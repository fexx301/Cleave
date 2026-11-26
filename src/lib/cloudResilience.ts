import type { CloudAnalysis } from "./types";

/**
 * Browser-only cache of Cloud analyses. The cached prompt holds only non-identifying allowlist facts and a
 * generic plan EOC, so the same facts + plan + model always get the same answer without spending quota.
 * Keyed by SHA-256 of model + exact prompt: any change to facts, EOC text, or prompt wording is a new key.
 */
const CACHE_STORAGE_KEY = "cleave-cloud-cache-v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 30;

export interface CachedCloudAnalysis {
  analysis: CloudAnalysis;
  savedAt: number;
}

type CacheStore = Record<string, CachedCloudAnalysis>;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // storage blocked (private mode / policy): caching is simply skipped
  }
}

function readStore(storage: StorageLike): CacheStore {
  try {
    return JSON.parse(storage.getItem(CACHE_STORAGE_KEY) || "{}") as CacheStore;
  } catch {
    return {};
  }
}

export async function cloudCacheKey(modelName: string, prompt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${modelName}\n${prompt}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getCachedCloudAnalysis(
  key: string,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage()
): CachedCloudAnalysis | null {
  if (!storage) return null;
  const hit = readStore(storage)[key];
  return hit && now - hit.savedAt < CACHE_TTL_MS ? hit : null;
}

export function putCachedCloudAnalysis(
  key: string,
  entry: CachedCloudAnalysis,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage) return;
  const store = readStore(storage);
  store[key] = entry;
  // Keep only the newest entries so the cache can't grow without bound.
  const newest = Object.entries(store)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, CACHE_MAX_ENTRIES);
  try {
    storage.setItem(CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // Quota exceeded: losing the cache is harmless, the live call already succeeded.
  }
}

/**
 * Stops waiting on a call that never settles (an on-device model stall shows as an endless spinner).
 * The underlying call is not cancelled; its late result is simply ignored.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Reads the server's own retry hint from a 429 error: Gemini returns google.rpc.RetryInfo
 * ({ retryDelay: "17s" }) in the error details, and the message often says "Please retry in 17.3s".
 */
export function parseRetryDelayMs(err: unknown): number | null {
  const details = (err as { customErrorData?: { errorDetails?: unknown[] } })?.customErrorData?.errorDetails;
  if (Array.isArray(details)) {
    for (const d of details) {
      const raw = (d as { retryDelay?: unknown })?.retryDelay;
      const secs = typeof raw === "string" ? parseFloat(raw) : NaN;
      if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
    }
  }
  const msg = String((err as Error)?.message || err || "");
  const m = msg.match(/retry(?:Delay)?["']?\s*(?:in|:)?\s*["']?(\d+(?:\.\d+)?)\s*s\b/i);
  return m ? Math.round(parseFloat(m[1]) * 1000) : null;
}
