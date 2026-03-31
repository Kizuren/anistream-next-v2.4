/**
 * Watch progress — persists to localStorage
 * Key: watchProgress
 * Value: { [animeId]: { animeId, animeName, poster, epSlug, epNumber, epTitle, watchedAt } }
 */

const KEY = "animedex_progress";

export function getProgress() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function saveProgress({ animeId, animeName, poster, epSlug, epNumber, epTitle }) {
  if (typeof window === "undefined") return;
  const all = getProgress();
  all[animeId] = { animeId, animeName, poster, epSlug, epNumber: Number(epNumber), epTitle, watchedAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getRecentlyWatched(limit = 10) {
  const all = getProgress();
  return Object.values(all)
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, limit);
}

export function clearProgress(animeId) {
  if (typeof window === "undefined") return;
  const all = getProgress();
  delete all[animeId];
  localStorage.setItem(KEY, JSON.stringify(all));
}
