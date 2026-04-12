/**
 * anilistClient.js — Client-side AniList GraphQL helper
 *
 * All calls go through /api/anilist/medialist which adds the Bearer token
 * server-side from the httpOnly cookie. The browser never touches the token.
 *
 * Covers:
 *   - saveMediaListEntry  (add/update anime in user's list)
 *   - deleteMediaListEntry
 *   - getUserMediaList    (CURRENT, PLANNING, COMPLETED, DROPPED, PAUSED)
 *   - getUserStats        (full statistics object)
 *   - getUserWatching     (currently watching — for home page)
 */

const PROXY = "/api/anilist/medialist";

async function gql(query, variables = {}) {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("NOT_AUTHENTICATED");
    throw new Error(`AniList error ${res.status}`);
  }
  const data = await res.json();
  if (data.errors?.length) {
    // 401 from AniList itself
    if (data.errors.some(e => e.status === 401)) throw new Error("NOT_AUTHENTICATED");
    throw new Error(data.errors[0].message || "AniList GraphQL error");
  }
  return data.data;
}

/* ── Media list status values ─────────────────────────────────────── */
export const LIST_STATUS = {
  CURRENT:   "CURRENT",    // Watching
  PLANNING:  "PLANNING",   // Plan to Watch
  COMPLETED: "COMPLETED",  // Completed
  DROPPED:   "DROPPED",    // Dropped
  PAUSED:    "PAUSED",     // On Hold
  REPEATING: "REPEATING",  // Rewatching
};

export const STATUS_LABELS = {
  CURRENT:   "Watching",
  PLANNING:  "Plan to Watch",
  COMPLETED: "Completed",
  DROPPED:   "Dropped",
  PAUSED:    "On Hold",
  REPEATING: "Rewatching",
};

/* ── Save / update a media list entry ────────────────────────────── */
export async function saveMediaListEntry({ mediaId, status, score, progress }) {
  const vars = { mediaId: Number(mediaId) };
  if (status   !== undefined) vars.status   = status;
  if (score    !== undefined) vars.score    = Number(score);   // 0-100
  if (progress !== undefined) vars.progress = Number(progress);

  return gql(`
    mutation SaveMediaListEntry(
      $mediaId: Int, $status: MediaListStatus,
      $score: Float, $progress: Int
    ) {
      SaveMediaListEntry(
        mediaId: $mediaId, status: $status,
        score: $score, progress: $progress
      ) {
        id status score progress startedAt { year month day }
      }
    }
  `, vars);
}

/* ── Delete a media list entry ────────────────────────────────────── */
export async function deleteMediaListEntry(id) {
  return gql(`
    mutation DeleteMediaListEntry($id: Int) {
      DeleteMediaListEntry(id: $id) { deleted }
    }
  `, { id: Number(id) });
}

/* ── Get the current viewer's list entry for one anime ───────────── */
export async function getMediaListEntry(mediaId) {
  const data = await gql(`
    query GetMediaListEntry($mediaId: Int) {
      MediaList(mediaId: $mediaId, userId: null) {
        id status score progress
      }
    }
  `, { mediaId: Number(mediaId) }).catch(() => null);
  return data?.MediaList || null;
}

/* ── Get viewer's list by status ─────────────────────────────────── */
export async function getUserMediaList(status, page = 1) {
  const data = await gql(`
    query GetUserMediaList($status: MediaListStatus, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage total }
        mediaList(status: $status, type: ANIME, sort: UPDATED_TIME_DESC) {
          id status score progress updatedAt
          media {
            id
            title { romaji english }
            coverImage { large }
            episodes
            format
            status
            nextAiringEpisode { episode airingAt }
          }
        }
      }
    }
  `, { status, page });
  return data?.Page || { mediaList: [], pageInfo: { hasNextPage: false, total: 0 } };
}

/* ── Get viewer's full statistics ────────────────────────────────── */
export async function getUserStats() {
  const data = await gql(`
    query GetViewerStats {
      Viewer {
        statistics {
          anime {
            count episodesWatched minutesWatched meanScore standardDeviation
            scores(sort: SCORE) { score count }
            genres(limit: 10, sort: COUNT_DESC) { genre count meanScore minutesWatched }
            formats { format count minutesWatched }
            statuses { status count minutesWatched }
            releaseYears(sort: YEAR_DESC, limit: 5) { releaseYear count minutesWatched }
          }
        }
      }
    }
  `);
  return data?.Viewer?.statistics?.anime || null;
}

/* ── Get currently watching — for home page continuous watching ───── */
export async function getUserWatching() {
  const page = await getUserMediaList("CURRENT", 1);
  return (page.mediaList || []).map(entry => {
    const m = entry.media;
    const title = m.title?.english || m.title?.romaji || "";
    return {
      animeId:   String(m.id),
      animeName: title,
      poster:    m.coverImage?.large || "",
      epSlug:    `ep-${entry.progress + 1}`,
      epNumber:  entry.progress + 1,
      score:     entry.score,
      progress:  entry.progress,
      total:     m.episodes,
      nextAiring: m.nextAiringEpisode,
      source:    "anilist",
    };
  });
}
