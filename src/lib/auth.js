/**
 * AniList OAuth 2.0 Authentication
 *
 * Setup:
 *  1. Go to https://anilist.co/settings/developer
 *  2. Create a new client. Set redirect URI to: http://localhost:3000/api/auth/callback
 *  3. Add to .env.local:
 *       ANILIST_CLIENT_ID=your_client_id
 *       ANILIST_CLIENT_SECRET=your_client_secret
 *       ANILIST_REDIRECT_URI=http://localhost:3000/api/auth/callback
 *       NEXTAUTH_SECRET=any_random_string_32_chars
 */

export const ANILIST_AUTH_URL   = "https://anilist.co/api/v2/oauth/authorize";
export const ANILIST_TOKEN_URL  = "https://anilist.co/api/v2/oauth/token";
export const ANILIST_GRAPHQL    = "https://graphql.anilist.co";

export function getAuthUrl() {
  const params = new URLSearchParams({
    client_id:     process.env.ANILIST_CLIENT_ID || "",
    redirect_uri:  process.env.ANILIST_REDIRECT_URI || "http://localhost:3000/api/auth/callback",
    response_type: "code",
  });
  return `${ANILIST_AUTH_URL}?${params}`;
}

/** Fetch the logged-in user's AniList profile */
export async function fetchAniListUser(accessToken) {
  const res = await fetch(ANILIST_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
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
  const data = await res.json();
  return data?.data?.Viewer || null;
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
  // Keep only latest 20
  const sorted = Object.entries(progress)
    .sort(([,a],[,b]) => b.timestamp - a.timestamp)
    .slice(0, 20);
  localStorage.setItem(WATCH_KEY, JSON.stringify(Object.fromEntries(sorted)));
}

export function getRecentlyWatched(limit = 8) {
  const progress = getWatchProgress();
  return Object.entries(progress)
    .sort(([,a],[,b]) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map(([animeId, data]) => ({ animeId, ...data }));
}
