export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";

// Catch-all: /anime/slug/ep-1 etc → redirect to /watch/slug/ep-1
export default function AnimeEpRedirect({ params }) {
  const rest = Array.isArray(params.rest) ? params.rest.join("/") : params.rest || "";
  redirect(`/watch/${params.id}/${rest}`);
}
