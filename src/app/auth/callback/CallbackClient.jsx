"use client";
import { useEffect, useRef } from "react";
import { useRouter }         from "next/navigation";
import { useAuth }           from "@/components/AuthProvider";

/**
 * Handles the redirect back from AniList OAuth.
 *
 * AniList implicit flow puts the access_token in the URL **hash** (#):
 *   /auth/callback#access_token=...&token_type=Bearer&expires_in=...
 *
 * We read it here (client-only — hashes never reach the server),
 * call handleToken() which stores it in an httpOnly cookie via /api/auth/session,
 * then redirect to /profile.
 */
export default function CallbackClient() {
  const { handleToken } = useAuth();
  const router          = useRouter();
  const ran             = useRef(false);

  useEffect(() => {
    if (ran.current) return;   // StrictMode guard
    ran.current = true;

    // Parse URL hash (#access_token=...&expires_in=...)
    const hash   = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token  = params.get("access_token");

    // Also handle query-string code flow (if using server-side callback)
    const qParams = new URLSearchParams(window.location.search);
    const error   = qParams.get("error");

    if (error) {
      console.error("[auth callback] AniList error:", error);
      router.replace("/?error=auth_failed");
      return;
    }

    if (!token) {
      console.warn("[auth callback] No access_token in hash");
      router.replace("/?error=no_token");
      return;
    }

    handleToken(token).then(() => {
      router.replace("/profile");
    }).catch(() => {
      router.replace("/?error=auth_failed");
    });
  }, [handleToken, router]);

  return (
    <div style={{
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
      height:          "60vh",
      flexDirection:   "column",
      gap:             20,
    }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
      <p style={{ color: "var(--text-2)", fontSize: 14 }}>
        Logging in with AniList…
      </p>
    </div>
  );
}
