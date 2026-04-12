"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  saveMediaListEntry,
  deleteMediaListEntry,
  getMediaListEntry,
  LIST_STATUS,
  STATUS_LABELS,
} from "@/lib/anilistClient";
import styles from "./AniListPanel.module.css";

/* ── Star rating (1–10 half-star) ─────────────────────────────────── */
function StarRating({ score, onChange, disabled }) {
  const [hover, setHover] = useState(0);
  // score is 0-100; display as 0-10 with 0.5 steps
  const display = score ? score / 10 : 0;
  const hoverDisplay = hover / 10;

  return (
    <div className={styles.stars} aria-label="Rating">
      {Array.from({ length: 10 }, (_, i) => {
        const val = i + 1; // 1-10
        const filled = (hoverDisplay || display) >= val;
        return (
          <button
            key={val}
            className={`${styles.star} ${filled ? styles.starFilled : ""}`}
            onMouseEnter={() => !disabled && setHover(val * 10)}
            onMouseLeave={() => !disabled && setHover(0)}
            onClick={() => !disabled && onChange(val === display ? 0 : val * 10)}
            aria-label={`Rate ${val}`}
            type="button"
          >★</button>
        );
      })}
      {display > 0 && (
        <span className={styles.scoreNum}>{display.toFixed(0)}/10</span>
      )}
    </div>
  );
}

/* ── Main panel ────────────────────────────────────────────────────── */
export default function AniListPanel({
  anilistId,       // number — the AniList media ID
  epNumber,        // current episode number (optional, from watch page)
  totalEpisodes,   // total episodes (optional)
  compact = false, // compact mode for info page sidebar
}) {
  const [entry,    setEntry]    = useState(null);   // current list entry
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(null);
  const [open,     setOpen]     = useState(false);
  const [authed,   setAuthed]   = useState(true);   // false = not logged in

  // Fetch current entry
  const load = useCallback(async () => {
    if (!anilistId) { setLoading(false); return; }
    try {
      const e = await getMediaListEntry(anilistId);
      setEntry(e);
    } catch (e) {
      if (e.message === "NOT_AUTHENTICATED") setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, [anilistId]);

  useEffect(() => { load(); }, [load]);

  async function save(patch) {
    setSaving(true); setError(null); setSuccess(null);
    try {
      await saveMediaListEntry({ mediaId: anilistId, ...patch });
      setSuccess("Saved to AniList ✓");
      setTimeout(() => setSuccess(null), 2500);
      // Reload entry
      const updated = await getMediaListEntry(anilistId);
      setEntry(updated);
    } catch (e) {
      if (e.message === "NOT_AUTHENTICATED") setAuthed(false);
      else setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!entry?.id || !confirm("Remove from your AniList?")) return;
    setSaving(true);
    try {
      await deleteMediaListEntry(entry.id);
      setEntry(null);
      setSuccess("Removed from AniList");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Sync episode progress from watch page
  function syncProgress() {
    if (!epNumber) return;
    save({ status: "CURRENT", progress: epNumber });
  }

  if (!authed) {
    return (
      <div className={`${styles.panel} ${compact ? styles.compact : ""}`}>
        <div className={styles.notAuthed}>
          <span className={styles.lockIcon}>🔐</span>
          <p>Sign in with AniList to track this anime</p>
          <a href="/api/auth/login" className={styles.signInBtn}>Sign in</a>
        </div>
      </div>
    );
  }

  if (!anilistId) return null;

  const currentStatus  = entry?.status || null;
  const currentScore   = entry?.score  || 0;
  const currentProg    = entry?.progress || 0;

  const statusIcon = {
    CURRENT:   "▶",
    PLANNING:  "📋",
    COMPLETED: "✓",
    DROPPED:   "✕",
    PAUSED:    "⏸",
    REPEATING: "↺",
  };

  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ""}`}>
      {/* Header button */}
      <motion.button
        className={`${styles.triggerBtn} ${currentStatus ? styles.triggerBtnActive : ""}`}
        onClick={() => setOpen(v => !v)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        disabled={loading}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
        </svg>
        {loading ? "Loading…" : currentStatus
          ? `${statusIcon[currentStatus]} ${STATUS_LABELS[currentStatus]}`
          : "+ Add to AniList"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
          style={{ marginLeft: "auto", opacity: 0.5, transform: open ? "rotate(180deg)" : "", transition: "transform .2s" }}>
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </motion.button>

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.dropdown}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Status buttons */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Status</p>
              <div className={styles.statusGrid}>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <motion.button
                    key={key}
                    className={`${styles.statusBtn} ${currentStatus === key ? styles.statusBtnActive : ""}`}
                    onClick={() => save({ status: key })}
                    disabled={saving}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    {statusIcon[key]} {label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Your Rating</p>
              <StarRating
                score={currentScore}
                onChange={score => save({ score })}
                disabled={saving}
              />
            </div>

            {/* Progress */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>
                Progress
                {totalEpisodes ? ` (${currentProg}/${totalEpisodes} eps)` : ` (${currentProg} eps)`}
              </p>
              <div className={styles.progressRow}>
                <button className={styles.progBtn} onClick={() => save({ progress: Math.max(0, currentProg - 1) })} disabled={saving || currentProg === 0}>−</button>
                <span className={styles.progNum}>{currentProg}</span>
                <button className={styles.progBtn} onClick={() => save({ progress: currentProg + 1 })} disabled={saving}>+</button>
                {epNumber && epNumber !== currentProg && (
                  <motion.button
                    className={styles.syncBtn}
                    onClick={syncProgress}
                    disabled={saving}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    ↑ Sync to Ep {epNumber}
                  </motion.button>
                )}
              </div>
            </div>

            {/* Feedback */}
            {(error || success) && (
              <p className={error ? styles.errorMsg : styles.successMsg}>
                {error || success}
              </p>
            )}

            {/* Remove */}
            {entry && (
              <button className={styles.removeBtn} onClick={remove} disabled={saving}>
                Remove from list
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
