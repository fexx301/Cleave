import { deleteApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  ThinkingLevel,
  type AI
} from "firebase/ai";
import { BENCHMARK_REFERENCE_DATE, PLAN_EOCS } from "./cases";
import {
  checkChunkBounds,
  computeDeterministicDayOffsets,
  detectAfterHoursCue,
  detectDenialReasonCue,
  detectNetworkStatusCue,
  detectOngoingTreatmentCue,
  detectPlanIdCue,
  detectScheduledNonUrgentCue,
  detectServiceSettingCue,
  detectUrgencyDocumentedCue,
  dropPlanCodeFromVault,
  extractDeterministicVault,
  mergeVaults,
  scanOutboundBodyForCanaries
} from "./gate";
import {
  cloudCacheKey,
  getCachedCloudAnalysis,
  parseRetryDelayMs,
  putCachedCloudAnalysis,
  withTimeout
} from "./cloudResilience";
import { plainCodesInProse } from "./labels";

// Nano normally answers in 10-45 s; past this it has stalled, and an endless spinner helps nobody.
const ON_DEVICE_TIMEOUT_MS = 90_000;
const ON_DEVICE_TIMEOUT_MESSAGE =
  "The on-device model didn't respond within 90 seconds, so Cleave stopped. Nothing was sent. Please try again; the first run after Chrome starts is the slowest.";
import type {
  AllowlistKey,
  AllowlistProposal,
  CloudAnalysis,
  FirebaseWebConfig,
  IdentityVault,
  PlanEoc,
  RefusalCode,
  SyntheticCase,
  WireEntry
} from "./types";
import { annotateWireEntries, getWireCount, getWireSlice, withWireContext } from "./wireSpy";

const CONFIG_STORAGE_KEY = "cleave_firebase_config_v1";
const APPCHECK_DEBUG_STORAGE_KEY = "cleave_appcheck_debug_token_v1";
const RECAPTCHA_STORAGE_KEY = "cleave_recaptcha_site_key_v1";
const CLOUD_MODEL_STORAGE_KEY = "cleave_cloud_model_v1";

export const DEFAULT_CLOUD_MODEL =
  (import.meta.env.VITE_CLOUD_MODEL as string | undefined) || "gemini-3.5-flash-lite";

let activeApp: FirebaseApp | null = null;
let activeAi: AI | null = null;
let activeAppCheckMode: "off" | "debug_token" | "recaptcha_enterprise" = "off";
let activeConfigFingerprint: string | null = null;
let initInFlight: Promise<{ projectId: string; appCheckMode: "off" | "debug_token" | "recaptcha_enterprise" }> | null = null;

export interface RuntimeSettings {
  config: FirebaseWebConfig | null;
  appCheckDebugToken: string;
  recaptchaSiteKey: string;
  cloudModel: string;
}

export type NanoAvailability = "available" | "downloadable" | "downloading" | "unavailable" | "unsupported_browser";

interface ChromeLanguageModelGlobal {
  availability: (opts?: Record<string, unknown>) => Promise<string>;
  create: (opts?: Record<string, unknown>) => Promise<{
    prompt: (text: string) => Promise<string>;
    destroy?: () => void;
  }>;
}

const LOCAL_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    identity_vault: {
      type: "object",
      properties: {
        member_name: { type: "string" },
        dob: { type: "string" },
        member_id: { type: "string" },
        claim_id: { type: "string" },
        group_id: { type: "string" },
        address: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        physician: { type: "string" },
        facility_name: { type: "string" }
      },
      required: ["member_name", "member_id", "claim_id", "physician", "facility_name"]
    },
    allowlist_proposal: {
      type: "object",
      properties: {
        plan_id: { type: "string" },
        denial_reason_code: {
          type: "string",
          enum: ["MISSING_REFERRAL", "MISSING_PRIOR_AUTH", "MISSING_REFERRAL_AND_OON", "OTHER"]
        },
        service_setting: {
          type: "string",
          enum: [
            "EMERGENCY_OR_AFTER_HOURS_URGENT",
            "OUTPATIENT_OBGYN",
            "OUTPATIENT_BEHAVIORAL_HEALTH",
            "ADVANCED_DIAGNOSTIC_IMAGING",
            "POST_OP_SPECIALIST_FOLLOWUP",
            "ELECTIVE_OUTPATIENT_SPECIALIST",
            "UNKNOWN"
          ]
        },
        after_hours_visit_confirmed: {
          type: "string",
          enum: ["YES", "NO", "NOT_MENTIONED"]
        },
        network_status: {
          type: "string",
          enum: ["IN_NETWORK", "OUT_OF_NETWORK", "UNKNOWN"]
        },
        urgency_documented: {
          type: "string",
          enum: ["YES", "NO", "NOT_MENTIONED"]
        },
        ongoing_treatment: {
          type: "string",
          enum: ["YES", "NO", "NOT_MENTIONED"]
        },
        enrollment_date_known: {
          type: "string",
          enum: ["YES", "NO", "NOT_MENTIONED"]
        }
      },
      required: [
        "plan_id",
        "denial_reason_code",
        "service_setting",
        "after_hours_visit_confirmed",
        "network_status",
        "urgency_documented",
        "ongoing_treatment",
        "enrollment_date_known"
      ]
    }
  },
  required: ["identity_vault", "allowlist_proposal"]
};

const CLOUD_ANALYSIS_SCHEMA = Schema.object({
  properties: {
    mode_used: Schema.enumString({ enum: ["POLICY_MATCHED", "GENERAL_GUIDANCE_ONLY"] }),
    cited_clause_id: Schema.string({
      description:
        "Exact policy clause ID (e.g. 4.2(a), 4.3(b), 4.4(a), 5.1(c), 6.4(a), 4.1 / 8.2) or NONE if no plan policy was provided."
    }),
    cited_clause_quote: Schema.string(),
    exception_applies: Schema.enumString({ enum: ["YES", "CONDITIONAL", "NO", "UNKNOWN_NO_POLICY"] }),
    needs_patient_confirmation: Schema.boolean(),
    confirmation_items: Schema.array({
      description:
        "If needs_patient_confirmation is true, list each unresolved fact as a pair: question (shown to the patient) and draft_statement (a clean first-person member factual sentence using 'I'/'my' such as 'My ordering physician documented clinical urgency in my medical chart', inserted ONLY if the patient checks the box; never a question and never third-person 'the patient').",
      items: Schema.object({
        properties: {
          question: Schema.string(),
          draft_statement: Schema.string()
        },
        required: ["question", "draft_statement"]
      })
    }),
    plain_explanation: Schema.string(),
    draft_request_for_review: Schema.string({
      description:
        "Editable Request for Review using ONLY opaque placeholders [MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME]. CRITICAL: When needs_patient_confirmation is true, NEVER state any unconfirmed fact as already true in this draft — phrase the request conditionally pending confirmation."
    })
  },
  required: [
    "mode_used",
    "cited_clause_id",
    "cited_clause_quote",
    "exception_applies",
    "needs_patient_confirmation",
    "confirmation_items",
    "plain_explanation",
    "draft_request_for_review"
  ]
});

export function parseFirebaseConfigSnippet(raw: string): FirebaseWebConfig {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Firebase config is empty.");
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Could not locate a { ... } config object.");
  }
  const objText = trimmed.slice(firstBrace, lastBrace + 1);
  try {
    const direct = JSON.parse(objText) as Partial<FirebaseWebConfig>;
    if (direct.apiKey && direct.projectId && direct.appId) {
      return direct as FirebaseWebConfig;
    }
  } catch {
    // Parse JS object literal cleanly without mangling colons inside appId strings
  }
  const parsed: Record<string, string> = {};
  const pairRegex = /["']?([a-zA-Z0-9_]+)["']?\s*:\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = pairRegex.exec(objText)) !== null) {
    parsed[m[1]] = m[2] ?? m[3] ?? "";
  }
  if (!parsed.apiKey || !parsed.projectId || !parsed.appId) {
    throw new Error("Config must include apiKey, projectId, and appId.");
  }
  return parsed as unknown as FirebaseWebConfig;
}

export function loadSavedSettings(): RuntimeSettings {
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const envAppId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;

  let config: FirebaseWebConfig | null = null;
  const rawStored =
    localStorage.getItem(CONFIG_STORAGE_KEY) ||
    localStorage.getItem("cleave_probe_firebase_config_v1");
  if (rawStored) {
    try {
      config = parseFirebaseConfigSnippet(rawStored);
    } catch {
      config = null;
    }
  } else if (envApiKey && envProjectId && envAppId) {
    config = {
      apiKey: envApiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
      projectId: envProjectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
      appId: envAppId
    };
  }

  return {
    config,
    appCheckDebugToken:
      localStorage.getItem(APPCHECK_DEBUG_STORAGE_KEY) ??
      localStorage.getItem("cleave_probe_appcheck_debug_token_v1") ??
      (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) ??
      "",
    recaptchaSiteKey:
      localStorage.getItem(RECAPTCHA_STORAGE_KEY) ??
      (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ??
      "",
    cloudModel: localStorage.getItem(CLOUD_MODEL_STORAGE_KEY) || DEFAULT_CLOUD_MODEL
  };
}

export async function initializeCleaveFirebase(settings: RuntimeSettings): Promise<{
  projectId: string;
  appCheckMode: "off" | "debug_token" | "recaptcha_enterprise";
}> {
  if (!settings.config) {
    throw new Error("Paste your Firebase Web config in Settings first.");
  }

  const fingerprint = JSON.stringify({
    apiKey: settings.config.apiKey,
    projectId: settings.config.projectId,
    appId: settings.config.appId,
    debug: settings.appCheckDebugToken.trim(),
    recaptcha: settings.recaptchaSiteKey.trim()
  });

  // Deduplicate React StrictMode double-mount init to avoid Firebase app/app-deleted warnings
  if (activeAi && activeConfigFingerprint === fingerprint) {
    localStorage.setItem(CLOUD_MODEL_STORAGE_KEY, settings.cloudModel.trim() || DEFAULT_CLOUD_MODEL);
    return { projectId: settings.config.projectId, appCheckMode: activeAppCheckMode };
  }
  if (initInFlight) {
    return initInFlight;
  }

  initInFlight = (async () => {
    for (const app of getApps()) {
      try {
        await deleteApp(app);
      } catch {
        // Already deleted
      }
    }

    const g = globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean };
    const debugToken = settings.appCheckDebugToken.trim();
    const recaptchaKey = settings.recaptchaSiteKey.trim();

    if (debugToken) {
      g.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    } else {
      delete g.FIREBASE_APPCHECK_DEBUG_TOKEN;
    }

    activeApp = initializeApp(settings.config!);

    if (debugToken) {
      initializeAppCheck(activeApp, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaKey || "debug-placeholder-site-key"),
        isTokenAutoRefreshEnabled: true
      });
      activeAppCheckMode = "debug_token";
    } else if (recaptchaKey) {
      initializeAppCheck(activeApp, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
        isTokenAutoRefreshEnabled: true
      });
      activeAppCheckMode = "recaptcha_enterprise";
    } else {
      activeAppCheckMode = "off";
    }

    activeAi = getAI(activeApp, { backend: new GoogleAIBackend() });
    activeConfigFingerprint = fingerprint;

    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(settings.config, null, 2));
    if (debugToken) localStorage.setItem(APPCHECK_DEBUG_STORAGE_KEY, debugToken);
    else localStorage.removeItem(APPCHECK_DEBUG_STORAGE_KEY);
    if (recaptchaKey) localStorage.setItem(RECAPTCHA_STORAGE_KEY, recaptchaKey);
    else localStorage.removeItem(RECAPTCHA_STORAGE_KEY);
    localStorage.setItem(CLOUD_MODEL_STORAGE_KEY, settings.cloudModel.trim() || DEFAULT_CLOUD_MODEL);

    return { projectId: settings.config!.projectId, appCheckMode: activeAppCheckMode };
  })();

  try {
    return await initInFlight;
  } finally {
    initInFlight = null;
  }
}

export function clearSavedFirebaseSettings(): void {
  localStorage.removeItem(CONFIG_STORAGE_KEY);
  localStorage.removeItem("cleave_probe_firebase_config_v1");
  localStorage.removeItem(APPCHECK_DEBUG_STORAGE_KEY);
  localStorage.removeItem("cleave_probe_appcheck_debug_token_v1");
  localStorage.removeItem(RECAPTCHA_STORAGE_KEY);
  activeAi = null;
  activeApp = null;
  activeConfigFingerprint = null;
  activeAppCheckMode = "off";
}

export function getFirebaseRuntimeStatus() {
  return {
    initialized: Boolean(activeAi),
    projectId: activeApp?.options.projectId || null,
    appCheckMode: activeAppCheckMode
  };
}

function requireAi(): AI {
  if (!activeAi) {
    throw new Error("Firebase AI Logic is not initialized yet. Open Settings and paste your Firebase Web config.");
  }
  return activeAi;
}

export async function checkNanoAvailability(): Promise<NanoAvailability> {
  const lm = (globalThis as unknown as { LanguageModel?: ChromeLanguageModelGlobal }).LanguageModel;
  if (!lm) return "unsupported_browser";
  try {
    const status = await lm.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }]
    });
    if (status === "available" || status === "downloadable" || status === "downloading" || status === "unavailable") {
      return status;
    }
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function downloadOrWarmNano(onProgress?: (pct: number) => void): Promise<NanoAvailability> {
  const lm = (globalThis as unknown as { LanguageModel?: ChromeLanguageModelGlobal }).LanguageModel;
  if (!lm) return "unsupported_browser";

  const avail = await checkNanoAvailability();
  if (avail === "unavailable") return "unavailable";

  const session = await lm.create({
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor(m: { addEventListener: (e: string, cb: (ev: { loaded?: number }) => void) => void }) {
      m.addEventListener("downloadprogress", (ev) => {
        onProgress?.(Math.round((ev.loaded || 0) * 100));
      });
    }
  });
  session.destroy?.();
  onProgress?.(100);
  return checkNanoAvailability();
}

const SESSION_CLOUD_CALL_CAP = 40;
let sessionCloudCalls = 0;

export function getSessionCloudCallUsage() {
  return { used: sessionCloudCalls, cap: SESSION_CLOUD_CALL_CAP };
}

export function resetSessionCloudCallUsage() {
  sessionCloudCalls = 0;
}

function assertWithinSessionQuota() {
  if (sessionCloudCalls >= SESSION_CLOUD_CALL_CAP) {
    throw new Error(
      `Session cloud quota cap reached (${SESSION_CLOUD_CALL_CAP} calls). On-device extraction and Offline Local Triage remain unlimited; reset or supply your own Firebase project in Settings to continue cloud calls.`
    );
  }
  sessionCloudCalls += 1;
}

export interface RetryNotice {
  nextAttempt: number;
  maxAttempts: number;
  delaySec: number;
  isRateLimit: boolean;
}

const MAX_RETRY_WAIT_MS = 30_000;

async function callWithTransientRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  onRetry?: (notice: RetryNotice) => void
): Promise<T> {
  assertWithinSessionQuota();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error)?.message || err);
      const is429 = /\b429\b|rate|quota/i.test(msg);
      const isTransient = is429 || /\b(500|503)\b|high demand|overloaded|temporarily/i.test(msg);
      if (!isTransient || attempt === maxAttempts) {
        if (is429) {
          throw new Error(
            "Cloud Gemini free-tier rate limit reached (HTTP 429). Wait ~30 seconds and retry, switch to Offline Local Triage (0 cloud quota), or configure your own Firebase project in Settings."
          );
        }
        throw err;
      }
      // Wait as long as the server says, not a guess. If that is too long, say so now instead of spinning.
      const hintMs = is429 ? parseRetryDelayMs(err) : null;
      if (hintMs !== null && hintMs > MAX_RETRY_WAIT_MS) {
        throw new Error(
          `Cloud Gemini free-tier rate limit reached (HTTP 429). The cloud asked to wait ~${Math.ceil(hintMs / 1000)}s. Try again then, or use Offline Local Triage (0 cloud quota).`
        );
      }
      // Jitter keeps several users who hit the limit together from retrying in lockstep.
      const delayMs = (hintMs ?? (is429 ? 6000 * attempt : 1500 * attempt)) + Math.round(Math.random() * 400);
      onRetry?.({
        nextAttempt: attempt + 1,
        maxAttempts,
        delaySec: Math.round(delayMs / 1000),
        isRateLimit: is429
      });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export type LocalExtractionResult =
  | {
      ok: true;
      inferenceSource: string;
      latencyMs: number;
      httpRequestsDuringLocal: number;
      identityVault: IdentityVault;
      proposedAllowlist: AllowlistProposal;
    }
  | {
      ok: false;
      refusal: RefusalCode;
      reason: string;
      httpRequestsDuringLocal: number;
      latencyMs: number;
    };

/**
 * Step 1 of Cleave: strictly ONLY_ON_DEVICE extraction via Firebase AI Logic.
 * Raw letter text stays exclusively inside browser memory; never falls back to cloud.
 */
export async function extractOnDevice(
  rawLetter: string,
  referenceDateIso: string = BENCHMARK_REFERENCE_DATE
): Promise<LocalExtractionResult> {
  const bounds = checkChunkBounds(rawLetter);
  if (!bounds.ok) {
    return {
      ok: false,
      refusal: bounds.refusal,
      reason: bounds.reason,
      httpRequestsDuringLocal: 0,
      latencyMs: 0
    };
  }

  // Defense-in-depth guard for a real @firebase/ai SDK edge case: in browsers without Chrome's
  // LanguageModel global, chromeAdapter is undefined and callCloudOrDevice() falls through to
  // inCloudCall() even when mode is ONLY_ON_DEVICE. Pre-check availability before calling the SDK.
  const nanoAvail = await checkNanoAvailability();
  if (nanoAvail !== "available") {
    return {
      ok: false,
      refusal: "REFUSE_LOCAL_UNAVAILABLE",
      reason: `On-device Gemini Nano is ${nanoAvail} (${
        nanoAvail === "unsupported_browser" ? "no Chrome LanguageModel API" : "model not downloaded or unavailable"
      }). Cleave stopped before invoking Firebase AI Logic so the raw letter cannot fall through to the cloud.`,
      httpRequestsDuringLocal: 0,
      latencyMs: 0
    };
  }

  const ai = requireAi();
  const wireBefore = getWireCount();
  const t0 = performance.now();

  const localModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      },
      promptOptions: {
        responseConstraint: LOCAL_EXTRACTION_JSON_SCHEMA
      }
    }
  });

  const prompt = `Extract two JSON objects from this insurance denial letter:
1) identity_vault: exact personal/provider identifiers from the letter (member_name, dob, member_id, claim_id, group_id, address, phone, email, physician, facility_name; use "" if absent).
2) allowlist_proposal: ONLY structured non-identifying claim facts:
- plan_id: exact plan policy code like PLAN-HMO-2026-GOLD or PLAN-EPO-2026-SELECT (never a member ID or claim ID)
- denial_reason_code: MISSING_REFERRAL | MISSING_PRIOR_AUTH | MISSING_REFERRAL_AND_OON | OTHER
- service_setting:
  * EMERGENCY_OR_AFTER_HOURS_URGENT (if ER or after-hours/late-night urgent care between 8 PM and 8 AM)
  * OUTPATIENT_OBGYN (if OB-GYN / women's clinic)
  * OUTPATIENT_BEHAVIORAL_HEALTH (if psychotherapy / behavioral health)
  * ADVANCED_DIAGNOSTIC_IMAGING (if MRI / CT / PET)
  * POST_OP_SPECIALIST_FOLLOWUP (if active post-operative follow-up)
  * ELECTIVE_OUTPATIENT_SPECIALIST (if non-urgent elective specialist)
  * UNKNOWN
- after_hours_visit_confirmed: YES if the letter states emergency care or an after-hours/weekend/8PM-8AM check-in time (like 11:40 PM); NO if routine weekday daytime; NOT_MENTIONED otherwise.
- network_status: IN_NETWORK | OUT_OF_NETWORK | UNKNOWN
- urgency_documented: YES if chart urgency notes were submitted; NO or NOT_MENTIONED if absent/not submitted.
- ongoing_treatment: YES | NO | NOT_MENTIONED
- enrollment_date_known: YES | NO | NOT_MENTIONED (use NO if letter says enrollment date is missing/not listed)

LETTER:
${rawLetter}`;

  try {
    const result = await withTimeout(localModel.generateContent(prompt), ON_DEVICE_TIMEOUT_MS, ON_DEVICE_TIMEOUT_MESSAGE);
    const latencyMs = Math.round(performance.now() - t0);
    const httpRequestsDuringLocal = getWireSlice(wireBefore).length;

    if (result.response.inferenceSource && result.response.inferenceSource !== InferenceSource.ON_DEVICE) {
      return {
        ok: false,
        refusal: "REFUSE_LOCAL_UNAVAILABLE",
        reason: `Expected on_device inference but SDK reported "${result.response.inferenceSource}". Refusing non-local result.`,
        httpRequestsDuringLocal,
        latencyMs
      };
    }

    const parsed = JSON.parse(result.response.text()) as {
      identity_vault?: IdentityVault;
      allowlist_proposal?: AllowlistProposal;
    };

    const detVault = extractDeterministicVault(rawLetter, referenceDateIso);
    // A plan code on the letter's "Plan" line identifies the plan, not the member, so it may be sent.
    const mergedVault = dropPlanCodeFromVault(mergeVaults(parsed.identity_vault, detVault), rawLetter);
    const dayOffsets = computeDeterministicDayOffsets(rawLetter, referenceDateIso);
    const detAfterHours = detectAfterHoursCue(rawLetter);
    const detDenialReason = detectDenialReasonCue(rawLetter);
    const detServiceSetting = detectServiceSettingCue(rawLetter);
    const detOngoing = detectOngoingTreatmentCue(rawLetter);
    const detUrgency = detectUrgencyDocumentedCue(rawLetter);
    const detNetwork = detectNetworkStatusCue(rawLetter);
    const detPlanId = detectPlanIdCue(rawLetter);

    const nanoProp = parsed.allowlist_proposal || {};
    const proposedAllowlist: AllowlistProposal = {
      ...nanoProp,
      plan_id: nanoProp.plan_id && /^PLAN-[A-Z0-9-]{4,28}$/.test(nanoProp.plan_id) ? nanoProp.plan_id : detPlanId || nanoProp.plan_id,
      denial_reason_code:
        !nanoProp.denial_reason_code || nanoProp.denial_reason_code === "OTHER"
          ? detDenialReason || nanoProp.denial_reason_code || "OTHER"
          : nanoProp.denial_reason_code,
      // Nano proposes; code overrules an "emergency" label on a letter that says the visit was scheduled or routine.
      service_setting:
        !nanoProp.service_setting || nanoProp.service_setting === "UNKNOWN"
          ? detServiceSetting || nanoProp.service_setting || "UNKNOWN"
          : nanoProp.service_setting === "EMERGENCY_OR_AFTER_HOURS_URGENT" && detectScheduledNonUrgentCue(rawLetter)
            ? detServiceSetting || "ELECTIVE_OUTPATIENT_SPECIALIST"
            : nanoProp.service_setting,
      network_status:
        !nanoProp.network_status || nanoProp.network_status === "UNKNOWN"
          ? detNetwork || nanoProp.network_status || "UNKNOWN"
          : nanoProp.network_status,
      after_hours_visit_confirmed:
        nanoProp.after_hours_visit_confirmed === "YES" || detAfterHours === "YES"
          ? "YES"
          : nanoProp.after_hours_visit_confirmed || "NOT_MENTIONED",
      ongoing_treatment:
        nanoProp.ongoing_treatment === "YES" || detOngoing === "YES"
          ? "YES"
          : nanoProp.ongoing_treatment || "NOT_MENTIONED",
      // Downgrade-only: a Nano "YES" without textual evidence becomes NOT_MENTIONED, so Cloud asks the
      // patient to confirm instead of citing an urgency fact the letter never states.
      urgency_documented:
        detUrgency !== "NOT_MENTIONED"
          ? detUrgency
          : nanoProp.urgency_documented === "YES"
            ? "NOT_MENTIONED"
            : nanoProp.urgency_documented || "NOT_MENTIONED",
      days_since_service: dayOffsets.daysSinceService,
      days_since_denial: dayOffsets.daysSinceDenial
    };

    return {
      ok: true,
      inferenceSource: result.response.inferenceSource || InferenceSource.ON_DEVICE,
      latencyMs,
      httpRequestsDuringLocal,
      identityVault: mergedVault,
      proposedAllowlist
    };
  } catch (err) {
    return {
      ok: false,
      refusal: "REFUSE_LOCAL_UNAVAILABLE",
      reason: `ONLY_ON_DEVICE failed (${(err as Error)?.message || String(err)}). Cleave refused to fall back to cloud.`,
      httpRequestsDuringLocal: getWireSlice(wireBefore).length,
      latencyMs: Math.round(performance.now() - t0)
    };
  }
}

export interface CloudAnalysisOutcome {
  inferenceSource: string;
  latencyMs: number;
  policyMatched: boolean;
  wireEntries: WireEntry[];
  wireBytes: number;
  leakedCanaries: string[];
  analysis: CloudAnalysis;
  /** Set when the answer was reused from the browser cache: nothing was sent. */
  cachedAt?: number;
}

/**
 * Step 2 of Cleave: strictly ONLY_IN_CLOUD analysis over the deterministic gate's allowlist JSON + generic EOC.
 */
export async function analyzeAllowlistInCloud(params: {
  allowlistPayload: Partial<Record<AllowlistKey, string | number>>;
  cloudModel: string;
  canariesToAudit?: readonly string[];
  customEoc?: PlanEoc | null;
  caseLabel?: string;
  onRetry?: (notice: RetryNotice) => void;
  /** Reuse an identical earlier answer from the browser cache. Off for the eval, which must measure live runs. */
  useCache?: boolean;
}): Promise<CloudAnalysisOutcome> {
  const ai = requireAi();
  const { allowlistPayload, cloudModel, canariesToAudit = [], customEoc, caseLabel, onRetry, useCache = false } = params;
  const modelName = cloudModel.trim() || DEFAULT_CLOUD_MODEL;

  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        ...(modelName.includes("lite") ? {} : { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }),
        responseMimeType: "application/json",
        responseSchema: CLOUD_ANALYSIS_SCHEMA
      }
    }
  });

  const planId = typeof allowlistPayload.plan_id === "string" ? allowlistPayload.plan_id : "";
  // Respect interactive user control: if the patient unchecked plan_id, withhold even a custom EOC!
  const policy: PlanEoc | null = planId ? customEoc || PLAN_EOCS[planId] || null : null;

  const policyBlock = policy
    ? policy.rawPolicyText
      ? `CUSTOM PLAN EOC (${policy.plan_id} — ${policy.plan_name}):\n${policy.rawPolicyText}`
      : `GENERIC PLAN EOC (${policy.plan_id} — ${policy.plan_name}):\n${JSON.stringify(policy.clauses, null, 2)}`
    : "";

  const prompt = policy
    ? `You are a health insurance policy analyst. You receive ONLY structured non-identifying claim facts and a generic Plan Evidence of Coverage (EOC).
Rules:
1. Check whether an EOC exception clause applies AND check the appeal filing deadline using days_since_denial against the deadline the EOC below actually states (cite that section; do not assume 180 days if the EOC says otherwise). If days_since_denial is missing, do not claim the appeal is within the deadline; name the deadline and its section instead.
2. Cite the exact clause ID(s) from the EOC below and quote the controlling sentence verbatim.
3. For Emergency / Urgent Care waivers (e.g. Section 4.2(a) or 7.3(a)): set exception_applies="YES", needs_patient_confirmation=false, confirmation_items=[] ONLY when the facts satisfy every condition in the cited clause's own wording (e.g. a clause that waives referral for visits between 8:00 PM and 8:00 AM is satisfied by service_setting EMERGENCY_OR_AFTER_HOURS_URGENT with after_hours_visit_confirmed YES). If the clause also requires a condition the facts do not establish (for example being temporarily outside the plan's service area, the plan network being unavailable or inaccessible, or an unforeseen illness or injury), set exception_applies="CONDITIONAL", needs_patient_confirmation=true, and ask about each missing condition in confirmation_items. (Chart urgency documentation is ONLY required for retroactive imaging prior auth, NOT urgent care waivers.)
4. For In-Network Direct Access waivers (OB-GYN or Behavioral Health): if network_status is IN_NETWORK and service_setting matches (and within the appeal filing window), set exception_applies="YES", needs_patient_confirmation=false, confirmation_items=[].
5. If an exception depends on an unconfirmed fact (such as chart urgency documentation for retroactive imaging when urgency_documented is NOT YES, OR continuity-of-care when ongoing_treatment is YES and enrollment_date_known is NOT YES), set exception_applies="CONDITIONAL", needs_patient_confirmation=true, and populate confirmation_items with pairs of { question, draft_statement } where draft_statement is strictly in first-person member voice ("I" / "my", e.g., "My ordering physician documented clinical urgency in my medical chart" — never third-person "the patient").
6. STRICT NO-FABRICATION RULE: When needs_patient_confirmation is true, draft_request_for_review MUST NOT assert any unconfirmed fact as already true! Instead, place the exact token [PENDING_PATIENT_CONFIRMATION] in the sentence where the confirmed supporting fact belongs (e.g., "Please review this claim under Section 5.1(c). [PENDING_PATIENT_CONFIRMATION]") so Cleave can swap that token cleanly with the patient's confirmed draft_statement once they check the box. Do NOT write "I will confirm once verified" separately when using [PENDING_PATIENT_CONFIRMATION].
7. If no exception applies or days_since_denial exceeds the EOC's appeal deadline, set exception_applies="NO", needs_patient_confirmation=false, confirmation_items=[], and cite the controlling rules (e.g. "4.1 / 8.2").
8. Write draft_request_for_review using ONLY opaque placeholders: [MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME]. Write plain_explanation and draft_request_for_review in plain English: never copy the fact codes (such as MISSING_REFERRAL_AND_OON or OUT_OF_NETWORK) into them.

ALLOWLIST CLAIM FACTS (JSON):
${JSON.stringify(allowlistPayload, null, 2)}

${policyBlock}`
    : `You are a health insurance appeal helper. The patient removed their Plan Policy Identifier, so NO specific Plan Evidence of Coverage is available.
Set mode_used="GENERAL_GUIDANCE_ONLY", cited_clause_id="NONE", cited_clause_quote="", exception_applies="UNKNOWN_NO_POLICY", needs_patient_confirmation=true.
In confirmation_items, list 2-3 practical next steps as { question: "concise next-step prompt", draft_statement: "concise factual sentence the member can include if applicable" }.
Explain plainly what general appeal guidance applies from the remaining allowlisted fields, and explain that matching a specific referral or prior-authorization waiver requires the plan identifier and Evidence of Coverage.
Use ONLY opaque placeholders ([MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME]) in draft_request_for_review, and do NOT invent unconfirmed facts.

ALLOWLIST CLAIM FACTS (JSON):
${JSON.stringify(allowlistPayload, null, 2)}`;

  // crypto.subtle needs a secure context; without it we just skip the cache.
  const cacheKey = useCache ? await cloudCacheKey(modelName, prompt).catch(() => null) : null;
  const cached = cacheKey ? getCachedCloudAnalysis(cacheKey) : null;
  if (cached) {
    return {
      inferenceSource: "browser_cache",
      latencyMs: 0,
      policyMatched: Boolean(policy),
      wireEntries: [],
      wireBytes: 0,
      leakedCanaries: [],
      analysis: cached.analysis,
      cachedAt: cached.savedAt
    };
  }

  const wireBefore = getWireCount();
  const t0 = performance.now();
  const result = await withWireContext("cleave_production", caseLabel, () =>
    callWithTransientRetry(() => model.generateContent(prompt), 4, onRetry)
  );
  const latencyMs = Math.round(performance.now() - t0);
  const wireEntries = getWireSlice(wireBefore);
  const allWireBodies = wireEntries.map((e) => e.bodyText).join("\n");
  const leakedCanaries = scanOutboundBodyForCanaries(allWireBodies, canariesToAudit);
  annotateWireEntries(
    wireEntries.map((e) => e.id),
    leakedCanaries
  );

  const analysis = JSON.parse(result.response.text()) as CloudAnalysis;
  // The patient reads and sends this prose, so fact codes the model copied in become plain words.
  analysis.plain_explanation = plainCodesInProse(analysis.plain_explanation);
  analysis.draft_request_for_review = plainCodesInProse(analysis.draft_request_for_review);
  if (cacheKey && leakedCanaries.length === 0) {
    putCachedCloudAnalysis(cacheKey, { analysis, savedAt: Date.now() });
  }
  return {
    inferenceSource: result.response.inferenceSource || InferenceSource.IN_CLOUD,
    latencyMs,
    policyMatched: Boolean(policy),
    wireEntries,
    wireBytes: wireEntries.reduce((sum, e) => sum + e.bodyLength, 0),
    leakedCanaries,
    analysis
  };
}

/**
 * Offline-Resilient Mode (PREFER_IN_CLOUD):
 * Runs cloud analysis when reachable; if offline/unreachable, Firebase AI Logic automatically falls back
 * to on-device Gemini Nano and Cleave explicitly labels the output OFFLINE_LOCAL_TRIAGE.
 */
export async function runOfflineResilientTriage(params: {
  allowlistPayload: Partial<Record<AllowlistKey, string | number>>;
  cloudModel: string;
  forceSimulateOffline?: boolean;
  caseLabel?: string;
}): Promise<{
  inferenceSource: string;
  latencyMs: number;
  httpRequests: number;
  offlineDegraded: boolean;
  summaryText: string;
}> {
  const ai = requireAi();
  const { allowlistPayload, cloudModel, forceSimulateOffline, caseLabel } = params;
  const modelName = cloudModel.trim() || DEFAULT_CLOUD_MODEL;

  const wireBefore = getWireCount();
  const t0 = performance.now();

  if (forceSimulateOffline) {
    const nanoAvail = await checkNanoAvailability();
    if (nanoAvail !== "available") {
      throw new Error(
        `Offline Local Triage requires Chrome Gemini Nano on-device (currently ${nanoAvail}). Open in Chrome Desktop 139+ with Gemini Nano ready, or use Match Policy Clause in Cloud.`
      );
    }
  }

  const mode = forceSimulateOffline ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_IN_CLOUD;
  const model = getGenerativeModel(ai, {
    mode,
    inCloudParams: { model: modelName },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      }
    }
  });

  const SETTING_HUMAN: Record<string, string> = {
    EMERGENCY_OR_AFTER_HOURS_URGENT: "emergency or after-hours urgent care",
    OUTPATIENT_OBGYN: "outpatient OB-GYN visit",
    OUTPATIENT_BEHAVIORAL_HEALTH: "outpatient behavioral health session",
    ADVANCED_DIAGNOSTIC_IMAGING: "advanced diagnostic imaging (MRI/CT/PET)",
    POST_OP_SPECIALIST_FOLLOWUP: "post-operative specialist follow-up",
    ELECTIVE_OUTPATIENT_SPECIALIST: "elective outpatient specialist visit",
    UNKNOWN: "unspecified care setting"
  };

  const humanSummary = [
    `Denial category: ${String(allowlistPayload.denial_reason_code || "unspecified").toLowerCase().replace(/_/g, " ")}`,
    `Care setting (NOT a diagnosis): ${SETTING_HUMAN[String(allowlistPayload.service_setting || "UNKNOWN")] || "unspecified"}`,
    `Network status: ${String(allowlistPayload.network_status || "unknown").toLowerCase().replace(/_/g, " ")}`,
    allowlistPayload.days_since_denial !== undefined ? `Days since denial notice: ${allowlistPayload.days_since_denial} days` : null,
    allowlistPayload.days_since_service !== undefined ? `Days since visit: ${allowlistPayload.days_since_service} days` : null,
    allowlistPayload.plan_id ? `Plan identifier on file: ${allowlistPayload.plan_id}` : "Plan identifier removed by patient"
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Write 3 short plain-text preparation checklist lines (NO markdown bold **, NO asterisks, NO raw ALL_CAPS enum codes, NO invented policy clause numbers, and do NOT call a care setting a diagnosis) using ONLY these non-identifying claim facts:
${humanSummary}`;

  const result = await withWireContext("cleave_production", caseLabel, () =>
    withTimeout(model.generateContent(prompt), ON_DEVICE_TIMEOUT_MS, ON_DEVICE_TIMEOUT_MESSAGE)
  );
  const latencyMs = Math.round(performance.now() - t0);
  const httpRequests = getWireSlice(wireBefore).length;
  const source =
    result.response.inferenceSource || (httpRequests === 0 ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD);

  // Cleanly strip any stray markdown bold/italic markers so the UI renders clean archival prose
  const cleanText = result.response
    .text()
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .trim();

  return {
    inferenceSource: source,
    latencyMs,
    httpRequests,
    offlineDegraded: source === InferenceSource.ON_DEVICE,
    summaryText: cleanText
  };
}

/**
 * Fail-Closed Lab (isolated demonstration — NEVER used in Cleave's production workflow!):
 * Proves live that passing an application/pdf denial letter to PREFER_ON_DEVICE silently uploads
 * raw PDF bytes over HTTPS, whereas ONLY_ON_DEVICE throws locally with 0 HTTP network requests.
 */
export async function runFailClosedPdfComparison(cloudModel: string): Promise<{
  onlyOnDevice: {
    threw: boolean;
    error?: string;
    httpRequests: number;
    verdict: string;
  };
  preferOnDevice: {
    threw: boolean;
    error?: string;
    inferenceSource?: string;
    httpRequests: number;
    bytesSent: number;
    rawPdfBase64LeakedOnWire: boolean;
    decodedLeaksFound: string[];
    verdict: string;
  };
}> {
  const ai = requireAi();
  const labCanaries = ["Elena Vasquez", "MBR-8841209", "CLM-2026-991042"];
  const syntheticPdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n% Elena Vasquez MBR-8841209 CLM-2026-991042";
  const pdfBase64 = btoa(syntheticPdf);
  const pdfPrompt = [
    { text: "Summarize this denial letter in 10 words." },
    { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }
  ];

  // 1. ONLY_ON_DEVICE (Cleave's mode) -> MUST fail closed locally with 0 HTTP requests
  const wireBeforeStrict = getWireCount();
  let onlyOnDevice: { threw: boolean; error?: string; httpRequests: number; verdict: string };
  const nanoAvailForLab = await checkNanoAvailability();
  if (nanoAvailForLab !== "available") {
    onlyOnDevice = {
      threw: true,
      error: `Pre-call guard blocked ONLY_ON_DEVICE because Chrome LanguageModel is ${nanoAvailForLab} (preventing @firebase/ai missing-adapter cloud fallback).`,
      httpRequests: 0,
      verdict:
        "FAIL-CLOSED PASS: Blocked locally before SDK call with 0 HTTP requests (also prevents @firebase/ai missing-adapter cloud fallback)."
    };
  } else {
    try {
      const strictModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
      await withWireContext("fail_closed_lab", "Lab: ONLY_ON_DEVICE PDF", () => strictModel.generateContent(pdfPrompt));
      const reqs = getWireSlice(wireBeforeStrict);
      onlyOnDevice = {
        threw: false,
        httpRequests: reqs.length,
        verdict: reqs.length === 0 ? "Stayed on-device (0 HTTP calls)." : "Unexpected network call."
      };
    } catch (err) {
      const reqs = getWireSlice(wireBeforeStrict);
      onlyOnDevice = {
        threw: true,
        error: (err as Error)?.message || String(err),
        httpRequests: reqs.length,
        verdict:
          reqs.length === 0
            ? "FAIL-CLOSED PASS: Threw locally with 0 HTTP requests. Zero bytes left the browser."
            : "Unexpected network request observed."
      };
    }
  }

  // 2. PREFER_ON_DEVICE (naive wrapper mode) -> silently ships raw PDF Base64 to Google Cloud!
  const wireBeforePrefer = getWireCount();
  let preferOnDevice: {
    threw: boolean;
    error?: string;
    inferenceSource?: string;
    httpRequests: number;
    bytesSent: number;
    rawPdfBase64LeakedOnWire: boolean;
    decodedLeaksFound: string[];
    verdict: string;
  };
  try {
    const preferModel = getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: { model: cloudModel.trim() || DEFAULT_CLOUD_MODEL }
    });
    const r = await withWireContext("fail_closed_lab", "Lab: PREFER_ON_DEVICE PDF (Deliberate Leak Test)", () =>
      preferModel.generateContent(pdfPrompt)
    );
    const reqs = getWireSlice(wireBeforePrefer);
    const wireText = reqs.map((e) => e.bodyText).join("\n");
    const decodedLeaks = scanOutboundBodyForCanaries(wireText, labCanaries);
    const leaked = reqs.some((e) => e.bodyText.includes(pdfBase64.slice(0, 24))) || decodedLeaks.length > 0;
    annotateWireEntries(
      reqs.map((e) => e.id),
      decodedLeaks
    );
    preferOnDevice = {
      threw: false,
      inferenceSource: r.response.inferenceSource,
      httpRequests: reqs.length,
      bytesSent: reqs.reduce((s, e) => s + e.bodyLength, 0),
      rawPdfBase64LeakedOnWire: leaked,
      decodedLeaksFound: decodedLeaks,
      verdict: leaked
        ? `SILENT LEAK CONFIRMED: PREFER_ON_DEVICE uploaded raw Base64 PDF over HTTPS (decoded identifiers on wire: ${decodedLeaks.join(", ")}).`
        : "Completed via cloud fallback."
    };
  } catch (err) {
    const reqs = getWireSlice(wireBeforePrefer);
    const wireText = reqs.map((e) => e.bodyText).join("\n");
    const decodedLeaks = scanOutboundBodyForCanaries(wireText, labCanaries);
    const leaked = reqs.some((e) => e.bodyText.includes(pdfBase64.slice(0, 24))) || decodedLeaks.length > 0;
    annotateWireEntries(
      reqs.map((e) => e.id),
      decodedLeaks
    );
    preferOnDevice = {
      threw: true,
      error: (err as Error)?.message || String(err),
      httpRequests: reqs.length,
      bytesSent: reqs.reduce((s, e) => s + e.bodyLength, 0),
      rawPdfBase64LeakedOnWire: leaked,
      decodedLeaksFound: decodedLeaks,
      verdict: leaked
        ? `SILENT LEAK CONFIRMED: Even before the server error, PREFER_ON_DEVICE transmitted raw Base64 PDF over HTTPS (decoded: ${decodedLeaks.join(", ")}).`
        : "Threw without network transmission."
    };
  }

  return { onlyOnDevice, preferOnDevice };
}

/**
 * Manual-Redaction Baseline for the reproducible 6-case / 50-canary eval runner.
 * Tagged cleanly to channel="manual_baseline_eval" so deliberate baseline leaks never pollute Cleave's production Wire Proof.
 */
export async function runManualBaselineCloud(
  caseObj: SyntheticCase,
  cloudModel: string,
  onRetry?: (notice: RetryNotice) => void
): Promise<{
  policyMatched: boolean;
  leakedCanaries: string[];
  analysis: CloudAnalysis;
}> {
  const ai = requireAi();
  const modelName = cloudModel.trim() || DEFAULT_CLOUD_MODEL;
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        ...(modelName.includes("lite") ? {} : { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }),
        responseMimeType: "application/json",
        responseSchema: CLOUD_ANALYSIS_SCHEMA
      }
    }
  });

  const hasPlanId = caseObj.manual_redacted_letter.includes(caseObj.plan_id);
  const policy = hasPlanId ? PLAN_EOCS[caseObj.plan_id] : null;

  const prompt = `You are a health insurance policy analyst. Analyze this manually redacted denial letter${
    policy ? " against the Plan EOC below" : " (no plan identifier is visible, so provide general guidance only)"
  }.
Check whether an exception applies, check the 180-day appeal deadline (today is ${BENCHMARK_REFERENCE_DATE}) if dates are visible, flag needs_patient_confirmation if decisive facts are missing/redacted, and cite the exact clause ID or NONE.

MANUALLY REDACTED LETTER:
${caseObj.manual_redacted_letter}

${policy ? `PLAN EOC:\n${JSON.stringify(policy.clauses, null, 2)}` : "PLAN EOC: UNAVAILABLE (plan ID was redacted)."}`;

  const wireBefore = getWireCount();
  const result = await withWireContext("manual_baseline_eval", `Manual Baseline (${caseObj.id})`, () =>
    callWithTransientRetry(() => model.generateContent(prompt), 4, onRetry)
  );
  const wireReqs = getWireSlice(wireBefore);
  const allWireBodies = wireReqs.map((e) => e.bodyText).join("\n");
  const leakedCanaries = scanOutboundBodyForCanaries(allWireBodies, caseObj.canaries);
  annotateWireEntries(
    wireReqs.map((e) => e.id),
    leakedCanaries
  );

  return {
    policyMatched: Boolean(policy),
    leakedCanaries,
    analysis: JSON.parse(result.response.text()) as CloudAnalysis
  };
}
