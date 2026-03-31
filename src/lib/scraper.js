/**
 * scraper.js — adapter layer
 *
 * Metadata : AniList GraphQL (anilist.co) — home, search, info, browse
 * Episodes : AniList GraphQL (air dates, episode count)
 * Streaming: Multiple iframe providers (providers.js) — no single point of failure
 */

export {
  getHomePage    as getHome,
  searchAniList  as searchAnime,
  getAnimeBySlug as getAnimeInfo,
  getCategoryPage as getCategoryAnimes,
} from "./anilist.js";

export { buildEpisodeList as getEpisodes } from "./episodes.js";
