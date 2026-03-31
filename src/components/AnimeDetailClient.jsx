"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import styles from "./AnimeDetailClient.module.css";
import CharacterSection from "./CharacterSection";
import RelatedSection from "./RelatedSection";

export default function AnimeDetailClient({ id }) {
  const router = useRouter();
  const [info,        setInfo]  = useState(null);
  const [eps,         setEps]   = useState(null);
  const [infoLoading, setIL]    = useState(true);
  const [epsLoading,  setEL]    = useState(true);
  const [error,       setError] = useState(null);
  const [showAllEps,  setSAE]   = useState(false);

  useEffect(() => {
    setIL(true); setError(null);
    api.info(id)
      .then(d  => { setInfo(d); setIL(false); })
      .catch(e => { setError(e.message); setIL(false); });
    api.episodes(id)
      .then(d => { setEps(d); setEL(false); })
      .catch(() => setEL(false));
  }, [id]);

  if (infoLoading) return <DetailSkeleton />;
  if (error) return (
    <div className={styles.errPage}>
      <span>⚠</span>
      <p>{error}</p>
      <button onClick={() => router.back()}>← Go Back</button>
    </div>
  );

  const anime      = info?.anime?.info;
  const moreInfo   = info?.anime?.moreInfo;
  const related    = info?.relatedAnimes     || [];
  const recs       = info?.recommendedAnimes || [];
  const seasons    = info?.seasons           || [];
  const characters = info?.characters        || [];
  const episodes   = eps?.episodes           || [];
  const displayEps = showAllEps ? episodes : episodes.slice(0, 60);

  if (!anime) return null;

  function watchFirst() {
    if (!episodes.length) return;
    router.push(`/watch/${id}/${episodes[0].epSlug}`);
  }

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className={styles.hero}>
        <div className={styles.heroBg}
          style={{ backgroundImage: `url(${anime.banner || anime.poster})` }} />
        <div className={styles.heroGrad} />

        <div className={`container ${styles.heroInner}`}>
          <div className={styles.posterWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={anime.poster} alt={anime.name} className={styles.poster} />
            {anime.rating && (
              <div className={styles.ratingBadge}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                {anime.rating}
              </div>
            )}
          </div>

          <div className={styles.heroInfo}>
            {anime.type && <span className={styles.typeChip}>{anime.type}</span>}
            <h1 className={styles.title}>{anime.name}</h1>
            {anime.jname && anime.jname !== anime.name && (
              <p className={styles.jname}>{anime.jname}</p>
            )}

            <div className={styles.statRow}>
              {anime.status    && <Chip>{anime.status.replace(/_/g, " ")}</Chip>}
              {anime.episodes?.sub > 0 && <span className="badge badge-sub">{anime.episodes.sub} Sub</span>}
              {anime.episodes?.dub > 0 && <span className="badge badge-dub">{anime.episodes.dub} Dub</span>}
              {anime.duration  && <Chip>⏱ {anime.duration}</Chip>}
            </div>

            {anime.description && (
              <p className={styles.desc}
                dangerouslySetInnerHTML={{
                  __html: anime.description
                    .replace(/<br>/gi, " ")
                    .replace(/<[^>]*>/g, "")
                    .slice(0, 360) + (anime.description.length > 360 ? "…" : ""),
                }}
              />
            )}

            <div className={styles.metaGrid}>
              {moreInfo?.aired   && <MetaRow label="Aired"  val={moreInfo.aired} />}
              {moreInfo?.studios && <MetaRow label="Studio" val={moreInfo.studios} />}
              {moreInfo?.season  && <MetaRow label="Season" val={moreInfo.season} />}
              {moreInfo?.genres?.length > 0 && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Genres</span>
                  <div className={styles.genreRow}>
                    {moreInfo.genres.map(g => (
                      <Link key={g}
                        href={`/browse?category=genre/${g.toLowerCase().replace(/ /g, "-")}`}
                        className="tag">{g}</Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.heroActions}>
              {!epsLoading && episodes.length > 0 ? (
                <button className={styles.watchBtn} onClick={watchFirst}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,3 19,12 5,21"/>
                  </svg>
                  Watch Now
                </button>
              ) : epsLoading ? (
                <button className={styles.watchBtnGhost} disabled>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Loading…
                </button>
              ) : (
                <button className={styles.watchBtnGhost} disabled>No episodes yet</button>
              )}
              <Link
                href={`/browse?category=genre/${moreInfo?.genres?.[0]?.toLowerCase().replace(/ /g, "-") || "action"}`}
                className={styles.browseBtn}>
                Browse Similar
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className={`container ${styles.body}`}>
        <div className={styles.mainGrid}>

          {/* Left / main column */}
          <div>
            {/* Seasons */}
            {seasons.length > 1 && (
              <section className={styles.section}>
                <h2 className="section-title" style={{ marginBottom: 14 }}>Seasons</h2>
                <div className={styles.seasonRow}>
                  {seasons.map(s => (
                    <Link key={s.id} href={`/anime/${s.id}`}
                      className={`${styles.seasonCard} ${s.id === id ? styles.seasonActive : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.poster} alt={s.name} loading="lazy" />
                      <span>{s.name}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Episodes */}
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className="section-title">Episodes</h2>
                <span className={styles.epCount}>{episodes.length} total</span>
              </div>

              {epsLoading ? (
                <div className={styles.epGrid}>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className={`skeleton ${styles.epSkel}`} />
                  ))}
                </div>
              ) : episodes.length === 0 ? (
                <p className={styles.noEps}>No episodes found via streaming provider.</p>
              ) : (
                <>
                  <div className={styles.epGrid}>
                    {displayEps.map(ep => (
                      <Link
                        key={ep.epSlug}
                        href={`/watch/${id}/${ep.epSlug}`}
                        className={styles.epBtn}
                        title={`Episode ${ep.number}${ep.airDate ? ` · ${ep.airDate}` : ""}`}
                      >
                        {ep.number}
                      </Link>
                    ))}
                  </div>
                  {episodes.length > 60 && (
                    <button className={styles.showMore} onClick={() => setSAE(!showAllEps)}>
                      {showAllEps ? "Show Less" : `Show All ${episodes.length} Episodes`}
                    </button>
                  )}
                </>
              )}
            </section>

            {/* ── Characters ───────────────────────────────── */}
            <CharacterSection characters={characters} />

            {/* ── Related Anime (full-width grid below chars) ── */}
            {related.length > 0 && (
              <RelatedSection
                title="Related Anime"
                items={related}
                viewAllHref={`/browse?category=top-airing`}
              />
            )}

            {/* ── Recommended ──────────────────────────────── */}
            {recs.length > 0 && (
              <RelatedSection
                title="You Might Also Like"
                items={recs}
                viewAllHref={`/browse?category=most-popular`}
              />
            )}
          </div>

          {/* Sidebar */}
          <aside>
            {related.length > 0 && (
              <section className={styles.sideSection}>
                <h3 className={styles.sideTitle}>Related</h3>
                <SideList items={related.slice(0, 8)} />
              </section>
            )}
            {recs.length > 0 && (
              <section className={styles.sideSection}>
                <h3 className={styles.sideTitle}>Recommended</h3>
                <SideList items={recs.slice(0, 8)} />
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────────── */
function Chip({ children }) {
  return <span className={styles.chip}>{children}</span>;
}
function MetaRow({ label, val }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaVal}>{val}</span>
    </div>
  );
}
function SideList({ items }) {
  return (
    <div className={styles.sideList}>
      {items.map(a => (
        <Link key={a.id} href={`/anime/${a.id}`} className={styles.sideCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.poster} alt={a.name} loading="lazy" className={styles.sideImg} />
          <div>
            <p className={styles.sideName}>{a.name}</p>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {a.episodes?.sub > 0 && (
                <span className="badge badge-sub">{a.episodes.sub} eps</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
function DetailSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 460 }} />
      <div className="container" style={{ paddingTop: 36 }}>
        <div className="skeleton" style={{ height: 260, borderRadius: "var(--r-xl)" }} />
      </div>
    </div>
  );
}
