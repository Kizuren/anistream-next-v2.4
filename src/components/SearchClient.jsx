"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import AnimeCard from "./AnimeCard";
import styles from "./SearchClient.module.css";

function buildPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current, current - 1, current + 1].filter(p => p >= 1 && p <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out = []; let prev = 0;
  for (const p of sorted) { if (p - prev > 1) out.push("…"); out.push(p); prev = p; }
  return out;
}

const SUGGESTIONS = ["Naruto", "Attack on Titan", "Demon Slayer", "One Piece", "Jujutsu Kaisen"];

export default function SearchClient() {
  const sp     = useSearchParams();
  const router = useRouter();
  const q      = sp.get("q") || "";
  const page   = parseInt(sp.get("page") || "1");

  const [input,   setInput]   = useState(q);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => { setInput(q); }, [q]);

  useEffect(() => {
    if (!q.trim()) { setData(null); return; }
    setLoading(true); setError(null);
    api.search(q, page)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [q, page]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    router.push(`/search?q=${encodeURIComponent(input.trim())}&page=1`);
  }

  function goPage(p) { router.push(`/search?q=${encodeURIComponent(q)}&page=${p}`); window.scrollTo({ top: 0 }); }

  const animes     = data?.animes || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div className={`container ${styles.page}`}>

      {/* Search hero */}
      <motion.div
        className={styles.searchHero}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className={styles.heroLabel}>Search the Abyss</p>
        <h1 className={styles.heroTitle}>Find Your Anime</h1>

        <form className={styles.searchBar} onSubmit={handleSubmit}>
          <div className={styles.inputWrap}>
            <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Search by title, genre, or studio…"
              autoFocus
            />
            {input && (
              <button type="button" className={styles.clearBtn} onClick={() => setInput("")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
          <motion.button
            type="submit"
            className={styles.searchBtn}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.97 }}
          >
            Search
          </motion.button>
        </form>

        {/* Quick suggestions — only shown when no query */}
        {!q && (
          <motion.div
            className={styles.suggestions}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className={styles.sugLabel}>Try:</span>
            {SUGGESTIONS.map(s => (
              <motion.button
                key={s}
                className={styles.sugBtn}
                onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}
                whileHover={{ scale: 1.05, y: -1 }}
                whileTap={{ scale: 0.95 }}
              >{s}</motion.button>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            className={styles.grid}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard}>
                <div className={`skeleton ${styles.skeletonPoster}`} />
                <div className={styles.skeletonInfo}>
                  <div className={`skeleton ${styles.skeletonTitle}`} />
                  <div className={`skeleton ${styles.skeletonMeta}`} />
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {error && !loading && (
          <motion.div key="error" className={styles.emptyState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className={styles.emptyIcon}>⚠</p>
            <p className={styles.emptyText}>{error}</p>
          </motion.div>
        )}

        {!loading && !error && q && animes.length === 0 && (
          <motion.div key="empty" className={styles.emptyState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className={styles.emptyIcon}>🔍</p>
            <p className={styles.emptyTitle}>Nothing found in the abyss</p>
            <p className={styles.emptyText}>Try a different title or check your spelling.</p>
          </motion.div>
        )}

        {!loading && animes.length > 0 && (
          <motion.div
            key={`${q}-${page}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className={styles.resultsHeader}>
              <span className={styles.resultsCount}>
                {data?.totalPages && `Page ${page} of ${data.totalPages} · `}
                Results for <strong>&ldquo;{q}&rdquo;</strong>
              </span>
            </div>

            <div className={styles.grid}>
              {animes.map((anime, i) => (
                <motion.div
                  key={anime.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.35 }}
                >
                  <AnimeCard anime={anime} />
                </motion.div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button className={styles.pageBtn} disabled={page === 1} onClick={() => goPage(page - 1)}>← Prev</button>
                {buildPages(page, totalPages).map((p, i) =>
                  p === "…"
                    ? <span key={`e-${i}`} className={styles.ellipsis}>…</span>
                    : <button key={p} className={`${styles.pageNum} ${p === page ? styles.pageNumActive : ""}`} onClick={() => goPage(p)}>{p}</button>
                )}
                <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => goPage(page + 1)}>Next →</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
