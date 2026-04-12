"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import AnimeCard from "./AnimeCard";
import styles from "./Section.module.css";

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
};

export default function Section({ title, animes = [], ranked = false, viewAllHref, loading = false }) {
  if (!loading && !animes.length) return null;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <span className={styles.titleAccent} />
          <h2 className={`section-title ${styles.title}`}>{title}</h2>
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className={styles.viewAll}>
            View All
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        )}
      </div>

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={`skeleton ${styles.skeletonPoster}`} />
              <div className={styles.skeletonInfo}>
                <div className={`skeleton ${styles.skeletonTitle}`} />
                <div className={`skeleton ${styles.skeletonMeta}`} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <motion.div
          className={styles.grid}
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          {animes.map((anime, i) => (
            <motion.div key={anime.id} variants={itemVariants}>
              <AnimeCard anime={anime} rank={ranked ? i + 1 : undefined} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
