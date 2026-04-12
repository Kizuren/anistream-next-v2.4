/**
 * useQuery.js — Lightweight SWR-style data fetching hook
 *
 * Features:
 *   - Deduplication: concurrent requests to the same key share one fetch
 *   - Stale-while-revalidate: returns cached data immediately, revalidates in background
 *   - Error retry with exponential backoff
 *   - Prefetch API for hover prefetching
 *   - No extra npm dependency (replaces SWR/React Query for simple cases)
 *
 * Usage:
 *   const { data, loading, error } = useQuery("anime:123", () => api.info("123"), { ttl: 300 });
 */
"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ── In-process cache (shared across all hook instances) ───────────────────────
const cache   = new Map(); // key → { data, ts, ttl }
const inflight= new Map(); // key → Promise

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl * 1000) { cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlSec) {
  cache.set(key, { data, ts: Date.now(), ttl: ttlSec });
}

async function dedupFetch(key, fetcher) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fetcher().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ── Prefetch API — call on hover/intersect ────────────────────────────────────
export function prefetch(key, fetcher, ttlSec = 300) {
  if (cacheGet(key)) return; // already cached
  dedupFetch(key, fetcher)
    .then(data => cacheSet(key, data, ttlSec))
    .catch(() => {});
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useQuery(key, fetcher, {
  ttl       = 300,    // seconds to keep in cache
  enabled   = true,   // set false to pause
  onSuccess = null,
} = {}) {
  const [data,    setData]    = useState(() => (key ? cacheGet(key) : null));
  const [loading, setLoading] = useState(!data && enabled && !!key);
  const [error,   setError]   = useState(null);
  const retryRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!key || !enabled) return;

    const cached = cacheGet(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      onSuccess?.(cached);
      // Still revalidate in background if stale (> half TTL)
      const entry = cache.get(key);
      if (!entry || Date.now() - entry.ts < (ttl * 1000) / 2) return;
    }

    let cancelled = false;
    retryRef.current = 0;

    const run = async (attempt = 0) => {
      if (cancelled) return;
      if (attempt === 0) setLoading(true);
      try {
        const result = await dedupFetch(key, fetcher);
        if (cancelled || !mountedRef.current) return;
        cacheSet(key, result, ttl);
        setData(result);
        setError(null);
        onSuccess?.(result);
      } catch (e) {
        if (cancelled || !mountedRef.current) return;
        if (attempt < 3) {
          // Exponential backoff: 1s, 2s, 4s
          setTimeout(() => run(attempt + 1), 1000 * Math.pow(2, attempt));
        } else {
          setError(e.message || "Request failed");
        }
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const refetch = useCallback(() => {
    if (!key) return;
    cache.delete(key);
    inflight.delete(key);
    setError(null);
    setLoading(true);
    fetcher()
      .then(result => {
        cacheSet(key, result, ttl);
        setData(result);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error, refetch };
}

// ── Preload next/prev episode data ────────────────────────────────────────────
export function preloadEpisodeData(animeId, epSlug, fetchers) {
  // Prefetch stream data for a given episode — call when user hovers "next"
  const key = `stream:${animeId}:${epSlug}`;
  if (cacheGet(key)) return;
  fetchers.stream(animeId, epSlug)
    .then(data => cacheSet(key, data, 60))
    .catch(() => {});
}
