import { afterEach, describe, expect, it, vi } from "vitest";
import { SYNTHETIC_CASES } from "../src/lib/cases";

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn((..._args: unknown[]) => ({ generateContent: mockGenerateContent }));

vi.mock("firebase/app", () => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ options: { projectId: "cleave-test" } })),
  deleteApp: vi.fn(async () => {})
}));

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn(() => ({})),
  ReCaptchaEnterpriseProvider: vi.fn()
}));

vi.mock("firebase/ai", () => ({
  getAI: vi.fn(() => ({ __mockAi: true })),
  getGenerativeModel: (...args: unknown[]) => mockGetGenerativeModel(...args),
  GoogleAIBackend: vi.fn(),
  InferenceMode: {
    ONLY_ON_DEVICE: "only_on_device",
    ONLY_IN_CLOUD: "only_in_cloud",
    PREFER_IN_CLOUD: "prefer_in_cloud",
    PREFER_ON_DEVICE: "prefer_on_device"
  },
  InferenceSource: {
    ON_DEVICE: "on_device",
    IN_CLOUD: "in_cloud"
  },
  Schema: {
    object: (x: unknown) => x,
    string: (x?: unknown) => x,
    boolean: (x?: unknown) => x,
    enumString: (x: unknown) => x,
    array: (x: unknown) => x
  },
  ThinkingLevel: { LOW: "LOW" }
}));

import { checkNanoAvailability, extractOnDevice, initializeCleaveFirebase } from "../src/lib/firebaseAi";

describe("Firebase AI Logic ONLY_ON_DEVICE fail-closed guards", () => {
  const originalLanguageModel = (globalThis as Record<string, unknown>).LanguageModel;

  afterEach(() => {
    vi.clearAllMocks();
    if (originalLanguageModel === undefined) {
      delete (globalThis as Record<string, unknown>).LanguageModel;
    } else {
      (globalThis as Record<string, unknown>).LanguageModel = originalLanguageModel;
    }
  });

  it("refuses before calling Firebase AI Logic when Chrome LanguageModel API is absent (prevents @firebase/ai missing-adapter cloud fallback)", async () => {
    delete (globalThis as Record<string, unknown>).LanguageModel;
    expect(await checkNanoAvailability()).toBe("unsupported_browser");

    const res = await extractOnDevice(SYNTHETIC_CASES[0].raw_letter);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal).toBe("REFUSE_LOCAL_UNAVAILABLE");
      expect(res.httpRequestsDuringLocal).toBe(0);
    }
    expect(mockGetGenerativeModel).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("refuses if the SDK ever reports in_cloud inferenceSource for an ONLY_ON_DEVICE call", async () => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      }
    };
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: vi.fn(async () => "available")
    };
    await initializeCleaveFirebase({
      config: {
        apiKey: "test-key",
        authDomain: "cleave-test.firebaseapp.com",
        projectId: "cleave-test",
        appId: "1:123:web:abc"
      },
      appCheckDebugToken: "",
      recaptchaSiteKey: "",
      cloudModel: "gemini-3.5-flash-lite"
    });
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        inferenceSource: "in_cloud",
        text: () => JSON.stringify({ identity_vault: {}, allowlist_proposal: {} })
      }
    });

    const res = await extractOnDevice(SYNTHETIC_CASES[0].raw_letter);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal).toBe("REFUSE_LOCAL_UNAVAILABLE");
      expect(res.reason).toContain("in_cloud");
    }
  });
});
