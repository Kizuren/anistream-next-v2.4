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
 *
 * BUG FIXES applied:
 *   FIX A — "map" action: mapAnilistSequential was called without the `titles`
 *     argument, so search/slug-probe fallbacks ALWAYS silently failed for any
 *     anime not indexed in the Crysoline mapper. Now passes titles fetched from
 *     AniList when needed.
 *
 *   FIX B — "episodes" STALE_MAPPING re-map: mapAnilistToSource was called
 *     without titles, meaning the re-mapping would never use the search/slug
 *     fallbacks. Now fetches titles before re-mapping.
 *
 *   FIX C — "mapOne" for non-animegg sources: titles were only fetched when
 *     sourceId === "animegg". The search fallback (Step 2 in mapAnilistToSource)
 *     applies to ALL sources, so titles must be fetched regardless of sourceId.
 */

import { NextResponse } from "next/server";
import {
  getCachedAsync, setCachedAsync,
  saveSourceMapping, loadSourceMappings, deleteSourceMapping,
  getCached, setCached,
} from "@/lib/cache";
import {
  CRYSOLINE_SOURCES, EN_SOURCE_IDS, ALL_SOURCE_IDS,
  STALE_MAPPING,
  mapAnilistToSource,
  mapAnilistToEnSources, mapAnilistToAllSources, mapAnilistSequential,
  getEpisodesFromSource, getServersFromSource, getSourcesFromSource,
} from "@/lib/crysoline";
import { getAniListEpisodeMeta } from "@/lib/anilist";

// Increase Vercel serverless function timeout — sequential mapping needs more than the 10s default
export const maxDuration = 60;

// ── Helper: fetch AniList titles for fallback mapping ─────────────────────────
// Returns [] instead of throwing so callers don't need try/catch.
async function fetchTitles(anilistId) {
  try {
    const meta = await getAniListEpisodeMeta(anilistId);
    return (meta.allTitles || []).filter(Boolean);
  } catch {
    return [];
  }
}

export async function POST(request) {
  try {
    const body   = await request.json();
    const action = body.action;

    switch (action) {

      // ── MAP ONE ───────────────────────────────────────────────────────
      case "mapOne": {
        const { anilistId, sourceId, titles: bodyTitles } = body;
        if (!anilistId || !sourceId) return err("anilistId and sourceId required");

        const dbMappings = await loadSourceMappings(anilistId);
        if (dbMappings.has(sourceId)) {
          const mappedId = dbMappings.get(sourceId);
          const src = CRYSOLINE_SOURCES.find(s => s.id === sourceId);
          return ok({ sourceId, mappedId, sourceName: src?.name || sourceId, found: true, fromCache: "db" });
        }

        const cacheKey = `cryo_map1:${anilistId}:${sourceId}`;
        const cached   = await getCachedAsync(cacheKey);
        if (cached && cached.found !== false) return ok({ ...cached, fromCache: "redis" });

        // FIX C: Fetch titles for ALL sources, not just animegg.
        // The search fallback (Step 2 in mapAnilistToSource) applies to every source.
        let titles = Array.isArray(bodyTitles) ? bodyTitles.filter(Boolean) : [];
        if (titles.length === 0) {
          titles = await fetchTitles(anilistId);
        }

        const mappedId = await mapAnilistToSource(anilistId, sourceId, titles);
        const src      = CRYSOLINE_SOURCES.find(s => s.id === sourceId);
        const result   = { sourceId, mappedId: mappedId||null, sourceName: src?.name||sourceId, found: !!mappedId };

        if (mappedId) {
          saveSourceMapping(anilistId, sourceId, mappedId).catch(() => {});
          setCachedAsync(cacheKey, result, 86400).catch(() => {});
        } else {
          // Cache "not found" for 1h — avoids hammering, allows retry after Crysoline indexes
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
          // FIX A: Fetch titles BEFORE mapAnilistSequential so search/slug fallbacks work.
          // Without titles, any anime not in the Crysoline mapper index silently returns null.
          const titles = await fetchTitles(anilistId);
          newMap = await mapAnilistSequential(anilistId, needApiIds, titles, 350);
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
        const { sourceId, mappedId, anilistId } = body;
        if (!sourceId || !mappedId) return err("sourceId and mappedId required");

        const cacheKey = `cryo_eps:${sourceId}:${mappedId}`;
        const cached   = await getCachedAsync(cacheKey);
        if (cached) return ok(cached);

        let episodes = await getEpisodesFromSource(sourceId, mappedId);

        // ── Stale mapping detected (upstream returned 404) ────────────────
        if (episodes === STALE_MAPPING) {
          console.log(`[crysoline] stale mapping for ${sourceId}:${mappedId} — re-mapping`);

          if (anilistId) {
            await deleteSourceMapping(anilistId, sourceId).catch(() => {});
            await setCachedAsync(`cryo_map1:${anilistId}:${sourceId}`, { __purged: true }, 1).catch(() => {});

            // FIX B: Fetch titles before re-mapping so fallbacks work.
            const titles = await fetchTitles(anilistId);
            const freshMappedId = await mapAnilistToSource(anilistId, sourceId, titles);

            if (freshMappedId && freshMappedId !== mappedId) {
              console.log(`[crysoline] re-mapped ${sourceId}: ${mappedId} → ${freshMappedId}`);
              saveSourceMapping(anilistId, sourceId, freshMappedId).catch(() => {});
              setCachedAsync(`cryo_map1:${anilistId}:${sourceId}`, {
                sourceId, mappedId: freshMappedId,
                sourceName: CRYSOLINE_SOURCES.find(s => s.id === sourceId)?.name || sourceId,
                found: true,
              }, 86400).catch(() => {});

              episodes = await getEpisodesFromSource(sourceId, freshMappedId);
              if (episodes === STALE_MAPPING) episodes = [];
            } else {
              episodes = [];
            }
          } else {
            episodes = [];
          }
        }

        const result = { episodes: episodes || [], count: (episodes || []).length };
        if (result.count > 0) await setCachedAsync(cacheKey, result, 7200); // 2h — reduce Vercel invocations
        return ok(result);
      }

      // ── SERVERS ───────────────────────────────────────────────────────
      case "servers": {
        const { sourceId, mappedId, episodeId, episodeNumber } = body;
        if (!sourceId || !mappedId || !episodeId) return err("sourceId, mappedId, episodeId required");

        const cacheKey = `cryo_srv:${sourceId}:${mappedId}:${episodeId}`;
        const cached   = await getCachedAsync(cacheKey);
        if (cached) return ok(cached);

        const servers = await getServersFromSource(sourceId, mappedId, episodeId, episodeNumber);
        const result  = { servers: servers||[] };

        if (result.servers.length > 0) await setCachedAsync(cacheKey, result, 1800); // 30min — reduce Vercel invocations
        return ok(result);
      }

      // ── SOURCES ───────────────────────────────────────────────────────
      case "sources": {
        try {
          const { sourceId, mappedId, episodeId, subType = "", server = "", episodeNumber } = body;

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
            server,
            episodeNumber
          );

          if (stream?.sources?.length > 0) {
            await setCachedAsync(cacheKey, stream, 1800); // 30min — reduce Vercel invocations
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
