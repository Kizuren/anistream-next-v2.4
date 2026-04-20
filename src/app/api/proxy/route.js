/**
 * GET /api/proxy?url=<encoded>&referer=<encoded>
 *
 * Thin shim — redirects ALL requests to the Cloudflare Worker.
 * The CF Worker handles m3u8 rewriting, CORS, subtitles, and byte-range.
 *
 * Zero Vercel function invocations for video/stream traffic.
 * Falls back to full server-side proxy only in local dev (no CF_PROXY set).
 */

import { NextResponse } from "next/server";

const CF_PROXY = process.env.NEXT_PUBLIC_PROXY_URL || "";

// ── Dev-only server-side proxy ────────────────────────────────────────────────

function isM3U8(url, ct) {
  return url.includes(".m3u8") || (ct||"").toLowerCase().includes("mpegurl");
}

function rewriteM3U8Dev(text, manifestUrl, referer, origin) {
  const base = new URL(manifestUrl);
  function abs(raw) {
    const t = raw.trim();
    if (!t || t.startsWith("data:") || t.startsWith("blob:")) return raw;
    if (t.startsWith("https://") || t.startsWith("http://")) return t;
    if (t.startsWith("//")) return base.protocol + t;
    if (t.startsWith("/")) return `${base.protocol}//${base.host}${t}`;
    const dir = base.href.substring(0, base.href.lastIndexOf("/") + 1);
    try { return new URL(t, dir).href; } catch { return raw; }
  }
  function toProxy(raw) {
    try {
      const p = new URLSearchParams({ url: abs(raw) });
      if (referer) p.set("referer", referer);
      return `${origin}/api/proxy?${p}`;
    } catch { return raw; }
  }
  function isSubM3U8(t) { const u = t.trim().toLowerCase().split("?")[0]; return u.endsWith(".m3u8") || u.includes(".m3u8"); }
  return text.split("\n").map(line => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith("#")) return line
      .replace(/URI="([^"]+)"/g, (_, u) => u.startsWith("data:") ? `URI="${u}"` : `URI="${toProxy(u)}"`)
      .replace(/URI='([^']+)'/g, (_, u) => u.startsWith("data:") ? `URI='${u}'` : `URI='${toProxy(u)}'`);
    if (t.startsWith("data:") || t.startsWith("blob:")) return line;
    if (isSubM3U8(t)) return toProxy(t);
    try { return abs(t); } catch { return line; }
  }).join("\n");
}

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function cfRedirect(rawUrl, referer) {
  const cfUrl = new URL(`${CF_PROXY}/proxy`);
  cfUrl.searchParams.set("url", rawUrl);
  if (referer) cfUrl.searchParams.set("referer", referer);
  return NextResponse.redirect(cfUrl.toString(), 307);
}

// Hosts that need server-side proxying (their CDN restricts CORS to their own origin).
// For these, we fetch server-side and rewrite the manifest — segments go direct.
// Everything else redirects to the CF Worker.
const NEEDS_VERCEL_PROXY = [
  "vid-cdn.xyz",       // anizone CDN — CORS locked to https://anizone.to
  "seiryuu.vid-cdn.xyz",
];

function needsVercelProxy(rawUrl) {
  try {
    const h = new URL(decodeURIComponent(rawUrl)).hostname.toLowerCase();
    return NEEDS_VERCEL_PROXY.some(d => h === d || h.endsWith("." + d));
  } catch { return false; }
}

export async function GET(request) {
  const reqUrl  = new URL(request.url);
  const rawUrl  = reqUrl.searchParams.get("url");
  const referer = reqUrl.searchParams.get("referer") || "";
  if (!rawUrl) return NextResponse.json({ error: "url param required" }, { status: 400 });

  // ── Production: CF Worker handles everything EXCEPT CORS-locked CDNs ──────
  // vid-cdn.xyz (anizone) returns Access-Control-Allow-Origin: https://anizone.to
  // CF Worker IPs are blocked by this CDN — handle these server-side on Vercel instead.
  if (CF_PROXY && !needsVercelProxy(rawUrl)) return cfRedirect(rawUrl, referer);

  // ── Dev fallback ──────────────────────────────────────────────────────────
  let targetUrl;
  try { targetUrl = new URL(decodeURIComponent(rawUrl)); }
  catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }

  if (!["http:", "https:"].includes(targetUrl.protocol))
    return NextResponse.json({ error: "Only http/https allowed" }, { status: 400 });

  const effectiveReferer = referer ? decodeURIComponent(referer) : `${targetUrl.protocol}//${targetUrl.hostname}/`;
  const rangeHeader = request.headers.get("range");
  const upHeaders = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    "Referer":         effectiveReferer,
    "Origin":          `${targetUrl.protocol}//${targetUrl.hostname}`,
  };
  if (rangeHeader) upHeaders["Range"] = rangeHeader;

  try {
    const upstream = await fetch(targetUrl.toString(), { headers: upHeaders, redirect: "follow" });
    if (!upstream.ok && upstream.status !== 206)
      return new NextResponse(null, { status: upstream.status });

    const contentType  = upstream.headers.get("content-type") || "";
    const serverOrigin = `${reqUrl.protocol}//${reqUrl.host}`;
    const corsH = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Range, Content-Type", "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges" };

    if (isM3U8(targetUrl.href, contentType)) {
      const rewritten = rewriteM3U8Dev(await upstream.text(), targetUrl.href, effectiveReferer, serverOrigin);
      return new NextResponse(rewritten, { status: 200, headers: { ...corsH, "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "public, max-age=30" } });
    }

    const h = new Headers(corsH);
    for (const hdr of ["content-type","content-length","content-range","accept-ranges","cache-control","etag"]) {
      const v = upstream.headers.get(hdr); if (v) h.set(hdr, v);
    }
    if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
    return new NextResponse(upstream.body, { status: upstream.status, headers: h });
  } catch (e) {
    return NextResponse.json({ error: "Upstream fetch failed", detail: e.message }, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Range, Content-Type", "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges" } });
}

export async function HEAD(request) {
  const reqUrl  = new URL(request.url);
  const rawUrl  = reqUrl.searchParams.get("url");
  const referer = reqUrl.searchParams.get("referer") || "";
  if (!rawUrl) return new NextResponse(null, { status: 400 });
  if (CF_PROXY) return cfRedirect(rawUrl, referer);

  let targetUrl;
  try { targetUrl = new URL(decodeURIComponent(rawUrl)); }
  catch { return new NextResponse(null, { status: 400 }); }

  const effectiveReferer = referer ? decodeURIComponent(referer) : `${targetUrl.protocol}//${targetUrl.hostname}/`;
  try {
    const upstream = await fetch(targetUrl.toString(), { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0", "Referer": effectiveReferer, "Origin": `${targetUrl.protocol}//${targetUrl.hostname}` }, redirect: "follow" });
    const h = new Headers({ "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges" });
    for (const hdr of ["content-type","content-length","accept-ranges","cache-control"]) { const v = upstream.headers.get(hdr); if (v) h.set(hdr, v); }
    if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
    return new NextResponse(null, { status: upstream.ok ? 200 : upstream.status, headers: h });
  } catch { return new NextResponse(null, { status: 502 }); }
}
