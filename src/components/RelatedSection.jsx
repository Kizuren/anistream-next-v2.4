import Link from "next/link";
import styles from "./RelatedSection.module.css";

/**
 * RelatedSection — full-width responsive grid of anime cards.
 * Used on the Info page below the Characters section.
 * Consistent with the homepage card design (AnimeCard-like).
 */
export default function RelatedSection({ title, items = [], viewAllHref }) {
  if (!items.length) return null;

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

      <div className={styles.grid}>
        {items.map(anime => (
          <RelatedCard key={anime.id} anime={anime} />
        ))}
      </div>
    </section>
  );
}

function RelatedCard({ anime }) {
  const { id, name, poster, type, episodes } = anime;
  return (
    <Link href={`/anime/${id}`} className={styles.card}>
      <div className={styles.poster}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt={name} loading="lazy" />

        {/* Hover play overlay */}
        <div className={styles.overlay}>
          <span className={styles.playBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </span>
        </div>

        {/* Badges */}
        <div className={styles.badges}>
          {episodes?.sub > 0 && <span className="badge badge-sub">SUB</span>}
          {episodes?.dub > 0 && <span className="badge badge-dub">DUB</span>}
        </div>

        {type && <span className={styles.typeTag}>{type}</span>}
      </div>

      <div className={styles.info}>
        <h3 className={styles.title}>{name}</h3>
        <div className={styles.meta}>
          {episodes?.sub > 0 && <span>{episodes.sub} eps</span>}
          {type && <span className={styles.typeLabel}>{type}</span>}
        </div>
      </div>
    </Link>
  );
}
