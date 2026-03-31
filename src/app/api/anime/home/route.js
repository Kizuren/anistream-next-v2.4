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
    return NextResponse.json(data);

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
