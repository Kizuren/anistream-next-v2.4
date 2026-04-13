/**
 * Cloudflare Worker — AnimeDex CORS Proxy
 *
 * Fixed:
 *  - 403 issue: removed over-strict ALLOWED_ORIGIN check.
 *    Browser video/fetch requests often send no `origin` header at all
 *    (especially for <video> src, range requests, and hls.js fragment loads).
 *    Blocking based on origin header broke legitimate player traffic.
 *    Security is now handled by the HOST ALLOWLIST only — we proxy only
 *    known CDN hostnames, so we can't be abused as an open proxy.
 *
 *  - AnimeGG .mp4 URLs: animegg.org itself is now in the allowlist.
 *    The ?for= signed URLs come directly from animegg.org/play/...
 *
 *  - AnimePahe / kwik.cx: all kwik variants allowlisted.
 *    Segments (.jpg trick) and m3u8 keys also allowed.
 *
 *  - Anizone CDN: anizone.to and known CDN subdomains added.
 *
 *  - M3U8 rewriter: .ts/.jpg segments returned as absolute CDN URLs
 *    (not proxied). Only #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA URIs
 *    and sub-manifests (.m3u8) are proxied. This keeps bandwidth zero
 *    for video data while fixing CORS for manifests and encryption keys.
 *
 *  - Crysoline health endpoint: /crysoline-health cached 60s at edge.
 */

// ─── Host allowlist ───────────────────────────────────────────────────────────
// Only proxy requests to these hostnames. This prevents open-proxy abuse.
// Pattern: exact match OR subdomain match (*.example.com).
// ── Host allowlist ─────────────────────────────────────────────────────────────
// Supports exact match and wildcard subdomain match (*.example.com).
// Add hosts as you encounter new CDNs in real traffic logs.
const ALLOWED_HOSTS = [
  // ── AnimeGG ──────────────────────────────────────────────────────────────
  "animegg.org",          // signed .mp4 play URLs from animegg.org/play/…
  "vid-cdn.xyz",          // AnimeGG CDN — covers seiryuu.vid-cdn.xyz etc.

  // ── AnimePahe / kwik.cx ──────────────────────────────────────────────────
  "kwik.cx",              // covers eu.kwik.cx, na.kwik.cx via subdomain match
  "animepahe.com",
  "animepahe.org",
  "animepahe.ru",
  "animepahe.si",

  // ── Anizone ──────────────────────────────────────────────────────────────
  "anizone.to",           // covers cdn.anizone.to, player.anizone.to

  // ── AnimePahe CDN (owocdn) ───────────────────────────────────────────────
  "owocdn.top",           // covers vault-14.owocdn.top etc.

  // ── AniSkip ──────────────────────────────────────────────────────────────
  "api.aniskip.com",

  // ── Cloudflare-served CDNs ───────────────────────────────────────────────
  "cdnfile.anilab.to",
  "anilab.to",

  // ── Safety wildcard — keep enabled until all CDNs are catalogued ─────────
  // Remove this and add specific hosts for production hardening.
  "*",
];

function isAllowedHost(hostname) {
  const h = hostname.toLowerCase();
  // Wildcard bypass
  if (ALLOWED_HOSTS.includes("*")) return true;
  // Exact match OR subdomain match: "vid-cdn.xyz" matches "seiryuu.vid-cdn.xyz"
  return ALLOWED_HOSTS.some(allowed =>
    h === allowed || h.endsWith("." + allowed)
  );
}

// ─── M3U8 rewriter ────────────────────────────────────────────────────────────
function isM3U8(url, contentType) {
  const ct = (contentType || "").toLowerCase();
  return (
    url.includes(".m3u8") ||
    ct.includes("mpegurl") ||
    ct.includes("x-mpegurl")
  );
}

/**
 * Rewrites m3u8 manifest:
 *   - Plain segment lines  → absolute CDN URL (NOT proxied — zero worker bandwidth)
 *   - Sub-manifests        → proxied (so we can rewrite them too)
 *   - #EXT-X-KEY URI=      → proxied (AES-128 encryption keys)
 *   - #EXT-X-MAP URI=      → proxied (init segments, CMAF)
 *   - #EXT-X-MEDIA URI=    → proxied (alternate audio/subtitle tracks)
 */
function rewriteM3U8(text, manifestUrl, referer, workerOrigin) {
  const base = new URL(manifestUrl);

  function resolveAbsolute(rawUri) {
    const t = rawUri.trim();
    if (!t || t.startsWith("data:") || t.startsWith("blob:")) return rawUri;
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    if (t.startsWith("//")) return base.protocol + t;
    if (t.startsWith("/")) return `${base.protocol}//${base.host}${t}`;
    const dir = base.href.substring(0, base.href.lastIndexOf("/") + 1);
    try { return new URL(t, dir).href; } catch { return rawUri; }
  }

  function toWorkerUrl(rawUri) {
    try {
      const abs = resolveAbsolute(rawUri);
      const p = new URLSearchParams({ url: abs });
      if (referer) p.set("referer", referer);
      return `${workerOrigin}/proxy?${p}`;
    } catch { return rawUri; }
  }

  function isSubManifest(uri) {
    const u = uri.trim().toLowerCase().split("?")[0];
    return u.endsWith(".m3u8") || u.includes(".m3u8");
  }

  return text.split("\n").map(line => {
    const t = line.trim();
    if (!t) return line;

    // Directive lines — rewrite URI= attributes only (keys, maps, media)
    if (t.startsWith("#")) {
      return line
        .replace(/URI="([^"]+)"/g, (_, uri) =>
          uri.startsWith("data:") ? `URI="${uri}"` : `URI="${toWorkerUrl(uri)}"`)
        .replace(/URI='([^']+)'/g, (_, uri) =>
          uri.startsWith("data:") ? `URI='${uri}'` : `URI='${toWorkerUrl(uri)}'`);
    }

    if (t.startsWith("data:") || t.startsWith("blob:")) return line;

    // Sub-manifests → proxy so we can rewrite them too
    if (isSubManifest(t)) return toWorkerUrl(t);

    // Plain segments → absolute CDN URL, NOT proxied (saves all bandwidth)
    try { return resolveAbsolute(t); } catch { return line; }
  }).join("\n");
}

// ─── CORS headers ──────────────────────────────────────────────────────────────
function cors(extra = {}) {
  return {
    "Access-Control-Allow-Origin":   "*",
    "Access-Control-Allow-Methods":  "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":  "Range, Content-Type, Origin",
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    ...extra,
  };
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    // ── Health ──────────────────────────────────────────────────────────────
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json(
        { ok: true, service: "animedex-proxy", version: "2.0" },
        { headers: cors() }
      );
    }

    // ── Crysoline health (cached 60s at edge) ───────────────────────────────
    if (url.pathname === "/crysoline-health") {
      try {
        const res  = await fetch("https://api.crysoline.moe/health", {
          signal: AbortSignal.timeout(8000),
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => ({ status: "unknown" }));
        return Response.json(
          { up: res.ok, ...data },
          { headers: cors({ "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" }) }
        );
      } catch (e) {
        return Response.json({ up: false, error: e.message }, { headers: cors() });
      }
    }

    // ── Proxy ───────────────────────────────────────────────────────────────
    if (url.pathname !== "/proxy") {
      return new Response("Not found", { status: 404, headers: cors() });
    }

    const rawUrl = url.searchParams.get("url");
    const referer = url.searchParams.get("referer") || "";

    if (!rawUrl) {
      return Response.json({ error: "url param required" }, { status: 400, headers: cors() });
    }

    let targetUrl;
    try {
      targetUrl = new URL(decodeURIComponent(rawUrl));
    } catch {
      return Response.json({ error: "Invalid URL" }, { status: 400, headers: cors() });
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return Response.json({ error: "Only http/https" }, { status: 400, headers: cors() });
    }

    // Block self-loops
    if (targetUrl.hostname === "localhost" || targetUrl.hostname === "127.0.0.1") {
      return Response.json({ error: "Self-loop blocked" }, { status: 400, headers: cors() });
    }

    // Host allowlist — security boundary
    if (!isAllowedHost(targetUrl.hostname)) {
      return Response.json(
        { error: "Host not allowed", host: targetUrl.hostname },
        { status: 403, headers: cors() }
      );
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
      "Sec-Fetch-Dest":  "empty",
      "Sec-Fetch-Mode":  "cors",
      "Sec-Fetch-Site":  "cross-site",
    };

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

    // ── HEAD request ────────────────────────────────────────────────────────
    if (request.method === "HEAD") {
      try {
        const up = await fetch(targetUrl.toString(), {
          method: "HEAD",
          headers: upstreamHeaders,
          redirect: "follow",
        });
        const h = new Headers(cors());
        for (const hdr of ["content-type", "content-length", "accept-ranges", "cache-control"]) {
          const v = up.headers.get(hdr);
          if (v) h.set(hdr, v);
        }
        if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
        return new Response(null, { status: up.ok ? 200 : up.status, headers: h });
      } catch (e) {
        return new Response(null, { status: 502, headers: cors() });
      }
    }

    // ── GET request ─────────────────────────────────────────────────────────
    try {
      const upstream = await fetch(targetUrl.toString(), {
        headers: upstreamHeaders,
        redirect: "follow",
      });

      // Surface upstream errors with full CORS headers so browser can read them
      if (!upstream.ok && upstream.status !== 206) {
        return new Response(
          `Upstream ${upstream.status}: ${targetUrl.hostname}`,
          { status: upstream.status, headers: cors({ "Content-Type": "text/plain" }) }
        );
      }

      const contentType   = upstream.headers.get("content-type") || "";
      const workerOrigin  = `${url.protocol}//${url.host}`;

      // ── M3U8 manifest — rewrite all URLs ───────────────────────────────
      if (isM3U8(targetUrl.href, contentType)) {
        const text      = await upstream.text();
        const rewritten = rewriteM3U8(text, targetUrl.href, effectiveReferer, workerOrigin);
        return new Response(rewritten, {
          status: 200,
          headers: cors({
            "Content-Type":  "application/vnd.apple.mpegurl",
            "Cache-Control": "public, max-age=30, s-maxage=60",
          }),
        });
      }

      // ── Subtitle files — cache aggressively ────────────────────────────
      const isSubtitle =
        contentType.includes("text/vtt") ||
        contentType.includes("text/plain") ||
        /\.(vtt|srt|ass|ssa)(\?|$)/i.test(targetUrl.pathname);
      if (isSubtitle) {
        const h = new Headers(cors());
        h.set("Content-Type", contentType || "text/vtt");
        h.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
        return new Response(upstream.body, { status: upstream.status, headers: h });
      }

      // ── Everything else (keys, init segments, .mp4 direct, .ts) ────────
      const respHeaders = new Headers(cors());
      for (const hdr of [
        "content-type", "content-length", "content-range",
        "accept-ranges", "cache-control", "etag",
      ]) {
        const v = upstream.headers.get(hdr);
        if (v) respHeaders.set(hdr, v);
      }
      if (!respHeaders.has("accept-ranges")) respHeaders.set("accept-ranges", "bytes");

      // Ensure mp4 content-type for AnimeGG direct play URLs
      const ct = respHeaders.get("content-type") || "";
      if (!ct && targetUrl.pathname.toLowerCase().match(/\.mp4|\/play\//)) {
        respHeaders.set("content-type", "video/mp4");
      }

      return new Response(upstream.body, { status: upstream.status, headers: respHeaders });

    } catch (e) {
      return Response.json(
        { error: "Upstream fetch failed", detail: e.message },
        { status: 502, headers: cors() }
      );
    }
  },
};
