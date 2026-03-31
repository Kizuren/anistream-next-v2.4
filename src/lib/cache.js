/**
 * cache.js — Layered persistent cache
 *
 * Three layers, each used as fallback for the next:
 *
 *   Layer 1: Upstash Redis (fastest, TTL-native, ~10k free ops/day)
 *            Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in .env.local
 *            Free tier: https://upstash.com (no credit card)
 *
 *   Layer 2: Turso SQLite (persistent, unlimited reads, 500 free DBs)
 *            Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in .env.local
 *            Free tier: https://turso.tech
 *
 *   Layer 3: In-memory Map (zero config, lost on server restart)
 *            Always active as final fallback.
 *
 * Usage is identical regardless of which layers are configured:
 *   getCached(key)          → value | null
 *   setCached(key, val, ttl) → void
 *
 * Works perfectly with zero config (layer 3 only).
 * Improves automatically as you add env vars.
 */

// ── Layer 3: In-memory (always available) ─────────────────────────────────────
const memStore = new Map();

function memGet(key) {
  const e = memStore.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { memStore.delete(key); return null; }
  return e.val;
}

function memSet(key, val, ttlSec) {
  memStore.set(key, { val, exp: Date.now() + ttlSec * 1000 });
  // Evict oldest entries when store grows too large
  if (memStore.size > 2000) {
    const keys = [...memStore.keys()].slice(0, 200);
    keys.forEach(k => memStore.delete(k));
  }
}

// ── Layer 1: Upstash Redis ────────────────────────────────────────────────────
// Lazy-init so missing env vars don't crash at import time
let _redis = null;
function getRedis() {
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = require("@upstash/redis");
    _redis = new Redis({ url, token });
    return _redis;
  } catch { return null; }
}

async function redisGet(key) {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get(key);
    return val ?? null;
  } catch { return null; }
}

async function redisSet(key, val, ttlSec) {
  const r = getRedis();
  if (!r) return;
  try { await r.set(key, val, { ex: ttlSec }); } catch {}
}

// ── Layer 2: Turso SQLite ─────────────────────────────────────────────────────
let _db = null;
let _dbReady = false;

async function getDb() {
  if (_dbReady) return _db;
  _dbReady = true; // prevent repeated init attempts

  const url   = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url) return null;

  try {
    const { createClient } = require("@libsql/client");
    _db = createClient({ url, authToken: token || undefined });

    // Create cache table if it doesn't exist
    await _db.execute(`
      CREATE TABLE IF NOT EXISTS cache (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    // Create anime_map table for persistent Crysoline source mappings
    await _db.execute(`
      CREATE TABLE IF NOT EXISTS anime_source_map (
        anilist_id  INTEGER NOT NULL,
        source_id   TEXT    NOT NULL,
        mapped_id   TEXT    NOT NULL,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (anilist_id, source_id)
      )
    `);
    // Create anime_meta table for search result caching
    await _db.execute(`
      CREATE TABLE IF NOT EXISTS anime_meta (
        anilist_id   INTEGER PRIMARY KEY,
        slug         TEXT    NOT NULL,
        title        TEXT    NOT NULL,
        title_romaji TEXT,
        poster       TEXT,
        type         TEXT,
        status       TEXT,
        episodes_sub INTEGER DEFAULT 0,
        mal_id       INTEGER,
        tmdb_id      INTEGER,
        updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    console.log("[cache] Turso SQLite connected");
    return _db;
  } catch (e) {
    console.warn("[cache] Turso init failed:", e.message);
    _db = null;
    return null;
  }
}

async function dbGet(key) {
  const db = await getDb();
  if (!db) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const r   = await db.execute({
      sql:  "SELECT value FROM cache WHERE key = ? AND expires_at > ?",
      args: [key, now],
    });
    if (!r.rows.length) return null;
    return JSON.parse(r.rows[0][0]);
  } catch { return null; }
}

async function dbSet(key, val, ttlSec) {
  const db = await getDb();
  if (!db) return;
  try {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    await db.execute({
      sql:  "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
      args: [key, JSON.stringify(val), exp],
    });
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a cached value. Checks layers in order: Redis → SQLite → memory.
 * Backfills faster layers when found in a slower one.
 */
export async function getCachedAsync(key) {
  // Layer 1: Redis
  const fromRedis = await redisGet(key);
  if (fromRedis !== null) return fromRedis;

  // Layer 2: SQLite
  const fromDb = await dbGet(key);
  if (fromDb !== null) {
    // Backfill Redis so next read is faster
    // (we don't know original TTL here — use 10 min as safe default)
    redisSet(key, fromDb, 600).catch(() => {});
    return fromDb;
  }

  // Layer 3: memory
  return memGet(key);
}

/**
 * Set a cached value in all available layers.
 */
export async function setCachedAsync(key, val, ttlSec = 300) {
  // Write to all layers in parallel
  await Promise.allSettled([
    redisSet(key, val, ttlSec),
    dbSet(key, val, ttlSec),
  ]);
  memSet(key, val, ttlSec);
}

/**
 * Synchronous wrappers (memory-only) for code that can't await.
 * Used in places where async isn't possible.
 */
export function getCached(key)                  { return memGet(key); }
export function setCached(key, val, ttl = 300)  { memSet(key, val, ttl); }

// ── Anime-specific DB helpers ─────────────────────────────────────────────────

/**
 * Persist a Crysoline source mapping to SQLite (permanent — never expires).
 * @param {number} anilistId
 * @param {string} sourceId    e.g. "anicore"
 * @param {string} mappedId    source-specific anime ID
 */
export async function saveSourceMapping(anilistId, sourceId, mappedId) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute({
      sql:  "INSERT OR REPLACE INTO anime_source_map (anilist_id, source_id, mapped_id) VALUES (?, ?, ?)",
      args: [anilistId, sourceId, mappedId],
    });
  } catch {}
}

/**
 * Load all saved source mappings for an anime.
 * @param {number} anilistId
 * @returns {Map<string, string>}  sourceId → mappedId
 */
export async function loadSourceMappings(anilistId) {
  const db = await getDb();
  if (!db) return new Map();
  try {
    const r = await db.execute({
      sql:  "SELECT source_id, mapped_id FROM anime_source_map WHERE anilist_id = ?",
      args: [anilistId],
    });
    return new Map(r.rows.map(row => [row[0], row[1]]));
  } catch { return new Map(); }
}

/**
 * Save anime metadata to SQLite for search result caching.
 */
export async function saveAnimeMeta(anime) {
  const db = await getDb();
  if (!db) return;
  try {
    const id = anime.anilistId;
    if (!id) return;
    await db.execute({
      sql: `INSERT OR REPLACE INTO anime_meta
              (anilist_id, slug, title, title_romaji, poster, type, status, episodes_sub, mal_id, tmdb_id, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      args: [
        id,
        anime.id || "",
        anime.name || "",
        anime.jname || "",
        anime.poster || "",
        anime.type || "",
        anime.status || "",
        anime.episodes?.sub || 0,
        anime.malId || null,
        anime.tmdbId || null,
      ],
    });
  } catch {}
}

/**
 * Look up anime by AniList ID from SQLite meta table.
 */
export async function lookupAnimeMeta(anilistId) {
  const db = await getDb();
  if (!db) return null;
  try {
    const r = await db.execute({
      sql:  "SELECT * FROM anime_meta WHERE anilist_id = ?",
      args: [anilistId],
    });
    if (!r.rows.length) return null;
    const row = r.rows[0];
    return {
      anilistId:  row.anilist_id,
      id:         row.slug,
      name:       row.title,
      jname:      row.title_romaji,
      poster:     row.poster,
      type:       row.type,
      status:     row.status,
      episodes:   { sub: row.episodes_sub },
      malId:      row.mal_id,
      tmdbId:     row.tmdb_id,
    };
  } catch { return null; }
}

/**
 * Delete expired rows from the cache table (call periodically).
 */
export async function pruneCache() {
  const db = await getDb();
  if (!db) return;
  try {
    const now = Math.floor(Date.now() / 1000);
    await db.execute({ sql: "DELETE FROM cache WHERE expires_at < ?", args: [now] });
  } catch {}
}

/**
 * Delete one or all source mappings for an anime from SQLite.
 * Used to purge corrupt mappings written by old buggy code.
 *
 * @param {number} anilistId
 * @param {string|null} sourceId  — pass null to delete ALL rows for this anime
 */
export async function deleteSourceMapping(anilistId, sourceId) {
  const db = await getDb();
  if (!db) return;
  try {
    if (sourceId) {
      await db.execute({
        sql:  "DELETE FROM anime_source_map WHERE anilist_id = ? AND source_id = ?",
        args: [anilistId, sourceId],
      });
    } else {
      // Delete ALL mappings for this anime (full purge)
      await db.execute({
        sql:  "DELETE FROM anime_source_map WHERE anilist_id = ?",
        args: [anilistId],
      });
    }
  } catch (e) {
    console.warn("[cache] deleteSourceMapping failed:", e.message);
  }
}
