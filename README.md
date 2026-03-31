# AniStream — Full-Stack Next.js Anime Streaming Platform

A single, unified full-stack anime streaming site built with **Next.js 14 App Router**.  
No separate backend needed. API routes and frontend live in the same codebase and deploy as one app.

---

## ⚡ Architecture

```
anistream/
├── src/
│   ├── app/
│   │   ├── layout.js               # Root layout (Navbar + Footer)
│   │   ├── page.js                 # Home (SSR with revalidation)
│   │   ├── search/page.js
│   │   ├── browse/page.js
│   │   ├── anime/[id]/page.js      # Anime detail
│   │   ├── watch/[animeId]/[episodeId]/page.js
│   │   └── api/                    # ← All API routes (same app)
│   │       ├── anime/home/route.js
│   │       ├── anime/search/route.js
│   │       ├── anime/info/[id]/route.js
│   │       ├── anime/episodes/[id]/route.js
│   │       ├── anime/category/[...slug]/route.js
│   │       ├── stream/servers/[episodeId]/route.js
│   │       └── stream/sources/route.js
│   ├── lib/
│   │   ├── scraper.js   # hianime.dk scraper (cheerio + axios)
│   │   ├── cache.js     # In-memory TTL cache
│   │   └── api.js       # Client-side fetch helper (calls /api/*)
│   ├── components/      # All React client components
│   └── styles/          # Global CSS design system
├── next.config.js
├── package.json
└── .env.example
```

**How it works:**
- Next.js API routes (`/api/*`) run on the server — they scrape `hianime.dk` using Cheerio + Axios
- The frontend React components call those same `/api/*` routes — always same-origin
- **Zero external API needed** after deployment

---

## 🚀 Quick Start

```bash
# 1. Install
npm install

# 2. Run dev server
npm run dev
# → http://localhost:3000
```

That's it. No backend to start separately.

---

## 🏗️ Production Build

```bash
npm run build
npm start
```

---

## ☁️ Deploy to Vercel (Recommended — Free)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Or push to GitHub and connect repo at vercel.com
```

**Vercel settings:**
- Framework: Next.js (auto-detected)
- Build command: `npm run build`
- Output directory: `.next` (auto)
- No environment variables required for basic deployment

Optional env var:
```
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
```

---

## 🌐 Deploy to Railway / Render / Fly.io

```bash
# Build
npm run build

# Start
npm start  # runs on PORT env var (default 3000)
```

Set `PORT` in your host's env settings if needed.

---

## 🔧 Deploy to a VPS (Self-hosted)

```bash
# Install Node 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and install
git clone <your-repo> && cd anistream
npm install && npm run build

# Run with PM2
npm install -g pm2
pm2 start npm --name "anistream" -- start
pm2 save && pm2 startup
```

Use Nginx as a reverse proxy pointing to `localhost:3000`.

---

## 📡 API Endpoints (Internal)

All endpoints are Next.js Route Handlers — they run server-side and scrape `hianime.dk`.

| Endpoint | Description | Cache TTL |
|---|---|---|
| `GET /api/anime/home` | Home data (spotlight, trending, top 10…) | 5 min |
| `GET /api/anime/search?q=&page=` | Search results | 3 min |
| `GET /api/anime/info/:id` | Anime details + seasons + related | 10 min |
| `GET /api/anime/episodes/:id` | Full episode list | 5 min |
| `GET /api/anime/category/:name?page=` | Browse by category or genre | 5 min |
| `GET /api/stream/servers/:episodeId` | Available stream servers | 2 min |
| `GET /api/stream/sources?episodeId=&server=&category=` | HLS stream URL + subtitle tracks | 2 min |

---

## 🎨 Design System

- **Font:** Syne (display) + DM Sans (body)
- **Theme:** Deep dark — `#07080d` base, ember-red accent (`#e85d4a`), gold secondary (`#f0a500`)
- **Components:** CSS Modules, fully responsive, no external UI library

---

## 🛠️ Features

| Feature | Details |
|---|---|
| **Home** | Auto-rotating spotlight hero, trending, latest episodes, top airing, Top 10 sidebar |
| **Search** | Live suggestion dropdown + full search page with pagination |
| **Browse** | 20+ categories and genres with sidebar filter + paginated grid |
| **Anime Detail** | Blurred hero, episode grid with filler markers, seasons, related/recommended |
| **Watch** | HLS.js player, Sub/Dub/Raw server selector, episode sidebar, prev/next nav |
| **Video Player** | Custom controls, quality selector, playback speed, volume, fullscreen, subtitle tracks |

---

## ⚠️ Disclaimer

AniStream does not host any video content. The scraper fetches publicly accessible data from `hianime.dk`.  
Use responsibly and in accordance with your local laws.
