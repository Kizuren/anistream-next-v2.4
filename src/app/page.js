export const dynamic = "force-dynamic";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import HomeClient from "@/components/HomeClient";

export const revalidate = 300;
export const metadata = { title: "AnimeDex — Watch Anime Free" };

async function getHomeData() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/anime/home`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const data = await getHomeData();
  return <HomeClient initialData={data} />;
}
