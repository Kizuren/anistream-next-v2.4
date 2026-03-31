/**
 * GET /api/proxy?url=<encoded>&referer=<encoded>
 *
 * Server-side CORS proxy for streaming video, HLS manifests, subtitles.
 *
 * Fixes in this version:
 *   1. Relative URL rewriting in m3u8 manifests — segment URLs like
 *      /api/video/360/playlist.m3u8 are rewritten to absolute upstream URLs
 *      before being returned, so hls.js doesn't try to fetch them from localhost.
 *   2. No timeout for large MP4/video streams — removes the 30s AbortSignal
 *      that was killing the "failed to pipe response" error on AnimeGG.
 *   3. Self-referencing loop detection — blocks proxy?url=localhost:3000/...
 *      which was causing cascading 404 loops in the logs.
 *   4. Token-auth CDNs (megaup.cc, dev23app.site) use IP-pinned session tokens
 *      that the proxy cannot replicate — these will still 403. This is expected
 *      and non-fatal; the video stream itself loads fine from other servers.
 */

import { NextResponse } from "next/server";

function isM3U8(url, contentType) {
  return (
    url.includes(".m3u8") ||
    (contentType || "").includes("mpegurl") ||
    (contentType || "").includes("x-mpegurl")
  );
}

/**
 * Rewrite all segment/sub-manifest URLs inside an m3u8 to absolute proxy URLs.
 * This fixes the "localhost:3000/api/video/360/playlist.m3u8 404" errors where
 * the manifest from seiryuu.vid-cdn.xyz contained relative paths like
 * /api/video/360/playlist.m3u8 — without rewriting, hls.js resolves these
 * against the proxy origin (localhost) instead of the CDN.
 */
function rewriteM3U8(text, manifestUrl, referer) {
  const base = new URL(manifestUrl);
  const lines = text.split("\n");

  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;

    let absolute;
    try {
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        absolute = trimmed;
      } else if (trimmed.startsWith("//")) {
        absolute = base.protocol + trimmed;
      } else if (trimmed.startsWith("/")) {
        absolute = `${base.protocol}//${base.host}${trimmed}`;
      } else {
        const dir = base.href.substring(0, base.href.lastIndexOf("/") + 1);
        absolute = new URL(trimmed, dir).href;
      }
    } catch {
      return line;
    }

    const params = new URLSearchParams({ url: absolute });
    if (referer) params.set("referer", referer);
    return `/api/proxy?${params.toString()}`;
  }).join("\n");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawUrl  = searchParams.get("url");
  const referer = searchParams.get("referer") || "";

  if (!rawUrl) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(rawUrl));
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return NextResponse.json({ error: "Only http/https allowed" }, { status: 400 });
  }

  // Block proxy loops: don't allow proxying localhost back to itself
  if (targetUrl.hostname === "localhost" || targetUrl.hostname === "127.0.0.1") {
    console.error(`[proxy] blocked self-loop: ${targetUrl.href}`);
    return NextResponse.json({ error: "Self-referencing loop blocked" }, { status: 400 });
  }

  const effectiveReferer = referer
    ? decodeURIComponent(referer)
    : `${targetUrl.protocol}//${targetUrl.hostname}/`;

  const effectiveOrigin = `${targetUrl.protocol}//${targetUrl.hostname}`;

  const upstreamHeaders = {
    "User-Agent":         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":             "*/*",
    "Accept-Language":    "en-US,en;q=0.9",
    "Accept-Encoding":    "identity",
    "Referer":            effectiveReferer,
    "Origin":             effectiveOrigin,
    "Sec-Fetch-Dest":     "empty",
    "Sec-Fetch-Mode":     "cors",
    "Sec-Fetch-Site":     "cross-site",
    "Sec-CH-UA":          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-CH-UA-Mobile":   "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Connection":         "keep-alive",
  };

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

  try {
    // No AbortSignal.timeout — video streams need unlimited time to pipe
    const upstream = await fetch(targetUrl.toString(), {
      headers:  upstreamHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[proxy] upstream ${upstream.status} for ${targetUrl.hostname}`);
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "";

    // ── M3U8: read fully, rewrite relative URLs, return rewritten text ────
    if (isM3U8(targetUrl.href, contentType)) {
      const text      = await upstream.text();
      const rewritten = rewriteM3U8(text, targetUrl.href, effectiveReferer);

      const h = new Headers();
      h.set("Access-Control-Allow-Origin",  "*");
      h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      h.set("Access-Control-Allow-Headers", "Range, Content-Type");
      h.set("Content-Type",  "application/vnd.apple.mpegurl");
      h.set("Cache-Control", "no-cache");
      return new NextResponse(rewritten, { status: 200, headers: h });
    }

    // ── Everything else: stream the body directly to the client ───────────
    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin",   "*");
    responseHeaders.set("Access-Control-Allow-Methods",  "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers",  "Range, Content-Type");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");

    for (const h of ["content-type","content-length","content-range","accept-ranges","cache-control","etag"]) {
      const v = upstream.headers.get(h);
      if (v) responseHeaders.set(h, v);
    }

    return new NextResponse(upstream.body, {
      status:  upstream.status,
      headers: responseHeaders,
    });

  } catch (e) {
    console.error("[proxy] fetch failed:", e.message);
    return NextResponse.json({ error: "Upstream fetch failed", detail: e.message }, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
    },
  });
}
