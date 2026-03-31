/**
 * Streaming providers registry
 *
 * All providers use TMDB ID for episode lookup (via tmdb.js).
 * To add a new provider: add an entry to PROVIDERS array.
 *
 * Each provider entry:
 *   id        - unique key
 *   name      - display label in UI
 *   getUrl()  - returns iframe src string or null if unavailable
 *
 * getUrl() receives:
 *   { tmdbId, season, episode, type, lang }
 *
 * SECURITY: TMDB API key lives in .env.local (server-side only).
 * Providers here only use the TMDB *ID* (a public number), not the key.
 */

export const PROVIDERS = [
  // ── Primary providers (TMDB-based, most reliable) ───────────────────────
  {
    id:   "autoembed",
    name: "AutoEmbed",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://autoembed.co/movie/tmdb/${tmdbId}`;
      return `https://autoembed.co/tv/tmdb/${tmdbId}-${season}-${episode}`;
    },
  },
  {
    id:   "autoembed2",
    name: "AutoEmbed 2",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://player.autoembed.app/embed/movie/${tmdbId}`;
      return `https://player.autoembed.app/embed/tv/${tmdbId}/${season}/${episode}`;
    },
  },
  {
    id:   "embedapi",
    name: "EmbedAPI",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://player.embed-api.stream/?id=${tmdbId}`;
      return `https://player.embed-api.stream/?id=${tmdbId}&s=${season}&e=${episode}`;
    },
  },
  {
    id:   "superembed",
    name: "SuperEmbed",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`;
      return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`;
    },
  },
  {
    id:   "superembed_vip",
    name: "SuperEmbed VIP",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1`;
      return `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`;
    },
  },
  {
    id:   "2embed",
    name: "2Embed",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://www.2embed.cc/embed/${tmdbId}`;
      return `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`;
    },
  },
  {
    id:   "2embed_skin",
    name: "2Embed Alt",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://www.2embed.skin/embed/${tmdbId}`;
      return `https://www.2embed.skin/embedtv/${tmdbId}&s=${season}&e=${episode}`;
    },
  },
  {
    id:   "2embed_online",
    name: "2Embed Online",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://www.2embed.online/embed/movie/${tmdbId}`;
      return `https://www.2embed.online/embed/tv/${tmdbId}/${season}/${episode}`;
    },
  },
  {
    id:   "hnembed",
    name: "HnEmbed",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://hnembed.cc/embed/movie/${tmdbId}`;
      return `https://hnembed.cc/embed/tv/${tmdbId}/${season}/${episode}`;
    },
  },
  {
    id:   "primesrc",
    name: "PrimeSrc",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://primesrc.me/embed/movie?tmdb=${tmdbId}`;
      return `https://primesrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`;
    },
  },
  {
    id:   "frembed",
    name: "FrEmbed",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://frembed.bond/embed/movie/${tmdbId}`;
      return `https://frembed.bond/embed/serie/${tmdbId}?sa=${season}&epi=${episode}`;
    },
  },
  {
    id:   "vidsrc",
    name: "VidSrc",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://vsembed.ru/embed/movie/${tmdbId}`;
      return `https://vsembed.ru/embed/tv/${tmdbId}/${season}/${episode}`;
    },
  },
  {
    id:   "vidsrc2",
    name: "VidSrc 2",
    getUrl({ tmdbId, season = 1, episode = 1, type }) {
      if (!tmdbId) return null;
      if (type === "movie") return `https://vsembed.su/embed/movie/${tmdbId}`;
      return `https://vsembed.su/embed/tv/${tmdbId}/${season}/${episode}`;
    },
  },
];

/**
 * Build an iframe embed URL for a given provider + episode context.
 *
 * @param {string} providerId
 * @param {object} ctx  { tmdbId, season, episode, type, lang }
 * @returns {string|null}
 */
export function buildEmbedUrl(providerId, ctx) {
  const p = PROVIDERS.find(p => p.id === providerId);
  return p ? p.getUrl(ctx) : null;
}

/** All provider IDs — all use TMDB for iframe embeds, no hianime dependency */
export const SAFE_PROVIDERS = PROVIDERS.map(p => p.id);
