/**
 * api.js — Client-side fetch helpers
 * All calls go to /api/* (same origin) — no secrets exposed to browser.
 */

const BASE = "/api";

async function apiFetch(path, params = {}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
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
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
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
  info:      (slug)           => apiFetch(`/anime/info/${slug}`),
  episodes:  (slug)           => apiFetch(`/anime/episodes/${slug}`),

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

    /** Get episode list from a specific source */
    episodes: (sourceId, mappedId) =>
      cryPost("episodes", { sourceId, mappedId }),

    /** Get streaming servers (only for sources with hasServers:true) */
    servers: (sourceId, mappedId, episodeId) =>
      cryPost("servers", { sourceId, mappedId, episodeId }),

    /** Get actual stream URLs for an episode */
    sources: (sourceId, mappedId, episodeId, subType = "", server = "") =>
      cryPost("sources", { sourceId, mappedId, episodeId, subType, server }),

    /** Auto-find first working stream across all sources */
    auto: (anilistId, epNumber, subType = "sub") =>
      cryPost("auto", { anilistId, epNumber, subType }),
  },
};
