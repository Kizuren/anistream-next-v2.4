import { getAuthUrl } from "@/lib/auth";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.redirect(getAuthUrl());
}
