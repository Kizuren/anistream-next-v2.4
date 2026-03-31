/**
 * tmdb.js — TMDB helpers for IFRAME EMBEDS ONLY
 *
 * IMPORTANT: TMDB is NOT used for anime metadata, search, or episode data.
 * It is ONLY used by providers.js to construct iframe embed URLs.
 *
 * The only active function here is extractTmdbIdFromLinks(),
 * which reads a TMDB ID from AniList's externalLinks field
 * so iframe providers (AutoEmbed, VidSrc, etc.) can embed by TMDB ID.
 *
 * All episode metadata now comes from AniList directly.
 * All episode metadata now comes from AniList directly.
 */

/**
 * Extract a TMDB TV ID from AniList's externalLinks array.
 * AniList uses inconsistent site names: "Themoviedb", "TheMovieDb", "TMDB".
 *
 * @param {Array<{url: string, site: string}>} links
 * @returns {{ tmdbId: number, mediaType: string } | null}
 */
export function extractTmdbIdFromLinks(links = []) {
  const link = links.find(l => {
    const site = (l.site || "").toLowerCase();
    return site.includes("themovie") || site === "tmdb";
  });
  if (!link?.url) return null;
  const m = link.url.match(/\/(tv|movie)\/(\d+)/);
  return m ? { tmdbId: parseInt(m[2]), mediaType: m[1] } : null;
}
