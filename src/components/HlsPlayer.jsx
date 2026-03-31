/**
 * HlsPlayer — plays HLS (.m3u8) and direct MP4 streams.
 *
 * CORS fix: All stream and subtitle URLs are routed through /api/proxy
 * server-side. Anime CDNs set Access-Control-Allow-Origin to their own
 * domain, blocking direct browser fetches. The proxy fetches upstream
 * with no CORS restriction and returns the response with ACAO: *.
 *
 * Referer fix: Browsers refuse xhr.setRequestHeader("Referer", ...)
 * as a forbidden header. The proxy accepts a ?referer= param and sets
 * it server-side so CDNs that check the referer still accept the request.
 */
"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./HlsPlayer.module.css";

/**
 * Wrap a URL through our server-side proxy.
 */
function proxyUrl(url, referer = "") {
  if (!url) return url;
  if (url.startsWith("/api/proxy")) return url;          // already proxied
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  const params = new URLSearchParams({ url });
  if (referer) params.set("referer", referer);
  return `/api/proxy?${params.toString()}`;
}

/** Extract the site origin from a URL to use as referer. */
function siteReferer(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.hostname}/`; }
  catch { return ""; }
}

export default function HlsPlayer({ src, subtitles = [], headers = {}, poster = "" }) {
  const videoRef  = useRef(null);
  const hlsRef    = useRef(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState([]);
  const [selQ,    setSelQ]    = useState(-1);

  useEffect(() => {
    if (!src) return;
    setError(null);
    setLoading(true);
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const isHLS   = src.includes(".m3u8") || src.includes("m3u8");
    const referer = headers?.Referer || headers?.referer || siteReferer(src);
    const proxied = proxyUrl(src, referer);

    if (isHLS) {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = proxied;
            video.load();
            setLoading(false);
          } else {
            setError("HLS not supported in this browser.");
          }
          return;
        }

        // The proxy now rewrites m3u8 manifests server-side:
        // all segment/sub-manifest URLs inside the m3u8 are already rewritten
        // to /api/proxy?url=... before hls.js sees them.
        // So we don't need a custom loader — hls.js fetches them from our origin.
        const hls = new Hls({
          // xhrSetup intentionally empty — do NOT set Referer (forbidden header)
          xhrSetup:     () => {},
          enableWorker: true,
          lowLatencyMode: false,
        });

        hlsRef.current = hls;
        hls.loadSource(proxied);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          const levels = data.levels.map((l, i) => ({
            index: i,
            label: l.height ? `${l.height}p` : `Quality ${i + 1}`,
          }));
          setQuality(levels);
          setLoading(false);
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) { setError(`Stream error: ${data.type}`); setLoading(false); }
        });

      }).catch(() => setError("Could not load HLS player."));

    } else {
      // Direct MP4 — proxy to avoid CORS
      video.src = proxied;
      video.load();
      setLoading(false);
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [src, headers]);

  function switchQuality(idx) {
    setSelQ(idx);
    if (hlsRef.current) hlsRef.current.currentLevel = idx;
  }

  if (!src) return (
    <div className={styles.empty}>
      <span>🎬</span><p>No stream source loaded</p>
    </div>
  );

  const referer = headers?.Referer || headers?.referer || siteReferer(src);
  const proxiedSubs = subtitles.map(s => ({ ...s, url: proxyUrl(s.url, referer) }));

  return (
    <div className={styles.wrapper}>
      {loading && (
        <div className={styles.loadOv}>
          <div className="spinner" /><p>Loading stream…</p>
        </div>
      )}
      {error && (
        <div className={styles.errorOv}>
          <span>⚠️</span><p>{error}</p>
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
        {/* Subtitles routed through proxy to bypass CDN CORS restrictions */}
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

      {quality.length > 1 && (
        <div className={styles.qualityBar}>
          <span className={styles.qualityLabel}>Quality:</span>
          <button className={`${styles.qualBtn} ${selQ === -1 ? styles.qualActive : ""}`}
            onClick={() => switchQuality(-1)}>Auto</button>
          {quality.map(q => (
            <button key={q.index}
              className={`${styles.qualBtn} ${selQ === q.index ? styles.qualActive : ""}`}
              onClick={() => switchQuality(q.index)}>{q.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
