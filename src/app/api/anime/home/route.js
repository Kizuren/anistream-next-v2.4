export const maxDuration = 30;
// Remove force-dynamic so Vercel CDN can cache this response at the edge.
// s-maxage=300 means Vercel serves from CDN for 5 min (no origin hit).
// stale-while-revalidate=600 means CDN continues serving stale while refreshing.
export const dynamic = "force-static";
export const revalidate = 300; // Next.js ISR — regenerate at most every 5 min

import { NextResponse } from "next/server";
import { getHome } from "@/lib/scraper";
import { getCachedAsync, setCachedAsync } from "@/lib/cache";

const EMPTY = {
  spotlightAnimes: [], trendingAnimes: [], latestEpisodeAnimes: [],
  topAiringAnimes: [], mostFavoriteAnimes: [], top10Animes: { today: [], week: [] },
};

export async function GET() {
  const key      = "home";
  const staleKey = "home_stale";

  const cached = await getCachedAsync(key);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await getHome();
    await setCachedAsync(key,      data, 30 * 60);      // 30 min
    setCachedAsync(staleKey, data, 24 * 60 * 60).catch(() => {}); // 24h stale
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    });

  } catch (err) {
    console.error("[home]", err.message);

    const stale = await getCachedAsync(staleKey);
    if (stale) {
      console.warn(`[home] Serving stale backup — ${err.message}`);
      return NextResponse.json({ ...stale, _stale: true });
    }

    return NextResponse.json({ ...EMPTY, error: err.message });
  }
}
