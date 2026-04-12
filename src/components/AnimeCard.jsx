"use client";
import { useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { prefetch } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import styles from "./AnimeCard.module.css";

export default function AnimeCard({ anime, rank }) {
  if (!anime?.id) return null;
  const { id, name, poster, type, episodes, rating } = anime;
  const cardRef = useRef(null);

  // NOTE: Viewport-based prefetch removed intentionally.
  // When a full grid (20+ cards) scrolls into view at once, it fires 20
  // simultaneous AniList API calls → immediate 429 rate-limit blocks.
  // Prefetch is kept on hover only — that's intentional user interest
  // and fires at a safe rate (one card at a time).

  return (
    <motion.div
      ref={cardRef}
      className={styles.cardWrapper}
      whileHover="hover"
      initial="rest"
    >
      <Link
        href={`/anime/${id}`}
        className={styles.card}
        onMouseEnter={() => prefetch(`info:${id}`, () => api.info(id), 300)}
      >
        <div className={styles.poster}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img
            src={poster}
            alt={name}
            loading="lazy"
            decoding="async"
            variants={{ hover: { scale: 1.07 }, rest: { scale: 1 } }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Blood glow overlay on hover */}
          <motion.div
            className={styles.glowOverlay}
            variants={{ hover: { opacity: 1 }, rest: { opacity: 0 } }}
            transition={{ duration: 0.3 }}
          />

          {/* Play button */}
          <motion.div
            className={styles.playRing}
            variants={{
              hover: { opacity: 1, scale: 1, y: 0 },
              rest:  { opacity: 0, scale: 0.8, y: 6 }
            }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </motion.div>

          {rank && (
            <span className={styles.rank}>
              <span className={styles.rankHash}>#</span>{rank}
            </span>
          )}

          <div className={styles.badges}>
            {(episodes?.sub > 0) && <span className="badge badge-sub">SUB</span>}
            {(episodes?.dub > 0) && <span className="badge badge-dub">DUB</span>}
          </div>

          {type && <span className={styles.typeTag}>{type}</span>}
        </div>

        <div className={styles.info}>
          <h3 className={styles.title}>{name}</h3>
          <div className={styles.meta}>
            {episodes?.sub > 0 && <span className={styles.eps}>{episodes.sub} eps</span>}
            {rating && <span className={styles.rating}>★ {rating}</span>}
          </div>
        </div>

        {/* Bottom glow line on hover */}
        <motion.div
          className={styles.bottomLine}
          variants={{ hover: { scaleX: 1, opacity: 1 }, rest: { scaleX: 0, opacity: 0 } }}
          transition={{ duration: 0.35 }}
        />
      </Link>
    </motion.div>
  );
}
