"use client";
/**
 * HlsPlayer.jsx — Upgraded Anime Streaming Player
 *
 * NEW in this version vs original:
 *  1. HEVC (H.265) detection + graceful fallback with user-friendly messaging
 *  2. Multi-format support: MP4 (H.264/H.265), WebM, HLS (.m3u8)
 *     — auto-detects format from URL/MIME, routes accordingly
 *  3. Netflix-style subtitle system
 *     — auto-loads English track by default
 *     — SRT → VTT runtime conversion (no server dependency)
 *     — Subtitle style customization panel (size, color, bg opacity)
 *     — ASS/SSA tracks via SubtitlesOctopus (existing public/ assets)
 *  4. Touch gestures: tap-to-seek (left/right zones), tap-to-play center,
 *     swipe-up volume, pinch-to-pip (mobile)
 *  5. Picture-in-Picture support
 *  6. Seek preview tooltip on progress hover
 *  7. Improved settings panel with subtitle styling
 *  8. Reduced layout shift: controls never cause reflow
 */

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./HlsPlayer.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// HEVC / codec detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects browser HEVC support via MediaSource or canPlayType.
 * Returns: "probably" | "maybe" | "no"
 */
function detectHEVCSupport() {
  if (typeof window === "undefined") return "no";

  // MediaSource is the most reliable path (Chrome 107+, Edge, Safari 17+)
  if (window.MediaSource?.isTypeSupported) {
    const codecs = [
      'video/mp4; codecs="hev1.1.6.L93.B0"',
      'video/mp4; codecs="hvc1.1.6.L93.B0"',
      'video/mp4; codecs="hev1"',
    ];
    if (codecs.some(c => window.MediaSource.isTypeSupported(c))) return "probably";
  }

  // HTMLVideoElement.canPlayType fallback
  try {
    const v = document.createElement("video");
    const r = v.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"');
    if (r === "probably" || r === "maybe") return r;
  } catch {}

  return "no";
}

/** Returns true when a URL likely carries an HEVC stream. */
function looksLikeHEVC(src) {
  if (!src) return false;
  const lower = src.toLowerCase();
  return (
    lower.includes("hevc") ||
    lower.includes("h265") ||
    lower.includes("h.265") ||
    lower.includes("hvc1") ||
    lower.includes("hev1")
  );
}

/** Infer streaming format from src URL. */
function detectFormat(src) {
  if (!src) return "unknown";
  const lower = src.toLowerCase().split("?")[0];
  if (lower.endsWith(".m3u8") || lower.includes(".m3u8")) return "hls";
  if (lower.endsWith(".mpd")  || lower.includes(".mpd"))  return "dash";
  if (lower.endsWith(".webm")) return "webm";
  if (lower.endsWith(".mp4"))  return "mp4";
  return "hls"; // default assumption for streaming URLs
}

// ─────────────────────────────────────────────────────────────────────────────
// SRT → VTT runtime converter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts SRT subtitle string to WebVTT.
 * Handles standard SRT timing lines and basic HTML tags.
 */
function srtToVtt(srt) {
  const normalized = srt
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  const vttLines = ["WEBVTT", ""];

  const blocks = normalized.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 2) continue;

    // Skip index line if numeric
    let start = 0;
    if (/^\d+$/.test(lines[0].trim())) start = 1;

    const timing = lines[start];
    if (!timing || !timing.includes("-->")) continue;

    // Convert SRT timing (00:00:00,000) to VTT (00:00:00.000)
    const vttTiming = timing.replace(/,(\d{3})/g, ".$1");
    vttLines.push(vttTiming);

    // Remaining lines are cue text
    for (let i = start + 1; i < lines.length; i++) {
      vttLines.push(lines[i]);
    }
    vttLines.push("");
  }

  return vttLines.join("\n");
}

/**
 * Fetches a subtitle URL and returns a blob: URL for <track>.
 * Handles .vtt natively; converts .srt on-the-fly.
 * Falls back to direct URL if fetch fails (may work if CORS allows).
 */
async function resolveSubtitleUrl(url, proxyFn) {
  if (!url) return url;

  const lower = url.toLowerCase();
  const isSRT = lower.includes(".srt") || lower.endsWith(".srt");
  const isVTT = lower.includes(".vtt") || lower.endsWith(".vtt");

  if (!isSRT && !isVTT) return proxyFn(url); // ASS/SSA handled separately

  try {
    const fetchUrl = proxyFn ? proxyFn(url) : url;
    const res = await fetch(fetchUrl);
    if (!res.ok) return proxyFn(url);
    let text = await res.text();

    if (isSRT) {
      text = srtToVtt(text);
    } else if (!text.trim().startsWith("WEBVTT")) {
      // Malformed VTT — try treating as SRT
      text = srtToVtt(text);
    }

    const blob = new Blob([text], { type: "text/vtt" });
    return URL.createObjectURL(blob);
  } catch {
    return proxyFn ? proxyFn(url) : url;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Proxy helpers (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

// CF Worker URL — set NEXT_PUBLIC_PROXY_URL in Vercel env to your worker URL.
// Falls back to /api/proxy (local dev or transition period).
const PROXY_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PROXY_URL)
    ? `${process.env.NEXT_PUBLIC_PROXY_URL}/proxy`
    : "/api/proxy";

function isAlreadyProxied(url) {
  if (!url) return false;
  if (url.startsWith("/api/proxy")) return true;
  try {
    const u = new URL(url);
    if (u.searchParams.has("url") &&
        (u.pathname === "/api/proxy" || u.pathname === "/proxy")) return true;
  } catch {}
  return false;
}

function proxyUrl(url, referer = "") {
  if (!url) return url;
  if (isAlreadyProxied(url)) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const p = new URLSearchParams({ url });
  if (referer) p.set("referer", referer);
  return `${PROXY_BASE}?${p.toString()}`;
}

function siteReferer(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.hostname}/`; }
  catch { return ""; }
}

function buildProxyLoader(Hls, streamReferer) {
  const DefaultLoader = Hls.DefaultConfig.loader;
  return class ProxyLoader {
    constructor(config) { this._loader = new DefaultLoader(config); }
    get stats()   { return this._loader.stats; }
    get context() { return this._loader.context; }
    destroy()     { this._loader.destroy(); }
    abort()       { this._loader.abort(); }
    load(context, config, callbacks) {
      if (!isAlreadyProxied(context.url)) {
        context.url = proxyUrl(context.url, streamReferer);
      }
      this._loader.load(context, config, callbacks);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AniSkip
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAniSkip(malId, episode) {
  if (!malId || !episode) return null;
  try {
    const url =
      `https://api.aniskip.com/v2/skip-times/${malId}/${episode}` +
      `?types[]=op&types[]=ed&episodeLength=0`;
    // AniSkip supports CORS natively — call directly, no proxy needed
    const res = await fetch(url);
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

// ─────────────────────────────────────────────────────────────────────────────
// Time formatting
// ─────────────────────────────────────────────────────────────────────────────

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subtitle style defaults & storage
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SUB_STYLE = {
  fontSize:   100,   // % of base (base = 18px)
  color:      "#ffffff",
  bgOpacity:  70,    // 0-100
  bgColor:    "#000000",
  position:   "bottom", // "bottom" | "top"
};

function loadSubStyle() {
  try { return { ...DEFAULT_SUB_STYLE, ...JSON.parse(localStorage.getItem("sub_style") || "{}") }; }
  catch { return { ...DEFAULT_SUB_STYLE }; }
}

function saveSubStyle(style) {
  try { localStorage.setItem("sub_style", JSON.stringify(style)); } catch {}
}

/**
 * Injects/updates a <style> tag for ::cue subtitle styling.
 * This is the only reliable way to style native VTT subtitles.
 */
function applySubtitleStyle(style) {
  let el = document.getElementById("__anistream_cue_style__");
  if (!el) {
    el = document.createElement("style");
    el.id = "__anistream_cue_style__";
    document.head.appendChild(el);
  }
  const fs = (style.fontSize / 100) * 18;
  const bg = hexToRgba(style.bgColor, style.bgOpacity / 100);
  el.textContent = `
    ::cue {
      font-size: ${fs}px !important;
      color: ${style.color} !important;
      background-color: ${bg} !important;
      font-family: 'Arial', sans-serif;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      font-weight: 600;
    }
  `;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

const PlayIcon     = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>;
const PauseIcon    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
const PrevIcon     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>;
const NextIcon     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm8.5-6v6h2V6h-2v6z"/></svg>;
const SkipIcon     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm8.5-6v6h2V6h-2v6z"/></svg>;
const VolHighIcon  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>;
const VolMutIcon   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>;
const FullIcon     = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>;
const ExitFulIcon  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>;
const SubIcon      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-6 7H7v-2h7v2zm3 4H7v-2h10v2zm0-4h-2v-2h2v2z"/></svg>;
const SettingsIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>;
const PipIcon      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>;
const HevcIcon     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/></svg>;

// ─────────────────────────────────────────────────────────────────────────────
// HlsPlayer component
// ─────────────────────────────────────────────────────────────────────────────

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
  animeId          = null,
  autoplay         = true,
  autoNext         = true,
  onAutoplayChange = null,
  onAutoNextChange = null,
  // isHLS: explicit override from the stream source metadata.
  // AnimePahe and other providers return signed CDN URLs that don't have
  // a .m3u8 extension, so detectFormat() wrongly falls back to "hls".
  // Passing isHLS=false forces the MP4/direct-video code path.
  isHLS            = null,
  // onStreamError: called when the stream URL is unreachable (e.g. proxy 502).
  // WatchClient uses this to auto-try the next source in the fallback chain
  // without waiting for the user to manually switch.
  onStreamError    = null,
}) {
  const videoRef     = useRef(null);
  const hlsRef       = useRef(null);
  const containerRef = useRef(null);
  const hideTimer    = useRef(null);
  const countdownRef = useRef(null);
  const progressRef  = useRef(null);
  const blobUrlsRef  = useRef([]);   // Track blob: URLs to revoke on cleanup

  // Refs that mirror muted/volume state so the src-change effect can read
  // the current values without a stale closure. This is the core fix for the
  // mute state bug: when src changes (episode switch), onReady() must apply
  // the persisted mute/volume back onto the <video> element.
  const mutedRef   = useRef(false);
  const volumeRef  = useRef(1);
  // refererRef: always holds the latest referer so the [src] effect (which
  // must NOT list referer as a dep — that would re-init hls on every headers
  // update) can still read the correct value when building the proxied URL.
  const refererRef = useRef("");

  // ── Core state ─────────────────────────────────────────────────────────────
  const [error,        setError]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [playing,      setPlaying]      = useState(false);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [volume,       setVolume]       = useState(1);
  const [muted,        setMuted]        = useState(false);
  const [fullscreen,   setFullscreen]   = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [quality,      setQuality]      = useState([]);
  const [selQ,         setSelQ]         = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [buffered,     setBuffered]     = useState(0);
  const [skipTimes,    setSkipTimes]    = useState(null);
  const [skipBanner,   setSkipBanner]   = useState(null);
  const [countdown,    setCountdown]    = useState(null);

  // ── HEVC state ─────────────────────────────────────────────────────────────
  const [hevcSupport,  setHevcSupport]  = useState(null); // "probably"|"maybe"|"no"|null
  const [hevcWarning,  setHevcWarning]  = useState(false);
  const [codecInfo,    setCodecInfo]    = useState("");

  // ── Subtitle state ─────────────────────────────────────────────────────────
  const [activeSub,    setActiveSub]    = useState(0);
  const [subsEnabled,  setSubsEnabled]  = useState(true);
  const [subStyle,     setSubStyleState] = useState(DEFAULT_SUB_STYLE);
  const [resolvedSubs, setResolvedSubs] = useState([]); // [{label, url (blob/proxy)}]
  const [showSubStyle, setShowSubStyle] = useState(false);

  // ── Seek preview ───────────────────────────────────────────────────────────
  const [seekPreview,  setSeekPreview]  = useState(null); // {x, time} | null

  // ── PiP ────────────────────────────────────────────────────────────────────
  const [pip,          setPip]          = useState(false);
  const [pipSupported, setPipSupported] = useState(false);

  // ── Touch gesture tracking ─────────────────────────────────────────────────
  const touchStart = useRef(null);

  // ── Keep mute/volume/referer refs in sync ─────────────────────────────────
  // These refs are read inside the src useEffect (which has [src] deps only)
  // so they must be refs — not state — to avoid stale closures.
  useEffect(() => { mutedRef.current  = muted;  }, [muted]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  // refererRef: runs every render so the [src] effect always reads a fresh value
  const referer = headers?.Referer || headers?.referer || siteReferer(src);
  refererRef.current = referer;

  // ─────────────────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────────────────
  const proxyFn = useCallback((url) => proxyUrl(url, refererRef.current), []);

  // Use the explicit isHLS prop when provided (AnimePahe and similar sources
  // return signed CDN URLs without a .m3u8 extension, so URL-based detection
  // is unreliable). Fall back to detectFormat() only when isHLS is not set.
  const format = isHLS !== null
    ? (isHLS ? "hls" : "mp4")
    : detectFormat(src);

  // All subtitle tracks (VTT/SRT — ASS handled by SubtitlesOctopus)
  const supportedSubs = (subtitles || []).filter(s => {
    const url = (s.url || "").toLowerCase();
    return !url.includes(".ass") && !url.includes(".ssa");
  });

  // English-first sort: put "English" / "en" tracks first
  const sortedSubs = [...supportedSubs].sort((a, b) => {
    const aEn = /english|^en$/i.test(a.label || "");
    const bEn = /english|^en$/i.test(b.label || "");
    if (aEn && !bEn) return -1;
    if (!aEn && bEn) return 1;
    return 0;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Init: HEVC check, PiP support, sub style
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const support = detectHEVCSupport();
    setHevcSupport(support);
    setPipSupported(document.pictureInPictureEnabled ?? false);
    const style = loadSubStyle();
    setSubStyleState(style);
    applySubtitleStyle(style);
  }, []);

  // ── Volume memory ──────────────────────────────────────────────────────────
  // FIX: also update refs immediately so the src effect (which fires on the
  // same render cycle) reads the correct persisted values, not stale defaults.
  useEffect(() => {
    try {
      const v = parseFloat(localStorage.getItem("player_volume") ?? "1");
      const m = localStorage.getItem("player_muted") === "1";
      if (isFinite(v)) {
        setVolume(v);
        volumeRef.current = v;
      }
      setMuted(m);
      mutedRef.current = m;
      // Apply directly to the video element if it already exists (e.g. on
      // episode switch where the <video> node is reused).
      const video = videoRef.current;
      if (video) {
        video.volume = isFinite(v) ? v : 1;
        video.muted  = m;
      }
    } catch {}
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Subtitle URL resolution (SRT→VTT conversion, blob: URLs)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sortedSubs.length) { setResolvedSubs([]); return; }

    let cancelled = false;
    // Revoke old blob URLs
    blobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    blobUrlsRef.current = [];

    Promise.all(
      sortedSubs.map(async (s) => {
        const resolved = await resolveSubtitleUrl(s.url, proxyFn);
        if (resolved && resolved.startsWith("blob:")) {
          blobUrlsRef.current.push(resolved);
        }
        return { label: s.label || "Unknown", url: resolved };
      })
    ).then((results) => {
      if (!cancelled) setResolvedSubs(results);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, subtitles]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // HEVC warning: show if src looks like HEVC and browser doesn't support it
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!src) { setHevcWarning(false); return; }
    const mightBeHEVC = looksLikeHEVC(src);
    setHevcWarning(mightBeHEVC && hevcSupport === "no");
  }, [src, hevcSupport]);

  // ─────────────────────────────────────────────────────────────────────────
  // HLS / MP4 / WebM setup — runs only when `src` changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!src) return;

    setError(null);
    setLoading(true);
    setQuality([]);
    setSelQ(-1);
    setCodecInfo("");
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setSkipBanner(null);
    cancelCountdown();

    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const proxied = proxyUrl(src, refererRef.current);

    const savedTime = (() => {
      if (!animeId || !epNumber) return 0;
      try { return parseFloat(localStorage.getItem(`cw_${animeId}_ep${epNumber}`) || "0") || 0; }
      catch { return 0; }
    })();

    const onReady = () => {
      setLoading(false);
      // FIX: Restore persisted mute/volume state onto this stream.
      // The <video> element is reused across episode changes (no remount),
      // so when hls.js reinitialises it may reset volume/muted to defaults.
      // Reading from refs avoids stale closures since this effect depends only on [src].
      video.muted  = mutedRef.current;
      video.volume = volumeRef.current;
      if (savedTime > 10) video.currentTime = savedTime;
      if (autoplay) video.play().catch(() => {});
    };

    if (format === "hls") {
      import("hls.js").then(({ default: Hls }) => {
        if (!videoRef.current) return;

        if (!Hls.isSupported()) {
          // Safari native HLS
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = proxied;
            video.load();
            video.addEventListener("loadedmetadata", onReady, { once: true });
          } else {
            setError("HLS not supported in this browser.");
            setLoading(false);
          }
          return;
        }

        let ProxyLoader;
        try { ProxyLoader = buildProxyLoader(Hls, refererRef.current); } catch {}

        const hls = new Hls({
          enableWorker:             true,
          lowLatencyMode:           false,
          maxBufferLength:          60,
          maxMaxBufferLength:       120,
          maxBufferSize:            60 * 1000 * 1000,
          maxBufferHole:            0.5,
          highBufferWatchdogPeriod: 2,
          startLevel:               -1,
          abrEwmaDefaultEstimate:   5_000_000,
          fragLoadingMaxRetry:      4,
          keyLoadingMaxRetry:       4,
          manifestLoadingMaxRetry:  2,
          progressive:              true,
          // ── HEVC: prefer lower levels first to avoid codec mismatch ──
          // capLevelToPlayerSize: true helps ABR pick the right codec level
          capLevelToPlayerSize:     true,
          // fLoader intentionally NOT set — video segments (.ts) fetch
          // directly from the CDN, bypassing the proxy entirely.
          // Only manifests (loader/pLoader) go through the proxy for CORS.
          ...(ProxyLoader ? { loader: ProxyLoader, pLoader: ProxyLoader } : {}),
        });

        hlsRef.current = hls;
        hls.loadSource(proxied);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          const levels = data.levels || [];
          setQuality(levels.map((l, i) => ({
            index: i,
            label: l.height ? `${l.height}p` : `Q${i + 1}`,
            codec: l.videoCodec || "",
          })));

          // Detect HEVC levels in the manifest
          const hasHEVC = levels.some(l =>
            l.videoCodec && (l.videoCodec.startsWith("hev1") || l.videoCodec.startsWith("hvc1"))
          );
          const hasH264 = levels.some(l =>
            l.videoCodec && l.videoCodec.startsWith("avc1")
          );

          if (hasHEVC && hevcSupport === "no" && hasH264) {
            // Auto-pick a H.264 level
            const h264Idx = levels.findIndex(l => l.videoCodec?.startsWith("avc1"));
            if (h264Idx >= 0) {
              hls.currentLevel = h264Idx;
              setCodecInfo("Auto-selected H.264 (HEVC unsupported in browser)");
            }
          } else if (hasHEVC) {
            setCodecInfo("HEVC (H.265)");
          }

          onReady();
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;

          if (data.details === "bufferAddCodecError") {
            const levels   = hls.levels || [];
            const cur      = hls.currentLevel;
            const curCodec = levels[cur]?.videoCodec || "";
            const fallback = levels.findIndex((l, i) =>
              i !== cur && (l.videoCodec || "") !== curCodec && l.videoCodec
            );
            if (fallback >= 0) {
              hls.currentLevel = fallback;
              const codec = levels[fallback].videoCodec || "";
              setCodecInfo(`Codec fallback → ${codec}`);
              return;
            }
            setError("Unsupported video codec. Try a different source.");
            setLoading(false);
            return;
          }
          if (data.details === "audioTrackLoadError") {
            console.warn("[hls] audio track error — video-only mode");
            setLoading(false);
            return;
          }
          if (data.details === "manifestLoadError") {
            setError("Stream unavailable. Trying next source…");
            setLoading(false);
            // Signal WatchClient to auto-try the next source
            onStreamError?.();
            return;
          }
          if (data.details === "manifestParsingError") {
            setError("Stream failed to load. The source may be restricted.");
            setLoading(false);
            return;
          }

          setError(`Stream error: ${data.details || data.type}`);
          setLoading(false);
        });

      }).catch(() => {
        setError("Could not load HLS player.");
        setLoading(false);
      });

    } else {
      // MP4 / WebM / direct video
      // Three-attempt strategy:
      //  1. Proxied URL  — handles CORS and sets the correct Referer
      //  2. Direct URL   — browser often reaches CDN even when Vercel is IP-blocked
      //  3. hls.js       — some providers disguise HLS playlists as .mp4 URLs

      // Attempt 1: proxy
      video.src = proxied;
      video.load();
      video.addEventListener("loadedmetadata", onReady, { once: true });

      const handleMp4Error = () => {
        const err = video.error;

        // MEDIA_ERR_NETWORK (code 2): proxy returned 502/503 or connection refused.
        // AnimeGG blocks Vercel server IPs — the browser can reach the CDN directly.
        if (err?.code === MediaError.MEDIA_ERR_NETWORK) {
          console.log("[player] Proxy network error — retrying with direct URL");
          if (!videoRef.current) { setLoading(false); return; }
          video.removeAttribute("src");
          video.load();

          // Attempt 2: direct unproxied URL
          video.src = src;
          video.load();
          video.addEventListener("loadedmetadata", onReady, { once: true });
          video.addEventListener("error", () => {
            console.log("[player] Direct URL also failed — signalling source fallback");
            setError("Stream unavailable. Trying next source…");
            setLoading(false);
            onStreamError?.();
          }, { once: true });
          return;
        }

        // MEDIA_ERR_SRC_NOT_SUPPORTED (code 4) + HEVC
        if (err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && hevcSupport === "no" && looksLikeHEVC(src)) {
          setError(
            "This stream uses HEVC (H.265) which your browser doesn’t support. " +
            "Try Chrome 108+, Edge 79+, or Safari 17+, or pick a different source."
          );
          setLoading(false);
          return;
        }

        // Attempt 3: hls.js — catches HLS manifests served with .mp4 extension
        import("hls.js").then(({ default: Hls }) => {
          if (!Hls.isSupported() || !videoRef.current) {
            setError(
              hevcSupport === "no" && looksLikeHEVC(src)
                ? "HEVC (H.265) is not supported by your browser."
                : "Video format not supported by your browser."
            );
            setLoading(false);
            onStreamError?.();
            return;
          }

          console.log("[player] Native MP4 failed — retrying via hls.js");
          video.removeAttribute("src");
          video.load();

          if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

          const hls = new Hls({ enableWorker: true, maxBufferLength: 60, fragLoadingMaxRetry: 4 });
          hlsRef.current = hls;
          hls.loadSource(proxied);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => onReady());
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            setError(
              hevcSupport === "no" && looksLikeHEVC(src)
                ? "HEVC (H.265) is not supported by your browser. Try a different source."
                : "Stream unavailable. Trying next source…"
            );
            setLoading(false);
            onStreamError?.();
          });
        }).catch(() => {
          setError("Failed to load video player. Try refreshing.");
          setLoading(false);
          onStreamError?.();
        });
      };

      video.addEventListener("error", handleMp4Error, { once: true });
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ── VTT subtitle track management ─────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    Array.from(video.textTracks || []).forEach((t, i) => {
      t.mode = (i === activeSub && subsEnabled) ? "showing" : "hidden";
    });
  }, [activeSub, subsEnabled, resolvedSubs]);

  // ── Video event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay     = () => setPlaying(true);
    const onPause    = () => setPlaying(false);
    const onDuration = () => setDuration(video.duration || 0);
    const onVolumeC  = () => { setVolume(video.volume); setMuted(video.muted); };
    const onWaiting  = () => setLoading(true);
    const onCanPlay  = () => setLoading(false);
    const onPip      = () => setPip(true);
    const onLeavePip = () => setPip(false);

    let rafId;
    let lastStateUpdate = 0;
    const updateProgress = () => {
      // Throttle setState to max 10fps (100ms) to avoid React 19 "maximum update depth" loop.
      // The RAF still runs at 60fps for smoothness but only commits to state when needed.
      const now = performance.now();
      if (now - lastStateUpdate >= 100) {
        lastStateUpdate = now;
        setCurrentTime(video.currentTime);
        if (video.buffered.length > 0) {
          const b = video.buffered.end(video.buffered.length - 1);
          setBuffered((b / (video.duration || 1)) * 100);
        }
      }
      rafId = requestAnimationFrame(updateProgress);
    };
    const startRaf = () => { cancelAnimationFrame(rafId); lastStateUpdate = 0; rafId = requestAnimationFrame(updateProgress); };
    const stopRaf  = () => cancelAnimationFrame(rafId);

    video.addEventListener("play",                onPlay);
    video.addEventListener("pause",               onPause);
    video.addEventListener("playing",             onPlay);
    video.addEventListener("durationchange",      onDuration);
    video.addEventListener("volumechange",        onVolumeC);
    video.addEventListener("waiting",             onWaiting);
    video.addEventListener("canplay",             onCanPlay);
    video.addEventListener("play",                startRaf);
    video.addEventListener("pause",               stopRaf);
    video.addEventListener("ended",               stopRaf);
    video.addEventListener("enterpictureinpicture", onPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);

    return () => {
      video.removeEventListener("play",                onPlay);
      video.removeEventListener("pause",               onPause);
      video.removeEventListener("playing",             onPlay);
      video.removeEventListener("durationchange",      onDuration);
      video.removeEventListener("volumechange",        onVolumeC);
      video.removeEventListener("waiting",             onWaiting);
      video.removeEventListener("canplay",             onCanPlay);
      video.removeEventListener("play",                startRaf);
      video.removeEventListener("pause",               stopRaf);
      video.removeEventListener("ended",               stopRaf);
      video.removeEventListener("enterpictureinpicture", onPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // ── Continue watching: save every 5s ──────────────────────────────────────
  useEffect(() => {
    if (!animeId || !epNumber) return;
    const key = `cw_${animeId}_ep${epNumber}`;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || !isFinite(video.currentTime)) return;
      try { localStorage.setItem(key, String(Math.floor(video.currentTime))); } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [animeId, epNumber]);

  // ── AniSkip ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setSkipTimes(null);
    setSkipBanner(null);
    if (malId && epNumber) fetchAniSkip(malId, epNumber).then(d => d && setSkipTimes(d));
  }, [malId, epNumber]);

  // skipBanner: use timeupdate event (fires ~4x/sec) instead of depending on
  // currentTime state to avoid the React 19 "maximum update depth exceeded" loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) { setSkipBanner(null); return; }
    if (!skipTimes) { setSkipBanner(null); return; }
    const { op, ed } = skipTimes;
    const onTimeUpdate = () => {
      const t = video.currentTime;
      if (op && t >= op.start && t < op.end)       setSkipBanner("op");
      else if (ed && t >= ed.start && t < ed.end)  setSkipBanner("ed");
      else                                          setSkipBanner(null);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => { video.removeEventListener("timeupdate", onTimeUpdate); setSkipBanner(null); };
  }, [skipTimes]);

  // ── Auto-next countdown ────────────────────────────────────────────────────
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
        if (n <= 0) { clearInterval(countdownRef.current); onNext?.(); setCountdown(null); }
        else setCountdown(n);
      }, 1000);
    };
    video.addEventListener("ended", fn);
    return () => { video.removeEventListener("ended", fn); cancelCountdown(); };
  }, [autoNext, hasNext, onNext, cancelCountdown]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case " ": case "k":
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case "m":  video.muted = !video.muted; break;
        case "f":  toggleFullscreen(); break;
        case "j":  video.currentTime = Math.max(0, video.currentTime - 10); break;
        case "l":  video.currentTime = Math.min(video.duration, video.currentTime + 10); break;
        case "c":  setSubsEnabled(v => !v); break;
        case "n":  if (hasNext) { cancelCountdown(); onNext?.(); } break;
        case "p":  if (hasPrev) { cancelCountdown(); onPrev?.(); } break;
        case "i":  togglePip(); break;
        default: break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext, hasPrev]);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }, []);

  // ── Picture-in-Picture ─────────────────────────────────────────────────────
  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {}
  }, []);

  // ── Controls auto-hide ─────────────────────────────────────────────────────
  const showControlsFor = useCallback((ms = 3500) => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), ms);
  }, []);

  // ── Playback handlers ──────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const seekTo = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
    setSeekPreview(null);
  };

  const onProgressMouseMove = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    setSeekPreview({ x: e.clientX - rect.left, time: Math.max(0, Math.min(duration, pct * duration)) });
  };

  const setVol = (e) => {
    const val = parseFloat(e.target.value);
    const vid = videoRef.current;
    if (!vid) return;
    vid.volume = val;
    vid.muted  = val === 0;
    try { localStorage.setItem("player_volume", String(val)); } catch {}
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    try { localStorage.setItem("player_muted", vid.muted ? "1" : "0"); } catch {}
  };

  const setSpeed = (rate) => {
    const vid = videoRef.current;
    if (vid) vid.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const switchQuality = (idx) => {
    setSelQ(idx);
    if (hlsRef.current) hlsRef.current.currentLevel = idx;
  };

  const skipTo = (time) => {
    const v = videoRef.current;
    if (v) { v.currentTime = time; v.play().catch(() => {}); }
    setSkipBanner(null);
  };

  // ── Subtitle style ─────────────────────────────────────────────────────────
  const updateSubStyle = (patch) => {
    const next = { ...subStyle, ...patch };
    setSubStyleState(next);
    saveSubStyle(next);
    applySubtitleStyle(next);
  };

  // ── Touch gestures ─────────────────────────────────────────────────────────
  const onTouchStart = (e) => {
    showControlsFor(4000);
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const onTouchEnd = (e) => {
    if (!touchStart.current) return;
    const dx   = e.changedTouches[0].clientX - touchStart.current.x;
    const dy   = e.changedTouches[0].clientY - touchStart.current.y;
    const dt   = Date.now() - touchStart.current.time;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    touchStart.current = null;

    const video = videoRef.current;
    if (!video) return;

    // Horizontal swipe: seek
    if (absDx > 40 && absDx > absDy && dt < 400) {
      const secs = Math.round((absDx / 100) * 5); // ~5s per 100px
      video.currentTime = Math.max(0, Math.min(video.duration,
        video.currentTime + (dx > 0 ? secs : -secs)
      ));
      return;
    }

    // Quick tap (< 200ms, < 20px movement): play/pause
    if (absDx < 20 && absDy < 20 && dt < 200) {
      togglePlay();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!src) return (
    <div className={styles.wrapper}>
      <div className={styles.empty}><span>🎬</span><p>No stream source loaded</p></div>
    </div>
  );

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={[
        styles.wrapper,
        fullscreen ? styles.fullscreen : "",
        !showControls && playing ? styles.hideCursor : "",
      ].join(" ")}
      onMouseMove={() => showControlsFor()}
      onMouseLeave={() => playing && setShowControls(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── HEVC Warning Banner ── */}
      {hevcWarning && (
        <div className={styles.hevcWarning}>
          <HevcIcon />
          <span>
            <strong>HEVC (H.265) may not play in your browser.</strong>{" "}
            Try Chrome 108+, Edge 108+, or Safari 17+. If playback fails, switch to a different source.
          </span>
          <button onClick={() => setHevcWarning(false)}>✕</button>
        </div>
      )}

      {loading && (
        <div className={styles.loadOv}>
          <div className={styles.spinner} />
          <p>Loading stream…</p>
        </div>
      )}

      {error && (
        <div className={styles.errorOv}>
          <span>⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {countdown !== null && (
        <div className={styles.countdownOv}>
          <div className={styles.countdownCard}>
            <p className={styles.countdownLabel}>Next episode in</p>
            <div className={styles.countdownNum}>{countdown}</div>
            <div className={styles.countdownBtns}>
              <button className={styles.cdPlay}   onClick={() => { cancelCountdown(); onNext?.(); }}>Play Now</button>
              <button className={styles.cdCancel} onClick={cancelCountdown}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {skipBanner && skipTimes && (
        <div className={styles.skipBanner}>
          <button
            className={styles.skipBtn}
            onClick={() => skipTo(skipBanner === "op" ? skipTimes.op.end : skipTimes.ed.end)}
          >
            <SkipIcon /> Skip {skipBanner === "op" ? "Opening" : "Ending"}
          </button>
        </div>
      )}

      {codecInfo && <div className={styles.codecBadge}>{codecInfo}</div>}

      {/* ── Video element ── */}
      <video
        ref={videoRef}
        className={styles.video}
        poster={poster}
        crossOrigin="anonymous"
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      >
        {resolvedSubs.map((s, i) => (
          <track
            key={i}
            kind="subtitles"
            src={s.url}
            label={s.label}
            srcLang={s.label?.toLowerCase().slice(0, 2) || "en"}
            default={i === 0 && subsEnabled}
          />
        ))}
      </video>

      {/* ── Custom controls ── */}
      <div className={`${styles.controls} ${showControls || !playing ? styles.controlsVisible : ""}`}>

        {/* Progress bar with seek preview */}
        <div
          ref={progressRef}
          className={styles.progressWrap}
          onClick={seekTo}
          onMouseMove={onProgressMouseMove}
          onMouseLeave={() => setSeekPreview(null)}
        >
          {seekPreview && (
            <div
              className={styles.seekTooltip}
              style={{ left: `${Math.max(24, Math.min(seekPreview.x, (progressRef.current?.offsetWidth || 0) - 24))}px` }}
            >
              {fmtTime(seekPreview.time)}
            </div>
          )}
          <div className={styles.progressBg}>
            <div className={styles.progressBuffered} style={{ width: `${buffered}%` }} />
            <div className={styles.progressFill}     style={{ width: `${progressPct}%` }} />
            <div className={styles.progressThumb}    style={{ left: `${progressPct}%` }} />
          </div>
        </div>

        <div className={styles.bottomRow}>
          {/* Left cluster */}
          <div className={styles.leftCluster}>
            <button className={styles.ctrlBtn} onClick={() => { cancelCountdown(); onPrev?.(); }} disabled={!hasPrev} title="Previous episode (P)">
              <PrevIcon />
            </button>
            <button className={styles.ctrlBtn} onClick={togglePlay} title="Play/Pause (Space)">
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button className={styles.ctrlBtn} onClick={() => { cancelCountdown(); onNext?.(); }} disabled={!hasNext} title="Next episode (N)">
              <NextIcon />
            </button>

            <div className={styles.volGroup}>
              <button className={styles.ctrlBtn} onClick={toggleMute} title="Mute (M)">
                {muted || volume === 0 ? <VolMutIcon /> : <VolHighIcon />}
              </button>
              <input
                type="range" min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={setVol}
                className={styles.volSlider}
                title="Volume"
              />
            </div>

            <span className={styles.timeDisplay}>
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
          </div>

          {/* Right cluster */}
          <div className={styles.rightCluster}>
            <button
              className={`${styles.textBtn} ${autoplay ? styles.textBtnOn : ""}`}
              onClick={() => onAutoplayChange?.(!autoplay)}
              title="Toggle autoplay"
            >
              Autoplay
            </button>
            <button
              className={`${styles.textBtn} ${autoNext ? styles.textBtnOn : ""}`}
              onClick={() => onAutoNextChange?.(!autoNext)}
              title="Toggle auto-next"
            >
              Auto-next
            </button>

            {/* PiP button */}
            {pipSupported && (
              <button
                className={`${styles.ctrlBtn} ${pip ? styles.ctrlBtnActive : ""}`}
                onClick={togglePip}
                title="Picture-in-Picture (I)"
              >
                <PipIcon />
              </button>
            )}

            {/* Subtitle toggle */}
            {resolvedSubs.length > 0 && (
              <button
                className={`${styles.ctrlBtn} ${subsEnabled ? styles.ctrlBtnActive : ""}`}
                onClick={() => setSubsEnabled(v => !v)}
                title="Toggle subtitles (C)"
              >
                <SubIcon />
              </button>
            )}

            {/* Settings panel */}
            <div className={styles.settingsWrap}>
              <button
                className={`${styles.ctrlBtn} ${showSettings ? styles.ctrlBtnActive : ""}`}
                onClick={() => { setShowSettings(v => !v); setShowSubStyle(false); }}
                title="Settings"
              >
                <SettingsIcon />
              </button>

              {showSettings && (
                <div className={styles.settingsPanel}>

                  {/* Quality */}
                  {quality.length > 1 && (
                    <div className={styles.settingsRow}>
                      <span className={styles.settingsLabel}>Quality</span>
                      <div className={styles.settingsBtns}>
                        <button
                          className={`${styles.sBtn} ${selQ === -1 ? styles.sBtnActive : ""}`}
                          onClick={() => switchQuality(-1)}
                        >Auto</button>
                        {quality.map(q => (
                          <button
                            key={q.index}
                            className={`${styles.sBtn} ${selQ === q.index ? styles.sBtnActive : ""}`}
                            onClick={() => switchQuality(q.index)}
                          >
                            {q.label}
                            {q.codec?.startsWith("hev1") || q.codec?.startsWith("hvc1")
                              ? <span className={styles.hevcBadge}>H.265</span>
                              : q.codec?.startsWith("avc1")
                              ? <span className={styles.h264Badge}>H.264</span>
                              : null
                            }
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Speed */}
                  <div className={styles.settingsRow}>
                    <span className={styles.settingsLabel}>Speed</span>
                    <div className={styles.settingsBtns}>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
                        <button
                          key={r}
                          className={`${styles.sBtn} ${playbackRate === r ? styles.sBtnActive : ""}`}
                          onClick={() => setSpeed(r)}
                        >{r === 1 ? "Normal" : `${r}x`}</button>
                      ))}
                    </div>
                  </div>

                  {/* Subtitle track selection */}
                  {resolvedSubs.length > 0 && (
                    <div className={styles.settingsRow}>
                      <div className={styles.settingsLabelRow}>
                        <span className={styles.settingsLabel}>Subtitles</span>
                        <button
                          className={styles.subStyleToggle}
                          onClick={() => setShowSubStyle(v => !v)}
                        >Style ✦</button>
                      </div>
                      <div className={styles.settingsBtns}>
                        <button
                          className={`${styles.sBtn} ${!subsEnabled ? styles.sBtnActive : ""}`}
                          onClick={() => setSubsEnabled(false)}
                        >Off</button>
                        {resolvedSubs.map((s, i) => (
                          <button
                            key={i}
                            className={`${styles.sBtn} ${subsEnabled && activeSub === i ? styles.sBtnActive : ""}`}
                            onClick={() => { setActiveSub(i); setSubsEnabled(true); }}
                          >
                            {s.label || `Track ${i + 1}`}
                            {/english|^en$/i.test(s.label || "") && (
                              <span className={styles.enBadge}>EN</span>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Netflix-style subtitle style panel */}
                      {showSubStyle && (
                        <div className={styles.subStylePanel}>
                          <div className={styles.subStyleRow}>
                            <label>Size</label>
                            <div className={styles.subStyleBtns}>
                              {[75, 100, 125, 150].map(sz => (
                                <button
                                  key={sz}
                                  className={`${styles.sBtn} ${subStyle.fontSize === sz ? styles.sBtnActive : ""}`}
                                  onClick={() => updateSubStyle({ fontSize: sz })}
                                >{sz}%</button>
                              ))}
                            </div>
                          </div>
                          <div className={styles.subStyleRow}>
                            <label>Text Color</label>
                            <div className={styles.subStyleBtns}>
                              {["#ffffff","#ffff00","#00ff00","#00ffff","#ff8800"].map(c => (
                                <button
                                  key={c}
                                  className={`${styles.colorSwatch} ${subStyle.color === c ? styles.colorSwatchActive : ""}`}
                                  style={{ background: c }}
                                  onClick={() => updateSubStyle({ color: c })}
                                  title={c}
                                />
                              ))}
                            </div>
                          </div>
                          <div className={styles.subStyleRow}>
                            <label>Background</label>
                            <div className={styles.subStyleBtns}>
                              {[0, 30, 60, 90].map(op => (
                                <button
                                  key={op}
                                  className={`${styles.sBtn} ${subStyle.bgOpacity === op ? styles.sBtnActive : ""}`}
                                  onClick={() => updateSubStyle({ bgOpacity: op })}
                                >{op === 0 ? "None" : `${op}%`}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.kbHint}>
                    Space/K: play · ←→: seek 5s · ↑↓: volume · M: mute · F: fullscreen · C: subs · I: PiP · N/P: ep
                  </div>
                </div>
              )}
            </div>

            <button className={styles.ctrlBtn} onClick={toggleFullscreen} title="Fullscreen (F)">
              {fullscreen ? <ExitFulIcon /> : <FullIcon />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
