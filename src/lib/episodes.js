/**
 * episodes.js — Episode list builder (SERVER-SIDE ONLY)
 *
 * Data source: AniList GraphQL API exclusively.
 * NO dependency on TMDB for episode metadata.
 * NO dependency on TMDB for episode data.
 *
 * AniList provides:
 *   - Total episode count (Media.episodes)
 *   - Air dates via airingSchedule (up to 50 aired episodes per query)
 *   - Next airing episode info
 *
 * Episode titles come from Crysoline sources at stream time (not pre-fetched).
 * This keeps the episode list fast and reliable.
 *
 * TMDB is used ONLY in providers.js for iframe embed URLs — not here.
 */

import { getAniListEpisodeMeta } from "./anilist.js";
import { getCached, setCached } from "./cache.js";

/**
 * Build a clean episode list purely from AniList data.
 *
 * @param {object} p
 * @param {number}   p.anilistId
 * @param {number}   p.totalEpisodes   - From AniList Media.episodes
 * @param {object[]} p.anilistEps      - [{ number, airDate }] from airingSchedule
 * @param {number}   [p.nextAiring]    - Next airing episode number
 *
 * @returns {Array<{
 *   number:  number,
 *   epSlug:  string,   // "ep-N" for URL routing
 *   airDate: string,   // "YYYY-MM-DD" or ""
 *   // NOTE: no tmdbId, no hianimeId — those are handled at stream time
 * }>}
 */
function buildFromAniList({ totalEpisodes, anilistEps = [], nextAiring = null }) {
  const airMap = new Map(anilistEps.map(e => [e.number, e.airDate]));
  const count  = Math.max(totalEpisodes || 0, anilistEps.length);
  if (count === 0) return [];

  return Array.from({ length: count }, (_, i) => ({
    number:  i + 1,
    epSlug:  `ep-${i + 1}`,
    airDate: airMap.get(i + 1) || "",
  }));
}

/**
 * Main export: get episode list for an anime (by AniList ID).
 * Cached for 10 minutes.
 *
 * @param {number} anilistId
 * @returns {Promise<{ episodes, totalEpisodes, title, allTitles, malId, tmdbId }>}
 */
export async function getEpisodeList(anilistId) {
  const key    = `eps_al:${anilistId}`;
  const cached = getCached(key);
  if (cached) return cached;

  const meta = await getAniListEpisodeMeta(anilistId);

  const episodes = buildFromAniList({
    totalEpisodes: meta.totalEpisodes,
    anilistEps:    meta.episodes || [],
    nextAiring:    meta.nextAiringEpisode?.episode || null,
  });

  const result = {
    episodes,
    totalEpisodes: episodes.length,
    title:         meta.title,
    allTitles:     meta.allTitles || [],
    malId:         meta.malId,
    anilistId:     meta.anilistId || anilistId,
    seasonYear:    meta.seasonYear,
    // tmdbId is passed through for use by iframe providers ONLY
    tmdbId:        meta.tmdbId || null,
  };

  if (episodes.length > 0) setCached(key, result, 600);
  console.log(`[episodes] "${meta.title}" → ${episodes.length} eps (AniList only)`);
  return result;
}

/**
 * Keep buildEpisodeList as a compatibility wrapper.
 * Previous callers used this signature.
 */
export async function buildEpisodeList({ anilistId, totalEpisodes, title, allTitles, tmdbId, seasonYear }) {
  // Just use AniList — ignore any TMDB-related params (they're only for embeds)
  return getEpisodeList(anilistId);
}
