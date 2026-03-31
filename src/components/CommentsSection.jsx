"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./CommentsSection.module.css";

/**
 * CommentsSection
 *
 * Strategy (most-to-least reliable):
 *  1. TheAnimeCommunity embed  — appended into a stable div BEFORE the script loads
 *  2. Disqus embed             — fallback if TAC fails or DISQUS shortname is set
 *  3. Error state              — retry button
 *
 * Root cause of the original bug:
 *  The script was appended INSIDE the `containerRef` div (which was also the
 *  target element with id="anime-community-comment-section"). The TAC script
 *  looks for that id on load — but since the script *is inside* the element,
 *  some browsers parse the DOM in a way that confuses the embed. Fix: keep the
 *  target div clean; append the script to <body> instead.
 */

const TAC_SCRIPT_ID   = "tac-embed-script";
const DISQUS_SCRIPT_ID = "dsq-embed-scr";

function buildTACConfig(anilistId, malId, epNumber) {
  const cfg = {
    episodeChapterNumber: String(epNumber ?? 1),
    mediaType: "anime",
    colorScheme: {
      backgroundColor:    "#0d0f17",
      primaryColor:       "#6c6ef7",
      strongTextColor:    "#edeef5",
      primaryTextColor:   "#edeef5",
      secondaryTextColor: "#8a92a8",
      dropDownTextColor:  "#edeef5",
      iconColor:          "#8a92a8",
      accentColor:        "rgba(108,110,247,0.35)",
    },
    removeBorderStyling: true,
  };
  if (anilistId) cfg.AniList_ID = String(anilistId);
  if (malId)     cfg.MAL_ID     = String(malId);
  return cfg;
}

export default function CommentsSection({
  animeId,
  animeName,
  epSlug,
  epNumber,
  malId,
  anilistId,
}) {
  const [enabled,  setEnabled]  = useState(false);
  const [status,   setStatus]   = useState("idle"); // idle | loading | loaded | error
  const [provider, setProvider] = useState("tac");  // tac | disqus

  // The TAC embed target — must be a stable, clean div (no script children)
  const tacRef    = useRef(null);
  // We track whether a script is already injected to avoid duplicates
  const injected  = useRef(false);

  // Resolved AniList numeric id from slug like "one-piece-100"
  const resolvedAnilistId = anilistId
    || (animeId ? animeId.match(/-(\d+)$/)?.[1] : null);

  // Reset when the episode changes
  useEffect(() => {
    setEnabled(false);
    setStatus("idle");
    injected.current = false;

    // Clean up any previously injected TAC script
    document.getElementById(TAC_SCRIPT_ID)?.remove();
    delete window.theAnimeCommunityConfig;
  }, [animeId, epSlug]);

  /* ─────────────────────────────────────────────────────────
     TAC loader
     Key fix: append script to document.body, NOT inside the
     target div. The embed script then finds the div by its id.
  ───────────────────────────────────────────────────────── */
  const loadTAC = useCallback(() => {
    if (injected.current) return;
    injected.current = true;
    setStatus("loading");

    window.theAnimeCommunityConfig = buildTACConfig(
      resolvedAnilistId, malId, epNumber
    );

    const script    = document.createElement("script");
    script.id       = TAC_SCRIPT_ID;
    script.src      = "https://theanimecommunity.com/embed.js";
    script.async    = true;

    script.onload = () => setStatus("loaded");
    script.onerror = () => {
      // TAC failed → automatically try Disqus if configured
      injected.current = false;
      const shortname = process.env.NEXT_PUBLIC_DISQUS_SHORTNAME;
      if (shortname) {
        setProvider("disqus");
        loadDisqus(shortname);
      } else {
        setStatus("error");
      }
    };

    // ✅ Append to body — not inside the target div
    document.body.appendChild(script);
  }, [resolvedAnilistId, malId, epNumber]);

  /* ─────────────────────────────────────────────────────────
     Disqus fallback loader
  ───────────────────────────────────────────────────────── */
  const loadDisqus = useCallback((shortname) => {
    if (!shortname) { setStatus("error"); return; }
    setStatus("loading");

    window.disqus_config = function () {
      this.page.url        = window.location.href;
      this.page.identifier = `${animeId}-${epSlug}`;
      this.page.title      = animeName
        ? `${animeName} Episode ${epNumber}`
        : `Episode ${epNumber}`;
    };

    // Remove old Disqus script if present
    document.getElementById(DISQUS_SCRIPT_ID)?.remove();

    const script  = document.createElement("script");
    script.id     = DISQUS_SCRIPT_ID;
    script.src    = `https://${shortname}.disqus.com/embed.js`;
    script.async  = true;
    script.setAttribute("data-timestamp", Date.now());

    script.onload  = () => setStatus("loaded");
    script.onerror = () => setStatus("error");

    document.body.appendChild(script);
  }, [animeId, epSlug, animeName, epNumber]);

  /* ─────────────────────────────────────────────────────────
     Master load handler — called when user clicks the button
  ───────────────────────────────────────────────────────── */
  function handleLoad() {
    setEnabled(true);
    const disqusShortname = process.env.NEXT_PUBLIC_DISQUS_SHORTNAME;

    // If only Disqus is configured (no TAC), go straight there
    if (!resolvedAnilistId && !malId && disqusShortname) {
      setProvider("disqus");
      loadDisqus(disqusShortname);
    } else {
      setProvider("tac");
      loadTAC();
    }
  }

  function handleRetry() {
    injected.current = false;
    document.getElementById(TAC_SCRIPT_ID)?.remove();
    document.getElementById(DISQUS_SCRIPT_ID)?.remove();
    delete window.theAnimeCommunityConfig;
    setStatus("loading");

    if (provider === "disqus") {
      loadDisqus(process.env.NEXT_PUBLIC_DISQUS_SHORTNAME);
    } else {
      loadTAC();
    }
  }

  return (
    <section className={styles.section} aria-label="Episode comments">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.icon} aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
          <h2 className={styles.title}>Discussion</h2>
          {epNumber && (
            <span className={styles.epBadge}>Episode {epNumber}</span>
          )}
        </div>
        {enabled && status === "loaded" && (
          <span className={styles.poweredBy}>
            via&nbsp;
            <a
              href={provider === "tac" ? "https://theanimecommunity.com" : "https://disqus.com"}
              target="_blank" rel="noreferrer noopener"
              className={styles.poweredLink}>
              {provider === "tac" ? "TheAnimeCommunity" : "Disqus"}
            </a>
          </span>
        )}
      </div>

      {/* ── Not yet enabled — show load prompt ─────────────── */}
      {!enabled ? (
        <div className={styles.prompt}>
          <div className={styles.promptGlow} aria-hidden="true" />
          <div className={styles.promptIcon} aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <path d="M8 10h8M8 14h5" strokeLinecap="round"/>
            </svg>
          </div>
          <p className={styles.promptText}>
            Join the discussion{animeName ? ` for ${animeName}` : ""}
          </p>
          <p className={styles.promptSub}>
            Share your thoughts, reactions &amp; theories for Episode {epNumber}
          </p>
          <button
            className={styles.loadBtn}
            onClick={handleLoad}
            aria-label="Load comments section"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Load Comments
          </button>
        </div>
      ) : (
        <div className={styles.embedWrap}>
          {/* Loading spinner */}
          {status === "loading" && (
            <div className={styles.loading} role="status" aria-live="polite">
              <div className={styles.loadingDots} aria-hidden="true">
                <span /><span /><span />
              </div>
              <span>Loading comments…</span>
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className={styles.errorState} role="alert">
              <span className={styles.errorIcon} aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
                </svg>
              </span>
              <p>Could not load the comment section.</p>
              <p className={styles.errorSub}>
                The comment provider may be temporarily unavailable.
              </p>
              <button className={styles.retryBtn} onClick={handleRetry}>
                Try again
              </button>
            </div>
          )}

          {/* ✅ TAC target div — must be clean, no script children */}
          {provider === "tac" && (
            <div
              id="anime-community-comment-section"
              ref={tacRef}
              className={`${styles.embed} ${status === "loaded" ? styles.embedVisible : ""}`}
              aria-label="Comments"
            />
          )}

          {/* Disqus target div */}
          {provider === "disqus" && (
            <div
              id="disqus_thread"
              className={`${styles.embed} ${status === "loaded" ? styles.embedVisible : ""}`}
              aria-label="Disqus comments"
            />
          )}
        </div>
      )}
    </section>
  );
}
