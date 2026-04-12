# AniStream — Bandwidth Fix & Cloudflare Worker Deployment Guide

## What Was Changed & Why

### Root cause
Every HLS video segment (.ts chunk, ~2 MB each) was being proxied through
Vercel serverless functions. A single episode watch = ~300 segments = ~600 MB
through Vercel, billed as Fast Origin Transfer. With just a few concurrent
users this exhausts the Hobby plan quota in hours.

### What the fixes do
1. **CF Worker proxy** — video manifests (.m3u8) go through Cloudflare Workers
   (free: 100k req/day, no egress billing). Video segments fetch directly from
   CDN — zero Vercel involvement.
2. **fLoader removed** — hls.js no longer routes .ts segments through any proxy.
3. **AniList ping removed** — was a serverless function call on every page load.
4. **Crysoline ping direct** — now calls api.crysoline.moe from the browser.
5. **AniSkip direct** — was proxied through Vercel unnecessarily; now direct.
6. **CDN caching** — metadata routes (home, info, episodes, search, schedule)
   now set Cache-Control headers so Vercel CDN serves them from the edge.

---

## Step 1 — Deploy the Cloudflare Worker

### 1a. Install Wrangler (Cloudflare CLI)

```bash
npm install -g wrangler
```

### 1b. Log in to Cloudflare

```bash
wrangler login
```

This opens your browser. Log in or create a free Cloudflare account at
https://dash.cloudflare.com/sign-up — no credit card needed.

### 1c. Deploy the worker

From your project root:

```bash
cd cf-proxy
npm install
npm run deploy
```

You'll see output like:

```
✓ Deployed anistream-proxy to workers.dev
  https://anistream-proxy.<your-subdomain>.workers.dev
```

Copy that URL — you'll need it in the next step.

### 1d. (Optional) Lock down the worker to your domain

Open `cf-proxy/wrangler.toml` and set:

```toml
[vars]
ALLOWED_ORIGIN = "https://your-site.vercel.app"
```

Then redeploy:

```bash
npm run deploy
```

---

## Step 2 — Add the Worker URL to Vercel

In your Vercel dashboard:

1. Go to your project → **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `NEXT_PUBLIC_PROXY_URL`
   - **Value:** `https://anistream-proxy.<your-subdomain>.workers.dev`
   - **Environments:** Production, Preview, Development
3. Click **Save**
4. **Redeploy** your Vercel project (Settings → Deployments → Redeploy)

That's it. Once deployed, all proxy requests redirect to Cloudflare.
Your Vercel `/api/proxy` route becomes a lightweight 302 redirect —
it consumes almost no origin transfer.

---

## Step 3 — Verify It's Working

### Check the worker is live:
```
https://anistream-proxy.<your-subdomain>.workers.dev/health
```
Should return: `{"ok":true,"service":"anistream-cf-proxy"}`

### Check proxy is redirecting:
Open your site and start watching an anime. In browser DevTools → Network tab:
- Filter by `proxy`
- You should see requests to your CF worker URL, NOT to `yoursite.vercel.app/api/proxy`
- .ts segment requests should go directly to CDN domains (NOT proxied at all)

### Check Vercel bandwidth in dashboard:
Within 24 hours of deploying, Fast Origin Transfer usage should drop by 90%+.

---

## Step 4 — Local Development

The worker is only used in production. For local dev:

```bash
# In project root
npm run dev
```

`NEXT_PUBLIC_PROXY_URL` is not set locally, so `/api/proxy` uses the
built-in dev fallback automatically. No CF worker needed locally.

If you want to test the worker locally:

```bash
cd cf-proxy
npm run dev   # starts worker on http://localhost:8787
```

Then in your `.env.local`:
```
NEXT_PUBLIC_PROXY_URL=http://localhost:8787
```

---

## Files Changed (Summary)

### New files
```
cf-proxy/
  src/index.js          ← Cloudflare Worker (the real proxy)
  wrangler.toml         ← Worker config
  package.json          ← wrangler dev dependency
```

### Modified files
```
src/app/api/proxy/route.js
  → Now a thin 302 redirect to CF Worker when NEXT_PUBLIC_PROXY_URL is set
  → Falls back to local implementation in dev

src/components/HlsPlayer.jsx
  → fLoader removed from HLS config (segments go direct to CDN)
  → proxyUrl() now uses NEXT_PUBLIC_PROXY_URL
  → AniSkip API called directly (no proxy)

src/components/Footer.jsx
  → AniList ping completely removed
  → Crysoline status calls api.crysoline.moe directly from browser

src/app/api/anime/home/route.js
  → Added Cache-Control: s-maxage=300 (Vercel CDN caches for 5 min)

src/app/api/anime/info/[id]/route.js
  → Added Cache-Control: s-maxage=3600 (Vercel CDN caches for 1 hour)

src/app/api/anime/episodes/[id]/route.js
  → Fixed duplicate dynamic export
  → Added Cache-Control: s-maxage=3600

src/app/api/anime/search/route.js
  → Added Cache-Control: s-maxage=600

src/app/api/anime/schedule/route.js
  → Added Cache-Control: s-maxage=3600

next.config.js
  → Added NEXT_PUBLIC_PROXY_URL and api.aniskip.com to CSP connect-src
  → Added https://* to allow direct CDN segment fetches

vercel.json
  → Removed /api/proxy from functions (it's now a redirect, not a handler)
```

### Deleted files
```
src/app/api/ping/anilist/route.js  ← removed entirely
```

---

## Crysoline Health Ping — Impact on Vercel

**LOW impact.** The Crysoline `/api/ping/crysoline` route was a small GET
returning ~100 bytes. By itself, it barely registers in bandwidth.

The real problem was that it was a **serverless function invocation** on every
page load (footer renders on every page), and it calls out to an external API
from Vercel's origin. Each invocation counts against:
  - Serverless function execution time
  - Fast Origin Transfer (the Vercel→external fetch response returning to Vercel)

In the patched code, the Crysoline health check now runs entirely in the
**browser** — `fetch("https://api.crysoline.moe/health")` from the client.
Crysoline supports CORS on that endpoint, so it works without a proxy.
Zero Vercel involvement.

---

## Bandwidth Impact Summary

| Source                        | Before          | After             |
|-------------------------------|-----------------|-------------------|
| HLS video segments            | All through Vercel (~600 MB/episode) | Direct CDN (0 MB Vercel) |
| HLS manifests (.m3u8)         | Through Vercel  | Through CF Worker (free) |
| AniSkip API                   | Through Vercel  | Direct browser    |
| Crysoline health ping         | Vercel function | Direct browser    |
| AniList ping                  | Vercel function | Removed           |
| Metadata APIs (info/episodes) | Every request hits origin | CDN-cached for 1h |
| Home page data                | Every request hits origin | CDN-cached for 5 min |

**Expected result: 90–95% reduction in Fast Origin Transfer usage.**
