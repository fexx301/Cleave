import { describe, expect, it } from "vitest";
import {
  cloudCacheKey,
  getCachedCloudAnalysis,
  parseRetryDelayMs,
  putCachedCloudAnalysis
} from "../src/lib/cloudResilience";
import type { CloudAnalysis } from "../src/lib/types";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v)
  };
}

const analysis = { mode_used: "POLICY_MATCHED", cited_clause_id: "4.2(a)" } as unknown as CloudAnalysis;

describe("parseRetryDelayMs", () => {
  it("reads google.rpc.RetryInfo retryDelay from SDK error details", () => {
    const err = { customErrorData: { errorDetails: [{ "@type": "x.RetryInfo", retryDelay: "17s" }] } };
    expect(parseRetryDelayMs(err)).toBe(17000);
  });

  it("falls back to the 'Please retry in Ns' message text", () => {
    expect(parseRetryDelayMs(new Error("[429] Quota exceeded. Please retry in 7.5s."))).toBe(7500);
  });

  it("returns null when the server gave no hint", () => {
    expect(parseRetryDelayMs(new Error("[429] Resource exhausted"))).toBeNull();
  });
});

describe("browser cloud-analysis cache", () => {
  it("keys on model + exact prompt", async () => {
    const a = await cloudCacheKey("gemini-3.5-flash-lite", "facts A");
    expect(a).toBe(await cloudCacheKey("gemini-3.5-flash-lite", "facts A"));
    expect(a).not.toBe(await cloudCacheKey("gemini-3.5-flash-lite", "facts B"));
    expect(a).not.toBe(await cloudCacheKey("other-model", "facts A"));
  });

  it("returns a fresh hit and expires it after 7 days", () => {
    const storage = memoryStorage();
    const savedAt = 1_000_000;
    putCachedCloudAnalysis("k", { analysis, savedAt }, storage);
    expect(getCachedCloudAnalysis("k", savedAt + 60_000, storage)?.analysis).toEqual(analysis);
    expect(getCachedCloudAnalysis("k", savedAt + 8 * 24 * 3600 * 1000, storage)).toBeNull();
    expect(getCachedCloudAnalysis("missing", savedAt, storage)).toBeNull();
  });

  it("keeps only the 30 newest entries", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 35; i++) putCachedCloudAnalysis(`k${i}`, { analysis, savedAt: i }, storage);
    expect(getCachedCloudAnalysis("k0", 40, storage)).toBeNull();
    expect(getCachedCloudAnalysis("k34", 40, storage)).not.toBeNull();
  });

  it("does nothing without storage", () => {
    expect(() => putCachedCloudAnalysis("k", { analysis, savedAt: 1 }, null)).not.toThrow();
    expect(getCachedCloudAnalysis("k", 1, null)).toBeNull();
  });
});
