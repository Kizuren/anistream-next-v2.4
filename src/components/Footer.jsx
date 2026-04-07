"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./Footer.module.css";

const BROWSE_LINKS = [
  { href: "/browse?category=top-airing",        label: "Top Airing"       },
  { href: "/browse?category=most-popular",      label: "Most Popular"     },
  { href: "/browse?category=most-favorite",     label: "Most Favorite"    },
  { href: "/browse?category=upcoming",          label: "Upcoming"         },
  { href: "/browse?category=recently-updated",  label: "Recently Updated" },
];

const SOCIAL_LINKS = [
  {
    label: "GitHub",
    href: "https://github.com",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.72-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.13 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    ),
  },
  {
    label: "Discord",
    href: "https://discord.com",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    ),
  },
  {
    label: "Twitter / X",
    href: "https://twitter.com",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
];

// APIs to check
const API_CHECKS = [
  { id: "anilist",    label: "AniList",     url: "https://graphql.anilist.co",           method: "GET" },
  { id: "crysoline",  label: "Crysoline",   url: "https://api.crysoline.moe/health",      method: "GET" },
  { id: "aniskip",    label: "AniSkip",     url: "https://api.aniskip.com/v2/skip-times/1/1?types[]=op", method: "GET" },
  { id: "anizone",    label: "AniZone",     url: "https://anizone.to",                   method: "GET" },
];

function useSiteStatus() {
  const [statuses, setStatuses] = useState({});
  const [checked,  setChecked]  = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAll() {
      const results = {};

      await Promise.allSettled(
        API_CHECKS.map(async (api) => {
          const start = Date.now();
          try {
            // Use our proxy to avoid CORS — just check if it responds
            const proxied = `/api/proxy?url=${encodeURIComponent(api.url)}`;
            const res = await fetch(proxied, { signal: AbortSignal.timeout(6000) });
            const latency = Date.now() - start;
            results[api.id] = {
              up:      res.ok || res.status < 500,
              latency,
              code:    res.status,
            };
          } catch {
            results[api.id] = { up: false, latency: null, code: null };
          }
        })
      );

      if (!cancelled) {
        setStatuses(results);
        setChecked(true);
      }
    }

    checkAll();
    // Recheck every 5 minutes
    const interval = setInterval(checkAll, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { statuses, checked };
}

function StatusDot({ up, checking }) {
  if (checking) return <span className={styles.dotChecking} />;
  return <span className={up ? styles.dotUp : styles.dotDown} />;
}

export default function Footer() {
  const { statuses, checked } = useSiteStatus();

  const allUp    = checked && API_CHECKS.every(a => statuses[a.id]?.up !== false);
  const anyDown  = checked && API_CHECKS.some(a => statuses[a.id]?.up === false);
  const checking = !checked;

  return (
    <footer className={styles.footer}>
      <div className={styles.glowLine} aria-hidden="true" />

      <div className={styles.inner}>

        {/* ── Brand column ────────────────────────────────── */}
        <div className={styles.brand}>
          <Link href="/" className={styles.logoWrap}>
            <div className={styles.logoIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L4 7v10l8 5 8-5V7L12 2z" fill="currentColor" opacity="0.9"/>
                <path d="M12 2v20M4 7l8 5 8-5" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none"/>
              </svg>
            </div>
            <span className={styles.logoText}>animedex</span>
          </Link>

          <p className={styles.brandDesc}>
            Stream anime in HD — sub &amp; dub.<br />
            No account required. Always free.
          </p>

          {/* Overall status pill */}
          <div className={`${styles.statusPill} ${anyDown ? styles.pillDown : checking ? styles.pillChecking : styles.pillUp}`}>
            <StatusDot up={allUp} checking={checking} />
            <span>
              {checking ? "Checking services…" : allUp ? "All systems operational" : "Some services degraded"}
            </span>
          </div>

          {/* Social buttons */}
          <div className={styles.socialRow}>
            {SOCIAL_LINKS.map(s => (
              <a key={s.label} href={s.href} target="_blank" rel="noreferrer"
                className={styles.socialBtn} aria-label={s.label}>
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        {/* ── Browse column ─────────────────────────────── */}
        <div className={styles.col}>
          <h4 className={styles.colHeading}>Browse</h4>
          {BROWSE_LINKS.map(l => (
            <Link key={l.href} href={l.href} className={styles.colLink}>
              <span className={styles.linkArrow}>›</span>{l.label}
            </Link>
          ))}
        </div>

        {/* ── Info column ───────────────────────────────── */}
        <div className={styles.col}>
          <h4 className={styles.colHeading}>Info</h4>
          <Link href="/"       className={styles.colLink}><span className={styles.linkArrow}>›</span>Home</Link>
          <Link href="/browse" className={styles.colLink}><span className={styles.linkArrow}>›</span>Catalog</Link>
          <Link href="/search" className={styles.colLink}><span className={styles.linkArrow}>›</span>Search</Link>
          <a href="https://github.com" target="_blank" rel="noreferrer" className={styles.colLink}>
            <span className={styles.linkArrow}>›</span>Source Code
          </a>
          <a href="https://anilist.co" target="_blank" rel="noreferrer" className={styles.colLink}>
            <span className={styles.linkArrow}>›</span>AniList
          </a>
        </div>

        {/* ── API Status column ──────────────────────────── */}
        <div className={styles.col}>
          <h4 className={styles.colHeading}>API Status</h4>
          <div className={styles.statusList}>
            {API_CHECKS.map(api => {
              const s = statuses[api.id];
              return (
                <div key={api.id} className={styles.statusRow}>
                  <StatusDot up={s?.up} checking={!checked} />
                  <span className={styles.statusName}>{api.label}</span>
                  {checked && s && (
                    <span className={`${styles.statusBadge} ${s.up ? styles.badgeUp : styles.badgeDown}`}>
                      {s.up ? (s.latency ? `${s.latency}ms` : "OK") : "Down"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className={styles.statusNote}>Checked every 5 min</p>
        </div>

      </div>

      {/* ── Bottom bar ─────────────────────────────────── */}
      <div className={styles.bottom}>
        <p className={styles.disclaimer}>
          Animedex does not host any video files. All content is aggregated from
          publicly available third-party sources.
        </p>
        <div className={styles.bottomRight}>
          <span className={styles.divider}>·</span>
          <p className={styles.copy}>© {new Date().getFullYear()} Animedex</p>
        </div>
      </div>
    </footer>
  );
}
