/**
 * GET /api/auth/me
 * Returns the current user from the httpOnly cookie.
 */
import { NextResponse } from "next/server";
import { fetchAniListUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const token = request.cookies.get("al_token")?.value;
    if (!token) return NextResponse.json({ user: null });

    // Try cheap cookie-cached user first
    const cachedRaw = request.cookies.get("al_user")?.value;
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (cached?.id) return NextResponse.json({ user: cached });
      } catch {}
    }

    // Fallback: hit AniList API
    const user = await fetchAniListUser(token);
    return NextResponse.json({ user: user || null });
  } catch {
    return NextResponse.json({ user: null });
  }
}
