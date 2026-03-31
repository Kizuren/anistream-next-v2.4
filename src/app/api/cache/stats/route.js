import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    layers: {
      redis:  !!process.env.UPSTASH_REDIS_REST_URL,
      sqlite: !!process.env.TURSO_DATABASE_URL,
      memory: true,
    },
    setup: {
      redis:  "https://upstash.com — free tier, no credit card",
      sqlite: "https://turso.tech — free tier, 500 DBs, 9GB storage",
    },
    envVars: {
      redis:  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
      sqlite: ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"],
    },
  });
}
