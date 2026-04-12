import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600; // Schedule changes at most hourly

// Helper: get Unix timestamps for start and end of current week (Mon–Sun)
function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: Math.floor(monday.getTime() / 1000),
    end:   Math.floor(sunday.getTime() / 1000),
  };
}

const SCHEDULE_QUERY = `
  query($page: Int, $start: Int, $end: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      airingSchedules(
        airingAt_greater: $start
        airingAt_lesser: $end
        sort: TIME
      ) {
        airingAt
        episode
        media {
          id
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          format
          status
          episodes
          duration
          averageScore
          popularity
          genres
          studios(isMain: true) { nodes { name } }
          description(asHtml: false)
          season
          seasonYear
          nextAiringEpisode { airingAt episode }
          isAdult
        }
      }
    }
  }
`;

export async function GET() {
  try {
    const { start, end } = getWeekRange();

    // Fetch up to 2 pages (100 entries)
    const pages = await Promise.all([
      fetchPage(1, start, end),
      fetchPage(2, start, end),
    ]);

    const allSchedules = pages.flat().filter(Boolean);

    // Group by day of week (0=Mon, 6=Sun)
    const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const grouped = {};
    DAYS.forEach(d => { grouped[d] = []; });

    for (const entry of allSchedules) {
      if (entry.media?.isAdult) continue;
      const date = new Date(entry.airingAt * 1000);
      const jsDay = date.getDay(); // 0=Sun
      const dayIdx = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0
      const dayName = DAYS[dayIdx];
      const media = entry.media;
      if (!media) continue;

      grouped[dayName].push({
        airingAt: entry.airingAt,
        episode:  entry.episode,
        airingTime: date.toISOString(),
        anime: {
          id:     media.id,
          name:   media.title?.english || media.title?.romaji || media.title?.native || "",
          jname:  media.title?.native || media.title?.romaji || "",
          poster: media.coverImage?.extraLarge || media.coverImage?.large || "",
          type:   media.format || "",
          rating: media.averageScore ? `${media.averageScore}%` : "",
          episodes: { sub: media.episodes || 0, dub: 0 },
          genres: media.genres || [],
          status: media.status || "",
          description: (media.description || "").replace(/<[^>]*>/g, "").slice(0, 180),
        },
      });
    }

    return NextResponse.json({ schedule: grouped, days: DAYS }, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch (e) {
    console.error("[schedule] error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function fetchPage(page, start, end) {
  try {
    const axios = (await import("axios")).default;
    const { data } = await axios.post(
      "https://graphql.anilist.co",
      { query: SCHEDULE_QUERY, variables: { page, start, end } },
      {
        timeout: 15000,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      }
    );
    return data?.data?.Page?.airingSchedules || [];
  } catch {
    return [];
  }
}
