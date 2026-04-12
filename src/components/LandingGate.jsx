"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * LandingGate — redirects first-time visitors to /landing before showing home.
 * Uses sessionStorage so the landing only shows once per browser session.
 * Skips the redirect for any route other than "/" so deeplinks still work.
 */
export default function LandingGate() {
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only gate the root home page, not deeplinks like /anime/... or /watch/...
    if (pathname !== "/") return;

    try {
      const entered = sessionStorage.getItem("animedex_entered");
      if (!entered) {
        // First visit this session — send to landing
        router.replace("/landing");
      }
    } catch {
      // sessionStorage unavailable (private mode, etc.) — skip gate
    }
  }, [pathname, router]);

  return null; // renders nothing, just side-effects
}
