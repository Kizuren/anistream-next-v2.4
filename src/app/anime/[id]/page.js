import AnimeDetailClient from "@/components/AnimeDetailClient";

// Force dynamic rendering — prevents webpack static analysis errors
// when client components reference server-only modules
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  return { title: `Anime — Animedex` };
}

export default function AnimeDetailPage({ params }) {
  return <AnimeDetailClient id={params.id} />;
}
