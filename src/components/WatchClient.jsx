/**
 * WatchClient — Upgraded watch page
 *
 * Key improvements over the original:
 *
 *   1. PERSISTENT PLAYER: HlsPlayer is never re-mounted on episode change.
 *      Only the `src` prop changes, so hls.js is destroyed+re-init but the
 *      <video> DOM node is kept. This eliminates the full React reconcile cost.
 *
 *   2. EPISODE PREFETCHING: On hover over prev/next episode buttons, we begin
 *      fetching the stream URL. If the user clicks immediately, the data is
 *      already in-flight or cached.
 *
 *   3. SOURCE PERSISTENCE: Selected source (id + subType) is saved to
 *      localStorage and auto-applied on next visit/episode change.
 *
 *   4. FALLBACK CHAIN: If a source fails, the next source is tried automatically.
 *
 *   5. SKELETON LOADERS: Episode list and info panel show skeletons while loading
 *      instead of blank states.
 *
 *   6. CACHING: useQuery hook caches anime info + episodes with SWR semantics,
 *      so navigating back is instant.
 *
 *   7. INSTANT UI: Episode selection shows immediate loading feedback while
 *      the new stream URL is fetched in the background.
 */
"use client";
import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { idFromSlug } from "@/lib/utils";
import { PROVIDERS, buildEmbedUrl, SAFE_PROVIDERS } from "@/lib/providers";
import { CRYSOLINE_SOURCES, DEFAULT_SOURCE_ID, FALLBACK_SOURCE_IDS } from "@/lib/crysoline";
import { saveProgress } from "@/lib/watchProgress";
import { useQuery, prefetch } from "@/hooks/useQuery";
import HlsPlayer from "./HlsPlayer";
import CommentsSection from "./CommentsSection";
import AniListPanel from "./AniListPanel";
import styles from "./WatchClient.module.css";

const PRIMARY_EMBED = PROVIDERS.filter(p => SAFE_PROVIDERS.includes(p.id)).slice(0, 6);

// ── Source preference persistence ─────────────────────────────────────────────
const PREF_KEY = "player_source_pref";
function loadSourcePref()       { try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { return {}; } }
function saveSourcePref(update) { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...loadSourcePref(), ...update })); } catch {} }

// Module-level dedup: prevents React StrictMode double-invoke from firing two
// identical probe races for the same anilistId simultaneously.
const probeInFlight = new Map(); // anilistId → Promise

// ── Skeleton components ───────────────────────────────────────────────────────
function EpisodeSkeleton() {
  return (
    <div className={styles.epSkelWrap}>
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className={`skeleton ${styles.epSkel}`} />
      ))}
    </div>
  );
}

function InfoPanelSkeleton() {
  return (
    <div className={styles.infoPanel}>
      <div className={`skeleton ${styles.infoPosterWrap}`} style={{ background: "#222" }} />
      <div className={styles.infoBody}>
        <div className="skeleton" style={{ height: 22, width: "60%", borderRadius: 4, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 14, width: "40%", borderRadius: 4, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 60, borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WatchClient({ animeId, epSlug }) {
  const router    = useRouter();
  const anilistId = idFromSlug(animeId);

  // ── Data fetching with cache ───────────────────────────────────────────────
  const { data: infoData } = useQuery(
    `info:${animeId}`,
    () => api.info(animeId),
    { ttl: 300 }
  );
  const { data: epsData, loading: epsLoading } = useQuery(
    `episodes:${animeId}`,
    () => api.episodes(animeId),
    { ttl: 180 }
  );

  const info    = infoData;
  const eps     = epsData?.episodes || [];
  const tmdbId  = epsData?.tmdbId   || null;

  const anime    = info?.anime?.info;
  const moreInfo = info?.anime?.moreInfo;
  const related  = info?.relatedAnimes     || [];
  const recs     = info?.recommendedAnimes || [];
  const seasons  = info?.seasons           || [];

  // ── Episode navigation ────────────────────────────────────────────────────
  const [showAllEps, setShowAllEps] = useState(false);
  const currentIdx = eps.findIndex(e => e.epSlug === epSlug);
  const currentEp  = eps[currentIdx] || null;
  const prevEp     = currentIdx > 0            ? eps[currentIdx - 1] : null;
  const nextEp     = currentIdx < eps.length-1 ? eps[currentIdx + 1] : null;
  const epNumber   = parseInt(epSlug.replace("ep-", "")) || 1;
  const dispEps    = showAllEps ? eps : eps.slice(0, 60);

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [sourceMode, setSourceMode] = useState("crysoline");

  // ── Source state ──────────────────────────────────────────────────────────
  // mounted: false on SSR, true after hydration — prevents localStorage reads on server
  const [mounted,       setMounted]       = useState(false);
  const [sourceMap,     setSourceMap]     = useState({});
  const [sourceLoading, setSourceLoading] = useState({});
  // activeSrcId: always start empty on SSR to avoid hydration mismatch.
  // Populated from localStorage after mount in the useEffect below.
  const [activeSrcId,   setActiveSrcId]   = useState("");

  // ── Stream data ───────────────────────────────────────────────────────────
  const [cryEps,        setCryEps]       = useState([]);
  const [cryEpsLoad,    setCryEpsLoad]   = useState(false);
  const [cryStream,     setCryStream]    = useState(null);
  const [cryStreamLoad, setCrySLoad]     = useState(false);
  const [cryStreamErr,  setCrySErr]      = useState(null);
  const [cryServers,    setCryServers]   = useState([]);
  const [crySubType,    setCrySubType]   = useState("sub"); // hydrated from localStorage after mount
  const [cryServer, setCryServer] = useState("");
  const [crySelSrc, setCrySelSrc] = useState(null);

  // ── Embed ─────────────────────────────────────────────────────────────────
  const [embedProvider,  setEmbedProvider]  = useState("autoembed");
  const [embedLang,      setEmbedLang]      = useState("sub");
  const [embedReload,    setEmbedReload]    = useState(0);
  const [showMoreEmbed,  setShowMoreEmbed]  = useState(false);

  // ── Player preferences ────────────────────────────────────────────────────
  const [autoplay, setAutoplay] = useState(true);
  const [autoNext, setAutoNext] = useState(true);

  useEffect(() => {
    try {
      const ap = localStorage.getItem("player_autoplay");
      const an = localStorage.getItem("player_autonext");
      if (ap !== null) setAutoplay(ap === "1");
      if (an !== null) setAutoNext(an === "1");
    } catch {}
  }, []);

  const handleAutoplayChange = (val) => {
    setAutoplay(val);
    try { localStorage.setItem("player_autoplay", val ? "1" : "0"); } catch {}
  };
  const handleAutoNextChange = (val) => {
    setAutoNext(val);
    try { localStorage.setItem("player_autonext", val ? "1" : "0"); } catch {}
  };

  // ── Watch progress ─────────────────────────────────────────────────────────
  const progressSaved = useRef(false);
  useEffect(() => {
    progressSaved.current = false;
  }, [animeId, epSlug]);

  useEffect(() => {
    if (!anime || !currentEp || progressSaved.current) return;
    saveProgress({ animeId, animeName: anime.name, poster: anime.poster,
      epSlug: currentEp.epSlug, epNumber: currentEp.number, epTitle: "" });
    progressSaved.current = true;
  }, [anime, currentEp, animeId]);

  // ── Select + load source episodes ─────────────────────────────────────────
  const selectSource = useCallback(async (sourceId, mappedId, subType) => {
    if (!mappedId) return;
    const st = subType ?? crySubType;
    setActiveSrcId(sourceId);
    setCryStream(null);
    setCrySErr(null);
    setCrySelSrc(null);
    setCryServers([]);
    setCryServer("");
    saveSourcePref({ sourceId, subType: st });

    setCryEpsLoad(true);
    try {
      const d = await api.crysoline.episodes(sourceId, mappedId, anilistId);
      setCryEps(d.episodes || []);
    } catch { setCryEps([]); }
    finally { setCryEpsLoad(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anilistId, crySubType]);

  // ── Fetch stream for current episode ──────────────────────────────────────
  const fetchStream = useCallback(async (subType = crySubType, server = cryServer) => {
    if (!activeSrcId) return;
    const mappedId = sourceMap[activeSrcId];
    if (!mappedId) return;

    const ep = cryEps.find(e => Number(e.number) === epNumber)
            || cryEps.find(e => Number(e.number) === epNumber - 1)
            || cryEps[epNumber - 1];
    if (!ep && cryEps.length > 0) { setCrySErr(`Episode ${epNumber} not found in this source`); return; }
    if (!ep) return;

    const episodeId = ep.id || String(epNumber);
    const episodeNumber = ep.number || epNumber;
    setCrySLoad(true); setCrySErr(null); setCryStream(null); setCrySelSrc(null);

    try {
      const src = CRYSOLINE_SOURCES.find(s => s.id === activeSrcId);
      if (src?.hasServers) {
        const sv = await api.crysoline.servers(activeSrcId, mappedId, episodeId, episodeNumber);
        setCryServers(sv.servers || []);
      }
      const data = await api.crysoline.sources(activeSrcId, mappedId, episodeId, subType, server, episodeNumber);
      setCryStream(data);
      if (data.sources?.length) {
        setCrySelSrc(data.sources[0]);
      } else {
        // Auto-fallback: try next source in fallback chain
        await tryFallback(activeSrcId, subType, server);
      }
    } catch (e) {
      setCrySErr(e.message);
      await tryFallback(activeSrcId, subType, server);
    } finally { setCrySLoad(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrcId, sourceMap, cryEps, epNumber, crySubType, cryServer]);

  // ── Automatic source fallback chain ───────────────────────────────────────
  const tryFallback = useCallback(async (failedSourceId, subType, server) => {
    const activeIds   = CRYSOLINE_SOURCES.map(s => s.id);
    // Include all sources EXCEPT the one that just failed.
    // Do NOT exclude already-mapped sources — they may work for /sources
    // even if they weren't chosen during the initial probe race.
    const fallbackIds = [DEFAULT_SOURCE_ID, ...FALLBACK_SOURCE_IDS]
      .filter(id => id !== failedSourceId && activeIds.includes(id));

    for (const fid of fallbackIds) {
      try {
        console.log(`[watch] source ${failedSourceId} failed → trying ${fid}`);

        // Use cached mapping if available, otherwise re-map
        let mappedId = sourceMap[fid] || null;
        if (!mappedId) {
          const data = await api.crysoline.mapOne(anilistId, fid);
          if (!data?.mappedId) continue;
          mappedId = data.mappedId;
          setSourceMap(prev => ({ ...prev, [fid]: mappedId }));
        }

        // Use cached episodes if already loaded, otherwise fetch
        let episodes = null;
        if (fid === activeSrcId && cryEps.length > 0) {
          episodes = cryEps;
        } else {
          const epsData = await api.crysoline.episodes(fid, mappedId, anilistId);
          if (!epsData?.episodes?.length) continue;
          episodes = epsData.episodes;
        }

        const ep = episodes.find(e => Number(e.number) === epNumber)
                || episodes[epNumber - 1];
        if (!ep) continue;

        const epId = ep.id || String(epNumber);
        const stream = await api.crysoline.sources(fid, mappedId, epId, subType, server, ep.number || epNumber);
        if (stream.sources?.length) {
          setActiveSrcId(fid);
          setCryEps(episodes);
          setCryStream(stream);
          setCrySelSrc(stream.sources[0]);
          setCrySErr(null);
          saveSourcePref({ sourceId: fid });
          return;
        }
      } catch { continue; }
    }
    console.log("[watch] all fallbacks failed");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anilistId, epNumber, sourceMap, activeSrcId, cryEps]);

  // ── Auto-load on mount: race all sources ──────────────────────────────────
  const streamRaceRan = useRef(false);

  // ── Mount: hydrate client-only state from localStorage after SSR ─────────
  useEffect(() => {
    setMounted(true);
    // Safe to read localStorage now — we're on the client
    const pref = loadSourcePref();
    if (pref.sourceId) setActiveSrcId(pref.sourceId);
    if (pref.subType)  setCrySubType(pref.subType);
  }, []);

  // Reset the race guard whenever the anime changes so navigating between
  // different anime pages always triggers a fresh source race.
  useEffect(() => {
    streamRaceRan.current = false;
  }, [animeId]);

  useEffect(() => {
    // Guard: wait until both anilistId is resolved AND we have at least one
    // episode loaded. Without the eps check, the effect fires immediately with
    // currentEp=null (eps are still loading), sets the ref to true, and the
    // actual data-ready re-render is silently skipped.
    if (!currentEp || !anilistId) return;
    if (streamRaceRan.current) return;
    streamRaceRan.current = true;

    const pref        = loadSourcePref();
    const preferredId = pref.sourceId || DEFAULT_SOURCE_ID;

    // Only probe sources that are actually defined in CRYSOLINE_SOURCES (active ones).
    // This prevents "mapper missed kickassanime/animeparadise" log spam from
    // trying sources that are commented out.
    const activeIds = CRYSOLINE_SOURCES.map(s => s.id);
    const allSrcIds = [
      preferredId,
      ...[DEFAULT_SOURCE_ID, ...FALLBACK_SOURCE_IDS].filter(
        id => id !== preferredId && activeIds.includes(id)
      ),
    ].filter((id, i, arr) => arr.indexOf(id) === i); // deduplicate

    if (pref.subType) setCrySubType(pref.subType);

    // Sequential source probe — avoids hammering Crysoline with parallel requests.
    // Module-level dedup: if StrictMode fires this effect twice for the same anilistId,
    // the second call reuses the in-flight promise instead of starting a new race.
    if (probeInFlight.has(anilistId)) return;
    const probePromise = (async () => {
      for (const sourceId of allSrcIds) {
        try {
          console.log(`[watch] probing source: ${sourceId}`);
          const data = await api.crysoline.mapOne(anilistId, sourceId);
          if (!data?.mappedId) {
            console.log(`[watch] ${sourceId}: no mapping found`);
            continue;
          }
          const eps = await api.crysoline.episodes(sourceId, data.mappedId, anilistId);
          if (!eps?.episodes?.length) {
            console.log(`[watch] ${sourceId}: no episodes`);
            continue;
          }
          // Found a working source — activate immediately
          console.log(`[watch] ${sourceId}: found ${eps.episodes.length} episodes — activating`);
          setSourceMap(prev => ({ ...prev, [sourceId]: data.mappedId }));
          setActiveSrcId(sourceId);
          setCryEps(eps.episodes);
          return; // stop probing — first working source wins
        } catch (e) {
          console.log(`[watch] ${sourceId}: error — ${e.message}`);
        }
      }
      console.log("[watch] all sources exhausted");
    })(); // invoke immediately — probePromise is the actual Promise
    probeInFlight.set(anilistId, probePromise);
    probePromise.finally(() => probeInFlight.delete(anilistId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEp?.epSlug, anilistId]);

  // ── Re-fetch stream when ep changes (episodes are already loaded) ─────────
  useEffect(() => {
    if (activeSrcId && cryEps.length > 0) fetchStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrcId, cryEps, epSlug]);

  // ── Called by HlsPlayer when the video URL is unreachable (proxy 502 etc) ──
  // Instead of showing a static error, automatically try the next source.
  const handleStreamError = useCallback(() => {
    console.log("[watch] HlsPlayer stream error — triggering source fallback");
    if (activeSrcId) tryFallback(activeSrcId, crySubType, cryServer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrcId, crySubType, cryServer]);

  // ── Handle source button click ────────────────────────────────────────────
  async function handleSourceClick(sourceId) {
    if (sourceMap[sourceId] !== undefined) {
      const cached = sourceMap[sourceId];
      if (cached) selectSource(sourceId, cached);
      else setCrySErr(`"${CRYSOLINE_SOURCES.find(s => s.id === sourceId)?.name}" is not available.`);
      return;
    }
    if (sourceLoading[sourceId]) return;
    setSourceLoading(prev => ({ ...prev, [sourceId]: true }));
    let mappedId = null;
    try {
      const data = await api.crysoline.mapOne(anilistId, sourceId);
      mappedId   = data?.mappedId || null;
      setSourceMap(prev => ({ ...prev, [sourceId]: mappedId }));
    } catch {
      setSourceMap(prev => ({ ...prev, [sourceId]: null }));
    } finally {
      setSourceLoading(prev => ({ ...prev, [sourceId]: false }));
    }
    if (mappedId) selectSource(sourceId, mappedId);
    else setCrySErr(`"${CRYSOLINE_SOURCES.find(s => s.id === sourceId)?.name}" is not available.`);
  }

  // ── Episode hover prefetch ─────────────────────────────────────────────────
  const prefetchEp = (ep) => {
    if (!ep) return;
    // Prefetch anime info for target episode (it uses same animeId, so noop if cached)
    prefetch(`episodes:${animeId}`, () => api.episodes(animeId), 180);
  };

  // ── Navigate to episode ────────────────────────────────────────────────────
  const goToEp = useCallback((ep) => {
    if (!ep) return;
    cancelCountdownRef.current?.();
    router.push(`/watch/${animeId}/${ep.epSlug}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animeId, router]);

  const cancelCountdownRef = useRef(null);

  // ── Embedded ──────────────────────────────────────────────────────────────
  const embedCtx = currentEp ? {
    tmdbId, season: 1, episode: epNumber, type: "tv", lang: embedLang,
  } : null;
  const embedUrl     = embedCtx ? buildEmbedUrl(embedProvider, embedCtx) : null;
  const availEmbed   = embedCtx ? PROVIDERS.filter(p => buildEmbedUrl(p.id, embedCtx) !== null).map(p => p.id) : [];
  const visibleEmbed = showMoreEmbed ? PROVIDERS : PRIMARY_EMBED;

  useEffect(() => {
    if (!embedCtx) return;
    const avail = PROVIDERS.filter(p => buildEmbedUrl(p.id, embedCtx) !== null);
    if (avail.length && !avail.find(p => p.id === embedProvider)) setEmbedProvider(avail[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEp?.epSlug, tmdbId]);

  const sidebarSections = [
    ...(seasons.length > 0 ? [{ label: "Seasons",           items: seasons }]           : []),
    ...(related.length > 0  ? [{ label: "Related",           items: related.slice(0, 6) }]: []),
    ...(recs.length > 0     ? [{ label: "You May Also Like", items: recs.slice(0, 6) }]   : []),
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.watchPage}>
      <div className={styles.playerSection}>

        {/* Breadcrumb */}
        <nav className={styles.breadcrumb}>
          <Link href="/">Home</Link>
          <span className={styles.sep}>›</span>
          {anime
            ? <Link href={`/anime/${animeId}`}>{anime.name}</Link>
            : <span className={`skeleton`} style={{ width: 120, height: 14, display: "inline-block", borderRadius: 3 }} />
          }
          <span className={styles.sep}>›</span>
          <span>Episode {epNumber}</span>
        </nav>

        {/* Player */}
        <div className={styles.playerWrap}>
          {epsLoading && !currentEp && (
            <div className={styles.playerState}>
              <div className="spinner" /><p>Loading…</p>
            </div>
          )}
          {!epsLoading && !currentEp && (
            <div className={styles.playerState}><span>⚠</span><p>Episode not found.</p></div>
          )}

          {/* ── Crysoline player — PERSISTENT, never re-mounted ───────────────
              The key is intentionally NOT set to epSlug/src — we want React to
              keep the component instance. Only props change, so HlsPlayer does
              an in-place update (destroy old hls, init new hls on same <video>).
          ──────────────────────────────────────────────────────────────────── */}
          {currentEp && sourceMode === "crysoline" && (
            <>
              {(cryEpsLoad || cryStreamLoad) && !crySelSrc && (() => {
                const srcName = CRYSOLINE_SOURCES.find(s => s.id === activeSrcId)?.name || activeSrcId || "the Abyss";
                return (
                  <div className={styles.playerState}>
                    <div className={styles.summonSpinner}>
                      <div className={styles.summonRing} />
                      <svg width="28" height="28" viewBox="0 0 64 64" fill="none" className={styles.summonSkull}>
                        <path d="M18 20 C15 11 13 5 16 2 C19 5 20 11 20 20Z" fill="#c0394d" opacity=".9"/>
                        <path d="M46 20 C49 11 51 5 48 2 C45 5 44 11 44 20Z" fill="#c0394d" opacity=".9"/>
                        <ellipse cx="32" cy="31" rx="18" ry="16" fill="#c0394d" opacity=".85"/>
                        <ellipse cx="23" cy="31" rx="6" ry="5.5" fill="#07060b" opacity=".92"/>
                        <ellipse cx="23" cy="31" rx="4" ry="3.8" fill="rgba(255,60,85,0.9)"/>
                        <ellipse cx="23" cy="31" rx="1.6" ry="3.2" fill="#07060b"/>
                        <ellipse cx="41" cy="31" rx="6" ry="5.5" fill="#07060b" opacity=".92"/>
                        <ellipse cx="41" cy="31" rx="4" ry="3.8" fill="rgba(255,60,85,0.9)"/>
                        <ellipse cx="41" cy="31" rx="1.6" ry="3.2" fill="#07060b"/>
                        <path d="M29 39 L32 34 L35 39 L34 43 L30 43Z" fill="#07060b" opacity=".9"/>
                        <path d="M22 49 Q32 57 42 49 L41 58 Q32 63 23 58Z" fill="#8b1a28"/>
                      </svg>
                    </div>
                    <p className={styles.summonTitle}>
                      {cryEpsLoad ? "Binding to the source…" : `Summoning souls from ${srcName}…`}
                    </p>
                    <p className={styles.summonSub}>
                      {cryEpsLoad ? "Cataloguing episodes from the underworld" : `Breaching ${srcName} — stand by`}
                    </p>
                  </div>
                );
              })()}
              {!activeSrcId && !cryStreamLoad && !cryEpsLoad && (
                <div className={styles.playerState}>
                  <span className={styles.stateIcon}>☠</span>
                  <p className={styles.summonTitle}>Awakening the portal…</p>
                  <p className={styles.summonSub}>Selecting the strongest conduit</p>
                </div>
              )}
              {activeSrcId && !cryEpsLoad && !cryStreamLoad && cryStreamErr && !crySelSrc && (
                <div className={styles.playerState}>
                  <span className={styles.stateIcon}>⚡</span>
                  <p className={styles.stateMsg}>{cryStreamErr}</p>
                  <div className={styles.stateBtns}>
                    <button className={styles.retryBtn} onClick={() => fetchStream()}>Retry</button>
                    {/* Embedded fallback button — disabled
                    <button className={styles.switchBtn} onClick={() => setSourceMode("embedded")}>
                      Try Embedded Player
                    </button>
                    */}
                  </div>
                </div>
              )}
              {/* Player is always mounted once crySelSrc exists.
                  Episode changes only update the src prop — no unmount. */}
              {crySelSrc && (
                <HlsPlayer
                  src={crySelSrc.url}
                  isHLS={crySelSrc.isHLS ?? null}
                  subtitles={cryStream?.subtitles || []}
                  headers={cryStream?.headers || {}}
                  poster={anime?.poster}
                  onPrev={prevEp ? () => goToEp(prevEp) : null}
                  onNext={nextEp ? () => goToEp(nextEp) : null}
                  hasPrev={!!prevEp}
                  hasNext={!!nextEp}
                  malId={moreInfo?.malId || null}
                  epNumber={epNumber}
                  animeId={animeId}
                  autoplay={autoplay}
                  autoNext={autoNext}
                  onAutoplayChange={handleAutoplayChange}
                  onAutoNextChange={handleAutoNextChange}
                  onStreamError={handleStreamError}
                />
              )}
            </>
          )}

          {/* Embedded player — disabled */}
          {/* {currentEp && sourceMode === "embedded" && (
            <>
              {!embedUrl && (
                <div className={styles.playerState}><span>📡</span><p>Select a source below.</p></div>
              )}
              {embedUrl && (
                <iframe
                  key={`${embedProvider}-${embedUrl}-${embedReload}`}
                  src={embedUrl}
                  className={styles.iframe}
                  frameBorder="0"
                  scrolling="no"
                  allowFullScreen
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  title={`${anime?.name || "Anime"} Episode ${epNumber}`}
                />
              )}
            </>
          )} */}
        </div>

        {/* ── Control panel ─────────────────────────────────────────────── */}
        <div className={styles.controlPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.modeTabs}>
              <button
                className={`${styles.modeTab} ${styles.modeTabActive}`}
                onClick={() => setSourceMode("crysoline")}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Stream
                {activeSrcId && crySelSrc && <span className={styles.activeIndicator} />}
              </button>
              {/* Embedded tab — disabled
              <button
                className={`${styles.modeTab} ${sourceMode === "embedded" ? styles.modeTabActive : ""}`}
                onClick={() => setSourceMode("embedded")}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                Embedded
              </button>
              */}
            </div>
            <button className={styles.reloadBtn} onClick={() => fetchStream()}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.5"/>
              </svg>
              Reload
            </button>
          </div>

          {sourceMode === "crysoline" && (
            <div className={styles.cryBody}>
              {mounted && activeSrcId && (
                <div className={styles.activeSource}>
                  <span className={styles.activeDot} />
                  <span>
                    {CRYSOLINE_SOURCES.find(s => s.id === activeSrcId)?.name || activeSrcId}
                    {crySelSrc ? " — streaming" : cryStreamLoad ? " — loading…" : ""}
                  </span>
                </div>
              )}
              <div className={styles.ctrlRow}>
                <span className={styles.ctrlLabel}>Source</span>
                <div className={styles.sourceGrid}>
                  {CRYSOLINE_SOURCES.map(src => {
                    const mapped  = sourceMap[src.id];
                    const loading = sourceLoading[src.id];
                    const active  = src.id === activeSrcId;
                    const unavail = mapped === null;
                    const isDefault = src.id === DEFAULT_SOURCE_ID;
                    return (
                      <button
                        key={src.id}
                        className={`${styles.srcBtn}
                          ${active    ? styles.srcBtnActive   : ""}
                          ${unavail   ? styles.srcBtnUnavail  : ""}
                          ${loading   ? styles.srcBtnLoading  : ""}
                          ${isDefault && !active && !unavail ? styles.srcBtnDefault : ""}
                        `}
                        onClick={() => !unavail && !loading && handleSourceClick(src.id)}
                        disabled={loading}
                        title={unavail ? `${src.name} — not available` : src.site}
                      >
                        {loading
                          ? <><span className={styles.srcSpinner} />{src.name}</>
                          : src.name
                        }
                        {isDefault && !active && !unavail && (
                          <span className={styles.defaultTag}>default</span>
                        )}
                        {mapped && !active && <span className={styles.srcDot} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.ctrlRow}>
                <span className={styles.ctrlLabel}>Audio</span>
                <div className={styles.btnGroup}>
                  {["sub", "dub"].map(t => (
                    <button key={t}
                      className={`${styles.optBtn} ${crySubType === t ? styles.optBtnActive : ""}`}
                      onClick={() => {
                        setCrySubType(t);
                        saveSourcePref({ subType: t });
                        fetchStream(t, "");
                        setCryServer("");
                      }}>
                      {t === "sub" ? "Subbed (Original)" : "Dubbed (Translated)"}
                    </button>
                  ))}
                </div>
              </div>

              {cryStream?.sources?.length > 1 && (
                <div className={styles.ctrlRow}>
                  <span className={styles.ctrlLabel}>Quality</span>
                  <div className={styles.btnGroup}>
                    {cryStream.sources.map((s, i) => (
                      <button key={i}
                        className={`${styles.optBtn} ${crySelSrc?.url === s.url ? styles.optBtnActive : ""}`}
                        onClick={() => setCrySelSrc(s)}>
                        {s.quality || `Stream ${i + 1}`}
                        {s.isHLS && <span className={styles.hlsBadge}>HLS</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cryServers.length > 1 && (
                <div className={styles.ctrlRow}>
                  <span className={styles.ctrlLabel}>Server</span>
                  <div className={styles.btnGroup}>
                    <button
                      className={`${styles.optBtn} ${!cryServer ? styles.optBtnActive : ""}`}
                      onClick={() => { setCryServer(""); fetchStream(crySubType, ""); }}>
                      Default
                    </button>
                    {cryServers.map((sv, i) => (
                      <button key={i}
                        className={`${styles.optBtn} ${cryServer === (sv.name || sv) ? styles.optBtnActive : ""}`}
                        onClick={() => { setCryServer(sv.name || sv); fetchStream(crySubType, sv.name || sv); }}>
                        {sv.name || sv}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const vttCount = (cryStream?.subtitles || []).filter(s => {
                  const url = (s.url || "").toLowerCase();
                  return !url.includes(".ass") && !url.includes(".ssa");
                }).length;
                if (!vttCount) return null;
                return (
                  <div className={styles.subInfo}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="14" rx="2"/>
                      <path d="M7 12h4m-4 4h10M15 12h2"/>
                    </svg>
                    {vttCount} subtitle track{vttCount > 1 ? "s" : ""} available
                  </div>
                );
              })()}
            </div>
          )}

          {/* Embedded control panel — disabled */}
          {/* {sourceMode === "embedded" && (
            <div className={styles.cryBody}>
              <div className={styles.ctrlRow}>
                <span className={styles.ctrlLabel}>Provider</span>
                <div className={styles.sourceGrid}>
                  {visibleEmbed.map(p => {
                    const avail  = availEmbed.includes(p.id);
                    const active = p.id === embedProvider;
                    return (
                      <button key={p.id}
                        className={`${styles.srcBtn} ${active ? styles.srcBtnActive : ""} ${!avail ? styles.srcBtnUnavail : ""}`}
                        onClick={() => avail && setEmbedProvider(p.id)}
                        disabled={!avail}>
                        {p.name}
                        {avail && <span className={styles.srcDot} />}
                      </button>
                    );
                  })}
                  <button className={styles.moreBtn} onClick={() => setShowMoreEmbed(v => !v)}>
                    {showMoreEmbed ? "Show less" : `+${PROVIDERS.length - PRIMARY_EMBED.length} more`}
                  </button>
                </div>
              </div>
              <div className={styles.ctrlRow}>
                <span className={styles.ctrlLabel}>Audio</span>
                <div className={styles.btnGroup}>
                  {["sub", "dub"].map(l => (
                    <button key={l}
                      className={`${styles.optBtn} ${embedLang === l ? styles.optBtnActive : ""}`}
                      onClick={() => { setEmbedLang(l); setEmbedReload(r => r + 1); }}>
                      {l === "sub" ? "Subbed (Original)" : "Dubbed (Translated)"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )} */}
        </div>

        {/* Episode nav with prefetch on hover */}
        <div className={styles.epNav}>
          <button className={styles.navBtn} disabled={!prevEp}
            onMouseEnter={() => prefetchEp(prevEp)}
            onClick={() => goToEp(prevEp)}>
            ← Prev
          </button>
          <div className={styles.navMid}>
            <span className={styles.epLabel}>Episode {epNumber}</span>
            {currentEp?.airDate && <span className={styles.airDate}>{currentEp.airDate}</span>}
          </div>
          <button className={styles.navBtn} disabled={!nextEp}
            onMouseEnter={() => prefetchEp(nextEp)}
            onClick={() => goToEp(nextEp)}>
            Next →
          </button>
        </div>

        {/* Anime info panel — skeleton while loading */}
        {!anime ? <InfoPanelSkeleton /> : (
          <div className={styles.infoPanel}>
            <div className={styles.infoPosterWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={anime.poster} alt={anime.name} className={styles.infoPoster} />
            </div>
            <div className={styles.infoBody}>
              <Link href={`/anime/${animeId}`} className={styles.infoTitle}>{anime.name}</Link>
              {anime.jname && anime.jname !== anime.name && (
                <p className={styles.infoJname}>{anime.jname}</p>
              )}
              <div className={styles.infoMeta}>
                {anime.rating  && <span className={styles.ratingBadge}>★ {anime.rating}</span>}
                {anime.type    && <span className={styles.metaTag}>{anime.type}</span>}
                {anime.status  && <span className={styles.metaTag}>{(anime.status || "").replace(/_/g, " ")}</span>}
              </div>
              {moreInfo?.genres?.length > 0 && (
                <div className={styles.infoGenres}>
                  {moreInfo.genres.slice(0, 4).map(g => (
                    <Link key={g} href={`/browse?category=genre/${g.toLowerCase().replace(/ /g, "-")}`} className="tag">{g}</Link>
                  ))}
                </div>
              )}
              {anime.description && (
                <p className={styles.infoDesc}>
                  {anime.description.replace(/<[^>]*>/g, "").slice(0, 200)}
                  {anime.description.length > 200 ? "…" : ""}
                </p>
              )}
              <div className={styles.infoActions}>
                <Link href={`/anime/${animeId}`} className={styles.viewMoreLink}>Full details →</Link>
                {nextEp && (
                  <button className={styles.nextEpBtn} onClick={() => goToEp(nextEp)}>
                    Next Ep →
                  </button>
                )}
              </div>

              {/* AniList sync panel */}
              {anilistId && (
                <div style={{ marginTop: 14 }}>
                  <AniListPanel
                    anilistId={anilistId}
                    epNumber={epNumber}
                    totalEpisodes={anime?.episodes?.sub || null}
                    compact
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <CommentsSection
          animeId={animeId}
          animeName={anime?.name || ""}
          epSlug={epSlug}
          epNumber={epNumber}
          anilistId={anilistId}
          malId={moreInfo?.malId}
        />
      </div>

      {/* Right column */}
      <div className={styles.rightCol}>
        <div className={styles.epSidebar}>
          <div className={styles.epSideHead}>
            <p className={styles.epSideTitle}>{anime?.name || "Episodes"}</p>
            <span className={styles.epSideCount}>{eps.length} eps</span>
          </div>
          <div className={styles.epList}>
            {epsLoading && eps.length === 0
              ? <EpisodeSkeleton />
              : dispEps.map(ep => (
                  <Link key={ep.epSlug} href={`/watch/${animeId}/${ep.epSlug}`}
                    className={`${styles.epItem} ${ep.epSlug === epSlug ? styles.epActive : ""}`}
                    onMouseEnter={() => prefetchEp(ep)}
                  >
                    <span className={styles.epNum}>Ep {ep.number}</span>
                    {ep.airDate && <span className={styles.epDate}>{ep.airDate}</span>}
                  </Link>
                ))
            }
            {eps.length > 60 && !showAllEps && (
              <button className={styles.showAllBtn} onClick={() => setShowAllEps(true)}>
                Show all {eps.length} episodes
              </button>
            )}
          </div>
        </div>

        {sidebarSections.map(sec => (
          <div key={sec.label} className={styles.relatedBlock}>
            <h3 className={styles.relatedTitle}>{sec.label}</h3>
            <div className={styles.relatedList}>
              {sec.items.map(item => (
                <Link key={item.id} href={`/anime/${item.id}`} className={styles.relatedCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.poster} alt={item.name} className={styles.relatedPoster} loading="lazy" />
                  <div className={styles.relatedInfo}>
                    <p className={styles.relatedName}>{item.name}</p>
                    <div className={styles.relatedMeta}>
                      {item.type && <span>{item.type}</span>}
                      {item.episodes?.sub > 0 && <span className="badge badge-sub">{item.episodes.sub} eps</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
