/**
 * api.js — Client-side fetch helpers
 * All calls go to /api/* (same origin) — no secrets exposed to browser.
 *
 * FIX: On Vercel, SSR/API routes run server-side where window is undefined.
 * The original code fell back to "http://localhost:3000" which always fails
 * in production. We now resolve the correct base URL from env vars:
 *   - NEXT_PUBLIC_SITE_URL  → your custom domain (set in Vercel dashboard)
 *   - VERCEL_URL            → auto-set by Vercel to the deployment URL
 *   - fallback              → http://localhost:3000 (local dev only)
 */

const BASE = "/api";

function getOrigin() {
  if (typeof window !== "undefined") return window.location.origin;
  // Server-side rendering on Vercel: window doesn't exist.
  // NEXT_PUBLIC_SITE_URL = your production domain, e.g. https://mysite.vercel.app
  // VERCEL_URL = auto-injected by Vercel, e.g. mysite-abc123.vercel.app (no https://)
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function apiFetch(path, params = {}) {
  const origin = getOrigin();
  const url    = new URL(BASE + path, origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString());
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function cryPost(action, body = {}) {
  const origin = getOrigin();
  const res = await fetch(`${origin}${BASE}/stream/crysoline`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ action, ...body }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Crysoline error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ── Metadata (AniList-backed) ──────────────────────────────────────────
  home:      ()               => apiFetch("/anime/home"),
  search:    (q, page = 1)   => apiFetch("/anime/search", { q, page }),
  category:  (cat, page = 1) => apiFetch(`/anime/category/${cat}`, { page }),
  /**
   * Guard against undefined/null slugs — these cause 404s like
   * GET /api/anime/info/undefined which spam logs and waste quota.
   * Root cause: AnimeDetailClient received wrong prop name (id vs animeId).
   * This guard is a safety net so a bad prop never hits the network.
   */
  info: (slug) => {
    if (!slug || slug === "undefined" || slug === "null") {
      console.warn("[api.info] called with invalid slug:", slug);
      return Promise.resolve(null);
    }
    return apiFetch(`/anime/info/${slug}`);
  },

  episodes: (slug) => {
    if (!slug || slug === "undefined" || slug === "null") {
      console.warn("[api.episodes] called with invalid slug:", slug);
      return Promise.resolve({ episodes: [], totalEpisodes: 0 });
    }
    return apiFetch(`/anime/episodes/${slug}`);
  },

  // ── Crysoline streaming (server-side proxy) ───────────────────────────
  crysoline: {
    /**
     * Map an AniList ID to all available Crysoline sources.
     * lang: "en" (default, fast) | "all" (all 24 sources)
     */
    map: (anilistId, lang = "en") =>
      cryPost("map", { anilistId, lang }),

    /** Map a single source (incremental, avoids rate limit) */
    mapOne: (anilistId, sourceId) =>
      cryPost("mapOne", { anilistId, sourceId }),

    /** Get episode list from a specific source.
     *  Pass anilistId so the server can auto-fix stale slugs on 404. */
    episodes: (sourceId, mappedId, anilistId) =>
      cryPost("episodes", { sourceId, mappedId, ...(anilistId ? { anilistId } : {}) }),

    /** Get streaming servers (only for sources with hasServers:true) */
    servers: (sourceId, mappedId, episodeId, episodeNumber) =>
      cryPost("servers", { sourceId, mappedId, episodeId, episodeNumber }),

    /** Get actual stream URLs for an episode */
    sources: (sourceId, mappedId, episodeId, subType = "", server = "", episodeNumber) =>
      cryPost("sources", { sourceId, mappedId, episodeId, subType, server, episodeNumber }),

    /** Auto-find first working stream across all sources */
    auto: (anilistId, epNumber, subType = "sub") =>
      cryPost("auto", { anilistId, epNumber, subType }),
  },
};
