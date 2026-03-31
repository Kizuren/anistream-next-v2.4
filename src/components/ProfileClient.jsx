"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getRecentlyWatched } from "@/lib/auth";
import styles from "./ProfileClient.module.css";

export default function ProfileClient() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [recent,  setRecent]  = useState([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => { setUser(d.user); setLoading(false); })
      .catch(() => setLoading(false));
    setRecent(getRecentlyWatched(12));
  }, []);

  if (loading) return (
    <div className={styles.center}><div className="spinner" /></div>
  );

  if (!user) return (
    <div className={styles.center}>
      <div className={styles.loginPrompt}>
        <span className={styles.loginIcon}>🔐</span>
        <h2>Sign in to Animedex</h2>
        <p>Log in with your AniList account to track your watch history and access your profile.</p>
        <a href="/api/auth/login" className={styles.loginBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          Login with AniList
        </a>
        {recent.length > 0 && (
          <p className={styles.localNote}>Your local watch history is shown below.</p>
        )}
      </div>
    </div>
  );

  const stats = user.statistics?.anime;

  return (
    <div className={`container ${styles.page}`}>
      {/* Profile header */}
      <div className={styles.header}>
        {user.bannerImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.bannerImage} alt="" className={styles.banner} />
        )}
        <div className={styles.headerContent}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user.avatar?.large} alt={user.name} className={styles.avatar} />
          <div className={styles.userInfo}>
            <h1 className={styles.username}>{user.name}</h1>
            {user.about && (
              <p className={styles.about}
                dangerouslySetInnerHTML={{ __html: user.about.replace(/<[^>]*>/g,"").slice(0,200) }}
              />
            )}
            <a href={user.siteUrl} target="_blank" rel="noreferrer" className={styles.anilistLink}>
              View on AniList ↗
            </a>
          </div>
          <a href="/api/auth/logout" className={styles.logoutBtn}>Logout</a>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className={styles.statsGrid}>
          <StatCard label="Anime Watched"    value={stats.count || 0} />
          <StatCard label="Episodes Watched" value={stats.episodesWatched || 0} />
          <StatCard label="Days Watched"     value={Math.round((stats.minutesWatched||0)/1440)} />
          <StatCard label="Mean Score"       value={stats.meanScore ? `${stats.meanScore}%` : "N/A"} />
        </div>
      )}

      {/* Top genres */}
      {stats?.genres?.length > 0 && (
        <div className={styles.section}>
          <h2 className="section-title">Top Genres</h2>
          <div className={styles.genres}>
            {stats.genres.map(g => (
              <Link key={g.genre} href={`/browse?category=genre/${g.genre.toLowerCase()}`}
                className={styles.genreTag}>
                {g.genre} <span>{g.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Continue watching */}
      {recent.length > 0 && <ContinueWatching items={recent} />}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:"20px 24px", textAlign:"center" }}>
      <p style={{ fontFamily:"var(--font-display)", fontSize:"clamp(24px,4vw,36px)", fontWeight:"800", color:"var(--accent)" }}>{value}</p>
      <p style={{ fontSize:"13px", color:"var(--text-3)", marginTop:"4px" }}>{label}</p>
    </div>
  );
}

function ContinueWatching({ items }) {
  const { styles: s } = { styles };
  return (
    <div style={{ marginTop:"40px" }}>
      <h2 className="section-title" style={{ marginBottom:"18px" }}>Continue Watching</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"16px" }}>
        {items.map(item => (
          <Link key={item.animeId} href={`/watch/${item.animeId}/${item.epSlug}`}
            style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--r-md)", overflow:"hidden", display:"block", transition:"transform .2s, box-shadow .2s", textDecoration:"none" }}
            onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 12px 32px rgba(0,0,0,.5)"}}
            onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=""}}>
            {item.poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.poster} alt={item.animeTitle} style={{ width:"100%", aspectRatio:"2/3", objectFit:"cover", display:"block" }} />
            )}
            <div style={{ padding:"10px" }}>
              <p style={{ fontSize:"12.5px", fontWeight:"600", color:"var(--text-1)", overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", marginBottom:"4px" }}>
                {item.animeTitle}
              </p>
              <p style={{ fontSize:"11px", color:"var(--accent)" }}>Episode {item.epNumber}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
