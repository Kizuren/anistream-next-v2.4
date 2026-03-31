import AnimeCard from "./AnimeCard";
import styles from "./AnimeGrid.module.css";

export default function AnimeGrid({ animes = [], ranked = false }) {
  return (
    <div className={styles.grid}>
      {animes.map((a, i) => (
        <AnimeCard key={a.id || i} anime={a} rank={ranked ? i + 1 : null} />
      ))}
    </div>
  );
}
