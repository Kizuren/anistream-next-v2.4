"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./Footer.module.css";

function useCrysolineStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const cfProxy = process.env.NEXT_PUBLIC_PROXY_URL || "";
    const healthUrl = cfProxy ? `${cfProxy}/crysoline-health` : "/api/ping/crysoline";

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

function AnimeDexLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
      <path d="M15 5 C12 14 17 23 21 27 C17 21 12 13 15 5Z" fill="currentColor" opacity="0.9"/>
      <path d="M49 5 C52 14 47 23 43 27 C47 21 52 13 49 5Z" fill="currentColor" opacity="0.9"/>
      <ellipse cx="32" cy="27" rx="17" ry="15" fill="currentColor" opacity="0.95"/>
      <path d="M17 36 C16 44 19 50 23 52 L24 52 C21 49 18 44 18 38Z" fill="currentColor" opacity="0.6"/>
      <path d="M47 36 C48 44 45 50 41 52 L40 52 C43 49 46 44 46 38Z" fill="currentColor" opacity="0.6"/>
      <path d="M23 44 Q32 50 41 44 L40 53 Q32 57 24 53Z" fill="currentColor" opacity="0.75"/>
      <rect x="25" y="50" width="2.5" height="4.5" rx="0.8" fill="rgba(7,6,11,0.9)"/>
      <rect x="29" y="50" width="2.5" height="5.5" rx="0.8" fill="rgba(7,6,11,0.9)"/>
      <rect x="33.5" y="50" width="2.5" height="4.5" rx="0.8" fill="rgba(7,6,11,0.9)"/>
      <path d="M29 34 L32 30 L35 34 L34 38 L30 38Z" fill="rgba(7,6,11,0.85)"/>
      <ellipse cx="23" cy="26" rx="5.5" ry="5" fill="rgba(7,6,11,0.9)"/>
      <ellipse cx="23" cy="26" rx="3" ry="2.8" fill="rgba(255,64,96,0.9)"/>
      <ellipse cx="23" cy="26" rx="1.2" ry="2.4" fill="rgba(7,6,11,1)"/>
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
      <div className={styles.glowLine} />

      <div className={`container ${styles.inner}`}>

        {/* ── Brand (left) ─────────────────────────────────── */}
        <div className={styles.brand}>
          <Link href="/" className={styles.logoWrap}>
            <div className={styles.logoIcon}><AnimeDexLogo /></div>
            <div className={styles.logoText}>
              <span className={styles.logoMain}>Anime</span>
              <span className={styles.logoDex}>Dex</span>
            </div>
          </Link>
          <p className={styles.brandSlogan}>
            Infinite series. Zero mercy.<br />
            Your soul was already ours.
          </p>
        </div>

        {/* ── API Status (right) ───────────────────────────── */}
        <div className={styles.apiStatus}>
          <h4 className={styles.apiLabel}>Pact Status</h4>
          <div className={styles.statusRow}>
            <StatusDot up={cryUp} />
            <span className={styles.statusName}>Crysoline</span>
            <span className={`${styles.statusBadge} ${
              cryUp === null ? styles.badgeChecking
                : cryUp      ? styles.badgeUp
                             : styles.badgeDown
            }`}>
              {cryUp === null ? "Consulting the oracle…" : cryUp ? "The pact holds" : "Pact weakening"}
            </span>
          </div>
          <p className={styles.statusNote}>Via Cloudflare edge · 60s cache</p>
        </div>

      </div>

      {/* ── Bottom bar ───────────────────────────────────────── */}
      <div className={styles.bottom}>
        <p className={styles.disclaimer}>
          AnimeDex does not host any video files. All content is sourced from publicly available third-party providers.
        </p>
        <div className={styles.bottomRight}>
          <Link href="/dmca"    className={styles.legalLink}>DMCA</Link>
          <span className={styles.bottomDot}>·</span>
          <Link href="/features"  className={styles.legalLink}>Features</Link>
          <span className={styles.bottomDot}>·</span>
          <Link href="/settings"  className={styles.legalLink}>Settings</Link>
          <span className={styles.bottomDot}>·</span>
          <Link href="/privacy" className={styles.legalLink}>Privacy</Link>
          <span className={styles.bottomDot}>·</span>
          <Link href="/terms"   className={styles.legalLink}>Terms</Link>
          <span className={styles.bottomDot}>·</span>
          <Link href="/about"   className={styles.legalLink}>About</Link>
          <span className={styles.bottomDot}>·</span>
          <p className={styles.copy}>© {new Date().getFullYear()} AnimeDex</p>
        </div>
      </div>
    </footer>
  );
}
