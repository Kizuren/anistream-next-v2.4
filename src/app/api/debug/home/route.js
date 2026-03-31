import { NextResponse } from "next/server";
import { getHomePage } from "@/lib/anilist";

export async function GET() {
  try {
    const data = await getHomePage();
    return NextResponse.json({
      spotlight:  data.spotlightAnimes?.length  || 0,
      trending:   data.trendingAnimes?.length   || 0,
      latest:     data.latestEpisodeAnimes?.length || 0,
      topAiring:  data.topAiringAnimes?.length  || 0,
      sample:     data.trendingAnimes?.[0] ? { name: data.trendingAnimes[0].name, id: data.trendingAnimes[0].id } : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
