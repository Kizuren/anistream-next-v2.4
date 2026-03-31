"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  /* ── Restore session from cookie-based /api/auth/me ─────────── */
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ── Kick off AniList OAuth (implicit token flow) ────────────── */
  function login() {
    const clientId = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID;
    if (!clientId) {
      alert(
        "AniList Client ID not configured.\n" +
        "Add NEXT_PUBLIC_ANILIST_CLIENT_ID to .env.local"
      );
      return;
    }

    const origin      = typeof window !== "undefined" ? window.location.origin : "";
    const redirectUri = `${origin}/auth/callback`;

    // Use implicit/token flow so no server secret is needed on the client.
    // If you want the full code-exchange flow, redirect to /api/auth/login instead.
    const url =
      `https://anilist.co/api/v2/oauth/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token`;

    window.location.href = url;
  }

  /* ── Logout: clear httpOnly cookie + local state ─────────────── */
  async function logout() {
    try { await fetch("/api/auth/logout"); } catch {}
    setUser(null);
  }

  /* ── Called from callback page with raw access_token ─────────── */
  const handleToken = useCallback(async (token) => {
    if (!token) return;
    try {
      // Exchange token for user profile via our own API (keeps token server-side)
      const res  = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data?.user) setUser(data.user);
    } catch {
      // Fallback: hit AniList GraphQL directly
      try {
        const { data } = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: `{ Viewer {
              id name
              avatar { large medium }
              statistics { anime { count episodesWatched meanScore } }
              siteUrl
            }}`,
          }),
        }).then(r => r.json());

        if (data?.Viewer) setUser(data.Viewer);
      } catch {}
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, handleToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
