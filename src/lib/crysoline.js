/**
 * crysoline.js — Crysoline API client (rate-limit aware)
 *
 * Sources: English/Japanese ONLY — Spanish, Russian, Arabic removed.
 * Default source: AnimeGG (animegg)
 */

import axios from "axios";

const BASE = "https://api.crysoline.moe";

function makeClient(timeout = 8000) {
  const key = process.env.CRYSOLINE_API_KEY || "";
  if (!key) console.warn("[crysoline] CRYSOLINE_API_KEY not set");
  return axios.create({
    baseURL: BASE,
    timeout,
    headers: { "x-api-key": key, Accept: "application/json" },
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function cryGet(path, params = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await makeClient().get(path, { params });
      return data;
    } catch (e) {
      const status = e.response?.status;
      const msg    = e.response?.data?.message || e.response?.data || e.message;

      if (status === 429) {
        if (attempt < retries) {
          const wait = Math.pow(2, attempt) * 1000;
          console.log(`[crysoline] 429 rate limit — waiting ${wait}ms (attempt ${attempt + 1}/${retries})`);
          await sleep(wait);
          continue;
        }
        console.log(`[crysoline] 429 rate limit exceeded after ${retries} retries: ${path}`);
        return null;
      }

      console.log(`[crysoline] ${path} → ${status || e.code}: ${
        typeof msg === "string" ? msg.slice(0, 80) : JSON.stringify(msg).slice(0, 80)
      }`);
      return null;
    }
  }
  return null;
}

// ── English/Japanese sources ONLY ─────────────────────────────────────────────
// AnimeGG is first (default source)
export const CRYSOLINE_SOURCES = [
  { id: "animegg",         name: "AnimeGG",       site: "animegg.org",             langs: ["en","ja"],      hasServers: false, isDefault: true  },
  { id: "animepahe",       name: "AnimePahe",     site: "animepahe.si",            langs: ["en","ja"],      hasServers: false },
  { id: "animeheaven",     name: "AnimeHeaven",   site: "animeheaven.me",          langs: ["en","ja"],      hasServers: false },
  { id: "animekai",        name: "AnimeKai",      site: "anikai.to",               langs: ["en","ja"],      hasServers: false },
  { id: "animeyy",         name: "AnimeYY",       site: "animeyy.com",             langs: ["en","ja"],      hasServers: false },
  { id: "anizone",         name: "Anizone",       site: "anizone.to",              langs: ["en","ja"],      hasServers: false },
  { id: "animenexus",      name: "AnimeNexus",    site: "anime.nexus",             langs: ["en","ja"],      hasServers: false },
  { id: "animeonsen",      name: "AnimeOnsen",    site: "animeonsen.xyz",          langs: ["en","ja"],      hasServers: false },
  { id: "animeparadise",   name: "AnimeParadise", site: "animeparadise.moe",       langs: ["en","ja"],      hasServers: false },
  { id: "animex",          name: "Animex",        site: "animex.one",              langs: ["en","ja","id"], hasServers: true  },
  { id: "onetwothreeanime",name: "123Anime",      site: "123animes.org",           langs: ["en","ja"],      hasServers: false },
  { id: "uniquestream",    name: "UniqueStream",  site: "anime.uniquestream.net",  langs: ["en","ja"],      hasServers: false },
  { id: "kickassanime",    name: "KickAssAnime",  site: "kickass-anime.ro",        langs: ["en","ja"],      hasServers: false },
  { id: "anicore",         name: "Anicore",       site: "anikage.cc",              langs: ["en","ja","id"], hasServers: true  },
  { id: "anidap",          name: "Anidap",        site: "anidap.se",               langs: ["en","ja","id"], hasServers: true  },
];

export const DEFAULT_SOURCE_ID = "animegg";

export const EN_SOURCE_IDS  = CRYSOLINE_SOURCES.map(s => s.id);
export const ALL_SOURCE_IDS = CRYSOLINE_SOURCES.map(s => s.id);

// ── Mapper ────────────────────────────────────────────────────────────────────

export async function mapAnilistToSource(anilistId, sourceId) {
  const data = await cryGet("/api/mapper/map", {
    id:       String(anilistId),
    provider: sourceId,
  });

  if (!data) return null;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[crysoline] mapper raw for ${sourceId}:${anilistId} →`, JSON.stringify(data));
  }

  if (!data.found) return null;

  const id =
    (typeof data.idMap === "string" ? data.idMap : null) ||
    (typeof data.idMap === "number" ? String(data.idMap) : null) ||
    (typeof data.id     === "string" ? data.id     : null) ||
    (typeof data.result === "string" ? data.result : null);

  if (!id || id === "null" || id === "undefined" || !id.trim()) return null;
  return id.trim();
}

export async function mapAnilistSequential(anilistId, sourceIds, delayMs = 350) {
  const map = new Map();

  for (const sourceId of sourceIds) {
    const mappedId = await mapAnilistToSource(anilistId, sourceId);
    if (mappedId) {
      map.set(sourceId, mappedId);
      console.log(`[crysoline] mapped ${sourceId} → ${mappedId}`);
    }
    await sleep(delayMs);
  }

  return map;
}

export async function mapAnilistToEnSources(anilistId) {
  return mapAnilistSequential(anilistId, EN_SOURCE_IDS, 500);
}

export async function mapAnilistToAllSources(anilistId) {
  return mapAnilistSequential(anilistId, ALL_SOURCE_IDS, 500);
}

// ── Per-source episode / stream calls ────────────────────────────────────────

export async function getEpisodesFromSource(sourceId, mappedId) {
  if (!sourceId || !mappedId) {
    console.warn(`[crysoline] getEpisodesFromSource called with missing params`);
    return [];
  }

  const data = await cryGet(`/api/anime/${sourceId}/episodes/${encodeURIComponent(mappedId)}`);
  if (!data) return [];

  let raw = [];
  if (Array.isArray(data))             raw = data;
  else if (Array.isArray(data.episodes)) raw = data.episodes;
  else if (Array.isArray(data.data))   raw = data.data;
  else return [];

  return raw.map((ep, idx) => ({
    id:       ep.id || ep.episodeId || String(ep.number ?? idx + 1),
    number:   ep.number ?? ep.episode ?? idx + 1,
    title:    ep.title || ep.name || `Episode ${ep.number ?? idx + 1}`,
    image:    ep.image || ep.thumbnail || null,
    metadata: ep.metadata || {},
  }));
}

export async function getServersFromSource(sourceId, mappedId, episodeId) {
  const src = CRYSOLINE_SOURCES.find(s => s.id === sourceId);
  if (!src?.hasServers) return [];
  if (!mappedId || !episodeId) return [];

  const data = await cryGet(`/api/anime/${sourceId}/servers`, { id: mappedId, episodeId });
  if (!data) return [];
  return data.servers || (Array.isArray(data) ? data : []);
}

export async function getSourcesFromSource(sourceId, mappedId, episodeId, subType = "", server = "") {
  if (!mappedId || !episodeId) return { sources: [], subtitles: [], headers: {} };

  const params = { id: mappedId, episodeId };
  if (subType) params.subType = subType;
  if (server)  params.server  = server;

  const data = await cryGet(`/api/anime/${sourceId}/sources`, params);
  if (!data) return { sources: [], subtitles: [], headers: {} };

  return {
    sources: (data.sources || []).map(s => ({
      url:     s.url || "",
      quality: s.quality || "auto",
      isHLS:   !!(s.isM3U8 || s.url?.includes(".m3u8")),
    })).filter(s => s.url),
    subtitles: (data.subtitles || data.tracks || []).map(t => ({
      url:   t.url || t.file || "",
      label: t.lang || t.label || "Unknown",
    })).filter(t => t.url),
    headers: data.headers || {},
  };
}
