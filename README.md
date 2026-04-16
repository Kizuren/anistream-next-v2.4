# 🎌 AnimeDex

A fast, modern anime streaming site built with **Next.js 15**. Pulls metadata from AniList's GraphQL API and streams episodes through multiple fallback providers — no single point of failure.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![AniList](https://img.shields.io/badge/AniList-GraphQL-02A9FF?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## ✨ Features

- **Spotlight banner** — rotating hero carousel of trending anime
- **Browse & search** — filter by genre, status, season, and more
- **Anime detail pages** — score, rank, source, tags, synonyms, trailer links, and external streaming links (Crunchyroll, Netflix, etc.)
- **Episode player** — HLS native player with multi-server fallback (12+ providers)
- **Airing schedule** — weekly calendar of currently airing episodes
- **AniList OAuth login** — Authorization Code flow, token stored in httpOnly cookie
- **User profile** — watch stats, recently watched, AniList list sync
- **Episode comments** — TheAnimeCommunity embed with Disqus fallback
- **Two-layer cache** — Upstash Redis → Turso SQLite → in-memory, zero config required
- **Proxy route** — server-side HLS stream proxying with Range header support for seeking

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| UI | React 18, CSS Modules |
| Metadata API | AniList GraphQL |
| Streaming | Crysoline API + 12 iframe providers |
| Auth | AniList OAuth 2.0 (Authorization Code) |
| Cache L1 | Upstash Redis |
| Cache L2 | Turso SQLite (libsql) |
| Video | hls.js |
| Comments | TheAnimeCommunity embed / Disqus |

---

## 📦 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### 1. Clone the repo

```bash
git clone https://github.com/skgupta507/animedex-next.git
cd anistream
npm install
```

### 2. Set up environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env.local
```

```env
# Required
CRYSOLINE_API_KEY=your_crysoline_key

# Optional but recommended
TMDB_API_KEY=your_tmdb_key

# Cache — Upstash Redis (free tier at upstash.com)
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Cache — Turso SQLite (free tier at turso.tech)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_token

# AniList OAuth
NEXT_PUBLIC_ANILIST_CLIENT_ID=your_client_id
ANILIST_CLIENT_ID=your_client_id
ANILIST_CLIENT_SECRET=your_client_secret
ANILIST_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

> The app works with zero cache config — it falls back to in-memory caching automatically. Adding Upstash and Turso is strongly recommended for production.

### 3. Set up AniList OAuth

1. Go to [anilist.co/settings/developer](https://anilist.co/settings/developer)
2. Create a new client
3. Set the **Redirect URI** to exactly: `http://localhost:3000/api/auth/callback`
4. Copy the **Client ID** and **Client Secret** into `.env.local`

> ⚠️ The redirect URI must match exactly — including the path `/api/auth/callback`.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 📁 Project Structure

```
src/
├── app/
│   ├── page.js                  # Home page
│   ├── anime/[id]/              # Anime detail page
│   ├── watch/[id]/[ep]/         # Episode player
│   ├── browse/                  # Browse by genre/category
│   ├── search/                  # Search results
│   ├── schedule/                # Weekly airing schedule
│   ├── profile/                 # User profile (requires login)
│   ├── auth/callback/           # AniList OAuth callback (client)
│   └── api/
│       ├── anime/               # Info, episodes, search, home, schedule
│       ├── auth/                # Login, callback, session, logout, me
│       ├── stream/              # Stream sources and servers
│       ├── proxy/               # Server-side HLS proxy
│       ├── cache/               # Cache stats and prune
│       └── debug/               # Debug endpoints
├── components/
│   ├── Navbar.jsx
│   ├── HomeClient.jsx
│   ├── AnimeDetailClient.jsx    # Anime info page
│   ├── WatchClient.jsx          # Video player page
│   ├── HlsPlayer.jsx            # HLS video player
│   ├── CommentsSection.jsx      # TAC / Disqus comments
│   ├── AuthProvider.jsx         # Auth context
│   ├── SpotlightBanner.jsx      # Hero carousel
│   └── ...
└── lib/
    ├── anilist.js               # AniList GraphQL client
    ├── auth.js                  # OAuth helpers
    ├── cache.js                 # Three-layer cache
    ├── providers.js             # Streaming provider registry
    ├── crysoline.js             # Crysoline API client
    ├── episodes.js              # Episode list builder
    ├── tmdb.js                  # TMDB ID extraction
    └── api.js                   # Client-side API wrapper
```

---

## 🎬 Streaming Providers

The player automatically cycles through providers if one fails. Supported providers:

**Primary (TMDB-based):** Embeded Sources

**Direct (Crysoline API):** Anime sources via the Crysoline API key

---

## ⚙️ Available Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
npm run fresh    # Clear .next cache and start dev server
npm run lint     # Run ESLint
```

---

## 🚀 Deployment

### Vercel (recommended)

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add all environment variables from `.env.example` in the Vercel dashboard
4. Update `ANILIST_REDIRECT_URI` to your production domain: `https://yourdomain.com/api/auth/callback`
5. Update the redirect URI in your AniList developer settings to match

### Self-hosted

```bash
npm run build
npm run start
```

---

## 🔒 Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `CRYSOLINE_API_KEY` | ✅ | Crysoline streaming API key |
| `TMDB_API_KEY` | Recommended | TMDB key for provider matching |
| `UPSTASH_REDIS_REST_URL` | Recommended | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Upstash Redis token |
| `TURSO_DATABASE_URL` | Recommended | Turso SQLite URL |
| `TURSO_AUTH_TOKEN` | Recommended | Turso auth token |
| `NEXT_PUBLIC_ANILIST_CLIENT_ID` | ✅ for login | AniList client ID (public) |
| `ANILIST_CLIENT_ID` | ✅ for login | AniList client ID (server) |
| `ANILIST_CLIENT_SECRET` | ✅ for login | AniList client secret |
| `ANILIST_REDIRECT_URI` | ✅ for login | OAuth callback URL |
| `NEXT_PUBLIC_DISQUS_SHORTNAME` | Optional | Disqus shortname for comments fallback |

---

## 📝 License

MIT — free to use, modify, and distribute.

---

---

## Disclaimer

> This project is open-source under the MIT License and is intended for self-hosting only. Any form of commercial use is strictly prohibited. AnimeDex does not host, upload, or store any media files and solely acts as an interface to access publicly available third-party content.

---

## 🙏 Credits

- [AniList](https://anilist.co) — anime metadata & OAuth
- [Crysoline](https://api.crysoline.moe) — primary streaming API
- [TMDB](https://www.themoviedb.org) — movie/TV database for provider matching
- [TheAnimeCommunity](https://theanimecommunity.com) — episode comments
- [hls.js](https://github.com/video-dev/hls.js) — HLS video playback