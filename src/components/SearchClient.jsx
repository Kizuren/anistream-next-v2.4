"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import AnimeGrid from "./AnimeGrid";
import styles from "./SearchClient.module.css";

function buildPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current, current-1, current+1].filter(p => p >= 1 && p <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out = []; let prev = 0;
  for (const p of sorted) { if (p - prev > 1) out.push("…"); out.push(p); prev = p; }
  return out;
}

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

  function goPage(p) { router.push(`/search?q=${encodeURIComponent(q)}&page=${p}`); }

  const animes     = data?.animes || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div className={`container ${styles.page}`}>
      {/* Search bar */}
      <div className={styles.searchHeader}>
        <h1 className={styles.heading}>Search Anime</h1>
        <form className={styles.bar} onSubmit={handleSubmit}>
          <div className={styles.inputWrap}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Search anime titles…"
              autoFocus
            />
            {input && (
              <button type="button" className={styles.clearBtn}
                onClick={() => { setInput(""); router.push("/search"); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          <button type="submit" className={styles.submitBtn}>Search</button>
        </form>
      </div>

      {/* Empty state */}
      {!q && !loading && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIconWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <h2>Find your next anime</h2>
          <p>Type a title above to search from thousands of anime</p>
          <div className={styles.suggestRow}>
            {["Solo Leveling", "Demon Slayer", "Frieren", "One Piece"].map(s => (
              <button key={s} className={styles.suggestChip}
                onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.skelGrid}>
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--r-lg)" }} />
              <div className="skeleton" style={{ height: 10, marginTop: 8, borderRadius: 3, width: "80%" }} />
            </div>
          ))}
        </div>
      )}

      {error && <div className={styles.errorMsg}>⚠ {error}</div>}

      {!loading && data && (
        <>
          <p className={styles.resultMeta}>
            {animes.length === 0
              ? `No results for "${q}"`
              : `"${q}" — ${animes.length} result${animes.length !== 1 ? "s" : ""}`}
          </p>
          {animes.length > 0 && <AnimeGrid animes={animes} />}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pgBtn} disabled={page <= 1} onClick={() => goPage(page-1)}>← Prev</button>
              {buildPages(page, totalPages).map((p, i) =>
                p === "…"
                  ? <span key={`e${i}`} className={styles.ellipsis}>…</span>
                  : <button key={p} className={`${styles.pgBtn} ${p === page ? styles.pgActive : ""}`} onClick={() => goPage(p)}>{p}</button>
              )}
              <button className={styles.pgBtn} disabled={page >= totalPages} onClick={() => goPage(page+1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
