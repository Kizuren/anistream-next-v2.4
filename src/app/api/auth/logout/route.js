import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export function GET(request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("al_token");
  response.cookies.delete("al_user");
  return response;
}

// Also allow POST for programmatic calls
export function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("al_token");
  response.cookies.delete("al_user");
  return response;
}
