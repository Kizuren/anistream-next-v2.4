/**
 * GET /api/proxy?url=<encoded>&referer=<encoded>
 *
 * Server-side CORS proxy for streaming video, HLS manifests, subtitles.
 *
 * PROBLEM 2 FIX — /api/audio/ 404s:
 *   AnimeNexus (and similar sources) embed EXT-X-MEDIA tags in the master
 *   m3u8 with relative URI= attributes, e.g.:
 *     #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="../../audio/0_ja/playlist.m3u8"
 *   The old rewriteM3U8 only rewrote non-comment lines (segment URLs).
 *   EXT-X-MEDIA and EXT-X-KEY attributes are comment lines (start with #),
 *   so their URI= values were not rewritten — hls.js then resolved them
 *   relative to the page origin (localhost:3000/api/audio/...) → 404.
 *
 *   FIX: rewriteM3U8 now also rewrites URI= values inside # directive lines.
 *
 * PROBLEM 3 FIX — /keys/*.key 404s:
 *   #EXT-X-KEY:METHOD=AES-128,URI="keys/pKjbjVSk.key" is a relative path.
 *   After the URI= rewrite below it becomes an absolute CDN URL, which is
 *   then rewritten to /api/proxy?url=... so the pLoader in HlsPlayer.jsx
 *   never even needs to handle it (belt-and-suspenders: both fixes are active).
 *
 * PROBLEM 4 — upstream 403 for IP-pinned CDNs (megaup.cc, in1.cdn.nexus):
 *   These CDNs bind the session token to the client IP. When the Vercel
 *   serverless function (different IP than the browser) proxies the request,
 *   they return 403. This is a CDN-level anti-hotlink measure that cannot be
 *   bypassed with headers. These sources (AnimeKai/MegaUp, AnimeNexus/in1.cdn)
 *   will continue to 403 — this is expected and non-fatal. The HLS player
 *   shows "Stream error" for those sources; users should switch sources.
 *   Logged clearly so it's obvious which CDN is the problem.
 *
 * PROBLEM 5 — AnimeHeaven 502:
 *   cz.animeheaven.me appears to be geoblocked or down for Vercel's server
 *   IPs. The upstream fetch fails entirely → proxy returns 502. Non-fixable
 *   server-side; treat as a broken source and let users switch.
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
 * Rewrite ALL URL references inside an m3u8 manifest through /api/proxy.
 *
 * Handles:
 *   1. Segment lines (non-# lines): plain URL or relative path
 *   2. EXT-X-KEY URI= values (encryption key URLs)
 *   3. EXT-X-MEDIA URI= values (alternate audio/subtitle track URLs)
 *   4. EXT-X-MAP URI= values (initialization segment URLs)
 *
 * PROBLEM 2+3 FIX: Previously only case 1 was handled. Cases 2-4 were
 * skipped because they're on lines starting with '#'.
 */
function rewriteM3U8(text, manifestUrl, referer, origin = "") {
  const base  = new URL(manifestUrl);
  const lines = text.split("\n");

  // Using absolute proxy URLs eliminates hls.js relative-URL resolution ambiguity.
  // When hls.js gets http://localhost:3000/api/proxy?url=X from a manifest,
  // it passes that exact absolute URL to the loader — no further resolution needed.
  const proxyBase = origin || "";

  function toProxyUrl(rawUri) {
    let absolute;
    try {
      const trimmed = rawUri.trim();

      // Already proxied in any form — normalise to absolute with correct origin
      if (trimmed.startsWith("/api/proxy")) {
        return `${proxyBase}${trimmed}`;
      }
      if (/https?:\/\/[^/]+\/api\/proxy/.test(trimmed)) {
        try {
          const inner = new URL(trimmed);
          return `${proxyBase}/api/proxy?${inner.searchParams.toString()}`;
        } catch { return rawUri; }
      }

      if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return rawUri;
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        absolute = trimmed;
      } else if (trimmed.startsWith("//")) {
        absolute = base.protocol + trimmed;
      } else if (trimmed.startsWith("/")) {
        absolute = `${base.protocol}//${base.host}${trimmed}`;
      } else {
        const dir = base.href.substring(0, base.href.lastIndexOf("/") + 1);
        absolute  = new URL(trimmed, dir).href;
      }
    } catch {
      return rawUri;
    }

    const params = new URLSearchParams({ url: absolute });
    if (referer) params.set("referer", referer);
    return `${proxyBase}/api/proxy?${params.toString()}`;
  }

  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // ── Directive lines (#EXT-X-*) — rewrite URI= attribute values ──────
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

    // ── Segment / sub-manifest lines ─────────────────────────────────────
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return line;
    return toProxyUrl(trimmed);
  }).join("\n");
}

// Known IP-pinned CDN hostnames that will always 403 when proxied from Vercel.
// Log these clearly instead of generic "upstream 403".
const IP_PINNED_CDNS = [
  "megaup.cc",     // AnimeKai / MegaUp player
  "in1.cdn.nexus", // AnimeNexus high-quality segments
];

function isIpPinnedCdn(hostname) {
  return IP_PINNED_CDNS.some(cdn => hostname === cdn || hostname.endsWith("." + cdn));
}

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const reqUrl  = new URL(request.url);
  const { searchParams } = reqUrl;
  // Server origin — used to emit absolute proxy URLs so hls.js can't re-resolve them
  const serverOrigin = `${reqUrl.protocol}//${reqUrl.host}`;
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

  // Block self-loops: both localhost direct AND double-proxied URLs (localhost:PORT/api/proxy?url=...)
  const isSelfHost = targetUrl.hostname === "localhost" || targetUrl.hostname === "127.0.0.1";
  const isDoubleProxy = isSelfHost || (targetUrl.pathname.startsWith("/api/proxy") && targetUrl.searchParams.has("url"));
  if (isDoubleProxy) {
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
    const upstream = await fetch(targetUrl.toString(), {
      headers:  upstreamHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      const hostname = targetUrl.hostname;

      if (upstream.status === 403 && isIpPinnedCdn(hostname)) {
        // Expected: IP-pinned CDN rejects Vercel server IP. Non-fixable.
        console.warn(`[proxy] 403 IP-pinned CDN (expected, non-fixable): ${hostname}`);
      } else {
        console.error(`[proxy] upstream ${upstream.status} for ${hostname}`);
      }

      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "";

    // ── M3U8: rewrite all URLs then return ───────────────────────────────
    if (isM3U8(targetUrl.href, contentType)) {
      const text      = await upstream.text();
      const rewritten = rewriteM3U8(text, targetUrl.href, effectiveReferer, serverOrigin);

      const h = new Headers();
      h.set("Access-Control-Allow-Origin",  "*");
      h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      h.set("Access-Control-Allow-Headers", "Range, Content-Type");
      h.set("Content-Type",  "application/vnd.apple.mpegurl");
      h.set("Cache-Control", "no-cache");
      return new NextResponse(rewritten, { status: 200, headers: h });
    }

    // ── Everything else: stream directly ─────────────────────────────────
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
