"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { getRecentlyWatched } from "@/lib/watchProgress";
import { getUserWatching } from "@/lib/anilistClient";
import SpotlightBanner from "./SpotlightBanner";
import Section from "./Section";
import AnimeCard from "./AnimeCard";
import styles from "./HomeClient.module.css";

/** Merge local + AniList watching, deduplicated by animeId, newest first */
function mergeWatchLists(local, anilist) {
  const seen = new Set();
  const merged = [];
  // AniList "currently watching" takes priority
  for (const item of anilist) {
    if (!seen.has(item.animeId)) { seen.add(item.animeId); merged.push({ ...item, source: "anilist" }); }
  }
  // Fill with local history for any not already in AniList list
  for (const item of local) {
    if (!seen.has(item.animeId)) { seen.add(item.animeId); merged.push({ ...item, source: "local" }); }
  }
  return merged;
}

export default function HomeClient({ initialData }) {
  const [data,    setData]    = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error,   setError]   = useState(null);
  const [recent,  setRecent]  = useState([]);

  useEffect(() => {
    const localHistory = getRecentlyWatched(10);
    // Try AniList currently watching — silently ignore if not logged in
    getUserWatching()
      .then(anilistWatching => {
        setRecent(mergeWatchLists(anilistWatching, localHistory));
      })
      .catch(() => {
        // Not logged in or API error — fall back to local only
        setRecent(localHistory);
      });

    if (initialData) return;
    api.home()
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [initialData]);

  if (error) return (
    <div className={styles.errWrap}>
      <motion.div
        className={styles.errCard}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className={styles.errSigil}>⚔</div>
        <h2 className={styles.errTitle}>The Abyss is Silent</h2>
        <p className={styles.errMsg}>{error}</p>
        <button className={styles.retryBtn} onClick={() => window.location.reload()}>
          Try Again
        </button>
      </motion.div>
    </div>
  );

  const spotlight  = data?.spotlightAnimes        || [];
  const trending   = data?.trendingAnimes          || [];
  const latest     = data?.latestEpisodeAnimes     || [];
  const topAiring  = data?.topAiringAnimes         || [];
  const favorites  = data?.mostFavoriteAnimes      || [];
  const top10Today = data?.top10Animes?.today      || [];

  return (
    <div className={styles.page}>
      {/* Hero banner */}
      <SpotlightBanner spotlights={spotlight} loading={loading} />

      {/* Continue Watching */}
      {recent.length > 0 && (
        <motion.section
          className={`container ${styles.continueSection}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className={styles.sectionHeader}>
            <div className={styles.titleWrap}>
              <span className={styles.titleAccent} />
              <h2 className="section-title">Continue Watching</h2>
            </div>
            <Link href="/profile" className={styles.viewAll}>
              View All
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          <div className={styles.continueRow}>
            {recent.slice(0, 8).map((item, i) => (
              <motion.div
                key={item.animeId}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -4 }}
              >
                <Link href={`/watch/${item.animeId}/${item.epSlug}`} className={styles.continueCard}>
                  <div className={styles.continuePoster}>
                    {item.poster && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.poster} alt={item.animeName} />
                    )}
                    <div className={styles.continuePlay}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                        <polygon points="5,3 19,12 5,21"/>
                      </svg>
                    </div>
                    <div className={styles.continueEpBadge}>Ep {item.epNumber}</div>
                    {item.source === "anilist" && (
                      <div className={styles.continueAlBadge}>AL</div>
                    )}
                  </div>
                  <p className={styles.continueName}>{item.animeName}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Main content grid */}
      <div className={`container ${styles.mainContent}`}>

        {/* Left column — primary sections */}
        <div className={styles.primaryCol}>
          <Section
            title="Trending Now"
            animes={trending}
            viewAllHref="/browse?category=top-airing"
            loading={loading}
          />
          <Section
            title="Latest Episodes"
            animes={latest}
            viewAllHref="/browse?category=recently-updated"
            loading={loading}
          />
          <Section
            title="Most Beloved"
            animes={favorites}
            viewAllHref="/browse?category=most-favorite"
            loading={loading}
          />
        </div>

        {/* Right column — top 10 + top airing */}
        <div className={styles.sideCol}>
          {/* Top 10 Today */}
          {(loading || top10Today.length > 0) && (
            <div className={styles.top10Card}>
              <div className={styles.top10Header}>
                <span className={styles.titleAccent} />
                <h3 className="section-title">Top 10 Today</h3>
              </div>
              <div className={styles.top10List}>
                {loading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className={styles.top10SkeletonRow}>
                        <div className={`skeleton ${styles.top10SkeletonNum}`} />
                        <div className={`skeleton ${styles.top10SkeletonImg}`} />
                        <div className={styles.top10SkeletonText}>
                          <div className={`skeleton ${styles.top10SkeletonTitle}`} />
                          <div className={`skeleton ${styles.top10SkeletonMeta}`} />
                        </div>
                      </div>
                    ))
                  : top10Today.slice(0, 10).map((anime, i) => (
                      <motion.div
                        key={anime.id}
                        initial={{ opacity: 0, x: 10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.04 }}
                        whileHover={{ x: 3 }}
                      >
                        <Link href={`/anime/${anime.id}`} className={styles.top10Row}>
                          <span className={`${styles.top10Rank} ${i < 3 ? styles.top10RankGold : ""}`}>
                            {i + 1}
                          </span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={anime.poster} alt={anime.name} className={styles.top10Img} />
                          <div className={styles.top10Info}>
                            <p className={styles.top10Name}>{anime.name}</p>
                            <span className={styles.top10Meta}>
                              {anime.type}
                              {anime.episodes?.sub > 0 && ` · ${anime.episodes.sub} eps`}
                            </span>
                          </div>
                        </Link>
                      </motion.div>
                    ))
                }
              </div>
            </div>
          )}

          {/* Top Airing compact */}
          {!loading && topAiring.length > 0 && (
            <div className={styles.airingCard}>
              <div className={styles.airingHeader}>
                <span className={styles.titleAccent} />
                <h3 className="section-title">Top Airing</h3>
                <Link href="/browse?category=top-airing" className={styles.airingViewAll}>All →</Link>
              </div>
              <div className={styles.airingGrid}>
                {topAiring.slice(0, 6).map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
