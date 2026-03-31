/**
 * POST /api/auth/session
 * Called from the callback page with the raw access_token from AniList implicit flow.
 * Stores token in httpOnly cookie and returns the user profile.
 */
import { NextResponse } from "next/server";
import { fetchAniListUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { token } = await request.json();
    if (!token) return NextResponse.json({ error: "No token" }, { status: 400 });

    const user = await fetchAniListUser(token);
    if (!user)  return NextResponse.json({ error: "Could not fetch user" }, { status: 401 });

    const response = NextResponse.json({ user });

    // Store token in httpOnly cookie — never exposed to JS
    response.cookies.set("al_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 30,
      path:     "/",
    });

    // Store non-sensitive user info in a readable cookie for SSR
    response.cookies.set("al_user", JSON.stringify({
      id:     user.id,
      name:   user.name,
      avatar: user.avatar?.large || user.avatar?.medium || null,
    }), {
      secure:  process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:  60 * 60 * 24 * 30,
      path:    "/",
    });

    return response;
  } catch (e) {
    console.error("[auth/session]", e.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
