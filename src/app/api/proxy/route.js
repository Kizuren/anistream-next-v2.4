/**
 * GET /api/proxy  — THIN REDIRECT SHIM
 *
 * The real proxy is now the Cloudflare Worker at NEXT_PUBLIC_PROXY_URL.
 * This route exists ONLY so that any hardcoded /api/proxy URLs in the
 * codebase continue to work during the transition.
 *
 * In production: set NEXT_PUBLIC_PROXY_URL in Vercel env vars.
 * All requests are 302-redirected to the CF worker — zero origin transfer.
 *
 * If NEXT_PUBLIC_PROXY_URL is not set (local dev), this falls back to
 * the lightweight local implementation below so development still works.
 */

import { NextResponse } from "next/server";

const CF_PROXY = process.env.NEXT_PUBLIC_PROXY_URL || "";

// ── Local fallback (dev only) ─────────────────────────────────────────────────

function isM3U8(url, contentType) {
  return (
    url.includes(".m3u8") ||
    (contentType || "").includes("mpegurl") ||
    (contentType || "").includes("x-mpegurl")
  );
}

/**
 * Dev-mode rewriter: segments returned as absolute CDN URLs (not proxied).
 * Matches CF worker behaviour so dev and prod behave identically.
 */
function rewriteM3U8Dev(text, manifestUrl, referer, origin) {
  const base = new URL(manifestUrl);
  const lines = text.split("\n");

  function resolveAbsolute(rawUri) {
    const trimmed = rawUri.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return rawUri;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("//")) return base.protocol + trimmed;
    if (trimmed.startsWith("/")) return `${base.protocol}//${base.host}${trimmed}`;
    const dir = base.href.substring(0, base.href.lastIndexOf("/") + 1);
    return new URL(trimmed, dir).href;
  }

  function toProxyUrl(rawUri) {
    try {
      const absolute = resolveAbsolute(rawUri);
      const params = new URLSearchParams({ url: absolute });
      if (referer) params.set("referer", referer);
      return `${origin}/api/proxy?${params.toString()}`;
    } catch { return rawUri; }
  }

  function isSubManifest(uri) {
    const u = uri.trim().toLowerCase().split("?")[0];
    return u.endsWith(".m3u8") || u.includes(".m3u8");
  }

  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      return line
        .replace(/URI="([^"]+)"/g, (_, uri) => {
          if (uri.startsWith("data:")) return `URI="${uri}"`;
          return `URI="${toProxyUrl(uri)}"`;
        })
        .replace(/URI='([^']+)'/g, (_, uri) => {
          if (uri.startsWith("data:")) return `URI='${uri}'`;
          return `URI='${toProxyUrl(uri)}'`;
        });
    }

    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return line;

    // Sub-manifests → proxy; plain segments → absolute CDN URL (not proxied)
    if (isSubManifest(trimmed)) return toProxyUrl(trimmed);
    try { return resolveAbsolute(trimmed); } catch { return line; }
  }).join("\n");
}

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const reqUrl = new URL(request.url);
  const rawUrl = reqUrl.searchParams.get("url");
  const referer = reqUrl.searchParams.get("referer") || "";

  if (!rawUrl) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  // ── Production: redirect to CF Worker (zero Vercel bandwidth) ────────────
  if (CF_PROXY) {
    const cfUrl = new URL(`${CF_PROXY}/proxy`);
    cfUrl.searchParams.set("url", rawUrl);
    if (referer) cfUrl.searchParams.set("referer", referer);
    return NextResponse.redirect(cfUrl.toString(), 302);
  }

  // ── Development fallback ──────────────────────────────────────────────────
  let targetUrl;
  try { targetUrl = new URL(decodeURIComponent(rawUrl)); }
  catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return NextResponse.json({ error: "Only http/https allowed" }, { status: 400 });
  }

  const effectiveReferer = referer
    ? decodeURIComponent(referer)
    : `${targetUrl.protocol}//${targetUrl.hostname}/`;

  const upstreamHeaders = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    "Referer":         effectiveReferer,
    "Origin":          `${targetUrl.protocol}//${targetUrl.hostname}`,
  };

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "";
    const serverOrigin = `${reqUrl.protocol}//${reqUrl.host}`;

    if (isM3U8(targetUrl.href, contentType)) {
      const text = await upstream.text();
      const rewritten = rewriteM3U8Dev(text, targetUrl.href, effectiveReferer, serverOrigin);
      const h = new Headers();
      h.set("Access-Control-Allow-Origin",  "*");
      h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      h.set("Access-Control-Allow-Headers", "Range, Content-Type");
      h.set("Content-Type",  "application/vnd.apple.mpegurl");
      h.set("Cache-Control", "public, max-age=60");
      return new NextResponse(rewritten, { status: 200, headers: h });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin",   "*");
    responseHeaders.set("Access-Control-Allow-Methods",  "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers",  "Range, Content-Type");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");

    for (const h of ["content-type","content-length","content-range","accept-ranges","cache-control","etag"]) {
      const v = upstream.headers.get(h);
      if (v) responseHeaders.set(h, v);
    }
    if (!responseHeaders.has("accept-ranges")) responseHeaders.set("accept-ranges", "bytes");

    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (e) {
    return NextResponse.json({ error: "Upstream fetch failed", detail: e.message }, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":   "*",
      "Access-Control-Allow-Methods":  "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers":  "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    },
  });
}

export async function HEAD(request) {
  const reqUrl = new URL(request.url);
  const rawUrl = reqUrl.searchParams.get("url");
  const referer = reqUrl.searchParams.get("referer") || "";
  if (!rawUrl) return new NextResponse(null, { status: 400 });

  if (CF_PROXY) {
    const cfUrl = new URL(`${CF_PROXY}/proxy`);
    cfUrl.searchParams.set("url", rawUrl);
    if (referer) cfUrl.searchParams.set("referer", referer);
    return NextResponse.redirect(cfUrl.toString(), 302);
  }

  let targetUrl;
  try { targetUrl = new URL(decodeURIComponent(rawUrl)); }
  catch { return new NextResponse(null, { status: 400 }); }

  const effectiveReferer = referer
    ? decodeURIComponent(referer)
    : `${targetUrl.protocol}//${targetUrl.hostname}/`;

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": effectiveReferer,
        "Origin":  `${targetUrl.protocol}//${targetUrl.hostname}`,
      },
      redirect: "follow",
    });
    const h = new Headers();
    h.set("Access-Control-Allow-Origin", "*");
    h.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    for (const hdr of ["content-type","content-length","accept-ranges","cache-control"]) {
      const v = upstream.headers.get(hdr);
      if (v) h.set(hdr, v);
    }
    if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
    return new NextResponse(null, { status: upstream.ok ? 200 : upstream.status, headers: h });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
