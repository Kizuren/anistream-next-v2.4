/**
 * AniList GraphQL API client
 * Docs: https://anilist.gitbook.io/anilist-apiv2-docs/
 * Endpoint: https://graphql.anilist.co
 */

import axios from "axios";
import { toSlug as _toSlug, idFromSlug as _idFromSlug } from "./utils.js";
import { extractTmdbIdFromLinks as _extractTmdb } from "./tmdb.js";

const ANILIST = "https://graphql.anilist.co";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Rate limiter ──────────────────────────────────────────────────────────────
// AniList allows 90 req/min. We self-limit to 60 req/min (1 per 1000ms)
// to stay well clear of the limit even with bursts.
// This is a simple token bucket implemented as a queue of pending resolvers.
const RATE_LIMIT_MS = 1000; // minimum ms between requests
let   _lastRequest  = 0;
let   _queue        = Promise.resolve();

function rateLimit() {
  _queue = _queue.then(() => {
    const now  = Date.now();
    const wait = Math.max(0, _lastRequest + RATE_LIMIT_MS - now);
    _lastRequest = now + wait;
    return wait > 0 ? sleep(wait) : undefined;
  });
  return _queue;
}

// Track if AniList is currently blocked so we can fail fast
// instead of queuing more requests that will also fail.
let _blockedUntil = 0;

/**
 * AniList GraphQL query with rate limiting + retry on 429/403.
 *
 * Rate limit: self-throttled to 60 req/min (AniList allows 90).
 * On 429: respect Retry-After header, mark blocked, fail fast for other callers.
 * On 403: short wait, 2 retries only (retrying a hard block too many times
 *         makes the block longer — so we give up quickly and serve cache).
 */
async function query(gql, variables = {}) {
  // Fail fast if we know AniList is currently blocking us
  if (_blockedUntil > Date.now()) {
    const remaining = Math.ceil((_blockedUntil - Date.now()) / 1000);
    throw new Error(`AniList blocked — ${remaining}s remaining`);
  }

  // Wait for our rate limit slot
  await rateLimit();

  // 2 retries max on 5xx; 1 retry on 403/429 (more makes blocks worse)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.post(
        ANILIST,
        { query: gql, variables },
        {
          timeout: 15000,
          headers: {
            "Content-Type": "application/json",
            Accept:         "application/json",
          },
        }
      );
      // Successful request — clear any block state
      _blockedUntil = 0;
      return data?.data;

    } catch (e) {
      const status = e.response?.status;

      if (status === 429) {
        const retryAfter = parseInt(e.response?.headers?.["retry-after"] || "60", 10);
        const blockMs    = Math.min(retryAfter * 1000, 120_000);
        _blockedUntil    = Date.now() + blockMs;
        console.warn(`[anilist] 429 — blocked for ${retryAfter}s`);
        // No retry — other requests should fail fast too
        throw new Error(`AniList rate limited — retry after ${retryAfter}s`);
      }

      if (status === 403) {
        // Mark blocked for 30s — retrying a 403 too eagerly deepens the block
        _blockedUntil = Date.now() + 30_000;
        console.warn(`[anilist] 403 — blocked for 30s (attempt ${attempt + 1}/3)`);
        if (attempt < 2) { await sleep(5000); continue; }
        throw new Error("AniList returned 403 — IP temporarily blocked");
      }

      if (status >= 500) {
        console.warn(`[anilist] ${status} server error (attempt ${attempt + 1}/3)`);
        if (attempt < 2) { await sleep(Math.pow(2, attempt) * 1000); continue; }
      }

      const gqlErrors = e.response?.data?.errors;
      if (gqlErrors) throw new Error(gqlErrors.map(e => e.message).join(", "));
      throw e;
    }
  }
}

// Fragment reused across queries
const MEDIA_FRAGMENT = `
  id
  idMal
  title { romaji english native }
  description(asHtml: false)
  coverImage { extraLarge large medium }
  bannerImage
  format
  status
  episodes
  duration
  season
  seasonYear
  averageScore
  popularity
  genres
  studios(isMain: true) { nodes { name } }
  startDate { year month day }
  endDate   { year month day }
  trailer { id site }
  synonyms
  nextAiringEpisode { airingAt episode }
  externalLinks { url site }
`;

// Normalise a raw AniList media object to our app's shape
export function normalizeMedia(m) {
  if (!m) return null;
  const title = m.title?.english || m.title?.romaji || m.title?.native || "";
  const slug  = toSlug(title, m.id);
  return {
    id:          slug,               // used for /anime/[id] routes
    anilistId:   m.id,
    malId:       m.idMal,
    name:        title,
    jname:       m.title?.native || m.title?.romaji || "",
    poster:      m.coverImage?.extraLarge || m.coverImage?.large || "",
    banner:      m.bannerImage || m.coverImage?.extraLarge || "",
    description: m.description || "",
    type:        m.format || "",
    status:      m.status || "",
    rating:      m.averageScore ? `${m.averageScore}%` : "",
    duration:    m.duration ? `${m.duration}m` : "",
    genres:      m.genres || [],
    studios:     m.studios?.nodes?.map(s => s.name).join(", ") || "",
    season:      m.season && m.seasonYear ? `${m.season} ${m.seasonYear}` : "",
    episodes: {
      sub: m.episodes || 0,
      dub: 0,
    },
    startDate: m.startDate
      ? `${m.startDate.year || ""}${m.startDate.month ? `-${String(m.startDate.month).padStart(2,"0")}` : ""}${m.startDate.day ? `-${String(m.startDate.day).padStart(2,"0")}` : ""}`
      : "",
    nextAiring: m.nextAiringEpisode || null,
    trailer:    m.trailer || null,
  };
}

/** Convert title + id to a URL-safe slug: "Frieren: Beyond Journey's End" → "frieren-beyond-journeys-end-12345" */
// Re-exported from utils.js so client components can import from there safely
export function toSlug(title, id) { return _toSlug(title, id); }
export function idFromSlug(slug) { return _idFromSlug(slug); }

// ── API methods ───────────────────────────────────────────────────────────────

export async function getHomePage() {
  const data = await query(`
    query {
      trending: Page(page: 1, perPage: 12) {
        media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${MEDIA_FRAGMENT} }
      }
      popular: Page(page: 1, perPage: 16) {
        media(sort: POPULARITY_DESC, type: ANIME, isAdult: false, status: RELEASING) { ${MEDIA_FRAGMENT} }
      }
      topRated: Page(page: 1, perPage: 10) {
        media(sort: SCORE_DESC, type: ANIME, isAdult: false, format_not_in: [MUSIC]) { ${MEDIA_FRAGMENT} }
      }
      upcoming: Page(page: 1, perPage: 10) {
        media(sort: POPULARITY_DESC, type: ANIME, isAdult: false, status: NOT_YET_RELEASED) { ${MEDIA_FRAGMENT} }
      }
      recentlyUpdated: Page(page: 1, perPage: 16) {
        media(sort: UPDATED_AT_DESC, type: ANIME, isAdult: false, status: RELEASING) { ${MEDIA_FRAGMENT} }
      }
    }
  `);

  const trending       = (data?.trending?.media       || []).map(normalizeMedia).filter(Boolean);
  const popular        = (data?.popular?.media         || []).map(normalizeMedia).filter(Boolean);
  const topRated       = (data?.topRated?.media        || []).map(normalizeMedia).filter(Boolean);
  const upcoming       = (data?.upcoming?.media        || []).map(normalizeMedia).filter(Boolean);
  const recentlyUpdated= (data?.recentlyUpdated?.media || []).map(normalizeMedia).filter(Boolean);

  return {
    spotlightAnimes:       trending.slice(0, 8).map((a, i) => ({ ...a, rank: i + 1, otherInfo: [a.type, a.season, a.status].filter(Boolean) })),
    trendingAnimes:        trending,
    latestEpisodeAnimes:   recentlyUpdated,
    topAiringAnimes:       popular,
    mostFavoriteAnimes:    topRated,
    latestCompletedAnimes: topRated.slice(0, 10),
    top10Animes: { today: trending.slice(0, 10), week: popular.slice(0, 10) },
  };
}

export async function searchAniList(q, page = 1) {
  const data = await query(`
    query($search: String, $page: Int) {
      Page(page: $page, perPage: 20) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${MEDIA_FRAGMENT} }
      }
    }
  `, { search: q, page: Number(page) });

  const page_data = data?.Page;
  return {
    animes:      (page_data?.media || []).map(normalizeMedia).filter(Boolean),
    totalPages:  page_data?.pageInfo?.lastPage  ?? 1,
    hasNextPage: page_data?.pageInfo?.hasNextPage ?? false,
    currentPage: Number(page),
  };
}

export async function getAnimeBySlug(slug) {
  const anilistId = idFromSlug(slug);
  if (!anilistId) return null;

  const data = await query(`
    query($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FRAGMENT}
        relations {
          edges {
            relationType(version: 2)
            node { id title { romaji english } coverImage { large } format episodes }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 8) {
          nodes { mediaRecommendation { ${MEDIA_FRAGMENT} } }
        }
        characters(sort: ROLE, perPage: 20) {
          edges { role node { id name { full } image { medium } } }
        }
      }
    }
  `, { id: anilistId });

  const m = data?.Media;
  if (!m) return null;
  const base = normalizeMedia(m);

  // Related (seasons, prequels, sequels)
  const relatedAnimes = (m.relations?.edges || [])
    .filter(e => ["PREQUEL","SEQUEL","SIDE_STORY","PARENT","ALTERNATIVE"].includes(e.relationType))
    .map(e => normalizeMedia(e.node)).filter(Boolean);

  // Recommended
  const recommendedAnimes = (m.recommendations?.nodes || [])
    .map(n => normalizeMedia(n.mediaRecommendation)).filter(Boolean);

  // Characters
  const characters = (m.characters?.edges || []).map(e => ({
    id:    e.node?.id,
    name:  e.node?.name?.full || "",
    image: e.node?.image?.medium || "",
    role:  e.role || "SUPPORTING",
  })).filter(c => c.name);

  return {
    anime: {
      info: base,
      moreInfo: {
        type:    m.format    || "",
        status:  m.status    || "",
        aired:   base.startDate || "",
        studios: base.studios,
        genres:  m.genres || [],
        duration: base.duration,
        season:  base.season,
      },
    },
    relatedAnimes,
    recommendedAnimes,
    seasons: relatedAnimes.filter(a => a.type === "TV" || a.type === "OVA"),
    characters,
  };
}

export async function getCategoryPage(category, page = 1) {
  const queryMap = {
    "top-airing":       { sort: "POPULARITY_DESC", status: "RELEASING" },
    "most-popular":     { sort: "POPULARITY_DESC" },
    "most-favorite":    { sort: "FAVOURITES_DESC" },
    "upcoming":         { sort: "POPULARITY_DESC", status: "NOT_YET_RELEASED" },
    "top-upcoming":     { sort: "POPULARITY_DESC", status: "NOT_YET_RELEASED" },
    "recently-updated": { sort: "UPDATED_AT_DESC", status: "RELEASING" },
    "completed":        { sort: "SCORE_DESC",       status: "FINISHED" },
    "recently-added":   { sort: "ID_DESC" },
  };

  // Genre support: "genre/action"
  let genre = null;
  if (category.startsWith("genre/")) {
    genre = category.replace("genre/", "").replace(/-/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase()); // "sci-fi" → "Sci-Fi"
  }

  const cfg = queryMap[category] || { sort: "POPULARITY_DESC" };
  const sortEnum = cfg.sort;
  const statusFilter = cfg.status ? `status: ${cfg.status}` : "";
  const genreFilter  = genre ? `genre: "${genre}"` : "";

  const data = await query(`
    query($page: Int) {
      Page(page: $page, perPage: 24) {
        pageInfo { total currentPage lastPage hasNextPage }
        media(sort: ${sortEnum}, type: ANIME, isAdult: false ${statusFilter ? `, ${statusFilter}` : ""} ${genreFilter ? `, ${genreFilter}` : ""}, format_not_in: [MUSIC]) {
          ${MEDIA_FRAGMENT}
        }
      }
    }
  `, { page: Number(page) });

  const pg = data?.Page;
  return {
    animes:      (pg?.media || []).map(normalizeMedia).filter(Boolean),
    totalPages:  pg?.pageInfo?.lastPage  ?? 1,
    hasNextPage: pg?.pageInfo?.hasNextPage ?? false,
    category,
    currentPage: Number(page),
  };
}

/**
 * Fetch episode metadata from AniList for a given anime (by AniList ID).
 * Returns: { episodes: [{number, title, airDate}], totalEpisodes }
 * Note: AniList doesn't have episode lists for all anime; returns count-based fallback.
 */
export async function getAniListEpisodeMeta(anilistId) {
  const data = await query(`
    query($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        episodes
        title { romaji english native }
        synonyms
        seasonYear
        nextAiringEpisode { episode }
        externalLinks { url site }
        airingSchedule(notYetAired: false, perPage: 50) {
          nodes { episode airingAt }
        }
      }
    }
  `, { id: anilistId });

  const m = data?.Media;
  if (!m) return { episodes: [], totalEpisodes: 0, title: "", malId: null };

  const title      = m.title?.english || m.title?.romaji || "";
  const totalEps   = m.episodes || m.nextAiringEpisode?.episode || 0;
  const airNodes   = m.airingSchedule?.nodes || [];

  // Build episode list — AniList only has airing dates, not titles
  // Air dates come from AniList airingSchedule
  const episodes = Array.from({ length: totalEps }, (_, i) => {
    const node = airNodes.find(n => n.episode === i + 1);
    return {
      number:  i + 1,
      airDate: node ? new Date(node.airingAt * 1000).toISOString().split("T")[0] : "",
    };
  });

  // Extract TMDB ID from AniList externalLinks
  // Site name varies: "Themoviedb", "TheMovieDb", "TMDB" etc — use helper for robust matching
  // Extract TMDB ID from externalLinks (used ONLY for iframe embed providers)
  const tmdbInfo = _extractTmdb(m.externalLinks || []);
  const tmdbId   = tmdbInfo?.tmdbId || null;

  // All title variants for matching fallback
  const allTitles = [
    m.title?.english, m.title?.romaji, m.title?.native,
    ...(m.synonyms || [])
  ].filter(Boolean);

  return { episodes, totalEpisodes: totalEps, title, allTitles, malId: m.idMal, anilistId: m.id, seasonYear: m.seasonYear || null, tmdbId };
}
