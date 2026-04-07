/**
 * GET /api/ping/anilist
 *
 * FIX: AniList proxy returning 404
 * ─────────────────────────────────
 * Root cause: The footer was hitting the generic /api/proxy with a bare GET
 * to https://graphql.anilist.co. GraphQL endpoints ONLY accept POST requests
 * with a JSON body containing { query: "..." }. A GET returns 404 — not
 * because the service is down, but because the method is wrong.
 *
 * Fix: This dedicated ping route issues a proper POST with a lightweight
 * introspection query ({ __typename }) and reports the result.
 * The footer calls this route instead of the generic proxy.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

// Minimal valid GraphQL query — asks for the schema root type name only.
// This is the lightest possible query: no data is fetched, no rate-limit cost.
const PING_QUERY = `{ __typename }`;

export async function GET() {
  const start = Date.now();
  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
      },
      body: JSON.stringify({ query: PING_QUERY }),
      signal: AbortSignal.timeout(8000),
    });

    const latency = Date.now() - start;

    // AniList returns 200 for valid queries, 429 for rate-limit.
    // Both mean the service is up — only 5xx means it's truly down.
    const up = res.status < 500;

    return NextResponse.json({ up, status: res.status, latency });
  } catch (e) {
    return NextResponse.json(
      { up: false, status: null, latency: Date.now() - start, error: e.message },
      { status: 200 } // Always 200 so the footer can parse the JSON body
    );
  }
}
