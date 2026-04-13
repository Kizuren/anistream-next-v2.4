import { NextResponse } from "next/server";
import { getCategoryAnimes } from "@/lib/scraper";
import { getCachedAsync, setCachedAsync } from "@/lib/cache";

export async function GET(request, { params }) {
  const { slug } = (await params);
  const category = slug?.join("/") || "";
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") || "1";
  const key  = `cat:${category}:${page}`;

  try {
    const cached = await getCachedAsync(key);
    if (cached) return NextResponse.json(cached);
    const data = await getCategoryAnimes(category, page);
    await setCachedAsync(key, data, 300);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
