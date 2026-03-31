import WatchClient from "@/components/WatchClient";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Watch — Animedex" };
}

export default function WatchPage({ params }) {
  return <WatchClient animeId={params.id} epSlug={params.ep} />;
}
