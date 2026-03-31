import { NextResponse } from "next/server";

// Stream is now handled via megaplay.buzz iframe embed.
// This endpoint is kept for backwards compatibility but returns empty.
export async function GET() {
  return NextResponse.json({ sources: [], tracks: [], info: "Stream via megaplay.buzz embed" });
}
