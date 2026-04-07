/**
 * GET /api/ping/crysoline
 *
 * Proxies a health check to the Crysoline API's /health endpoint.
 * This keeps all cross-origin requests server-side (no CORS issues).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CRYSOLINE_HEALTH = "https://api.crysoline.moe/health";

export async function GET() {
  const start = Date.now();
  try {
    const res = await fetch(CRYSOLINE_HEALTH, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    const latency = Date.now() - start;
    const up = res.ok || res.status < 500;

    return NextResponse.json({ up, status: res.status, latency });
  } catch (e) {
    return NextResponse.json(
      { up: false, status: null, latency: Date.now() - start, error: e.message },
      { status: 200 }
    );
  }
}
