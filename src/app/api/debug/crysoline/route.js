/**
 * Debug: GET /api/debug/crysoline?anilistId=151807
 * Tests the Crysoline Mapper for a given AniList ID.
 * Shows which of the 24 sources have this anime mapped.
 */
import { NextResponse } from "next/server";
import { mapAnilistToAllSources, CRYSOLINE_SOURCES } from "@/lib/crysoline";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const anilistId = parseInt(searchParams.get("anilistId") || "0");
  if (!anilistId) {
    return NextResponse.json({ error: "Pass ?anilistId=NUMBER (e.g. ?anilistId=151807 for Solo Leveling)" });
  }

  const keySet = !!process.env.CRYSOLINE_API_KEY;
  if (!keySet) {
    return NextResponse.json({ error: "CRYSOLINE_API_KEY not set in .env.local" });
  }

  try {
    const idMap = await mapAnilistToAllSources(anilistId);
    const mapped = [];
    const unmapped = [];

    for (const src of CRYSOLINE_SOURCES) {
      const mappedId = idMap.get(src.id);
      if (mappedId) {
        mapped.push({ sourceId: src.id, name: src.name, mappedId, langs: src.langs, site: src.site });
      } else {
        unmapped.push({ sourceId: src.id, name: src.name, langs: src.langs });
      }
    }

    return NextResponse.json({
      anilistId,
      totalSources:  CRYSOLINE_SOURCES.length,
      mappedCount:   mapped.length,
      unmappedCount: unmapped.length,
      mapped,
      unmapped,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
