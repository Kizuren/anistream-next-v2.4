/**
 * AniList OAuth 2.0 Authentication
 *
 * ── Setup ─────────────────────────────────────────────────────────────────
 * 1. Go to https://anilist.co/settings/developer
 * 2. Click "+ New Client", set:
 *      Name:         AnimeDex (or anything)
 *      Redirect URI: https://your-site.vercel.app/api/auth/callback
 *                    (use http://localhost:3000/api/auth/callback for local dev)
 *      Type:         Web  ← IMPORTANT: must be "Web" not "Pin"
 * 3. Add to Vercel environment variables:
 *      ANILIST_CLIENT_ID      = the numeric ID shown in your AniList app
 *      ANILIST_CLIENT_SECRET  = the secret key shown in your AniList app
 *      ANILIST_REDIRECT_URI   = https://your-site.vercel.app/api/auth/callback
 *      NEXTAUTH_SECRET        = any random 32+ char string
 *
 * ── Common "invalid_client" causes ────────────────────────────────────────
 * • ANILIST_REDIRECT_URI doesn't match EXACTLY what's in your AniList app
 *   (even a trailing slash difference breaks it)
 * • Wrong client_id / client_secret copied
 * • Sending x-www-form-urlencoded instead of application/json in token exchange
 *   (AniList requires JSON — we handle this correctly in the callback route)
 * • App type is "Pin" instead of "Web"
 */

export const ANILIST_AUTH_URL  = "https://anilist.co/api/v2/oauth/authorize";
export const ANILIST_TOKEN_URL = "https://anilist.co/api/v2/oauth/token";
export const ANILIST_GRAPHQL   = "https://graphql.anilist.co";

/** Build the AniList OAuth authorization URL */
export function getAuthUrl() {
  const clientId    = process.env.ANILIST_CLIENT_ID    || "";
  const redirectUri = process.env.ANILIST_REDIRECT_URI || "http://localhost:3000/api/auth/callback";

  if (!clientId) {
    console.error("[auth] ANILIST_CLIENT_ID is not set — OAuth will fail");
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
  });

  return `${ANILIST_AUTH_URL}?${params}`;
}

/**
 * Fetch the logged-in user's AniList profile using their access token.
 * Returns null if the token is invalid or expired.
 */
export async function fetchAniListUser(accessToken) {
  try {
    const res = await fetch(ANILIST_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Accept":        "application/json",
      },
      body: JSON.stringify({
        query: `{
          Viewer {
            id name about
            avatar { large medium }
            bannerImage
            statistics {
              anime {
                count episodesWatched minutesWatched
                meanScore
                genres(limit: 5, sort: COUNT_DESC) { genre count }
              }
            }
            siteUrl
          }
        }`,
      }),
    });

    if (!res.ok) {
      console.error(`[auth] fetchAniListUser HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (data.errors?.length) {
      console.error("[auth] fetchAniListUser GraphQL errors:", data.errors);
      return null;
    }

    return data?.data?.Viewer || null;
  } catch (e) {
    console.error("[auth] fetchAniListUser error:", e.message);
    return null;
  }
}

/**
 * Watch progress stored in localStorage (client-side).
 * Structure: { [animeId]: { epSlug, epNumber, animeTitle, poster, timestamp } }
 */
export const WATCH_KEY = "animedex_watch_progress";

export function getWatchProgress() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(WATCH_KEY) || "{}"); } catch { return {}; }
}

export function saveWatchProgress({ animeId, epSlug, epNumber, animeTitle, poster }) {
  if (typeof window === "undefined") return;
  const progress = getWatchProgress();
  progress[animeId] = { epSlug, epNumber, animeTitle, poster, timestamp: Date.now() };
  const sorted = Object.entries(progress)
    .sort(([, a], [, b]) => b.timestamp - a.timestamp)
    .slice(0, 20);
  localStorage.setItem(WATCH_KEY, JSON.stringify(Object.fromEntries(sorted)));
}

export function getRecentlyWatched(limit = 8) {
  const progress = getWatchProgress();
  return Object.entries(progress)
    .sort(([, a], [, b]) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map(([animeId, data]) => ({ animeId, ...data }));
}
