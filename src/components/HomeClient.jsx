"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getRecentlyWatched } from "@/lib/watchProgress";
import SpotlightBanner from "./SpotlightBanner";
import Section from "./Section";
import styles from "./HomeClient.module.css";

export default function HomeClient({ initialData }) {
  const [data,    setData]    = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error,   setError]   = useState(null);
  const [recent,  setRecent]  = useState([]);

  useEffect(() => {
    setRecent(getRecentlyWatched(10));
    if (initialData) return;
    api.home()
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [initialData]);

  if (error) return (
    <div className={styles.errWrap}>
      <div className={styles.errCard}>
        <span className={styles.errIcon}>⚠</span>
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );

  const spotlight  = data?.spotlightAnimes       || [];
  const trending   = data?.trendingAnimes         || [];
  const latest     = data?.latestEpisodeAnimes    || [];
  const topAiring  = data?.topAiringAnimes        || [];
  const favorites  = data?.mostFavoriteAnimes     || [];
  const top10Today = data?.top10Animes?.today      || [];

  return (
    <div>
      <SpotlightBanner spotlights={spotlight} loading={loading} />

      <div className={`container ${styles.page}`}>

        {/* Continue Watching */}
        {recent.length > 0 && (
          <section className={styles.continueSection}>
            <div className={styles.sectionHeader}>
              <h2 className="section-title">Continue Watching</h2>
              <Link href="/profile" className={styles.viewAll}>View All →</Link>
            </div>
            <div className={styles.continueRow}>
              {recent.slice(0, 8).map(item => (
                <Link key={item.animeId}
                  href={`/watch/${item.animeId}/${item.epSlug}`}
                  className={styles.continueCard}>
                  <div className={styles.continuePoster}>
                    {item.poster && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.poster} alt={item.animeName} />
                    )}
                    <div className={styles.continuePlay}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <polygon points="5,3 19,12 5,21"/>
                      </svg>
                    </div>
                    <div className={styles.continueEpBadge}>Ep {item.epNumber}</div>
                  </div>
                  <p className={styles.continueName}>{item.animeName}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Main two-col */}
        <div className={styles.twoCol}>
          <div className={styles.mainCol}>
            <Section title="Trending Now"      animes={trending}  loading={loading} viewAllHref="/browse?category=top-airing" />
            <Section title="Latest Episodes"   animes={latest}    loading={loading} viewAllHref="/browse?category=recently-updated" />
            <Section title="Top Airing"        animes={topAiring} loading={loading} viewAllHref="/browse?category=top-airing" />
            <Section title="Most Favorited"    animes={favorites} loading={loading} viewAllHref="/browse?category=most-favorite" />
          </div>

          {/* Sidebar */}
          <aside className={styles.sidebar}>
            <div className={styles.top10Card}>
              <div className={styles.top10Header}>
                <h3 className={styles.top10Title}>Top 10 Today</h3>
                <span className={styles.top10Badge}>Live</span>
              </div>
              {loading
                ? Array.from({length: 10}).map((_,i) => (
                    <div key={i} className={styles.top10SkelRow}>
                      <div className={`skeleton ${styles.top10SkelNum}`} />
                      <div className={`skeleton ${styles.top10SkelImg}`} />
                      <div style={{flex:1}}>
                        <div className={`skeleton`} style={{height:11,marginBottom:5,borderRadius:4,width:"75%"}} />
                        <div className={`skeleton`} style={{height:9,borderRadius:4,width:"40%"}} />
                      </div>
                    </div>
                  ))
                : top10Today.map((a, i) => (
                    <Link key={a.id} href={`/anime/${a.id}`} className={styles.top10Row}>
                      <span className={`${styles.top10Num} ${i < 3 ? styles.top10NumGold : ""}`}>
                        {i < 3 ? ["①","②","③"][i] : i + 1}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.poster} alt="" className={styles.top10Poster} />
                      <div className={styles.top10Info}>
                        <p className={styles.top10Name}>{a.name}</p>
                        <div className={styles.top10Meta}>
                          {a.type && <span>{a.type}</span>}
                          {a.episodes?.sub > 0 && <span className="badge badge-sub">{a.episodes.sub} eps</span>}
                        </div>
                      </div>
                    </Link>
                  ))
              }
            </div>

            {/* Genre quick-links */}
            <div className={styles.genreCard}>
              <h3 className={styles.top10Title} style={{marginBottom:12}}>Genres</h3>
              <div className={styles.genreGrid}>
                {["Action","Comedy","Drama","Fantasy","Romance","Thriller","Sci-Fi","Horror"].map(g => (
                  <Link key={g}
                    href={`/browse?category=genre/${g.toLowerCase().replace(/ /g,"-")}`}
                    className={styles.genreChip}>
                    {g}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
