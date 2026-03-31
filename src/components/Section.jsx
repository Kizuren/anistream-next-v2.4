import Link from "next/link";
import AnimeCard from "./AnimeCard";
import styles from "./Section.module.css";

export default function Section({
  title,
  animes = [],
  viewAllHref,
  ranked  = false,
  loading = false,
}) {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className="section-title">{title}</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className={styles.viewAll}>
            View All
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        )}
      </div>

      {loading ? (
        /* Skeleton grid */
        <div className={styles.row}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={styles.skelCard}>
              <div className={`skeleton ${styles.skelPoster}`} />
              <div className={`skeleton ${styles.skelLine}`}
                style={{ width: "80%", marginTop: 8 }} />
              <div className={`skeleton ${styles.skelLine}`}
                style={{ width: "50%", marginTop: 5 }} />
            </div>
          ))}
        </div>
      ) : animes.length === 0 ? (
        <div className={styles.empty}>
          <span>No data available</span>
          {viewAllHref && (
            <Link href={viewAllHref} className={styles.emptyLink}>Browse →</Link>
          )}
        </div>
      ) : (
        /* Responsive wrap grid — no more single-row scroll */
        <div className={styles.row}>
          {animes.map((a, i) => (
            <AnimeCard key={a.id || i} anime={a} rank={ranked ? i + 1 : null} />
          ))}
        </div>
      )}
    </section>
  );
}
