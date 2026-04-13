import WatchClient from "@/components/WatchClient";

export const dynamic = "force-dynamic";
export const viewport = { themeColor: "#07060b" };

export async function generateMetadata({ params }) {
  const { id, ep } = await params;
  return { title: "Watch — AnimeDex" };
}

export default async function WatchPage({ params }) {
  const { id, ep } = await params;
  return <WatchClient animeId={id} epSlug={ep} />;
}
