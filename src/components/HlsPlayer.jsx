/**
 * HlsPlayer — feature-complete anime video player
 *
 * Fixes applied vs previous version:
 *  - bufferAddCodecError: try switching quality level on unsupported codec (AnimePahe HEVC)
 *  - audioTrackLoadError: treated as non-fatal (IP-pinned CDN on AnimeNexus) — video continues
 *  - manifestParsingError / manifestLoadError 403: clear user-facing messages
 *
 * New features:
 *  - AniSkip: fetches OP/ED timestamps, shows Skip Opening/Ending button
 *  - Prev/Next episode buttons
 *  - Autoplay toggle (persisted via parent)
 *  - Auto-next toggle with 5-second countdown overlay
 *  - Quality + subtitle track selectors
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

function buildProxyLoader(Hls, streamReferer) {
  const DefaultLoader = Hls.DefaultConfig.loader;
  return class ProxyLoader {
    constructor(config) { this._delegate = new DefaultLoader(config); }
    get stats() { return this._delegate.stats; }
    set stats(v) { this._delegate.stats = v; }
    load(context, config, callbacks) {
      if (context.url) {
        const already = unwrapProxied(context.url);
        context.url = already ?? proxyUrl(context.url, streamReferer);
      }
      this._delegate.load(context, config, callbacks);
    }
    abort()   { this._delegate.abort?.(); }
    destroy() { this._delegate.destroy?.(); }
  };
}

// ── AniSkip ───────────────────────────────────────────────────────────────────

async function fetchAniSkip(malId, episode) {
  if (!malId || !episode) return null;
  try {
    const res = await fetch(
      `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types[]=op&types[]=ed&episodeLength=0`
    );
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
    <path d="M16 6h2v12h-2zm-3.5 6L4 6v12z"/>
  </svg>
);
const IconSkip = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/>
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

export default function HlsPlayer({
  src,
  subtitles     = [],
  headers       = {},
  poster        = "",
  onPrev        = null,
  onNext        = null,
  hasPrev       = false,
  hasNext       = false,
  malId         = null,
  epNumber      = null,
  autoplay      = true,
  autoNext      = true,
  onAutoplayChange = null,
  onAutoNextChange = null,
}) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState([]);
  const [selQ,    setSelQ]    = useState(-1);
  const [activeSub, setActiveSub] = useState(0);

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

  // Track time → show skip banner
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

  // Auto-next on ended
  const cancelCountdown = useCallback(() => {
    clearInterval(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => {
      if (!autoNext || !hasNext) return;
      let s = 5; setCountdown(s);
      countdownRef.current = setInterval(() => {
        s -= 1; setCountdown(s);
        if (s <= 0) { cancelCountdown(); onNext?.(); }
      }, 1000);
    };
    video.addEventListener("ended", onEnded);
    return () => { video.removeEventListener("ended", onEnded); cancelCountdown(); };
  }, [autoNext, hasNext, onNext, cancelCountdown]);

  // HLS setup
  useEffect(() => {
    if (!src) return;
    setError(null); setLoading(true); setQuality([]); setSelQ(-1);
    cancelCountdown(); setSkipBanner(null);

    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const isHLS   = src.includes(".m3u8");
    const referer = headers?.Referer || headers?.referer || siteReferer(src);
    const proxied = proxyUrl(src, referer);

    if (isHLS) {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = proxied; video.load(); setLoading(false);
          } else { setError("HLS not supported in this browser."); }
          return;
        }

        let ProxyLoader;
        try   { ProxyLoader = buildProxyLoader(Hls, referer); }
        catch { ProxyLoader = undefined; }

        const hls = new Hls({
          xhrSetup: () => {},
          enableWorker: true,
          lowLatencyMode: false,
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

          // AnimePahe: HEVC/H.265 codec not supported in most browsers
          if (data.details === "bufferAddCodecError") {
            const cur    = hls.currentLevel;
            const levels = hls.levels || [];
            const next   = levels.findIndex((l, i) =>
              i !== cur && (l.videoCodec || "") !== (levels[cur]?.videoCodec || "")
            );
            if (next >= 0) { hls.currentLevel = next; return; } // non-fatal recovery
            setError("Unsupported video codec (HEVC/H.265). Try a different source.");
            setLoading(false);
            return;
          }

          // AnimeNexus in1.cdn.nexus: IP-pinned audio tracks 403 → non-fatal, video continues
          if (data.details === "audioTrackLoadError") {
            console.warn("[hls] audio track load failed (IP-pinned CDN) — video-only mode");
            setLoading(false);
            return;
          }

          // AnimeKai/MegaUp: IP-pinned m3u8 manifest 403
          if (data.details === "manifestLoadError") {
            setError("Stream unavailable (geo/IP restriction). Try another source.");
            setLoading(false);
            return;
          }

          // Bad manifest content (HTML 403 error page returned instead of m3u8)
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
      video.src = proxied; video.load(); setLoading(false);
      if (autoplay) video.play().catch(() => {});
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, headers]);

  // Subtitle switching
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

  const referer     = headers?.Referer || headers?.referer || siteReferer(src);
  const proxiedSubs = subtitles.map(s => ({ ...s, url: proxyUrl(s.url, referer) }));

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

      {/* Auto-next countdown */}
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

      <video
        ref={videoRef}
        className={styles.video}
        controls
        poster={poster}
        crossOrigin="anonymous"
        playsInline
      >
        {proxiedSubs.map((s, i) => (
          <track key={i} kind="subtitles" src={s.url} label={s.label}
            srcLang={s.label?.toLowerCase().slice(0, 2) || "en"} default={i === 0} />
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

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Quality */}
        {quality.length > 1 && (
          <div className={styles.qualityBar}>
            <span className={styles.qualityLabel}>Quality</span>
            <button className={`${styles.qualBtn} ${selQ === -1 ? styles.qualActive : ""}`}
              onClick={() => switchQuality(-1)}>Auto</button>
            {quality.map(q => (
              <button key={q.index}
                className={`${styles.qualBtn} ${selQ === q.index ? styles.qualActive : ""}`}
                onClick={() => switchQuality(q.index)}>{q.label}</button>
            ))}
          </div>
        )}

        {/* Subtitles */}
        {proxiedSubs.length > 1 && (
          <div className={styles.qualityBar}>
            <span className={styles.qualityLabel}>Sub</span>
            <button className={`${styles.qualBtn} ${activeSub === -1 ? styles.qualActive : ""}`}
              onClick={() => switchSub(-1)}>Off</button>
            {proxiedSubs.map((s, i) => (
              <button key={i}
                className={`${styles.qualBtn} ${activeSub === i ? styles.qualActive : ""}`}
                onClick={() => switchSub(i)}>{s.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
