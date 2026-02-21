import type { CacheEntry } from './types';

const store = new Map<string, CacheEntry<unknown>>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

// Returns undefined on cache miss, T (which may be null) on cache hit.
// This allows callers to distinguish "not cached" from "cached null".
export function cacheGet<T>(key: string): T | undefined {
  cleanup();
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data: data as unknown, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(keyPrefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
}
