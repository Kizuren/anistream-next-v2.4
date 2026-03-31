/**
 * Pure utility functions — safe to import in both client and server components.
 * No external dependencies.
 */

/**
 * Convert a title + AniList ID to a URL slug.
 * "Frieren: Beyond Journey's End" + 154587 → "frieren-beyond-journeys-end-154587"
 */
export function toSlug(title = "", id = "") {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-$/, "");
  return `${base}-${id}`;
}

/**
 * Extract AniList numeric ID from a slug.
 * "frieren-beyond-journeys-end-154587" → 154587
 */
export function idFromSlug(slug = "") {
  const m = slug.match(/-(\d+)$/);
  return m ? parseInt(m[1]) : null;
}
