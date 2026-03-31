"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getRecentlyWatched, clearProgress } from "@/lib/watchProgress";
import styles from "./ProfileClient.module.css";

export default function ProfileClient() {
  const { user, loading, login, logout } = useAuth();
  const [recent, setRecent] = useState([]);

  useEffect(() => { setRecent(getRecentlyWatched(12)); }, []);

  if (loading) return (
    <div className={styles.centred}><div className="spinner" /></div>
  );

  if (!user) return (
    <div className={styles.centred}>
      <div className={styles.loginCard}>
        <div className={styles.loginIcon}>🎌</div>
        <h1>Sign in to Animedex</h1>
        <p>Track your watch progress and sync with AniList</p>
        <button className={styles.loginBtn} onClick={login}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          Login with AniList
        </button>
        {recent.length > 0 && (
          <div className={styles.guestHistory}>
            <p>Your local watch history ({recent.length} anime)</p>
          </div>
        )}
      </div>
    </div>
  );

  const stats = user.statistics?.anime;

  return (
    <div className={styles.page}>
      {/* Profile header */}
      <div className={styles.profileHeader}>
        <div className={styles.avatar}>
          {user.avatar?.large
            ? <img src={user.avatar.large} alt={user.name} />
            : <span>{user.name?.[0]?.toUpperCase()}</span>
          }
        </div>
        <div className={styles.profileInfo}>
          <h1 className={styles.username}>{user.name}</h1>
          <p className={styles.anilistLink}>
            <a href={`https://anilist.co/user/${user.name}`} target="_blank" rel="noreferrer">
              View AniList Profile ↗
            </a>
          </p>
          {stats && (
            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statNum}>{stats.count || 0}</span>
                <span className={styles.statLabel}>Anime Watched</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNum}>{stats.episodesWatched || 0}</span>
                <span className={styles.statLabel}>Episodes</span>
              </div>
            </div>
          )}
          <button className={styles.logoutBtn} onClick={logout}>Sign Out</button>
        </div>
      </div>

      {/* Continue Watching */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className="section-title">Continue Watching</h2>
          {recent.length > 0 && (
            <button className={styles.clearBtn} onClick={() => {
              recent.forEach(r => clearProgress(r.animeId));
              setRecent([]);
            }}>Clear All</button>
          )}
        </div>
        {recent.length === 0 ? (
          <div className={styles.empty}>
            <p>No watch history yet. Start watching anime to see it here!</p>
            <Link href="/" className={styles.browseLink}>Browse Anime →</Link>
          </div>
        ) : (
          <div className={styles.recentGrid}>
            {recent.map(item => (
              <div key={item.animeId} className={styles.recentCard}>
                <Link href={`/watch/${item.animeId}/${item.epSlug}`}>
                  <div className={styles.recentPoster}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {item.poster && <img src={item.poster} alt={item.animeName} />}
                    <div className={styles.recentOverlay}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                    </div>
                    <div className={styles.recentEpBadge}>Ep {item.epNumber}</div>
                  </div>
                </Link>
                <div className={styles.recentInfo}>
                  <Link href={`/anime/${item.animeId}`} className={styles.recentTitle}>{item.animeName}</Link>
                  <p className={styles.recentEp}>
                    {item.epTitle ? `Ep ${item.epNumber} — ${item.epTitle}` : `Episode ${item.epNumber}`}
                  </p>
                  <div className={styles.recentActions}>
                    <Link href={`/watch/${item.animeId}/${item.epSlug}`} className={styles.resumeBtn}>
                      ▶ Resume
                    </Link>
                    <button className={styles.removeBtn} onClick={() => {
                      clearProgress(item.animeId);
                      setRecent(prev => prev.filter(r => r.animeId !== item.animeId));
                    }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
