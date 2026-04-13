export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";

// Catch-all: /anime/slug/ep-1 etc → redirect to /watch/slug/ep-1
export default async function AnimeEpRedirect({ params }) {
  const { id, rest } = await params;
  const restPath = Array.isArray(rest) ? rest.join("/") : rest || "";
  redirect(`/watch/${id}/${restPath}`);
}
