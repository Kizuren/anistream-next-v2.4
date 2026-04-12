"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import styles from "./Footer.module.css";

const BROWSE_LINKS = [
  { href: "/browse?category=top-airing",        label: "Top Airing"       },
  { href: "/browse?category=most-popular",      label: "Most Popular"     },
  { href: "/browse?category=most-favorite",     label: "Most Favorite"    },
  { href: "/browse?category=upcoming",          label: "Upcoming"         },
  { href: "/browse?category=recently-updated",  label: "Recently Updated" },
];

/**
 * Crysoline health check via Cloudflare Worker.
 *
 * Route: GET <CF_WORKER>/crysoline-health
 * The CF Worker proxies api.crysoline.moe/health and caches it for 60s at the
 * Cloudflare edge — so 100 footer renders = 1 upstream ping, not 100.
 *
 * Falls back to /api/ping/crysoline (Vercel server-side) if CF_PROXY is not set.
 * Falls back to "unknown" on any error — never crashes the footer.
 *
 * Why not call api.crysoline.moe/health directly?
 * Browser CORS policy: some hosting environments return no CORS headers on the
 * /health endpoint, causing the browser to block the response silently.
 * Routing through CF Worker (same-origin from the worker's perspective) avoids
 * this entirely.
 */
function useCrysolineStatus() {
  const [status, setStatus] = useState(null); // null=checking | true=up | false=down

  useEffect(() => {
    let cancelled = false;

    // Determine URL: CF Worker preferred, Vercel API fallback
    const cfProxy = process.env.NEXT_PUBLIC_PROXY_URL || "";
    const healthUrl = cfProxy
      ? `${cfProxy}/crysoline-health`
      : "/api/ping/crysoline";

    fetch(healthUrl, { signal: AbortSignal.timeout(9000) })
      .then(r => { if (!cancelled) setStatus(r.ok); })
      .catch(() => { if (!cancelled) setStatus(false); });

    return () => { cancelled = true; };
  }, []);

  return status;
}

function StatusDot({ up }) {
  if (up === null) return <span className={styles.dotChecking} />;
  return <span className={up ? styles.dotUp : styles.dotDown} />;
}

/* AnimeDex demon skull logo - matches navbar and favicon */
function AnimeDexLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
      {/* Horns */}
      <path d="M15 5 C12 14 17 23 21 27 C17 21 12 13 15 5Z" fill="currentColor" opacity="0.9"/>
      <path d="M49 5 C52 14 47 23 43 27 C47 21 52 13 49 5Z" fill="currentColor" opacity="0.9"/>
      {/* Cranium */}
      <ellipse cx="32" cy="27" rx="17" ry="15" fill="currentColor" opacity="0.95"/>
      {/* Jaw */}
      <path d="M17 36 C16 44 19 50 23 52 L24 52 C21 49 18 44 18 38Z" fill="currentColor" opacity="0.6"/>
      <path d="M47 36 C48 44 45 50 41 52 L40 52 C43 49 46 44 46 38Z" fill="currentColor" opacity="0.6"/>
      <path d="M23 44 Q32 50 41 44 L40 53 Q32 57 24 53Z" fill="currentColor" opacity="0.75"/>
      {/* Teeth */}
      <rect x="25" y="50" width="2.5" height="4.5" rx="0.8" fill="rgba(7,6,11,0.9)"/>
      <rect x="29" y="50" width="2.5" height="5.5" rx="0.8" fill="rgba(7,6,11,0.9)"/>
      <rect x="33.5" y="50" width="2.5" height="4.5" rx="0.8" fill="rgba(7,6,11,0.9)"/>
      {/* Nose cavity */}
      <path d="M29 34 L32 30 L35 34 L34 38 L30 38Z" fill="rgba(7,6,11,0.85)"/>
      {/* Left eye */}
      <ellipse cx="23" cy="26" rx="5.5" ry="5" fill="rgba(7,6,11,0.9)"/>
      <ellipse cx="23" cy="26" rx="3" ry="2.8" fill="rgba(255,64,96,0.9)"/>
      <ellipse cx="23" cy="26" rx="1.2" ry="2.4" fill="rgba(7,6,11,1)"/>
      {/* Right eye */}
      <ellipse cx="41" cy="26" rx="5.5" ry="5" fill="rgba(7,6,11,0.9)"/>
      <ellipse cx="41" cy="26" rx="3" ry="2.8" fill="rgba(255,64,96,0.9)"/>
      <ellipse cx="41" cy="26" rx="1.2" ry="2.4" fill="rgba(7,6,11,1)"/>
    </svg>
  );
}

export default function Footer() {
  const cryUp = useCrysolineStatus();

  return (
    <footer className={styles.footer}>
      {/* Blood glow line */}
      <div className={styles.glowLine} />

      <div className={`container ${styles.inner}`}>

        {/* Brand */}
        <div className={styles.brand}>
          <Link href="/" className={styles.logoWrap}>
            <div className={styles.logoIcon}>
              <AnimeDexLogo />
            </div>
            <div className={styles.logoText}>
              <span className={styles.logoMain}>Anime</span>
              <span className={styles.logoDex}>Dex</span>
            </div>
          </Link>

          <p className={styles.brandDesc}>
            Stream anime in HD — sub &amp; dub.<br />
            No soul required. Always free.
          </p>

          {/* API Status */}
          <div className={styles.apiStatus}>
            <span className={styles.apiStatusLabel}>API Status</span>
            <div className={styles.statusRow}>
              <StatusDot up={cryUp} />
              <span className={styles.statusName}>Crysoline</span>
              <span className={`${styles.statusBadge} ${
                cryUp === null
                  ? styles.badgeChecking
                  : cryUp
                  ? styles.badgeUp
                  : styles.badgeDown
              }`}>
                {cryUp === null ? "Checking…" : cryUp ? "Operational" : "Degraded"}
              </span>
            </div>
            <p className={styles.statusNote}>Via Cloudflare edge · 60s cache</p>
          </div>
        </div>

        {/* Browse */}
        <div className={styles.col}>
          <h4 className={styles.colHeading}>Browse</h4>
          {BROWSE_LINKS.map(l => (
            <Link key={l.href} href={l.href} className={styles.colLink}>
              <span className={styles.linkChevron}>›</span>{l.label}
            </Link>
          ))}
        </div>

        {/* Navigate */}
        <div className={styles.col}>
          <h4 className={styles.colHeading}>Navigate</h4>
          <Link href="/"         className={styles.colLink}><span className={styles.linkChevron}>›</span>Home</Link>
          <Link href="/browse"   className={styles.colLink}><span className={styles.linkChevron}>›</span>Catalog</Link>
          <Link href="/search"   className={styles.colLink}><span className={styles.linkChevron}>›</span>Search</Link>
          <Link href="/schedule" className={styles.colLink}><span className={styles.linkChevron}>›</span>Schedule</Link>
          <a href="https://anilist.co" target="_blank" rel="noreferrer" className={styles.colLink}>
            <span className={styles.linkChevron}>›</span>AniList
          </a>
        </div>
      </div>

      {/* Bottom */}
      <div className={styles.bottom}>
        <p className={styles.disclaimer}>
          AnimeDex does not host any video files. All content is sourced from publicly available third-party providers.
        </p>
        <p className={styles.copy}>© {new Date().getFullYear()} AnimeDex</p>
      </div>
    </footer>
  );
}
