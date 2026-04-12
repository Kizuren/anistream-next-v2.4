/**
 * POST /api/anilist/medialist
 * Authenticated AniList GraphQL proxy — mutations + queries needing a token.
 * Token stored server-side in httpOnly cookie, never exposed to browser.
 */
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const token = request.cookies.get("al_token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    // Pass through rate-limit headers
    const headers = new Headers({ "Content-Type": "application/json" });
    const rl = res.headers.get("x-ratelimit-remaining");
    if (rl) headers.set("x-ratelimit-remaining", rl);
    return NextResponse.json(data, { headers });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
