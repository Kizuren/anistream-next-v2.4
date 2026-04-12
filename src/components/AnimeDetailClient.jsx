"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery, prefetch } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import CharacterSection from "./CharacterSection";
import AniListPanel from "./AniListPanel";
import styles from "./AnimeDetailClient.module.css";

/* ── Skeletons ─────────────────────────────────────────────────────── */
function HeroSkeleton() {
  return (
    <div className={styles.heroBanner}>
      <div className={`container ${styles.heroContent}`}>
        <div className={`skeleton ${styles.heroPosterSkel}`} />
        <div className={styles.heroInfo}>
          <div className="skeleton" style={{ height: 36, width: "55%", borderRadius: 6, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 13, width: "35%", borderRadius: 4, marginBottom: 18 }} />
          <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
            {[70, 90, 80].map((w, i) => <div key={i} className="skeleton" style={{ height: 26, width: w, borderRadius: 99 }} />)}
          </div>
          <div className="skeleton" style={{ height: 80, borderRadius: 8, marginBottom: 22 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <div className="skeleton" style={{ height: 46, width: 148, borderRadius: 12 }} />
            <div className="skeleton" style={{ height: 46, width: 108, borderRadius: 12 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Compact info item ─────────────────────────────────────────────── */
function MetaRow({ label, value }) {
  if (!value) return null;
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{String(value)}</span>
    </div>
  );
}

/* ── Horizontal anime card used in related/recs ───────────────────── */
function AnimeThumbCard({ anime }) {
  if (!anime?.id) return null;
  const { id, name, poster, type, episodes } = anime;
  return (
    <Link href={`/anime/${id}`} className={styles.thumbCard}
      onMouseEnter={() => prefetch(`info:${id}`, () => api.info(id), 300)}>
      <div className={styles.thumbPoster}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt={name} loading="lazy" />
        <div className={styles.thumbPlay}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
      </div>
      <div className={styles.thumbInfo}>
        <p className={styles.thumbTitle}>{name}</p>
        <div className={styles.thumbMeta}>
          {type && <span className={styles.thumbType}>{type}</span>}
          {episodes?.sub > 0 && <span className="badge badge-sub">{episodes.sub} eps</span>}
        </div>
      </div>
    </Link>
  );
}

/* ── Section wrapper for related/recs ─────────────────────────────── */
function AnimeSection({ title, items = [], columns = 2 }) {
  if (!items.length) return null;
  return (
    <section className={styles.animeSection}>
      <div className={styles.sectionHeaderRow}>
        <span className={styles.sectionAccent} />
        <h2 className={`section-title ${styles.sectionTitle}`}>{title}</h2>
      </div>
      <div className={styles.thumbGrid} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {items.map(a => <AnimeThumbCard key={a.id} anime={a} />)}
      </div>
    </section>
  );
}

/* ── Main component ────────────────────────────────────────────────── */
export default function AnimeDetailClient({ animeId, initialData }) {
  const [showAllEps, setShowAllEps] = useState(false);

  const { data: info, loading, error } = useQuery(
    `info:${animeId}`,
    () => api.info(animeId),
    { ttl: 300 }
  );
  const { data: epsData } = useQuery(
    `episodes:${animeId}`,
    () => api.episodes(animeId),
    { ttl: 180 }
  );

  const data    = info || initialData;
  const eps     = epsData?.episodes || [];
  const anime   = data?.anime?.info;
  const more    = data?.anime?.moreInfo;
  const related = data?.relatedAnimes     || [];
  const recs    = data?.recommendedAnimes || [];
  const chars   = data?.characters        || [];
  const seasons = data?.seasons           || [];

  if (error && !data) return (
    <div className={styles.errPage}>
      <p className={styles.errMsg}>The spirits have abandoned this realm.</p>
      <button className={styles.retryBtn} onClick={() => window.location.reload()}>Retry</button>
    </div>
  );

  if (!anime) return <HeroSkeleton />;

  const firstEp   = eps[0];
  const watchUrl  = firstEp ? `/watch/${animeId}/${firstEp.epSlug}` : null;
  const dispEps   = showAllEps ? eps : eps.slice(0, 100);
  const cleanDesc = (anime.description || "").replace(/<[^>]*>/g, "").trim();

  return (
    <div className={styles.page}>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div className={styles.heroBanner}>
        {(anime.cover || anime.poster) && (
          <div className={styles.heroBg}
            style={{ backgroundImage: `url(${anime.cover || anime.poster})` }} />
        )}
        <div className={styles.heroGradient} />
        <div className={styles.heroVignette} />

        <div className={`container ${styles.heroContent}`}>
          {/* Poster */}
          <motion.div
            className={styles.posterWrap}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={anime.poster} alt={anime.name} className={styles.heroPoster} />
            <div className={styles.posterGlow} />
            {watchUrl && (
              <Link href={watchUrl} className={styles.posterPlayBtn}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
              </Link>
            )}
          </motion.div>

          {/* Info column */}
          <motion.div
            className={styles.heroInfo}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Status chips */}
            <div className={styles.chipRow}>
              {anime.type && <span className={styles.typeChip}>{anime.type}</span>}
              {anime.status && (
                <span className={`${styles.statusChip} ${anime.status === "RELEASING" ? styles.statusLive : ""}`}>
                  {anime.status === "RELEASING" && <span className={styles.liveDot} />}
                  {anime.status.replace(/_/g, " ")}
                </span>
              )}
              {more?.score && <span className={styles.scoreChip}>★ {more.score}</span>}
              {more?.rank  && <span className={styles.rankChip}>{more.rank}</span>}
            </div>

            <h1 className={styles.heroTitle}>{anime.name}</h1>
            {anime.jname && anime.jname !== anime.name && (
              <p className={styles.heroJname}>{anime.jname}</p>
            )}

            {/* Episode counts */}
            <div className={styles.epRow}>
              {anime.episodes?.sub > 0 && (
                <span className={styles.epBadge}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  {anime.episodes.sub} Sub
                </span>
              )}
              {anime.episodes?.dub > 0 && (
                <span className={`${styles.epBadge} ${styles.epBadgeDub}`}>
                  {anime.episodes.dub} Dub
                </span>
              )}
            </div>

            {cleanDesc && (
              <p className={styles.heroDesc}>
                {cleanDesc.slice(0, 300)}{cleanDesc.length > 300 ? "…" : ""}
              </p>
            )}

            {/* Genres */}
            {(more?.genres?.length > 0 || anime.genres?.length > 0) && (
              <div className={styles.genreRow}>
                {(more?.genres || anime.genres || []).slice(0, 7).map(g => (
                  <Link key={g}
                    href={`/browse?category=genre/${g.toLowerCase().replace(/ /g, "-")}`}
                    className="tag"
                  >{g}</Link>
                ))}
              </div>
            )}

            {/* CTAs */}
            <div className={styles.heroActions}>
              {watchUrl && (
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Link href={watchUrl} className="btn-primary">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    Watch Now
                  </Link>
                </motion.div>
              )}
              {more?.malId && (
                <a href={`https://myanimelist.net/anime/${more.malId}`}
                  target="_blank" rel="noreferrer" className="btn-ghost">
                  MAL ↗
                </a>
              )}
              {/* External streaming links */}
              {more?.externalLinks?.slice(0, 2).map(l => (
                <a key={l.site} href={l.url} target="_blank" rel="noreferrer" className="btn-ghost">
                  {l.site} ↗
                </a>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Seasons strip ─────────────────────────────────────────── */}
      {seasons.length > 1 && (
        <div className={`container ${styles.seasonsRow}`}>
          {seasons.map(s => (
            <Link key={s.id} href={`/anime/${s.id}`}
              className={`${styles.seasonBtn} ${s.id === animeId ? styles.seasonActive : ""}`}>
              {s.name || s.title}
            </Link>
          ))}
        </div>
      )}

      {/* ── MAIN BODY ─────────────────────────────────────────────── */}
      <div className={`container ${styles.body}`}>
        <div className={styles.bodyGrid}>

          {/* ── LEFT: episodes + characters ── */}
          <div className={styles.mainCol}>

            {/* Episodes */}
            <section className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <span className={styles.sectionAccent} />
                <h2 className={`section-title ${styles.sectionTitle}`}>
                  Episodes {eps.length > 0 && <span className={styles.epCount}>{eps.length}</span>}
                </h2>
              </div>
              {eps.length === 0 ? (
                <p className={styles.emptyMsg}>
                  {loading ? "Loading episodes…" : "No episodes available yet."}
                </p>
              ) : (
                <>
                  <div className={styles.epGrid}>
                    {dispEps.map((ep, i) => (
                      <motion.div
                        key={ep.epSlug}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.005, 0.25) }}
                      >
                        <Link href={`/watch/${animeId}/${ep.epSlug}`} className={styles.epCard}>
                          <span className={styles.epNum}>Ep {ep.number}</span>
                          {ep.title && ep.title !== `Episode ${ep.number}` && (
                            <span className={styles.epTitle}>{ep.title}</span>
                          )}
                          <svg className={styles.epPlay} width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5,3 19,12 5,21"/>
                          </svg>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                  {eps.length > 100 && !showAllEps && (
                    <button className={styles.showAllBtn} onClick={() => setShowAllEps(true)}>
                      Show all {eps.length} episodes ↓
                    </button>
                  )}
                </>
              )}
            </section>

            {/* Characters */}
            {chars.length > 0 && <CharacterSection characters={chars} />}
          </div>

          {/* ── RIGHT: full details panel ── */}
          <aside className={styles.sideCol}>

            {/* AniList tracking panel */}
            {anime?.anilistId && (
              <div style={{ marginBottom: 16 }}>
                <AniListPanel
                  anilistId={anime.anilistId}
                  totalEpisodes={anime.episodes?.sub || null}
                  compact
                />
              </div>
            )}

            <div className={styles.detailsPanel}>
              <div className={styles.detailsPanelHeader}>
                <span className={styles.sectionAccent} />
                <h3 className={styles.detailsPanelTitle}>Details</h3>
              </div>

              <div className={styles.metaList}>
                <MetaRow label="Status"   value={more?.status  || anime.status} />
                <MetaRow label="Aired"    value={more?.aired   || anime.startDate} />
                <MetaRow label="Ended"    value={more?.ended   || anime.endDate} />
                <MetaRow label="Season"   value={more?.season  || anime.season} />
                <MetaRow label="Episodes" value={anime.episodes?.sub > 0 ? anime.episodes.sub : more?.episodes} />
                <MetaRow label="Duration" value={more?.duration || anime.duration} />
                <MetaRow label="Studio"   value={more?.studios || anime.studios} />
                <MetaRow label="Source"   value={more?.source  || anime.source} />
                <MetaRow label="Score"    value={more?.score} />
                <MetaRow label="Rank"     value={more?.rank} />
                <MetaRow label="Format"   value={more?.type    || anime.type} />
              </div>

              {/* Tags */}
              {(more?.tags || anime.tags || []).length > 0 && (
                <div className={styles.tagsBlock}>
                  <p className={styles.tagsLabel}>Tags</p>
                  <div className={styles.tagsRow}>
                    {(more?.tags || anime.tags || []).slice(0, 10).map(t => (
                      <span key={typeof t === "string" ? t : t.name} className={styles.tagPill}>
                        {typeof t === "string" ? t : t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Synonyms */}
              {more?.synonyms?.length > 0 && (
                <div className={styles.tagsBlock}>
                  <p className={styles.tagsLabel}>Also Known As</p>
                  {more.synonyms.map(s => (
                    <p key={s} className={styles.synonymLine}>{s}</p>
                  ))}
                </div>
              )}

              {/* Trailer */}
              {(more?.trailer || anime.trailer) && (
                <div className={styles.trailerBlock}>
                  <p className={styles.tagsLabel}>Trailer</p>
                  {(() => {
                    const t = more?.trailer || anime.trailer;
                    const url = t?.site === "youtube"
                      ? `https://www.youtube.com/watch?v=${t.id}`
                      : t?.site === "dailymotion"
                      ? `https://www.dailymotion.com/video/${t.id}`
                      : null;
                    return url ? (
                      <a href={url} target="_blank" rel="noreferrer" className={styles.trailerBtn}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                        Watch Trailer ↗
                      </a>
                    ) : null;
                  })()}
                </div>
              )}

              {/* External links */}
              {more?.externalLinks?.length > 0 && (
                <div className={styles.tagsBlock}>
                  <p className={styles.tagsLabel}>Stream On</p>
                  <div className={styles.extLinks}>
                    {more.externalLinks.map(l => (
                      <a key={l.site} href={l.url} target="_blank" rel="noreferrer" className={styles.extLink}>
                        {l.site}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* ── FULL-WIDTH: Related, Recommended, You May Like ── */}
        <div className={styles.bottomSections}>
          <AnimeSection title="Related Anime"     items={related} columns={4} />
          <AnimeSection title="Recommended"       items={recs.slice(0, 8)}    columns={4} />

          {/* You May Like: mix of recs tail + related */}
          {(recs.length > 8 || related.length > 0) && (
            <AnimeSection
              title="You May Also Like"
              items={[...recs.slice(8, 16), ...related].slice(0, 8)}
              columns={4}
            />
          )}
        </div>
      </div>
    </div>
  );
}
