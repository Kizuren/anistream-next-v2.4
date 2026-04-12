"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import AnimeCard from "./AnimeCard";
import styles from "./BrowseClient.module.css";

const CATS = [
  { label: "Top Airing",       value: "top-airing",       icon: "🔥" },
  { label: "Most Popular",     value: "most-popular",      icon: "📈" },
  { label: "Most Favorite",    value: "most-favorite",     icon: "⭐" },
  { label: "Upcoming",         value: "upcoming",          icon: "📅" },
  { label: "Recently Updated", value: "recently-updated",  icon: "🕐" },
  { label: "Completed",        value: "completed",         icon: "✅" },
];

const GENRES = [
  "Action","Adventure","Comedy","Drama","Fantasy","Horror",
  "Mystery","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller",
];

function buildPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current, current - 1, current + 1].filter(p => p >= 1 && p <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out = []; let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p); prev = p;
  }
  return out;
}

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } }
};
const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] } }
};

export default function BrowseClient() {
  const sp     = useSearchParams();
  const router = useRouter();
  const cat    = sp.get("category") || "top-airing";
  const page   = parseInt(sp.get("page") || "1");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    setLoading(true); setError(null); setData(null);
    api.category(cat, page)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [cat, page]);

  function setCategory(c) { router.push(`/browse?category=${c}&page=1`); setSidebarOpen(false); }
  function goPage(p)       { router.push(`/browse?category=${cat}&page=${p}`); window.scrollTo({ top: 0 }); }

  const animes     = data?.animes || [];
  const totalPages = data?.totalPages || 1;
  const isGenre    = cat.startsWith("genre/");
  const genreSlug  = isGenre ? cat.replace("genre/", "") : null;
  const activeLabel = isGenre
    ? genreSlug?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : CATS.find(c => c.value === cat)?.label || cat;

  return (
    <div className={`container ${styles.page}`}>

      {/* Mobile filter toggle */}
      <button className={styles.filterToggle} onClick={() => setSidebarOpen(v => !v)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/>
        </svg>
        {sidebarOpen ? "Hide Filters" : "Filters"}
      </button>

      <div className={styles.layout}>

        {/* ── Sidebar ── */}
        <AnimatePresence>
          {(true) && (
            <motion.aside
              className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
              initial={false}
            >
              {/* Categories */}
              <div className={styles.sideBlock}>
                <p className={styles.sideLabel}>
                  <span className={styles.sideLabelAccent} />
                  Categories
                </p>
                <ul className={styles.catList}>
                  {CATS.map(c => (
                    <li key={c.value}>
                      <motion.button
                        className={`${styles.catBtn} ${c.value === cat ? styles.catActive : ""}`}
                        onClick={() => setCategory(c.value)}
                        whileHover={{ x: 3 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <span className={styles.catIcon}>{c.icon}</span>
                        {c.label}
                        {c.value === cat && <span className={styles.catActiveDot} />}
                      </motion.button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Genres */}
              <div className={styles.sideBlock}>
                <p className={styles.sideLabel}>
                  <span className={styles.sideLabelAccent} />
                  Genres
                </p>
                <div className={styles.genreGrid}>
                  {GENRES.map(g => {
                    const slug = `genre/${g.toLowerCase().replace(/ /g, "-")}`;
                    return (
                      <motion.button
                        key={g}
                        className={`${styles.genreBtn} ${cat === slug ? styles.genreActive : ""}`}
                        onClick={() => setCategory(slug)}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                      >
                        {g}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Main ── */}
        <div className={styles.main}>

          {/* Header */}
          <div className={styles.mainHeader}>
            <div className={styles.mainTitleWrap}>
              <span className={styles.mainTitleAccent} />
              <h1 className={styles.mainTitle}>{activeLabel}</h1>
            </div>
            {!loading && animes.length > 0 && (
              <span className={styles.resultCount}>
                {data?.totalPages && `Page ${page} of ${data.totalPages}`}
              </span>
            )}
          </div>

          {/* Error */}
          {error && !loading && (
            <div className={styles.errMsg}>
              <p>⚠ {error}</p>
              <button onClick={() => window.location.reload()}>Retry</button>
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className={styles.grid}>
              {Array.from({ length: 20 }).map((_, i) => (
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
              key={`${cat}-${page}`}
              variants={gridVariants}
              initial="hidden"
              animate="show"
            >
              {animes.map(anime => (
                <motion.div key={anime.id} variants={cardVariants}>
                  <AnimeCard anime={anime} />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className={styles.pagination}>
              <motion.button
                className={styles.pageBtn}
                disabled={page === 1}
                onClick={() => goPage(page - 1)}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
              >← Prev</motion.button>

              {buildPages(page, totalPages).map((p, i) =>
                p === "…"
                  ? <span key={`ellipsis-${i}`} className={styles.ellipsis}>…</span>
                  : (
                    <motion.button
                      key={p}
                      className={`${styles.pageNum} ${p === page ? styles.pageNumActive : ""}`}
                      onClick={() => goPage(p)}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                    >{p}</motion.button>
                  )
              )}

              <motion.button
                className={styles.pageBtn}
                disabled={page === totalPages}
                onClick={() => goPage(page + 1)}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
              >Next →</motion.button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
