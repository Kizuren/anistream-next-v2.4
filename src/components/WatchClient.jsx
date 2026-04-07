/**
 * WatchClient — Watch page
 *
 * Default source: AnimeGG — auto-loads when page opens.
 * Other sources: shown in grid, loaded only on user click.
 * Languages: English/Japanese only (Spanish, Russian, Arabic removed).
 */
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { idFromSlug } from "@/lib/utils";
import { PROVIDERS, buildEmbedUrl, SAFE_PROVIDERS } from "@/lib/providers";
import { CRYSOLINE_SOURCES, DEFAULT_SOURCE_ID, FALLBACK_SOURCE_IDS } from "@/lib/crysoline";
import { saveProgress } from "@/lib/watchProgress";
import HlsPlayer from "./HlsPlayer";
import CommentsSection from "./CommentsSection";
import styles from "./WatchClient.module.css";

const PRIMARY_EMBED = PROVIDERS.filter(p => SAFE_PROVIDERS.includes(p.id)).slice(0, 6);

export default function WatchClient({ animeId, epSlug }) {
  const router    = useRouter();
  const anilistId = idFromSlug(animeId);

  // ── Base data ─────────────────────────────────────────────────────────────
  const [info,       setInfo]    = useState(null);
  const [eps,        setEps]     = useState([]);
  const [epsLoading, setEL]      = useState(true);
  const [showAllEps, setSAE]     = useState(false);
  const [tmdbId,     setTmdbId]  = useState(null);
  const progressSaved = useRef(false);

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [sourceMode, setSourceMode] = useState("crysoline");

  // ── Source map cache ──────────────────────────────────────────────────────
  const [sourceMap,     setSourceMap]     = useState({});
  const [sourceLoading, setSourceLoading] = useState({});
  const [activeSrcId,   setActiveSrcId]   = useState("");

  // ── Episode + stream data ─────────────────────────────────────────────────
  const [cryEps,        setCryEps]       = useState([]);
  const [cryEpsLoad,    setCryEpsLoad]   = useState(false);
  const [cryStream,     setCryStream]    = useState(null);
  const [cryStreamLoad, setCrySLoad]     = useState(false);
  const [cryStreamErr,  setCrySErr]      = useState(null);
  const [cryServers,    setCryServers]   = useState([]);
  const [crySubType,    setCrySubType]   = useState("sub");
  const [cryServer,     setCryServer]    = useState("");
  const [crySelSrc,     setCrySelSrc]    = useState(null);

  // ── Embed ─────────────────────────────────────────────────────────────────
  const [embedProvider,  setEmbedProvider] = useState("autoembed");
  const [embedLang,      setEmbedLang]     = useState("sub");
  const [embedReload,    setEmbedReload]   = useState(0);
  const [showMoreEmbed,  setShowMoreEmbed] = useState(false);

  // ── Player preferences (persisted in localStorage) ───────────────────────
  const [autoplay,  setAutoplay]  = useState(true);
  const [autoNext,  setAutoNext]  = useState(true);

  useEffect(() => {
    try {
      const ap = localStorage.getItem("player_autoplay");
      const an = localStorage.getItem("player_autonext");
      if (ap !== null) setAutoplay(ap === "1");
      if (an !== null) setAutoNext(an === "1");
    } catch {}
  }, []);

  function handleAutoplayChange(val) {
    setAutoplay(val);
    try { localStorage.setItem("player_autoplay", val ? "1" : "0"); } catch {}
  }
  function handleAutoNextChange(val) {
    setAutoNext(val);
    try { localStorage.setItem("player_autonext", val ? "1" : "0"); } catch {}
  }

  // ── Load base data ────────────────────────────────────────────────────────
  useEffect(() => {
    api.info(animeId).then(setInfo).catch(() => {});
    setEL(true);
    api.episodes(animeId)
      .then(d => {
        setEps(d?.episodes || []);
        if (d?.tmdbId) setTmdbId(d.tmdbId);
        setEL(false);
      })
      .catch(() => setEL(false));

    progressSaved.current = false;
    setCryStream(null);
    setCrySErr(null);
    setCrySelSrc(null);
    setCryEps([]);
    setCryServer("");
    setActiveSrcId("");
  }, [animeId, epSlug]);

  const currentEp  = eps.find(e => e.epSlug === epSlug) || null;
  const currentIdx = eps.findIndex(e => e.epSlug === epSlug);
  const prevEp     = currentIdx > 0            ? eps[currentIdx - 1] : null;
  const nextEp     = currentIdx < eps.length-1 ? eps[currentIdx + 1] : null;
  const epNumber   = parseInt(epSlug.replace("ep-", "")) || 1;

  const anime    = info?.anime?.info;
  const moreInfo = info?.anime?.moreInfo;
  const related  = info?.relatedAnimes     || [];
  const recs     = info?.recommendedAnimes || [];
  const seasons  = info?.seasons           || [];
  const dispEps  = showAllEps ? eps : eps.slice(0, 60);

  // ── Watch progress ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!anime || !currentEp || progressSaved.current) return;
    saveProgress({ animeId, animeName: anime.name, poster: anime.poster,
      epSlug: currentEp.epSlug, epNumber: currentEp.number, epTitle: "" });
    progressSaved.current = true;
  }, [anime, currentEp, animeId]);

  // ── Auto-load: try AnimeGG + fallback sources in parallel ───────────────────
  // All sources race simultaneously. First one with episodes wins.
  // If all fail → auto-switch to embedded player (no user action needed).
  const streamRaceRan = useRef(false);
  useEffect(() => {
    if (!currentEp || !anilistId) return;
    if (streamRaceRan.current) return;
    streamRaceRan.current = true;

    const allSrcIds = [DEFAULT_SOURCE_ID, ...FALLBACK_SOURCE_IDS];
    let settled = false;

    const trySource = async (sourceId) => {
      try {
        const data = await api.crysoline.mapOne(anilistId, sourceId);
        if (!data?.mappedId || settled) return null;
        const eps = await api.crysoline.episodes(sourceId, data.mappedId, anilistId);
        if (eps?.episodes?.length > 0 && !settled) {
          return { sourceId, mappedId: data.mappedId, episodes: eps.episodes };
        }
      } catch { /* source failed */ }
      return null;
    };

    (async () => {
      // Fire all source lookups at the same time
      const promises = allSrcIds.map(id => trySource(id));
      // Use allSettled + check each result in order of resolution
      const results = await Promise.allSettled(promises);

      for (const r of results) {
        if (r.status === "fulfilled" && r.value && !settled) {
          settled = true;
          const { sourceId, mappedId, episodes } = r.value;
          console.log(`[watch] source found: ${sourceId} (${episodes.length} eps)`);
          setSourceMap(prev => ({ ...prev, [sourceId]: mappedId }));
          setActiveSrcId(sourceId);
          setCryEps(episodes);
          return;
        }
      }

      // All sources failed — switch to embedded player automatically
      if (!settled) {
        console.log("[watch] all Crysoline sources failed — switching to embedded player");
        setSourceMode("embedded");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEp?.epSlug, anilistId]);

  // ── Select source and load its episodes ───────────────────────────────────
  const selectSource = useCallback(async (sourceId, mappedId) => {
    if (!mappedId) return;
    setActiveSrcId(sourceId);
    setCryStream(null);
    setCrySErr(null);
    setCrySelSrc(null);
    setCryServers([]);
    setCryServer("");

    setCryEpsLoad(true);
    try {
      // Pass anilistId so the server can auto-fix stale mappings on 404
      const d = await api.crysoline.episodes(sourceId, mappedId, anilistId);
      setCryEps(d.episodes || []);
    } catch { setCryEps([]); }
    finally { setCryEpsLoad(false); }
  }, [anilistId]);

  // ── Fetch stream for current episode ─────────────────────────────────────
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
    setCrySLoad(true); setCrySErr(null); setCryStream(null); setCrySelSrc(null);

    try {
      const src = CRYSOLINE_SOURCES.find(s => s.id === activeSrcId);
      if (src?.hasServers) {
        const sv = await api.crysoline.servers(activeSrcId, mappedId, episodeId);
        setCryServers(sv.servers || []);
      }
      const data = await api.crysoline.sources(activeSrcId, mappedId, episodeId, subType, server);
      setCryStream(data);
      if (data.sources?.length) setCrySelSrc(data.sources[0]);
      else setCrySErr("No streams available from this source. Try another source below.");
    } catch (e) { setCrySErr(e.message); }
    finally { setCrySLoad(false); }
  }, [activeSrcId, sourceMap, cryEps, epNumber, crySubType, cryServer]);

  // Auto-fetch stream once we have episodes
  useEffect(() => {
    if (activeSrcId && cryEps.length > 0) fetchStream();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrcId, cryEps]);

  // Handle source button click
  async function handleSourceClick(sourceId) {
    if (sourceMap[sourceId] !== undefined) {
      const cached = sourceMap[sourceId];
      if (cached) { selectSource(sourceId, cached); }
      else { setCrySErr(`"${CRYSOLINE_SOURCES.find(s => s.id === sourceId)?.name}" is not available for this anime.`); }
      return;
    }

    if (sourceLoading[sourceId]) return;

    setSourceLoading(prev => ({ ...prev, [sourceId]: true }));
    let mappedId = null;
    try {
      const data = await api.crysoline.mapOne(anilistId, sourceId);
      mappedId = data?.mappedId || null;
      setSourceMap(prev => ({ ...prev, [sourceId]: mappedId }));
    } catch {
      setSourceMap(prev => ({ ...prev, [sourceId]: null }));
    } finally {
      setSourceLoading(prev => ({ ...prev, [sourceId]: false }));
    }

    if (mappedId) { selectSource(sourceId, mappedId); }
    else { setCrySErr(`"${CRYSOLINE_SOURCES.find(s => s.id === sourceId)?.name}" is not available for this anime.`); }
  }

  // ── Embedded ──────────────────────────────────────────────────────────────
  const embedCtx = currentEp ? {
    tmdbId, season: 1, episode: epNumber, type: "tv", lang: embedLang,
  } : null;
  const embedUrl   = embedCtx ? buildEmbedUrl(embedProvider, embedCtx) : null;
  const availEmbed = embedCtx ? PROVIDERS.filter(p => buildEmbedUrl(p.id, embedCtx) !== null).map(p => p.id) : [];
  const visibleEmbed = showMoreEmbed ? PROVIDERS : PRIMARY_EMBED;

  useEffect(() => {
    if (!embedCtx) return;
    const avail = PROVIDERS.filter(p => buildEmbedUrl(p.id, embedCtx) !== null);
    if (avail.length && !avail.find(p => p.id === embedProvider)) setEmbedProvider(avail[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEp?.epSlug, tmdbId]);

  const sidebarSections = [
    ...(seasons.length > 0 ? [{ label: "Seasons",            items: seasons }]           : []),
    ...(related.length > 0  ? [{ label: "Related",            items: related.slice(0, 6) }]: []),
    ...(recs.length > 0     ? [{ label: "You May Also Like",  items: recs.slice(0, 6) }]   : []),
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.watchPage}>
      <div className={styles.playerSection}>

        {/* Breadcrumb */}
        <nav className={styles.breadcrumb}>
          <Link href="/">Home</Link>
          <span className={styles.sep}>›</span>
          {anime && <Link href={`/anime/${animeId}`}>{anime.name}</Link>}
          <span className={styles.sep}>›</span>
          <span>Episode {epNumber}</span>
        </nav>

        {/* Player */}
        <div className={styles.playerWrap}>
          {/* Loading state */}
          {(epsLoading && !currentEp) && (
            <div className={styles.playerState}>
              <div className="spinner" /><p>Loading…</p>
            </div>
          )}
          {(!epsLoading && !currentEp) && (
            <div className={styles.playerState}><span>⚠</span><p>Episode not found.</p></div>
          )}

          {/* Crysoline player */}
          {currentEp && sourceMode === "crysoline" && (
            <>
              {(cryEpsLoad || cryStreamLoad) && !crySelSrc && (
                <div className={styles.playerState}>
                  <div className="spinner" />
                  <p>{cryEpsLoad ? "Loading episode list…" : "Fetching stream from AnimeGG…"}</p>
                </div>
              )}
              {!activeSrcId && !cryStreamLoad && !cryEpsLoad && (
                <div className={styles.playerState}>
                  <span className={styles.stateIcon}>🎬</span>
                  <p>Loading default source…</p>
                </div>
              )}
              {activeSrcId && !cryEpsLoad && !cryStreamLoad && cryStreamErr && !crySelSrc && (
                <div className={styles.playerState}>
                  <span className={styles.stateIcon}>⚡</span>
                  <p className={styles.stateMsg}>{cryStreamErr}</p>
                  <div className={styles.stateBtns}>
                    <button className={styles.retryBtn} onClick={() => fetchStream()}>Retry</button>
                    <button className={styles.switchBtn} onClick={() => setSourceMode("embedded")}>
                      Try Embedded Player
                    </button>
                  </div>
                </div>
              )}
              {crySelSrc && (
                <HlsPlayer
                  key={crySelSrc.url}
                  src={crySelSrc.url}
                  subtitles={cryStream?.subtitles || []}
                  headers={cryStream?.headers || {}}
                  poster={anime?.poster}
                  onPrev={prevEp ? () => router.push(`/watch/${animeId}/${prevEp.epSlug}`) : null}
                  onNext={nextEp ? () => router.push(`/watch/${animeId}/${nextEp.epSlug}`) : null}
                  hasPrev={!!prevEp}
                  hasNext={!!nextEp}
                  malId={info?.anime?.moreInfo?.malId || null}
                  epNumber={epNumber}
                  autoplay={autoplay}
                  autoNext={autoNext}
                  onAutoplayChange={handleAutoplayChange}
                  onAutoNextChange={handleAutoNextChange}
                />
              )}
            </>
          )}

          {/* Embedded player */}
          {currentEp && sourceMode === "embedded" && (
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
          )}
        </div>

        {/* ── Control panel ──────────────────────────────────────────────── */}
        <div className={styles.controlPanel}>

          {/* Mode tabs + reload */}
          <div className={styles.panelHeader}>
            <div className={styles.modeTabs}>
              <button
                className={`${styles.modeTab} ${sourceMode === "crysoline" ? styles.modeTabActive : ""}`}
                onClick={() => setSourceMode("crysoline")}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Stream
                {activeSrcId && crySelSrc && <span className={styles.activeIndicator} />}
              </button>
              <button
                className={`${styles.modeTab} ${sourceMode === "embedded" ? styles.modeTabActive : ""}`}
                onClick={() => setSourceMode("embedded")}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                Embedded
              </button>
            </div>
            <button className={styles.reloadBtn}
              onClick={() => sourceMode === "crysoline" ? fetchStream() : setEmbedReload(r => r + 1)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.5"/>
              </svg>
              Reload
            </button>
          </div>

          {/* Crysoline controls */}
          {sourceMode === "crysoline" && (
            <div className={styles.cryBody}>

              {/* Active source indicator */}
              {activeSrcId && (
                <div className={styles.activeSource}>
                  <span className={styles.activeDot} />
                  <span>
                    {CRYSOLINE_SOURCES.find(s => s.id === activeSrcId)?.name || activeSrcId}
                    {crySelSrc ? " — streaming" : cryStreamLoad ? " — loading…" : ""}
                  </span>
                </div>
              )}

              {/* Source grid */}
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
                        title={unavail ? `${src.name} — not available` : src.site}>
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

              {/* Audio */}
              <div className={styles.ctrlRow}>
                <span className={styles.ctrlLabel}>Audio</span>
                <div className={styles.btnGroup}>
                  {["sub", "dub"].map(t => (
                    <button key={t}
                      className={`${styles.optBtn} ${crySubType === t ? styles.optBtnActive : ""}`}
                      onClick={() => { setCrySubType(t); fetchStream(t, ""); setCryServer(""); }}>
                      {t === "sub" ? "Subbed" : "Dubbed"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality */}
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

              {/* Servers */}
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

              {cryStream?.subtitles?.length > 0 && (
                <div className={styles.subInfo}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2"/>
                    <path d="M7 12h4m-4 4h10M15 12h2"/>
                  </svg>
                  {cryStream.subtitles.length} subtitle track{cryStream.subtitles.length > 1 ? "s" : ""} available
                </div>
              )}
            </div>
          )}

          {/* Embedded controls */}
          {sourceMode === "embedded" && (
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
                      {l === "sub" ? "Subbed" : "Dubbed"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Episode nav */}
        <div className={styles.epNav}>
          <button className={styles.navBtn} disabled={!prevEp}
            onClick={() => prevEp && router.push(`/watch/${animeId}/${prevEp.epSlug}`)}>
            ← Prev
          </button>
          <div className={styles.navMid}>
            <span className={styles.epLabel}>Episode {epNumber}</span>
            {currentEp?.airDate && <span className={styles.airDate}>{currentEp.airDate}</span>}
          </div>
          <button className={styles.navBtn} disabled={!nextEp}
            onClick={() => nextEp && router.push(`/watch/${animeId}/${nextEp.epSlug}`)}>
            Next →
          </button>
        </div>

        {/* Anime info */}
        {anime && (
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
                  <button className={styles.nextEpBtn}
                    onClick={() => router.push(`/watch/${animeId}/${nextEp.epSlug}`)}>
                    Next Ep →
                  </button>
                )}
              </div>
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
        {/* Episode sidebar */}
        <div className={styles.epSidebar}>
          <div className={styles.epSideHead}>
            <p className={styles.epSideTitle}>{anime?.name || "Episodes"}</p>
            <span className={styles.epSideCount}>{eps.length} eps</span>
          </div>
          <div className={styles.epList}>
            {epsLoading && eps.length === 0 && (
              <div className={styles.epSkelWrap}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className={`skeleton ${styles.epSkel}`} />
                ))}
              </div>
            )}
            {dispEps.map(ep => (
              <Link key={ep.epSlug} href={`/watch/${animeId}/${ep.epSlug}`}
                className={`${styles.epItem} ${ep.epSlug === epSlug ? styles.epActive : ""}`}>
                <span className={styles.epNum}>Ep {ep.number}</span>
                {ep.airDate && <span className={styles.epDate}>{ep.airDate}</span>}
              </Link>
            ))}
            {eps.length > 60 && !showAllEps && (
              <button className={styles.showAllBtn} onClick={() => setSAE(true)}>
                Show all {eps.length} episodes
              </button>
            )}
          </div>
        </div>

        {/* Related / seasons */}
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
