import { NextResponse } from "next/server";
import { ANILIST_TOKEN_URL, fetchAniListUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/?error=no_code", request.url));

  try {
    // Exchange code for access token
    const tokenRes = await fetch(ANILIST_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type:    "authorization_code",
        client_id:     process.env.ANILIST_CLIENT_ID,
        client_secret: process.env.ANILIST_CLIENT_SECRET,
        redirect_uri:  process.env.ANILIST_REDIRECT_URI || "http://localhost:3000/api/auth/callback",
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("No access token");

    // Store token in httpOnly cookie
    const user = await fetchAniListUser(tokenData.access_token);
    const response = NextResponse.redirect(new URL("/profile", request.url));
    response.cookies.set("al_token", tokenData.access_token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      maxAge: tokenData.expires_in || 60 * 60 * 24 * 30, path: "/",
    });
    response.cookies.set("al_user", JSON.stringify({
      id: user?.id, name: user?.name, avatar: user?.avatar?.large,
    }), { maxAge: 60 * 60 * 24 * 30, path: "/" });

    return response;
  } catch (e) {
    console.error("[auth] callback error:", e.message);
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}
