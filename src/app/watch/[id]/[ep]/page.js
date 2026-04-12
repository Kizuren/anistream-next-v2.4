import WatchClient from "@/components/WatchClient";

export const dynamic = "force-dynamic";
export const viewport = { themeColor: "#07060b" };

export function generateMetadata() {
  return { title: "Watch — AnimeDex" };
}

export default function WatchPage({ params }) {
  return <WatchClient animeId={params.id} epSlug={params.ep} />;
}
