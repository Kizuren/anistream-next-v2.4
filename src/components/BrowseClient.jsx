"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import AnimeGrid from "./AnimeGrid";
import styles from "./BrowseClient.module.css";

const CATS = [
  { label: "Top Airing",       value: "top-airing",       icon: "🔥" },
  { label: "Most Popular",     value: "most-popular",     icon: "📈" },
  { label: "Most Favorite",    value: "most-favorite",    icon: "⭐" },
  { label: "Upcoming",         value: "upcoming",         icon: "📅" },
  { label: "Recently Updated", value: "recently-updated", icon: "🕐" },
  { label: "Completed",        value: "completed",        icon: "✅" },
];

const GENRES = [
  "Action","Adventure","Comedy","Drama","Fantasy","Horror",
  "Mystery","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller",
];

function buildPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current, current-1, current+1].filter(p => p >= 1 && p <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out = []; let prev = 0;
  for (const p of sorted) { if (p - prev > 1) out.push("…"); out.push(p); prev = p; }
  return out;
}

export default function BrowseClient() {
  const sp     = useSearchParams();
  const router = useRouter();
  const cat    = sp.get("category") || "top-airing";
  const page   = parseInt(sp.get("page") || "1");

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true); setError(null); setData(null);
    api.category(cat, page)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [cat, page]);

  function setCategory(c) { router.push(`/browse?category=${c}&page=1`); }
  function goPage(p)       { router.push(`/browse?category=${cat}&page=${p}`); }

  const animes     = data?.animes || [];
  const totalPages = data?.totalPages || 1;

  const isGenre   = cat.startsWith("genre/");
  const genreSlug = isGenre ? cat.replace("genre/", "") : null;

  const activeLabel = isGenre
    ? genreSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : CATS.find(c => c.value === cat)?.label || cat;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.layout}>
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className={styles.sidebar}>
          <div className={styles.sideBlock}>
            <p className={styles.sideGroupLabel}>Categories</p>
            <ul className={styles.catList}>
              {CATS.map(c => (
                <li key={c.value}>
                  <button
                    className={`${styles.catBtn} ${c.value === cat ? styles.catActive : ""}`}
                    onClick={() => setCategory(c.value)}>
                    <span className={styles.catIcon}>{c.icon}</span>
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.sideBlock}>
            <p className={styles.sideGroupLabel}>Genres</p>
            <ul className={styles.catList}>
              {GENRES.map(g => {
                const v = `genre/${g.toLowerCase().replace(/ /g, "-")}`;
                return (
                  <li key={v}>
                    <button
                      className={`${styles.catBtn} ${cat === v ? styles.catActive : ""}`}
                      onClick={() => setCategory(v)}>
                      {g}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────── */}
        <div className={styles.main}>
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>{activeLabel}</h1>
              {data && <p className={styles.pageCount}>{animes.length} titles · page {page}</p>}
            </div>
          </div>

          {error && <div className={styles.errorMsg}>⚠ {error}</div>}

          {loading ? (
            <div className={styles.skelGrid}>
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i}>
                  <div className="skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--r-lg)" }} />
                  <div className="skeleton" style={{ height: 10, marginTop: 8, borderRadius: 3, width: "80%" }} />
                  <div className="skeleton" style={{ height: 9, marginTop: 5, borderRadius: 3, width: "50%" }} />
                </div>
              ))}
            </div>
          ) : <AnimeGrid animes={animes} />}

          {!loading && totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pgBtn} disabled={page <= 1}
                onClick={() => goPage(page - 1)}>← Prev</button>
              {buildPages(page, totalPages).map((p, i) =>
                p === "…"
                  ? <span key={`e${i}`} className={styles.ellipsis}>…</span>
                  : <button key={p}
                      className={`${styles.pgBtn} ${p === page ? styles.pgActive : ""}`}
                      onClick={() => goPage(p)}>{p}</button>
              )}
              <button className={styles.pgBtn} disabled={page >= totalPages}
                onClick={() => goPage(page + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
