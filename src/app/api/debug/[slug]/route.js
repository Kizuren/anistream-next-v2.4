/**
 * Debug: GET /api/debug/<slug>
 * e.g. http://localhost:3000/api/debug/solo-leveling-151807
 *
 * Shows: AniList metadata, Crysoline source mappings, and embed URLs.
 * TMDB ID is shown only for iframe embed reference (not used for metadata).
 */
import { NextResponse } from "next/server";
import { idFromSlug, getAniListEpisodeMeta } from "@/lib/anilist";
import { getEpisodeList } from "@/lib/episodes";
import { mapAnilistToEnSources, CRYSOLINE_SOURCES } from "@/lib/crysoline";
import { PROVIDERS, buildEmbedUrl } from "@/lib/providers";

export async function GET(request, { params }) {
  const { slug } = params;
  const anilistId = idFromSlug(slug);
  if (!anilistId) return NextResponse.json({ error: "No AniList ID in slug" });

  const result = { slug, anilistId };

  try {
    // AniList metadata (primary source)
    const meta = await getAniListEpisodeMeta(anilistId);
    result.anilist = {
      title:         meta.title,
      allTitles:     meta.allTitles,
      totalEpisodes: meta.totalEpisodes,
      malId:         meta.malId,
      seasonYear:    meta.seasonYear,
      tmdbId:        meta.tmdbId || null, // embed-only reference
    };

    // Episode list (AniList only)
    const epData = await getEpisodeList(anilistId);
    result.episodes = { count: epData.episodes.length, sample: epData.episodes.slice(0,3) };

    // Crysoline source mappings (via Mapper API)
    const idMap = await mapAnilistToEnSources(anilistId);
    result.crysolineSources = {};
    for (const [sourceId, mappedId] of idMap) {
      const src = CRYSOLINE_SOURCES.find(s => s.id === sourceId);
      result.crysolineSources[sourceId] = {
        mappedId,
        name: src?.name,
        langs: src?.langs,
      };
    }
    result.crysolineCount = idMap.size;

    // Iframe embed URLs (TMDB-based, embed only)
    if (meta.tmdbId) {
      const embedCtx = { tmdbId: meta.tmdbId, season: 1, episode: 1, type: "tv", lang: "sub" };
      result.embedUrls = {};
      for (const p of PROVIDERS.slice(0, 4)) {
        result.embedUrls[p.name] = buildEmbedUrl(p.id, embedCtx) || "unavailable";
      }
    }
  } catch (e) {
    result.error = e.message;
  }

  return NextResponse.json(result);
}
