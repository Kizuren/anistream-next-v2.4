"use client";
import styles from "./CharacterSection.module.css";

const ROLE_LABEL = {
  MAIN:       "Main",
  SUPPORTING: "Supporting",
  BACKGROUND: "Background",
};

export default function CharacterSection({ characters = [] }) {
  if (!characters.length) return null;

  return (
    <section className={styles.section}>
      <h2 className="section-title" style={{ marginBottom: 16 }}>Characters</h2>
      <div className={styles.grid}>
        {characters.map(c => (
          <div key={c.id} className={styles.card}>
            <div className={styles.imgWrap}>
              {c.image
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={c.image} alt={c.name} loading="lazy" />
                : <div className={styles.placeholder}>{c.name?.[0]}</div>
              }
              <span className={`${styles.roleBadge} ${c.role === "MAIN" ? styles.main : styles.supporting}`}>
                {ROLE_LABEL[c.role] || "Supporting"}
              </span>
            </div>
            <p className={styles.name}>{c.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
