import AnimeDetailClient from "@/components/AnimeDetailClient";

export const dynamic = "force-dynamic";
export const viewport = { themeColor: "#07060b" };

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `Anime — AnimeDex` };
}

export default async function AnimeDetailPage({ params }) {
  const { id } = await params;
  return <AnimeDetailClient animeId={id} />;
}
