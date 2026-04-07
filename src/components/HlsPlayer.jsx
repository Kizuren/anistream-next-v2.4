/**
 * HlsPlayer — feature-complete anime video player
 *
 * Architecture: raw hls.js bound to a React <video> ref.
 * We do NOT use Video.js — it mutates the DOM in ways that conflict with
 * React's reconciler (insertBefore NotFoundError, element-not-in-DOM warnings)
 * and its dynamic stylesheet injection violates the site's CSP policy.
 * hls.js alone gives us everything we need with zero DOM side-effects.
 *
 * HEVC/H.265 support (Fix 2):
 *   On bufferAddCodecError, scan all quality levels for one with a different
 *   codec and switch to it automatically (e.g. H.264 fallback when HEVC fails).
 *   A small badge shows the active codec when a fallback is active.
 *
 * AniSkip fix:
 *   Fetches skip times through /api/proxy to avoid CORS rejection from
 *   api.aniskip.com (which sends no Access-Control-Allow-Origin header).
 *
 * Subtitle fix:
 *   .ass / .ssa files are not supported by the browser <track> element or
 *   hls.js. They are filtered out — only .vtt and .srt tracks are passed
 *   to <track>, since browsers convert .srt to WebVTT internally. A badge
 *   is shown when ASS-only subs are present so the user knows.
 */
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./HlsPlayer.module.css";

// ── Proxy helpers ─────────────────────────────────────────────────────────────

function unwrapProxied(url) {
  if (!url) return null;
  if (url.startsWith("/api/proxy")) return url;
  try {
    const u = new URL(url);
    if (u.pathname === "/api/proxy" && u.searchParams.has("url"))
      return `/api/proxy?${u.searchParams.toString()}`;
  } catch { /* not absolute */ }
  return null;
}

function proxyUrl(url, referer = "") {
  if (!url) return url;
  const unwrapped = unwrapProxied(url);
  if (unwrapped) return unwrapped;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const p = new URLSearchParams({ url });
  if (referer) p.set("referer", referer);
  return `/api/proxy?${p.toString()}`;
}

function siteReferer(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.hostname}/`; }
  catch { return ""; }
}

/**
 * Build a custom hls.js loader that routes all segment/manifest requests
 * through /api/proxy so CORS is handled server-side.
 */
function buildProxyLoader(Hls, streamReferer) {
  const DefaultLoader = Hls.DefaultConfig.loader;
  return class ProxyLoader {
    constructor(config) { this._loader = new DefaultLoader(config); }
    get stats()   { return this._loader.stats; }
    get context() { return this._loader.context; }
    destroy()     { this._loader.destroy(); }
    abort()       { this._loader.abort(); }

    load(context, config, callbacks) {
      const original = context.url;
      if (!original.startsWith("/api/proxy")) {
        context.url = proxyUrl(original, streamReferer);
      }
      this._loader.load(context, config, callbacks);
    }
  };
}

// ── Subtitle helpers ──────────────────────────────────────────────────────────

/**
 * FIX: Text track parse errors for .ass/.ssa subtitles
 * ───────────────────────────────────────────────────────
 * Video.js (and the native <track> element) can only parse WebVTT and SRT.
 * ASS/SSA is an entirely different format — when Video.js or the browser
 * tries to parse it as WebVTT it spams "Text Track parsing errors" to the
 * console and no subtitles appear.
 *
 * Fix: split subtitle tracks by format. Only .vtt and .srt files are
 * passed to native <track> elements. .ass/.ssa files are noted but skipped
 * (full ASS rendering requires a dedicated library like JavascriptSubtitlesOctopus
 * which is out of scope here).
 */
function classifySubtitles(subtitles) {
  const supported = [];
  const assOnly   = [];

  for (const sub of subtitles) {
    const url = (sub.url || "").toLowerCase();
    if (url.includes(".ass") || url.includes(".ssa")) {
      assOnly.push(sub);
    } else {
      // .vtt and .srt are both handled by the browser's <track> element
      supported.push(sub);
    }
  }

  return { supported, assOnly };
}

// ── AniSkip ───────────────────────────────────────────────────────────────────

/**
 * FIX (AniSkip 400): Direct browser fetch to api.aniskip.com fails with
 * a CORS rejection (no Access-Control-Allow-Origin header). Route through
 * /api/proxy instead — server-side, no CORS restrictions apply.
 */
async function fetchAniSkip(malId, episode) {
  if (!malId || !episode) return null;
  try {
    const aniskipUrl =
      `https://api.aniskip.com/v2/skip-times/${malId}/${episode}` +
      `?types[]=op&types[]=ed&episodeLength=0`;
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(aniskipUrl)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.found) return null;
    const result = {};
    for (const item of (data.results || [])) {
      result[item.skipType] = { start: item.interval.startTime, end: item.interval.endTime };
    }
    return result;
  } catch { return null; }
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

const IconPrev = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
  </svg>
);
const IconNext = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zm8.5-6v6h2V6h-2v6z"/>
  </svg>
);
const IconSkip = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zm8.5-6v6h2V6h-2v6z"/>
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

export default function HlsPlayer({
  src,
  subtitles        = [],
  headers          = {},
  poster           = "",
  onPrev           = null,
  onNext           = null,
  hasPrev          = false,
  hasNext          = false,
  malId            = null,
  epNumber         = null,
  autoplay         = true,
  autoNext         = true,
  onAutoplayChange = null,
  onAutoNextChange = null,
}) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [quality,   setQuality]   = useState([]);
  const [selQ,      setSelQ]      = useState(-1);
  const [activeSub, setActiveSub] = useState(0);
  const [codecInfo, setCodecInfo] = useState(""); // shown when HEVC fallback activates

  const [skipTimes,  setSkipTimes]  = useState(null);
  const [skipBanner, setSkipBanner] = useState(null); // "op"|"ed"|null
  const [countdown,  setCountdown]  = useState(null);
  const countdownRef = useRef(null);
  const hideTimer    = useRef(null);
  const [showBar,    setShowBar]    = useState(true);

  // AniSkip fetch
  useEffect(() => {
    setSkipTimes(null); setSkipBanner(null);
    if (malId && epNumber) fetchAniSkip(malId, epNumber).then(d => d && setSkipTimes(d));
  }, [malId, epNumber]);

  // Track playback time → show skip banner
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const fn = () => {
      const t = video.currentTime;
      if (!skipTimes) { setSkipBanner(null); return; }
      const { op, ed } = skipTimes;
      if (op && t >= op.start && t < op.end) setSkipBanner("op");
      else if (ed && t >= ed.start && t < ed.end) setSkipBanner("ed");
      else setSkipBanner(null);
    };
    video.addEventListener("timeupdate", fn);
    return () => video.removeEventListener("timeupdate", fn);
  }, [skipTimes]);

  // Auto-next countdown on video end
  const cancelCountdown = useCallback(() => {
    clearInterval(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoNext || !hasNext) return;
    const fn = () => {
      let n = 5;
      setCountdown(n);
      countdownRef.current = setInterval(() => {
        n -= 1;
        if (n <= 0) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          setCountdown(null);
          onNext?.();
        } else setCountdown(n);
      }, 1000);
    };
    video.addEventListener("ended", fn);
    return () => { video.removeEventListener("ended", fn); cancelCountdown(); };
  }, [autoNext, hasNext, onNext, cancelCountdown]);

  // ── hls.js setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!src) return;
    setError(null);
    setLoading(true);
    setQuality([]);
    setSelQ(-1);
    setCodecInfo("");
    cancelCountdown();
    setSkipBanner(null);

    const video = videoRef.current;
    if (!video) return;

    // Destroy any existing hls.js instance before creating a new one
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const isHLS   = src.includes(".m3u8");
    const referer = headers?.Referer || headers?.referer || siteReferer(src);
    const proxied = proxyUrl(src, referer);

    if (isHLS) {
      import("hls.js").then(({ default: Hls }) => {
        // Guard: component may have unmounted while the import was in flight
        if (!videoRef.current) return;

        if (!Hls.isSupported()) {
          // Safari has native HLS support — fall through to video.src below
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = proxied;
            video.load();
            setLoading(false);
            if (autoplay) video.play().catch(() => {});
          } else {
            setError("HLS not supported in this browser.");
          }
          return;
        }

        let ProxyLoader;
        try   { ProxyLoader = buildProxyLoader(Hls, referer); }
        catch { ProxyLoader = undefined; }

        const hls = new Hls({
          enableWorker:            true,
          lowLatencyMode:          false,
          fragLoadingMaxRetry:     4,
          keyLoadingMaxRetry:      4,
          manifestLoadingMaxRetry: 2,
          ...(ProxyLoader ? { loader: ProxyLoader, pLoader: ProxyLoader, fLoader: ProxyLoader } : {}),
        });

        hlsRef.current = hls;
        hls.loadSource(proxied);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setQuality((data.levels || []).map((l, i) => ({
            index: i,
            label: l.height ? `${l.height}p` : `Q${i + 1}`,
            codec: l.videoCodec || "",
          })));
          setLoading(false);
          if (autoplay) video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;

          // ── HEVC/H.265 codec not supported in this browser ───────────────
          // Strategy: find any quality level using a DIFFERENT codec and switch
          // to it. Covers the AnimePahe case where some levels are HEVC and
          // others are H.264 — we just jump to an H.264 level automatically.
          if (data.details === "bufferAddCodecError") {
            const cur      = hls.currentLevel;
            const levels   = hls.levels || [];
            const curCodec = levels[cur]?.videoCodec || "";

            const fallback = levels.findIndex((l, i) =>
              i !== cur && (l.videoCodec || "") !== curCodec && l.videoCodec
            );

            if (fallback >= 0) {
              const fb = levels[fallback].videoCodec;
              console.info(`[hls] HEVC unsupported → switching to level ${fallback} (${fb})`);
              hls.currentLevel = fallback;
              setCodecInfo(`Codec fallback: ${fb}`);
              return; // non-fatal — recovery complete
            }

            setError("Unsupported video codec (HEVC/H.265). Try a different source.");
            setLoading(false);
            return;
          }

          // AnimeNexus in1.cdn.nexus: IP-pinned audio tracks 403 — video still works
          if (data.details === "audioTrackLoadError") {
            console.warn("[hls] audio track load failed (IP-pinned CDN) — video-only mode");
            setLoading(false);
            return;
          }

          // AnimeKai/MegaUp: IP-pinned manifest 403
          if (data.details === "manifestLoadError") {
            setError("Stream unavailable (geo/IP restriction). Try another source.");
            setLoading(false);
            return;
          }

          // HTML error page returned instead of m3u8 (source blocked)
          if (data.details === "manifestParsingError") {
            setError("Stream failed to load. The source may be restricted. Try another source.");
            setLoading(false);
            return;
          }

          console.error("[hls] fatal:", data.type, data.details);
          setError(`Stream error: ${data.details || data.type}`);
          setLoading(false);
        });

      }).catch(e => {
        console.error("[hls] import failed:", e);
        setError("Could not load HLS player.");
      });

    } else {
      // Non-HLS (mp4, etc.) — plain video src
      video.src = proxied;
      video.load();
      setLoading(false);
      if (autoplay) video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, headers]);

  // Subtitle track switching via native TextTrack API
  function switchSub(idx) {
    const video = videoRef.current;
    if (!video) return;
    setActiveSub(idx);
    Array.from(video.textTracks || []).forEach((t, i) => {
      t.mode = i === idx ? "showing" : "hidden";
    });
  }

  function switchQuality(idx) {
    setSelQ(idx);
    if (hlsRef.current) hlsRef.current.currentLevel = idx;
  }

  function skipTo(time) {
    const video = videoRef.current;
    if (video) { video.currentTime = time; video.play().catch(() => {}); }
    setSkipBanner(null);
  }

  function onMouseMove() {
    setShowBar(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowBar(false), 3500);
  }

  const referer = headers?.Referer || headers?.referer || siteReferer(src);

  // Split subtitles: only pass .vtt / .srt to <track>; ignore .ass / .ssa
  // (ASS requires a dedicated renderer — native <track> cannot parse them)
  const { supported: supportedSubs, assOnly } = classifySubtitles(subtitles);
  const proxiedSubs = supportedSubs.map(s => ({ ...s, url: proxyUrl(s.url, referer) }));

  if (!src) return (
    <div className={styles.wrapper}>
      <div className={styles.empty}><span>🎬</span><p>No stream source loaded</p></div>
    </div>
  );

  return (
    <div className={styles.wrapper} onMouseMove={onMouseMove} onClick={cancelCountdown}>

      {loading && (
        <div className={styles.loadOv}><div className="spinner" /><p>Loading stream…</p></div>
      )}

      {error && (
        <div className={styles.errorOv}><span>⚠️</span><p>{error}</p></div>
      )}

      {/* Auto-next countdown overlay */}
      {countdown !== null && (
        <div className={styles.countdownOv}>
          <div className={styles.countdownCard}>
            <p className={styles.countdownLabel}>Next episode in</p>
            <div className={styles.countdownNum}>{countdown}</div>
            <div className={styles.countdownBtns}>
              <button className={styles.cdPlay} onClick={() => { cancelCountdown(); onNext?.(); }}>
                Play Now
              </button>
              <button className={styles.cdCancel} onClick={cancelCountdown}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* AniSkip banner */}
      {skipBanner && skipTimes && (
        <div className={styles.skipBanner}>
          <button
            className={styles.skipBtn}
            onClick={() => skipTo(skipBanner === "op" ? skipTimes.op.end : skipTimes.ed.end)}
          >
            <IconSkip />
            Skip {skipBanner === "op" ? "Opening" : "Ending"}
          </button>
        </div>
      )}

      {/*
        Plain <video> element — hls.js attaches to this ref.
        Only .vtt / .srt subtitle tracks are passed here; .ass files are
        excluded because the browser cannot parse them as WebVTT.
      */}
      <video
        ref={videoRef}
        className={styles.video}
        controls
        poster={poster}
        crossOrigin="anonymous"
        playsInline
      >
        {proxiedSubs.map((s, i) => (
          <track
            key={i}
            kind="subtitles"
            src={s.url}
            label={s.label}
            srcLang={s.label?.toLowerCase().slice(0, 2) || "en"}
            default={i === 0}
          />
        ))}
      </video>

      {/* Top control bar */}
      <div className={`${styles.topBar} ${showBar ? styles.barVisible : ""}`}>

        {/* Episode prev/next */}
        <div className={styles.epNav}>
          <button className={styles.navBtn} disabled={!hasPrev}
            onClick={() => { cancelCountdown(); onPrev?.(); }} title="Previous Episode">
            <IconPrev />
          </button>
          <button className={styles.navBtn} disabled={!hasNext}
            onClick={() => { cancelCountdown(); onNext?.(); }} title="Next Episode">
            <IconNext />
          </button>
        </div>

        {/* Autoplay / Auto-next toggles */}
        <div className={styles.toggleRow}>
          <button
            className={`${styles.toggle} ${autoplay ? styles.toggleOn : ""}`}
            onClick={() => onAutoplayChange?.(!autoplay)}
          >
            <span className={styles.toggleDot} />Autoplay
          </button>
          <button
            className={`${styles.toggle} ${autoNext ? styles.toggleOn : ""}`}
            onClick={() => onAutoNextChange?.(!autoNext)}
          >
            <span className={styles.toggleDot} />Auto Next
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* HEVC codec fallback badge — visible only when fallback is active */}
        {codecInfo && (
          <div className={styles.codecBadge} title="HEVC unsupported; switched to H.264 track">
            {codecInfo}
          </div>
        )}

        {/* ASS subtitle notice — shown when only .ass tracks are available */}
        {proxiedSubs.length === 0 && assOnly.length > 0 && (
          <div className={styles.codecBadge} title="ASS subtitles are not supported by the browser">
            Subs: ASS only (unsupported)
          </div>
        )}

        {/* Quality selector */}
        {quality.length > 1 && (
          <div className={styles.qualityBar}>
            <span className={styles.qualityLabel}>Quality</span>
            <button
              className={`${styles.qualBtn} ${selQ === -1 ? styles.qualActive : ""}`}
              onClick={() => switchQuality(-1)}>Auto</button>
            {quality.map(q => (
              <button key={q.index}
                className={`${styles.qualBtn} ${selQ === q.index ? styles.qualActive : ""}`}
                onClick={() => switchQuality(q.index)}>{q.label}</button>
            ))}
          </div>
        )}

        {/* Subtitle track selector (only for supported formats) */}
        {proxiedSubs.length > 1 && (
          <div className={styles.subBar}>
            <span className={styles.qualityLabel}>Sub</span>
            {proxiedSubs.map((s, i) => (
              <button key={i}
                className={`${styles.qualBtn} ${activeSub === i ? styles.qualActive : ""}`}
                onClick={() => switchSub(i)}>{s.label || `Track ${i + 1}`}</button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
