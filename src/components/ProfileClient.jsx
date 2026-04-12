"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getRecentlyWatched } from "@/lib/watchProgress";
import { getUserMediaList, getUserStats, STATUS_LABELS } from "@/lib/anilistClient";
import styles from "./ProfileClient.module.css";

function fmtMins(mins) {
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

function StatCard({ label, value, accent }) {
  return (
    <motion.div className={styles.statCard} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} whileHover={{ y:-3 }}>
      <p className={`${styles.statValue} ${accent ? styles.statValueAccent : ""}`}>{value}</p>
      <p className={styles.statLabel}>{label}</p>
    </motion.div>
  );
}

function MediaListTab({ status }) {
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    getUserMediaList(status, page)
      .then(data => {
        setEntries(prev => page === 1 ? data.mediaList : [...(prev || []), ...data.mediaList]);
        setHasMore(data.pageInfo?.hasNextPage || false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [status, page]);

  if (loading && page === 1) return (
    <div className={styles.listGrid}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={styles.listSkel}>
          <div className={`skeleton ${styles.listSkelImg}`} />
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8, padding:12 }}>
            <div className={`skeleton ${styles.listSkelTitle}`} />
            <div className={`skeleton ${styles.listSkelMeta}`} />
          </div>
        </div>
      ))}
    </div>
  );

  if (!entries?.length) return (
    <p className={styles.emptyList}>Nothing here yet.</p>
  );

  return (
    <>
      <div className={styles.listGrid}>
        {entries.map((entry, i) => {
          const m = entry.media;
          const title = m.title?.english || m.title?.romaji || "";
          const pct = m.episodes ? Math.round((entry.progress / m.episodes) * 100) : 0;
          const nextEp = Math.max(1, (entry.progress || 0) + 1);
          return (
            <motion.div key={entry.id} className={styles.listCard}
              initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}>
              <Link href={`/anime/${m.id}`} className={styles.listCardInner}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.coverImage?.large} alt={title} className={styles.listImg} loading="lazy" />
                <div className={styles.listInfo}>
                  <p className={styles.listTitle}>{title}</p>
                  <div className={styles.listMeta}>
                    {m.format && <span className={styles.listFormat}>{m.format}</span>}
                    {entry.score > 0 && <span className={styles.listScore}>★ {entry.score / 10}</span>}
                  </div>
                  <div className={styles.listProgress}>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={styles.progressText}>{entry.progress}/{m.episodes || "?"}</span>
                  </div>
                  {m.nextAiringEpisode && (
                    <p className={styles.nextAiring}>
                      Ep {m.nextAiringEpisode.episode} in {Math.ceil((m.nextAiringEpisode.airingAt * 1000 - Date.now()) / 86400000)}d
                    </p>
                  )}
                </div>
              </Link>
              <Link href={`/watch/${m.id}/ep-${nextEp}`} className={styles.watchBtn}>▶</Link>
            </motion.div>
          );
        })}
      </div>
      {hasMore && (
        <button className={styles.loadMore} onClick={() => setPage(p => p + 1)} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}

const TABS = [
  { key:"CURRENT",  label:"Watching"     },
  { key:"PLANNING", label:"Plan to Watch"},
  { key:"COMPLETED",label:"Completed"    },
  { key:"DROPPED",  label:"Dropped"      },
  { key:"PAUSED",   label:"On Hold"      },
  { key:"local",    label:"Local History"},
  { key:"stats",    label:"Statistics"   },
];

export default function ProfileClient() {
  const [user,   setUser]   = useState(null);
  const [loading,setLoading]= useState(true);
  const [tab,    setTab]    = useState("CURRENT");
  const [stats,  setStats]  = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    setRecent(getRecentlyWatched(20));
    fetch("/api/auth/me").then(r=>r.json()).then(d=>{setUser(d.user);setLoading(false);}).catch(()=>setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "stats" && !stats && user) getUserStats().then(setStats).catch(()=>{});
  }, [tab, stats, user]);

  if (loading) return <div className={styles.center}><div className="spinner"/></div>;

  if (!user) return (
    <div className={styles.center}>
      <motion.div className={styles.loginPrompt} initial={{opacity:0,y:24}} animate={{opacity:1,y:0}}>
        <div className={styles.loginIcon}>
          <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
            <path d="M22 12 L26 21 L20 19 Z" fill="#c0394d" opacity="0.85"/>
            <path d="M42 12 L38 21 L44 19 Z" fill="#c0394d" opacity="0.85"/>
            <path d="M12 32 Q32 19 52 32 Q32 45 12 32 Z" stroke="#c0394d" strokeWidth="1.8" fill="rgba(192,57,77,0.14)"/>
            <ellipse cx="32" cy="32" rx="9" ry="8" fill="#c0394d"/>
            <ellipse cx="32" cy="32" rx="3" ry="7.5" fill="#07060b"/>
          </svg>
        </div>
        <h2 className={styles.loginTitle}>Sign in to AnimeDex</h2>
        <p className={styles.loginDesc}>Connect your AniList account to sync your watchlist, track progress, rate anime, and view your statistics.</p>
        <a href="/api/auth/login" className={styles.loginBtn}>Sign in with AniList</a>
        {recent.length > 0 && <p className={styles.localNote}>Your local history is shown below ↓</p>}
      </motion.div>
      {recent.length > 0 && (
        <div className={`container ${styles.localSection}`}>
          <h3 className={styles.localHeading}>Local Watch History</h3>
          <div className={styles.localGrid}>
            {recent.map(item => (
              <Link key={item.animeId} href={`/watch/${item.animeId}/${item.epSlug}`} className={styles.localCard}>
                {item.poster && <img src={item.poster} alt={item.animeName} className={styles.localImg} loading="lazy"/>}
                <div className={styles.localInfo}>
                  <p className={styles.localTitle}>{item.animeName}</p>
                  <span className={styles.localEp}>Ep {item.epNumber}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const aniStats = user.statistics?.anime;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        {user.bannerImage && <img src={user.bannerImage} alt="" className={styles.heroBanner}/>}
        <div className={styles.heroOverlay}/>
        <div className={`container ${styles.heroContent}`}>
          <img src={user.avatar?.large} alt={user.name} className={styles.avatar}/>
          <div className={styles.userInfo}>
            <h1 className={styles.username}>{user.name}</h1>
            {user.about && <p className={styles.about}>{user.about.replace(/<[^>]*>/g,"").slice(0,200)}</p>}
            <div className={styles.userLinks}>
              <a href={user.siteUrl} target="_blank" rel="noreferrer" className={styles.anilistLink}>AniList Profile ↗</a>
              <a href="/api/auth/logout" className={styles.logoutBtn}>Logout</a>
            </div>
          </div>
        </div>
      </div>

      {aniStats && (
        <div className={`container ${styles.quickStats}`}>
          <StatCard label="Anime Watched"  value={aniStats.count || 0}/>
          <StatCard label="Episodes"       value={(aniStats.episodesWatched||0).toLocaleString()}/>
          <StatCard label="Time Watched"   value={fmtMins(aniStats.minutesWatched||0)} accent/>
          <StatCard label="Mean Score"     value={aniStats.meanScore ? `${aniStats.meanScore}%` : "N/A"}/>
        </div>
      )}

      <div className={`container ${styles.tabsWrap}`}>
        <div className={styles.tabs}>
          {TABS.map(t => (
            <motion.button key={t.key}
              className={`${styles.tab} ${tab===t.key ? styles.tabActive : ""}`}
              onClick={() => setTab(t.key)} whileHover={{y:-1}} whileTap={{scale:0.97}}>
              {t.label}
            </motion.button>
          ))}
        </div>
      </div>

      <div className={`container ${styles.tabContent}`}>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.22}}>
            {["CURRENT","PLANNING","COMPLETED","DROPPED","PAUSED"].includes(tab) && <MediaListTab status={tab}/>}

            {tab === "local" && (
              recent.length === 0
                ? <p className={styles.emptyList}>No local history found.</p>
                : <div className={styles.localGrid}>
                    {recent.map(item => (
                      <Link key={item.animeId} href={`/watch/${item.animeId}/${item.epSlug}`} className={styles.localCard}>
                        {item.poster && <img src={item.poster} alt={item.animeName} className={styles.localImg} loading="lazy"/>}
                        <div className={styles.localInfo}>
                          <p className={styles.localTitle}>{item.animeName}</p>
                          <span className={styles.localEp}>Ep {item.epNumber}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
            )}

            {tab === "stats" && (
              <div className={styles.statsPage}>
                {!stats ? <div className="spinner"/> : (
                  <>
                    {stats.scores?.length > 0 && (
                      <section className={styles.statSection}>
                        <h3 className={styles.statSectionTitle}>Score Distribution</h3>
                        <div className={styles.scoreBar}>
                          {stats.scores.map(s => {
                            const max = Math.max(...stats.scores.map(x=>x.count));
                            const h = max > 0 ? Math.round((s.count/max)*100) : 0;
                            return (
                              <div key={s.score} className={styles.scoreBarCol}>
                                <span className={styles.scoreBarCount}>{s.count || ""}</span>
                                <div className={styles.scoreBarFill} style={{height:`${h}%`}}/>
                                <span className={styles.scoreBarLabel}>{s.score/10}</span>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}
                    {stats.genres?.length > 0 && (
                      <section className={styles.statSection}>
                        <h3 className={styles.statSectionTitle}>Top Genres</h3>
                        <div className={styles.genreGrid}>
                          {stats.genres.map(g => (
                            <Link key={g.genre} href={`/browse?category=genre/${g.genre.toLowerCase().replace(/ /g,"-")}`} className={styles.genreCard}>
                              <span className={styles.genreName}>{g.genre}</span>
                              <span className={styles.genreCount}>{g.count} anime</span>
                              {g.minutesWatched > 0 && <span className={styles.genreTime}>{fmtMins(g.minutesWatched)}</span>}
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}
                    {stats.statuses?.length > 0 && (
                      <section className={styles.statSection}>
                        <h3 className={styles.statSectionTitle}>List Breakdown</h3>
                        <div className={styles.statusBreakdown}>
                          {stats.statuses.map(s => (
                            <div key={s.status} className={styles.statusBreakRow}>
                              <span className={styles.statusBreakLabel}>{STATUS_LABELS[s.status]||s.status}</span>
                              <span className={styles.statusBreakCount}>{s.count}</span>
                              <span className={styles.statusBreakTime}>{fmtMins(s.minutesWatched||0)}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
