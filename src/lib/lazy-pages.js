/**
 * lazy-pages.js — Code splitting setup
 *
 * Use these instead of direct imports in your page.js files.
 * Each component is lazy-loaded — its JS bundle is only downloaded
 * when the page is first visited, not on initial app load.
 *
 * In Next.js 14 App Router, use next/dynamic (which uses React.lazy internally):
 *
 *   import { LazyWatchClient } from "@/lib/lazy-pages";
 *   export default function Page() { return <LazyWatchClient ... />; }
 */
import dynamic from "next/dynamic";

// ── Loading skeletons ─────────────────────────────────────────────────────────
const PageSkeleton = () => (
  <div style={{ padding: "60px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1200, margin: "0 auto" }}>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="skeleton" style={{ height: 200, borderRadius: 8 }} />
    ))}
  </div>
);

const PlayerSkeleton = () => (
  <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
    <div className="skeleton" style={{ width: "100%", aspectRatio: "16/9", borderRadius: 8 }} />
    <div className="skeleton" style={{ height: 60, borderRadius: 6 }} />
    <div style={{ display: "flex", gap: 12 }}>
      <div className="skeleton" style={{ height: 40, flex: 1, borderRadius: 5 }} />
      <div className="skeleton" style={{ height: 40, flex: 1, borderRadius: 5 }} />
    </div>
  </div>
);

// ── Lazy components ───────────────────────────────────────────────────────────
export const LazyHomeClient = dynamic(
  () => import("@/components/HomeClient"),
  { loading: () => <PageSkeleton />, ssr: false }
);

export const LazyWatchClient = dynamic(
  () => import("@/components/WatchClient"),
  { loading: () => <PlayerSkeleton />, ssr: false }
);

export const LazyAnimeDetailClient = dynamic(
  () => import("@/components/AnimeDetailClient"),
  { loading: () => <PageSkeleton /> }  // SSR: yes — good for SEO
);

export const LazyBrowseClient = dynamic(
  () => import("@/components/BrowseClient"),
  { loading: () => <PageSkeleton />, ssr: false }
);

export const LazySearchClient = dynamic(
  () => import("@/components/SearchClient"),
  { loading: () => <PageSkeleton />, ssr: false }
);

export const LazyScheduleClient = dynamic(
  () => import("@/components/ScheduleClient"),
  { loading: () => <PageSkeleton />, ssr: false }
);

/**
 * USAGE IN page.js:
 *
 * // app/watch/[animeId]/[epSlug]/page.js
 * import { LazyWatchClient } from "@/lib/lazy-pages";
 *
 * export default function Page({ params }) {
 *   return <LazyWatchClient animeId={params.animeId} epSlug={params.epSlug} />;
 * }
 *
 * // This ensures the WatchClient bundle (hls.js, etc.) is NOT shipped to
 * // users who only visit the home page — massive first-load improvement.
 */
