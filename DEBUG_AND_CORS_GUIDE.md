# Media Player Debugging & CORS Fix Guide

## 1. Media Player Errors — Causes & Fixes

### Error: `manifestLoadError` / "Stream unavailable"
**Cause:** The proxy fetched the .m3u8 but the CDN returned 403 or 404.
Common with IP-pinned CDNs (MegaUp, in1.cdn.nexus) that bind session tokens
to the client IP — when Vercel's server IP differs from the browser, the CDN
rejects it.

**Fix:** Already handled in `HlsPlayer.jsx`:
```js
if (data.details === "manifestLoadError") {
  onStreamError?.(); // triggers automatic fallback to next source
}
```
No user action needed — the player auto-falls back. If all sources fail,
switch to a different `sourceId` manually in the source panel.

---

### Error: `bufferAddCodecError`
**Cause:** hls.js loaded an HEVC (H.265) stream on a browser/OS that doesn't
support hardware-accelerated H.265 decoding (most Windows Chrome users).

**Fix (already in code):**
```js
hls.on(Hls.Events.ERROR, (_, data) => {
  if (data.details === "bufferAddCodecError") {
    // Automatically selects a H.264 fallback level from the manifest
    const fallback = levels.findIndex((l, i) =>
      i !== cur && l.videoCodec !== curCodec
    );
    if (fallback >= 0) { hls.currentLevel = fallback; return; }
  }
});
```
The player shows a "H.264 auto-selected" badge. If no H.264 level exists,
the error surfaces and the user should switch sources.

---

### Error: Player loads but video is black / no audio
**Cause A:** Browser autoplay policy blocked the `.play()` call.
**Fix:** The `.play().catch(() => {})` suppresses the error silently. If the
video is paused on load, the user must click the play button.

**Cause B:** `crossOrigin="anonymous"` is set but the CDN doesn't send
`Access-Control-Allow-Origin`. This causes the video element to refuse to
render the stream even if it loaded.

**Fix:**
```jsx
// In HlsPlayer.jsx — only set crossOrigin when subtitles are present
// (it's only needed for VTT/SRT tracks that require CORS text fetches)
<video
  crossOrigin={subtitles?.length > 0 ? "anonymous" : undefined}
  ...
/>
```

---

### Error: Subtitles not showing / `resolveSubtitleUrl` fails silently
**Cause:** The subtitle URL is on a CORS-restricted CDN. `resolveSubtitleUrl`
tries `fetch(proxyFn(url))` but the CF worker returns 403 (not in allowlist).

**Fix:** Add the subtitle CDN to `PROXY_ALLOWLIST` in `cf-proxy/src/index.js`:
```js
const PROXY_ALLOWLIST = [
  "api.aniskip.com",
  "subtitle.animegg.org",  // ← add CDN that hosts .vtt/.srt files
  ...
];
```

---

### Error: "Stream error: fragLoadError" on .ts segments
**Cause:** After removing `fLoader: ProxyLoader`, segments now go direct to the
CDN. If a CDN requires CORS headers for segment fetches, the browser blocks them.

**Reality check:** Most anime CDNs serve segments with broad CORS headers
(or none, which the browser's media pipeline ignores). If a specific CDN
blocks direct segment fetches:

**Fix:** Add a custom fLoader that only proxies segment URLs from that CDN:
```js
// In HlsPlayer.jsx — selective fLoader
const FORCE_PROXY_HOSTS = ["restrictive-cdn.example.com"];
const fLoader = class extends DefaultLoader {
  load(ctx, cfg, cbs) {
    try {
      const host = new URL(ctx.url).hostname;
      if (FORCE_PROXY_HOSTS.some(h => host.endsWith(h))) {
        ctx.url = proxyUrl(ctx.url, streamReferer);
      }
    } catch {}
    super.load(ctx, cfg, cbs);
  }
};
// Then add to HLS config: fLoader
```

---

## 2. CORS Error — Crysoline Health Endpoint

### Why This Happens

The old code called `/api/ping/crysoline` — a Next.js serverless function that
in turn fetched `https://api.crysoline.moe/health` from Vercel's server.

When you moved to calling `https://api.crysoline.moe/health` **directly from
the browser**, the browser enforces CORS. If the server doesn't respond with
`Access-Control-Allow-Origin: *`, the browser blocks the response.

**Specifically:** The browser sends a preflight OPTIONS request. If the
Crysoline server returns a 403, no CORS header, or a timeout, you see:

```
Access to fetch at 'https://api.crysoline.moe/health' from origin
'https://yoursite.vercel.app' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

---

### Fix Option A — Keep Crysoline ping server-side (lowest risk)

Keep `/api/ping/crysoline` as a Vercel serverless function. It adds 1 small
invocation per page load but avoids all CORS issues:

```js
// src/app/api/ping/crysoline/route.js — KEEP this file
export const dynamic = "force-dynamic";
export async function GET() {
  const start = Date.now();
  try {
    const res = await fetch("https://api.crysoline.moe/health", {
      signal: AbortSignal.timeout(8000),
    });
    return Response.json({ up: res.ok, latency: Date.now() - start });
  } catch (e) {
    return Response.json({ up: false, latency: Date.now() - start });
  }
}
```

Then in Footer.jsx, revert to:
```js
fetch("/api/ping/crysoline") // ← calls your own Vercel origin, no CORS issue
```

---

### Fix Option B — Call Crysoline directly with error handling (current approach)

If `api.crysoline.moe/health` DOES support CORS (it currently does as of
April 2026), calling it directly is fine. Add a graceful fallback if it stops:

```js
// In Footer.jsx
function useCrysolineStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    fetch("https://api.crysoline.moe/health", {
      signal: AbortSignal.timeout(8000),
      // mode: "cors" is the default — no change needed
    })
      .then(r => setStatus(r.ok))
      .catch(() => setStatus(false)); // CORS failure = treated as "down"
  }, []);
  return status;
}
```

If the CORS error appears in console but `status` becomes `false`, the UI
still shows "Degraded" gracefully — no crash.

---

### Fix Option C — Proxy through the Cloudflare Worker

Add a `/status` route to the CF Worker that proxies the health check.
No CORS issue since it's same-origin from the worker:

```js
// In cf-proxy/src/index.js — add to the fetch handler:
if (url.pathname === "/crysoline-health") {
  const res = await fetch("https://api.crysoline.moe/health", {
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({ status: "unknown" }));
  return Response.json(
    { up: res.ok, ...data },
    { headers: corsHeaders({ "Cache-Control": "public, max-age=60" }) }
  );
}
```

Then in Footer.jsx:
```js
const WORKER = process.env.NEXT_PUBLIC_PROXY_URL || "";
const healthUrl = WORKER
  ? `${WORKER}/crysoline-health`
  : "https://api.crysoline.moe/health";

fetch(healthUrl) // ← CF worker handles CORS + caches for 60s
```

This is the best production option: it caches the health result for 60 seconds,
so 100 users visiting the footer don't trigger 100 pings to Crysoline.

---

### Fix Option D — Hide the status indicator if CORS fails

If none of the above is feasible, simply suppress the error visually:

```jsx
// Footer.jsx — show "Status unavailable" instead of erroring
const [status, setStatus] = useState("unknown");
useEffect(() => {
  fetch("https://api.crysoline.moe/health")
    .then(r => setStatus(r.ok ? "up" : "down"))
    .catch(() => setStatus("unknown")); // hide silently
}, []);

// Render:
{status !== "unknown" && <StatusDot up={status === "up"} />}
```

---

## 3. Summary Table

| Issue | Root Cause | Recommended Fix |
|---|---|---|
| `manifestLoadError` | IP-pinned CDN rejects Vercel IP | Auto-fallback (already coded) |
| `bufferAddCodecError` | HEVC on non-HEVC browser | Auto H.264 fallback (already coded) |
| Black video | `crossOrigin` + no CDN CORS header | Remove `crossOrigin` unless subtitles present |
| Subtitle load fail | CDN not in CF Worker allowlist | Add CDN host to `PROXY_ALLOWLIST` |
| Segment `fragLoadError` | CDN blocks direct browser fetch | Add CDN to selective `fLoader` |
| Crysoline CORS error | Direct browser fetch blocked | Option A (server-side) or C (CF Worker cached) |
