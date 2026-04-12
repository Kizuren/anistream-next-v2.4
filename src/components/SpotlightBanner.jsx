"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./SpotlightBanner.module.css";

/* Floating particle embers */
function Ember({ index }) {
  const x    = (index * 137.5) % 100;
  const size = 1.5 + (index % 3) * 1.2;
  const dur  = 8 + (index % 5) * 2;
  const del  = (index * 0.7) % dur;
  return (
    <motion.div
      className={styles.ember}
      style={{ left: `${x}%`, width: size, height: size }}
      animate={{
        y: [0, -120, -200],
        opacity: [0, 0.7, 0],
        scale: [1, 0.8, 0.3],
      }}
      transition={{
        duration: dur,
        delay: del,
        repeat: Infinity,
        ease: "easeOut",
      }}
    />
  );
}

export default function SpotlightBanner({ spotlights = [], loading = false }) {
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    if (spotlights.length < 2) return;
    const t = setInterval(() => {
      setDir(1);
      setIdx(i => (i + 1) % spotlights.length);
    }, 8000);
    return () => clearInterval(t);
  }, [spotlights.length]);

  function goTo(i) {
    if (i === idx) return;
    setDir(i > idx ? 1 : -1);
    setIdx(i);
  }

  if (loading) return <div className={styles.skeleton} />;

  if (!spotlights.length) return (
    <div className={styles.empty}>
      <div className={styles.emptyContent}>
        <motion.span
          className={styles.emptyLabel}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >Descend into</motion.span>
        <motion.h1
          className={styles.emptyTitle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >AnimeDex</motion.h1>
        <motion.p
          className={styles.emptyDesc}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >Stream anime in HD — sub &amp; dub, no soul required</motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Link href="/browse?category=top-airing" className="btn-primary">Begin the Journey</Link>
        </motion.div>
      </div>
    </div>
  );

  const item = spotlights[idx];
  const desc = (item.description || "").replace(/<[^>]*>/g, "");

  const slideVariants = {
    enter: (d) => ({ opacity: 0, x: d > 0 ? 60 : -60 }),
    center: { opacity: 1, x: 0 },
    exit:  (d) => ({ opacity: 0, x: d > 0 ? -60 : 60 }),
  };

  return (
    <div className={styles.banner}>
      {/* Ambient embers */}
      <div className={styles.embers} aria-hidden>
        {Array.from({ length: 12 }, (_, i) => <Ember key={i} index={i} />)}
      </div>

      {/* Background image */}
      <AnimatePresence mode="sync">
        <motion.div
          key={`bg-${idx}`}
          className={styles.bg}
          style={{ backgroundImage: `url(${item.banner || item.poster})` }}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1.0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </AnimatePresence>

      {/* Layered gradients */}
      <div className={styles.gradientBottom} />
      <div className={styles.gradientLeft}   />
      <div className={styles.gradientTop}    />
      {/* Blood vignette */}
      <div className={styles.vignette}       />

      {/* Thumbnail strip */}
      <div className={styles.thumbStrip}>
        {spotlights.slice(0, 6).map((s, i) => (
          <motion.button
            key={s.id}
            className={`${styles.thumb} ${i === idx ? styles.thumbActive : ""}`}
            onClick={() => goTo(i)}
            whileHover={{ scale: 1.05, x: 3 }}
            whileTap={{ scale: 0.96 }}
            aria-label={`Show ${s.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.poster} alt={s.name} />
            <div className={styles.thumbOverlay} />
            {i === idx && <motion.div className={styles.thumbBorder} layoutId="thumbborder" />}
          </motion.button>
        ))}
      </div>

      {/* Main content */}
      <div className={styles.content}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={`content-${idx}`}
            className={styles.contentInner}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Meta pills */}
            <div className={styles.metaRow}>
              {item.rank && (
                <span className={styles.rankPill}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  #{item.rank}
                </span>
              )}
              {item.type    && <span className={styles.typePill}>{item.type}</span>}
              {item.otherInfo?.slice(0, 2).map(t => (
                <span key={t} className={styles.infoPill}>{t}</span>
              ))}
            </div>

            {/* Title */}
            <h1 className={styles.title}>{item.name}</h1>

            {/* Description */}
            {desc && (
              <p className={styles.desc}>
                {desc.slice(0, 200)}{desc.length > 200 ? "…" : ""}
              </p>
            )}

            {/* Episode counts */}
            <div className={styles.episodeBadges}>
              {item.episodes?.sub > 0 && (
                <span className={styles.epBadge}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  {item.episodes.sub} Sub
                </span>
              )}
              {item.episodes?.dub > 0 && (
                <span className={`${styles.epBadge} ${styles.epBadgeDub}`}>
                  {item.episodes.dub} Dub
                </span>
              )}
            </div>

            {/* CTAs */}
            <div className={styles.actions}>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link href={`/anime/${item.id}`} className={styles.watchBtn}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  Watch Now
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link href={`/anime/${item.id}`} className={styles.detailsBtn}>Details</Link>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Dot indicators */}
        <div className={styles.dots}>
          {spotlights.slice(0, 6).map((_, i) => (
            <motion.button
              key={i}
              className={`${styles.dot} ${i === idx ? styles.dotActive : ""}`}
              onClick={() => goTo(i)}
              whileHover={{ scale: 1.3 }}
              whileTap={{ scale: 0.9 }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
