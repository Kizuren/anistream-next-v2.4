export const maxDuration = 30;
// Cache episodes at Vercel CDN edge — episode lists change rarely.
// Per-ID caching: CDN stores a separate response for each anime slug.
export const dynamic = "force-static";
export const revalidate = 3600; // Re-fetch at most every hour

import { NextResponse } from "next/server";
import { idFromSlug } from "@/lib/anilist";
import { getEpisodeList } from "@/lib/episodes";
import { getCachedAsync, setCachedAsync } from "@/lib/cache";

export async function GET(request, { params }) {
  const { id }    = params;
  const anilistId = idFromSlug(id);
  if (!anilistId) return NextResponse.json({ episodes: [], totalEpisodes: 0, error: "Invalid slug" });

  const key      = `eps_al:${anilistId}`;
  const staleKey = `eps_stale:${anilistId}`;

  // 1. Fresh cache (6 hour TTL)
  const cached = await getCachedAsync(key);
  if (cached) return NextResponse.json(cached, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });

  // 2. Live fetch
  try {
    const result = await getEpisodeList(anilistId);
    const out = {
      episodes:      result.episodes,
      totalEpisodes: result.totalEpisodes,
      tmdbId:        result.tmdbId || null,
    };
    if (result.episodes.length > 0) {
      await setCachedAsync(key,      out, 6 * 60 * 60);
      setCachedAsync(staleKey, out, 24 * 60 * 60).catch(() => {});
    }
    return NextResponse.json(out, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });

  } catch (err) {
    console.error(`[episodes/${id}]`, err.message);

    const stale = await getCachedAsync(staleKey);
    if (stale) {
      console.warn(`[episodes/${id}] Serving stale backup — ${err.message}`);
      return NextResponse.json({ ...stale, _stale: true });
    }

    return NextResponse.json({ episodes: [], totalEpisodes: 0, error: err.message });
  }
}
