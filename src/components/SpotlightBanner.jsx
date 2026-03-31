"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./SpotlightBanner.module.css";

export default function SpotlightBanner({ spotlights = [], loading = false }) {
  const [idx, setIdx] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (spotlights.length < 2) return;
    const t = setInterval(() => {
      setTransitioning(true);
      setTimeout(() => { setIdx(i => (i + 1) % spotlights.length); setTransitioning(false); }, 300);
    }, 7000);
    return () => clearInterval(t);
  }, [spotlights.length]);

  function goTo(i) {
    if (i === idx) return;
    setTransitioning(true);
    setTimeout(() => { setIdx(i); setTransitioning(false); }, 250);
  }

  if (loading) return <div className={styles.skeleton} />;

  if (!spotlights.length) return (
    <div className={styles.empty}>
      <div className={styles.emptyContent}>
        <span className={styles.emptyLabel}>Welcome to</span>
        <h1 className={styles.emptyTitle}>Animedex</h1>
        <p className={styles.emptyDesc}>Stream anime in HD — sub &amp; dub, no account needed</p>
        <Link href="/browse?category=top-airing" className={styles.emptyBtn}>Browse Anime</Link>
      </div>
    </div>
  );

  const item = spotlights[idx];
  const desc = (item.description || "").replace(/<[^>]*>/g, "");

  return (
    <div className={styles.banner}>
      {/* Background */}
      <div
        className={`${styles.bg} ${transitioning ? styles.bgFade : ""}`}
        style={{ backgroundImage: `url(${item.banner || item.poster})` }}
      />
      <div className={styles.gradient} />

      {/* Thumbnail strip — left sidebar */}
      <div className={styles.thumbStrip}>
        {spotlights.slice(0, 6).map((s, i) => (
          <button
            key={s.id}
            className={`${styles.thumb} ${i === idx ? styles.thumbActive : ""}`}
            onClick={() => goTo(i)}
            aria-label={`Show ${s.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.poster} alt={s.name} />
            <div className={styles.thumbOverlay} />
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={`${styles.content} ${transitioning ? styles.contentFade : ""}`}>
        <div className={styles.metaRow}>
          {item.type && <span className={styles.typePill}>{item.type}</span>}
          {item.otherInfo?.slice(0, 2).map(t => (
            <span key={t} className={styles.infoPill}>{t}</span>
          ))}
        </div>

        <h1 className={styles.title}>{item.name}</h1>

        {desc && <p className={styles.desc}>{desc.slice(0, 220)}{desc.length > 220 ? "…" : ""}</p>}

        <div className={styles.episodeBadges}>
          {item.episodes?.sub > 0 && (
            <span className={styles.epBadge}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              {item.episodes.sub} Sub
            </span>
          )}
          {item.episodes?.dub > 0 && (
            <span className={`${styles.epBadge} ${styles.epBadgeDub}`}>
              {item.episodes.dub} Dub
            </span>
          )}
        </div>

        <div className={styles.actions}>
          <Link href={`/anime/${item.id}`} className={styles.watchBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            Watch Now
          </Link>
          <Link href={`/anime/${item.id}`} className={styles.detailsBtn}>Details</Link>
        </div>

        {/* Dot indicators */}
        <div className={styles.dots}>
          {spotlights.slice(0, 8).map((_, i) => (
            <button
              key={i}
              className={`${styles.dot} ${i === idx ? styles.dotActive : ""}`}
              onClick={() => goTo(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
