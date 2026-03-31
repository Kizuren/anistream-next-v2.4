/**
 * Debug: GET /api/debug/anilist?id=151807
 * Shows raw AniList external links so we can see the exact site name for TMDB.
 */
import { NextResponse } from "next/server";
import axios from "axios";
import { extractTmdbIdFromLinks } from "@/lib/tmdb";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") || "151807");

  try {
    const { data } = await axios.post("https://graphql.anilist.co", {
      query: `query($id:Int){Media(id:$id,type:ANIME){
        id idMal title{english romaji}
        externalLinks{url site siteId}
      }}`,
      variables: { id }
    }, { timeout:10000, headers:{"Content-Type":"application/json",Accept:"application/json"} });

    const m = data?.data?.Media;
    const links = m?.externalLinks || [];
    const tmdbInfo = extractTmdbIdFromLinks(links);

    return NextResponse.json({
      id:            m?.id,
      idMal:         m?.idMal,
      title:         m?.title,
      tmdbExtracted: tmdbInfo,
      externalLinks: links,
    });
  } catch(e) {
    return NextResponse.json({ error: e.message });
  }
}
