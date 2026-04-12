/**
 * Cloudflare Worker — CORS Proxy for AniStream
 *
 * Replaces Vercel /api/proxy entirely.
 * Deploy this to Cloudflare Workers (free tier: 100k req/day, zero egress cost).
 *
 * KEY DIFFERENCE from the old Vercel proxy:
 *   - m3u8 manifests: fetched here, URLs rewritten, returned (same as before)
 *   - .ts video segments: NOT proxied here. rewriteM3U8 now returns absolute
 *     CDN URLs directly so hls.js fetches segments straight from the CDN.
 *     Only #EXT-X-KEY and #EXT-X-MAP URIs stay proxied (encryption/init).
 *   - This eliminates ~95% of bandwidth — only tiny manifest text files
 *     pass through the worker, never multi-MB video chunks.
 *
 * SECURITY:
 *   Set ALLOWED_ORIGINS in wrangler.toml vars to your site's domain.
 *   Requests from other origins are rejected with 403.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

// List of CDN hostnames we're allowed to proxy.
// Prevents your worker from being used as an open proxy.
const PROXY_ALLOWLIST = [
  // AniSkip
  "api.aniskip.com",
  // AnimeGG / Crysoline sources — add CDN hostnames as you encounter them
  "v6.animegg.org",
  "cdn.animegg.org",
  "s1.animegg.org",
  "s2.animegg.org",
  "s3.animegg.org",
  // AnimePahe
  "kwik.cx",
  "eu.kwik.cx",
  "na.kwik.cx",
  // Anizone
  "anizone.to",
  "cdn.anizone.to",
  // Generic — allow any crysoline-sourced CDN by keeping this open
  // Remove the line below and add specific hosts for stricter security
  "*", // ← change to specific hosts in production for best security
];

function isAllowedHost(hostname) {
  if (PROXY_ALLOWLIST.includes("*")) return true;
  return PROXY_ALLOWLIST.some(
    (h) => hostname === h || hostname.endsWith("." + h)
  );
}

// ─── M3U8 rewriter ───────────────────────────────────────────────────────────

function isM3U8(url, contentType) {
  return (
    url.includes(".m3u8") ||
    (contentType || "").includes("mpegurl") ||
    (contentType || "").includes("x-mpegurl")
  );
}

/**
 * Rewrites an m3u8 manifest so that:
 *  - Plain segment lines (.ts, .aac, etc.) → resolved to absolute CDN URLs
 *    (NOT proxied — hls.js fetches them directly from the CDN)
 *  - #EXT-X-KEY URI= (encryption keys) → proxied through this worker
 *  - #EXT-X-MAP URI= (init segments)   → proxied through this worker
 *  - #EXT-X-MEDIA URI= (audio/subs)    → proxied through this worker
 *  - Sub-manifest lines (.m3u8)        → proxied through this worker
 */
function rewriteM3U8(text, manifestUrl, referer, workerOrigin) {
  const base = new URL(manifestUrl);
  const lines = text.split("\n");

  function resolveAbsolute(rawUri) {
    const trimmed = rawUri.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:"))
      return rawUri;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
      return trimmed;
    if (trimmed.startsWith("//")) return base.protocol + trimmed;
    if (trimmed.startsWith("/"))
      return `${base.protocol}//${base.host}${trimmed}`;
    const dir = base.href.substring(0, base.href.lastIndexOf("/") + 1);
    return new URL(trimmed, dir).href;
  }

  function toWorkerUrl(rawUri) {
    try {
      const absolute = resolveAbsolute(rawUri);
      const params = new URLSearchParams({ url: absolute });
      if (referer) params.set("referer", referer);
      return `${workerOrigin}/proxy?${params.toString()}`;
    } catch {
      return rawUri;
    }
  }

  function isSubManifest(uri) {
    const u = uri.trim().toLowerCase().split("?")[0];
    return u.endsWith(".m3u8") || u.includes(".m3u8");
  }

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Directive lines — only rewrite URI= attributes (keys, maps, media)
      // These MUST go through the proxy for CORS/auth reasons
      if (trimmed.startsWith("#")) {
        return line
          .replace(/URI="([^"]+)"/g, (_, uri) => {
            if (uri.startsWith("data:")) return `URI="${uri}"`;
            return `URI="${toWorkerUrl(uri)}"`;
          })
          .replace(/URI='([^']+)'/g, (_, uri) => {
            if (uri.startsWith("data:")) return `URI='${uri}'`;
            return `URI='${toWorkerUrl(uri)}'`;
          });
      }

      // data:/blob: lines — pass through
      if (trimmed.startsWith("data:") || trimmed.startsWith("blob:"))
        return line;

      // Sub-manifest lines (.m3u8) → proxy so we can rewrite them too
      if (isSubManifest(trimmed)) {
        return toWorkerUrl(trimmed);
      }

      // Plain segment lines (.ts, .aac, .mp4 chunks, etc.)
      // → resolve to absolute CDN URL but DO NOT proxy
      // hls.js fetches these directly — zero worker bandwidth used
      try {
        return resolveAbsolute(trimmed);
      } catch {
        return line;
      }
    })
    .join("\n");
}

// ─── CORS headers ────────────────────────────────────────────────────────────

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Range, Content-Length, Accept-Ranges",
    ...extra,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── OPTIONS preflight ────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── Health check ─────────────────────────────────────────────────────────
    if (url.pathname === "/health" || url.pathname === "/") {
      return Response.json(
        { ok: true, service: "animedex-cf-proxy" },
        { headers: corsHeaders() }
      );
    }

    // ── Crysoline health proxy ────────────────────────────────────────────────
    // Footer calls this instead of api.crysoline.moe/health directly.
    // Cached at Cloudflare edge for 60s — 100 visitors = 1 upstream ping.
    if (url.pathname === "/crysoline-health") {
      try {
        const res = await fetch("https://api.crysoline.moe/health", {
          signal: AbortSignal.timeout(8000),
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => ({ status: "unknown" }));
        return Response.json(
          { up: res.ok, latency: null, ...data },
          {
            headers: corsHeaders({
              // Cache at Cloudflare edge for 60s — reduces upstream pings
              "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
            }),
          }
        );
      } catch (e) {
        return Response.json(
          { up: false, error: e.message },
          { headers: corsHeaders() }
        );
      }
    }

    // ── Proxy endpoint: /proxy?url=...&referer=... ────────────────────────────
    if (url.pathname !== "/proxy") {
      return new Response("Not found", { status: 404 });
    }

    // ── Origin check (SECURITY) ──────────────────────────────────────────────
    // Allow requests from your site domain. Set ALLOWED_ORIGIN in wrangler.toml.
    const allowedOrigin = env.ALLOWED_ORIGIN || "";
    if (allowedOrigin) {
      const reqOrigin = request.headers.get("origin") || "";
      const reqReferer = request.headers.get("referer") || "";
      const ok =
        !allowedOrigin || // no restriction set
        reqOrigin.startsWith(allowedOrigin) ||
        reqReferer.startsWith(allowedOrigin);
      if (!ok) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const rawUrl = url.searchParams.get("url");
    const referer = url.searchParams.get("referer") || "";

    if (!rawUrl) {
      return Response.json(
        { error: "url param required" },
        { status: 400, headers: corsHeaders() }
      );
    }

    let targetUrl;
    try {
      targetUrl = new URL(decodeURIComponent(rawUrl));
    } catch {
      return Response.json(
        { error: "Invalid URL" },
        { status: 400, headers: corsHeaders() }
      );
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return Response.json(
        { error: "Only http/https allowed" },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Block self-loops
    if (
      targetUrl.hostname === "localhost" ||
      targetUrl.hostname === "127.0.0.1"
    ) {
      return Response.json(
        { error: "Self-loop blocked" },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Allowlist check
    if (!isAllowedHost(targetUrl.hostname)) {
      return Response.json(
        { error: "Host not in allowlist" },
        { status: 403, headers: corsHeaders() }
      );
    }

    const effectiveReferer = referer
      ? decodeURIComponent(referer)
      : `${targetUrl.protocol}//${targetUrl.hostname}/`;

    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      Referer: effectiveReferer,
      Origin: `${targetUrl.protocol}//${targetUrl.hostname}`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
    };

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

    // HEAD request
    if (request.method === "HEAD") {
      try {
        const upstream = await fetch(targetUrl.toString(), {
          method: "HEAD",
          headers: upstreamHeaders,
          redirect: "follow",
        });
        const h = new Headers(corsHeaders());
        for (const hdr of [
          "content-type",
          "content-length",
          "accept-ranges",
          "cache-control",
        ]) {
          const v = upstream.headers.get(hdr);
          if (v) h.set(hdr, v);
        }
        if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
        return new Response(null, {
          status: upstream.ok ? 200 : upstream.status,
          headers: h,
        });
      } catch {
        return new Response(null, { status: 502 });
      }
    }

    // GET request
    try {
      const upstream = await fetch(targetUrl.toString(), {
        headers: upstreamHeaders,
        redirect: "follow",
      });

      if (!upstream.ok && upstream.status !== 206) {
        return new Response(null, {
          status: upstream.status,
          headers: corsHeaders(),
        });
      }

      const contentType = upstream.headers.get("content-type") || "";
      const workerOrigin = `${url.protocol}//${url.host}`;

      // M3U8 — rewrite and return (only manifests come through here)
      if (isM3U8(targetUrl.href, contentType)) {
        const text = await upstream.text();
        const rewritten = rewriteM3U8(
          text,
          targetUrl.href,
          effectiveReferer,
          workerOrigin
        );
        return new Response(rewritten, {
          status: 200,
          headers: corsHeaders({
            "Content-Type": "application/vnd.apple.mpegurl",
            // Short cache for manifests — they change between episodes
            "Cache-Control": "public, max-age=60",
          }),
        });
      }

      // Subtitle files — cache aggressively at Cloudflare edge
      const isSubtitle =
        contentType.includes("text/vtt") ||
        contentType.includes("text/plain") ||
        /\.(vtt|srt|ass|ssa)(\?|$)/i.test(targetUrl.pathname);
      if (isSubtitle) {
        const responseHeaders = new Headers(corsHeaders());
        responseHeaders.set("Content-Type", contentType || "text/vtt");
        responseHeaders.set("Cache-Control", "public, max-age=86400");
        return new Response(upstream.body, {
          status: upstream.status,
          headers: responseHeaders,
        });
      }

      // Everything else (encryption keys, init segments)
      const responseHeaders = new Headers(corsHeaders());
      for (const h of [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "cache-control",
        "etag",
      ]) {
        const v = upstream.headers.get(h);
        if (v) responseHeaders.set(h, v);
      }
      if (!responseHeaders.has("accept-ranges")) {
        responseHeaders.set("accept-ranges", "bytes");
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (e) {
      return Response.json(
        { error: "Upstream fetch failed", detail: e.message },
        { status: 502, headers: corsHeaders() }
      );
    }
  },
};
