"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import styles from "./Navbar.module.css";

export default function Navbar() {
  const [query, setQuery]     = useState("");
  const [suggestions, setSug] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [scrolled, setScroll] = useState(false);
  const [mobileOpen, setMob]  = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const debounce = useRef(null);
  const router   = useRouter();
  const pathname = usePathname();
  const { user, login } = useAuth();

  useEffect(() => {
    const fn = () => setScroll(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => { setMob(false); setSearchOpen(false); }, [pathname]);

  function handleInput(e) {
    const v = e.target.value; setQuery(v);
    clearTimeout(debounce.current);
    if (!v.trim() || v.trim().length < 2) { setSug([]); setShowSug(false); return; }
    debounce.current = setTimeout(async () => {
      try { const d = await api.search(v, 1); setSug((d.animes || []).slice(0, 6)); setShowSug(true); } catch {}
    }, 420);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setShowSug(false); setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function pick(anime) { setQuery(""); setShowSug(false); setSearchOpen(false); router.push(`/anime/${anime.id}`); }

  const navLinks = [
    { href: "/",                             label: "Home"     },
    { href: "/browse?category=top-airing",   label: "Explore"  },
    { href: "/browse?category=most-popular", label: "Popular"  },
    { href: "/browse?category=upcoming",     label: "Schedule" },
  ];

  const isActive = (href) => {
    const base = href.split("?")[0];
    return pathname === base;
  };

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ""}`}>
      <div className={styles.inner}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 7v10l8 5 8-5V7L12 2z" fill="currentColor" opacity="0.9"/>
              <path d="M12 2v20M4 7l8 5 8-5" stroke="rgba(255,255,255,0.3)" strokeWidth="1" fill="none"/>
            </svg>
          </div>
          <span className={styles.logoText}>animedex</span>
        </Link>

        {/* Nav links */}
        <div className={styles.links}>
          {navLinks.map(l => (
            <Link key={l.href} href={l.href}
              className={`${styles.link} ${isActive(l.href) ? styles.active : ""}`}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className={styles.rightSide}>
          {/* Search toggle */}
          <div className={`${styles.searchWrap} ${searchOpen ? styles.searchOpen : ""}`}>
            <form className={styles.searchForm} onSubmit={handleSubmit}>
              <button type="button" className={styles.searchIconBtn}
                onClick={() => setSearchOpen(v => !v)} aria-label="Toggle search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </button>
              <input
                value={query}
                onChange={handleInput}
                onFocus={() => suggestions.length && setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 180)}
                placeholder="Search anime…"
                className={styles.input}
                aria-label="Search"
              />
              {showSug && suggestions.length > 0 && (
                <ul className={styles.dropdown}>
                  {suggestions.map(a => (
                    <li key={a.id} className={styles.dropItem} onMouseDown={() => pick(a)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.poster} alt="" className={styles.dropImg} />
                      <div>
                        <p className={styles.dropTitle}>{a.name}</p>
                        <span className={styles.dropMeta}>{a.type} · {a.episodes?.sub ?? "?"} eps</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          </div>

          {/* Auth */}
          {user ? (
            <Link href="/profile" className={styles.avatarBtn} title={user.name}>
              {user.avatar?.large
                ? <img src={user.avatar.large} alt={user.name} className={styles.avatarImg} />
                : <span className={styles.avatarInitial}>{user.name?.[0]?.toUpperCase()}</span>
              }
            </Link>
          ) : (
            <button className={styles.loginBtn} onClick={login}>Sign in</button>
          )}

          {/* Burger */}
          <button className={styles.burger} onClick={() => setMob(!mobileOpen)} aria-label="Menu">
            <span className={`${styles.burgerLine} ${mobileOpen ? styles.bL1 : ""}`} />
            <span className={`${styles.burgerLine} ${mobileOpen ? styles.bL2 : ""}`} />
            <span className={`${styles.burgerLine} ${mobileOpen ? styles.bL3 : ""}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className={styles.mobileMenu}>
          <form className={styles.mobileSearch} onSubmit={handleSubmit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search anime…" />
            <button type="submit">Go</button>
          </form>
          <div className={styles.mobileLinks}>
            {navLinks.map(l => (
              <Link key={l.href} href={l.href}
                className={`${styles.mobileLink} ${isActive(l.href) ? styles.mobileLinkActive : ""}`}>
                {l.label}
              </Link>
            ))}
            {user
              ? <Link href="/profile" className={styles.mobileLink}>Profile</Link>
              : <button className={`${styles.mobileLink} ${styles.mobileLoginBtn}`} onClick={login}>Sign in with AniList</button>
            }
          </div>
        </div>
      )}
    </nav>
  );
}
