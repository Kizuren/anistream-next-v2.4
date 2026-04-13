export const maxDuration = 30;
// Cache at Vercel CDN: revalidate every hour
export const revalidate = 3600;

import { NextResponse } from "next/server";
import { getAnimeInfo } from "@/lib/scraper";
import { getCachedAsync, setCachedAsync, saveAnimeMeta } from "@/lib/cache";

export async function GET(request, { params }) {
  const { id }     = (await params);
  const key        = `info:${id}`;
  const staleKey   = `info_stale:${id}`; // long-lived backup copy

  // 1. Try fresh cache first (6 hour TTL)
  const cached = await getCachedAsync(key);
  if (cached) return NextResponse.json(cached, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });

  // 2. Try live fetch
  try {
    const data = await getAnimeInfo(id);
    if (!data) return NextResponse.json({ error: "Not found", anime: null }, { status: 404 });

    if (data?.anime?.info) saveAnimeMeta(data.anime.info).catch(() => {});

    // Write to both the normal cache and a long-lived stale backup (24h)
    await setCachedAsync(key,      data, 6 * 60 * 60);  // 6 hours
    setCachedAsync(staleKey, data, 24 * 60 * 60).catch(() => {}); // 24h stale backup

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });

  } catch (err) {
    console.error(`[info/${id}]`, err.message);

    // 3. Serve long-lived stale backup rather than 502
    const stale = await getCachedAsync(staleKey);
    if (stale) {
      console.warn(`[info/${id}] Serving stale backup — ${err.message}`);
      return NextResponse.json({ ...stale, _stale: true });
    }

    return NextResponse.json({ error: err.message, anime: null }, { status: 502 });
  }
}
