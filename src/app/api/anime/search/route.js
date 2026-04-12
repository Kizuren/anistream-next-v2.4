/**
 * GET /api/anime/search?q=&page=
 *
 * Single source: AniList GraphQL only.
 * Cached in all available layers (Redis → SQLite → memory).
 *
 * Also persists each result to anime_meta table so future ID lookups
 * don't need another API call.
 */
import { NextResponse } from "next/server";
import { searchAnime } from "@/lib/scraper";
import { getCachedAsync, setCachedAsync, saveAnimeMeta } from "@/lib/cache";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q    = (searchParams.get("q") || "").trim();
  const page = searchParams.get("page") || "1";

  if (!q) return NextResponse.json({ animes: [], totalPages: 0 });

  const key = `search:${q.toLowerCase()}:${page}`;
  try {
    // Check all cache layers first
    const cached = await getCachedAsync(key);
    if (cached) return NextResponse.json(cached);

    // Single API call — AniList only
    const data = await searchAnime(q, page);

    // Cache the result (10 min — search results are stable)
    await setCachedAsync(key, data, 600);

    // Persist each result's metadata for future ID lookups
    if (data?.animes?.length) {
      for (const anime of data.animes) {
        saveAnimeMeta(anime).catch(() => {}); // fire-and-forget
      }
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
    });
  } catch (err) {
    console.error("[search]", err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
