/**
 * GET /api/cache/prune
 * Cleans expired rows from SQLite cache table.
 * Call this periodically (e.g., via a cron job or Vercel cron).
 */
import { NextResponse } from "next/server";
import { pruneCache } from "@/lib/cache";

export async function GET() {
  try {
    await pruneCache();
    return NextResponse.json({ ok: true, message: "Expired cache entries pruned" });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
