import Link from "next/link";
import styles from "./AnimeCard.module.css";

export default function AnimeCard({ anime, rank }) {
  if (!anime?.id) return null;
  const { id, name, poster, type, episodes, duration, rating } = anime;
  return (
    <Link href={`/anime/${id}`} className={styles.card}>
      <div className={styles.poster}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt={name} loading="lazy" />
        {rank && <span className={styles.rank}>#{rank}</span>}
        <div className={styles.overlay}>
          <span className={styles.playBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </span>
        </div>
        <div className={styles.badges}>
          {(episodes?.sub > 0) && <span className="badge badge-sub">SUB</span>}
          {(episodes?.dub > 0) && <span className="badge badge-dub">DUB</span>}
        </div>
        {type && <span className={styles.typeTag}>{type}</span>}
      </div>
      <div className={styles.info}>
        <h3 className={styles.title}>{name}</h3>
        <div className={styles.meta}>
          {episodes?.sub > 0 && <span>{episodes.sub} eps</span>}
          {rating && <span className={styles.rating}>★ {rating}</span>}
        </div>
      </div>
    </Link>
  );
}
