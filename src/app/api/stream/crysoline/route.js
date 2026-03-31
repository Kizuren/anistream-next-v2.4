/**
 * POST /api/stream/crysoline
 *
 * Caching strategy (prevents rate limiting):
 *   1. mapOne: checks SQLite anime_source_map first — permanent storage
 *      Only calls Crysoline mapper if not in DB (first time only per anime/source pair)
 *   2. All other calls: Redis → SQLite → memory layered cache
 *   3. Sequential mapper calls with 350ms delay (no parallel storms)
 *
 * Cache TTLs:
 *   Source mappings  → permanent (SQLite anime_source_map table)
 *   Episode lists    → 10 min
 *   Stream sources   → 2 min
 */
import { NextResponse } from "next/server";
import {
  getCachedAsync, setCachedAsync,
  saveSourceMapping, loadSourceMappings, deleteSourceMapping,
  getCached, setCached,
} from "@/lib/cache";
import {
  CRYSOLINE_SOURCES, EN_SOURCE_IDS, ALL_SOURCE_IDS,
  mapAnilistToSource,
  mapAnilistToEnSources, mapAnilistToAllSources, mapAnilistSequential,
  getEpisodesFromSource, getServersFromSource, getSourcesFromSource,
} from "@/lib/crysoline";

export async function POST(request) {
  try {
    const body   = await request.json();
    const action = body.action;

    switch (action) {

      // ── MAP ONE ───────────────────────────────────────────────────────
      case "mapOne": {
        const { anilistId, sourceId } = body;
        if (!anilistId || !sourceId) return err("anilistId and sourceId required");

        const dbMappings = await loadSourceMappings(anilistId);
        if (dbMappings.has(sourceId)) {
          const mappedId = dbMappings.get(sourceId);
          const src = CRYSOLINE_SOURCES.find(s => s.id === sourceId);
          return ok({ sourceId, mappedId, sourceName: src?.name || sourceId, found: true, fromCache: "db" });
        }

        const cacheKey = `cryo_map1:${anilistId}:${sourceId}`;
        const cached   = await getCachedAsync(cacheKey);
        if (cached) return ok({ ...cached, fromCache: "redis" });

        const mappedId = await mapAnilistToSource(anilistId, sourceId);
        const src      = CRYSOLINE_SOURCES.find(s => s.id === sourceId);
        const result   = { sourceId, mappedId: mappedId||null, sourceName: src?.name||sourceId, found: !!mappedId };

        if (mappedId) {
          saveSourceMapping(anilistId, sourceId, mappedId).catch(() => {});
          setCachedAsync(cacheKey, result, 86400).catch(() => {});
        } else {
          setCachedAsync(cacheKey, result, 3600).catch(() => {});
        }
        return ok(result);
      }

      // ── MAP ───────────────────────────────────────────────────────────
      case "map": {
        const { anilistId, lang = "en" } = body;
        if (!anilistId) return err("anilistId required");

        const dbMap = await loadSourceMappings(anilistId);

        const cacheKey = `cryo_map:${anilistId}:${lang}`;
        const cached   = await getCachedAsync(cacheKey);
        if (cached && dbMap.size >= cached.total) return ok({ ...cached, fromCache: "db" });

        const sourceIds  = lang === "all" ? ALL_SOURCE_IDS : EN_SOURCE_IDS;
        const needApiIds = sourceIds.filter(id => !dbMap.has(id));

        let newMap = new Map();
        if (needApiIds.length > 0) {
          newMap = await mapAnilistSequential(anilistId, needApiIds, 350);
          for (const [sid, mid] of newMap) {
            saveSourceMapping(anilistId, sid, mid).catch(() => {});
          }
        }

        const combined = new Map([...dbMap, ...newMap]);
        const available = [];
        for (const [sourceId, mappedId] of combined) {
          const src = CRYSOLINE_SOURCES.find(s => s.id === sourceId);
          if (src) {
            available.push({
              sourceId,
              mappedId,
              sourceName: src.name,
              langs: src.langs,
              hasServers: src.hasServers
            });
          }
        }

        const result = { available, total: available.length };
        if (available.length > 0) setCachedAsync(cacheKey, result, 86400).catch(() => {});
        return ok(result);
      }

      // ── EPISODES ──────────────────────────────────────────────────────
      case "episodes": {
        const { sourceId, mappedId } = body;
        if (!sourceId || !mappedId) return err("sourceId and mappedId required");

        const cacheKey = `cryo_eps:${sourceId}:${mappedId}`;
        const cached   = await getCachedAsync(cacheKey);
        if (cached) return ok(cached);

        const episodes = await getEpisodesFromSource(sourceId, mappedId);
        const result   = { episodes: episodes||[], count: episodes?.length||0 };

        if (result.count > 0) await setCachedAsync(cacheKey, result, 600);
        return ok(result);
      }

      // ── SERVERS ───────────────────────────────────────────────────────
      case "servers": {
        const { sourceId, mappedId, episodeId } = body;
        if (!sourceId || !mappedId || !episodeId) return err("sourceId, mappedId, episodeId required");

        const cacheKey = `cryo_srv:${sourceId}:${mappedId}:${episodeId}`;
        const cached   = await getCachedAsync(cacheKey);
        if (cached) return ok(cached);

        const servers = await getServersFromSource(sourceId, mappedId, episodeId);
        const result  = { servers: servers||[] };

        if (result.servers.length > 0) await setCachedAsync(cacheKey, result, 120);
        return ok(result);
      }

      // ── SOURCES (FIXED) ───────────────────────────────────────────────
      case "sources": {
        try {
          const { sourceId, mappedId, episodeId, subType = "", server = "" } = body;

          if (!sourceId || !mappedId || !episodeId) {
            return err("sourceId, mappedId, episodeId required");
          }

          const cacheKey = `cryo_src:${sourceId}:${mappedId}:${episodeId}:${subType}:${server}`;
          const cached   = await getCachedAsync(cacheKey);
          if (cached) return ok(cached);

          const stream = await getSourcesFromSource(
            sourceId,
            mappedId,
            episodeId,
            subType,
            server
          );

          if (stream?.sources?.length > 0) {
            await setCachedAsync(cacheKey, stream, 120);
          }

          return ok(stream);

        } catch (e) {
          return ok({
            error: e.message,
            status: e.response?.status,
            body: e.response?.data,
          });
        }
      }

      // ── PURGE ─────────────────────────────────────────────────────────
      case "purgeMapping": {
        const { anilistId } = body;
        if (!anilistId) return err("anilistId required");

        await deleteSourceMapping(anilistId, null);

        const { ALL_SOURCE_IDS: ids } = await import("@/lib/crysoline");
        await Promise.allSettled(
          ids.map(sid =>
            setCachedAsync(`cryo_map1:${anilistId}:${sid}`, { __purged: true }, 1)
          )
        );

        console.log(`[crysoline] purged all cached mappings for anilistId=${anilistId}`);
        return ok({ purged: true, anilistId });
      }

      default:
        return err(`Unknown action: "${action}". Valid: map, mapOne, episodes, servers, sources, purgeMapping`);
    }

  } catch (e) {
    console.error("[crysoline route]", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

const ok  = d => NextResponse.json(d);
const err = (m, c=400) => NextResponse.json({ error: m }, { status: c });