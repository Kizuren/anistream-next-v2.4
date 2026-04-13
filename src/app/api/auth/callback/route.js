import { NextResponse } from "next/server";
import { ANILIST_TOKEN_URL, fetchAniListUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  // AniList redirects here with ?error= if the user denied access
  if (error) {
    console.error("[auth] AniList denied access:", error);
    return NextResponse.redirect(new URL("/?error=access_denied", request.url));
  }

  if (!code) {
    console.error("[auth] No code param in callback");
    return NextResponse.redirect(new URL("/?error=no_code", request.url));
  }

  // Validate env vars before making the request
  const clientId     = process.env.ANILIST_CLIENT_ID;
  const clientSecret = process.env.ANILIST_CLIENT_SECRET;
  const redirectUri  = process.env.ANILIST_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error("[auth] Missing env vars:", {
      hasClientId:     !!clientId,
      hasClientSecret: !!clientSecret,
      hasRedirectUri:  !!redirectUri,
    });
    return NextResponse.redirect(new URL("/?error=server_misconfigured", request.url));
  }

  try {
    /**
     * AniList OAuth token exchange.
     *
     * IMPORTANT: AniList requires JSON body (application/json), NOT
     * application/x-www-form-urlencoded. Sending form-encoded causes
     * the "invalid_client" error even with correct credentials.
     *
     * Ref: https://anilist.gitbook.io/anilist-apiv2-docs/overview/oauth/authorization-code-grant
     */
    const tokenRes = await fetch(ANILIST_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
      },
      body: JSON.stringify({
        grant_type:    "authorization_code",
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      // Surface the exact AniList error so it's visible in Vercel logs
      console.error("[auth] Token exchange failed:", {
        status:  tokenRes.status,
        error:   tokenData.error,
        message: tokenData.message,
        hint:    tokenData.hint,
      });

      // Helpful hints for common errors
      if (tokenData.error === "invalid_client") {
        console.error(
          "[auth] invalid_client — check:\n" +
          "  1. ANILIST_CLIENT_ID matches your AniList app exactly\n" +
          "  2. ANILIST_CLIENT_SECRET matches your AniList app exactly\n" +
          `  3. ANILIST_REDIRECT_URI="${redirectUri}" matches EXACTLY what is set in your AniList app (no trailing slash difference)\n` +
          "  4. Your AniList app type is 'Web' (not 'Pin')"
        );
      }

      const errCode = tokenData.error || "token_failed";
      return NextResponse.redirect(new URL(`/?error=${errCode}`, request.url));
    }

    // Fetch user profile with the new token
    const user = await fetchAniListUser(tokenData.access_token);

    if (!user) {
      console.error("[auth] Got access token but fetchAniListUser returned null");
      return NextResponse.redirect(new URL("/?error=user_fetch_failed", request.url));
    }

    // Store token in httpOnly cookie — browser JS can never read this
    const response = NextResponse.redirect(new URL("/profile", request.url));

    response.cookies.set("al_token", tokenData.access_token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   tokenData.expires_in || 60 * 60 * 24 * 30,
      path:     "/",
    });

    // Non-sensitive user cache (for SSR — readable by JS but contains no secrets)
    response.cookies.set("al_user", JSON.stringify({
      id:     user.id,
      name:   user.name,
      avatar: user.avatar?.large || null,
    }), {
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24 * 30,
      path:     "/",
    });

    console.log(`[auth] Login successful: ${user.name} (id: ${user.id})`);
    return response;

  } catch (e) {
    console.error("[auth] Unexpected callback error:", e.message, e.stack);
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}
