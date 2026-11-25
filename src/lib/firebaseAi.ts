import { deleteApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
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
  extractDeterministicVault,
  mergeVaults,
  scanOutboundBodyForCanaries
} from "./gate";
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
import { getWireCount, getWireSlice } from "./wireSpy";

const CONFIG_STORAGE_KEY = "cleave_firebase_config_v1";
const APPCHECK_DEBUG_STORAGE_KEY = "cleave_appcheck_debug_token_v1";
const RECAPTCHA_STORAGE_KEY = "cleave_recaptcha_site_key_v1";
const CLOUD_MODEL_STORAGE_KEY = "cleave_cloud_model_v1";

export const DEFAULT_CLOUD_MODEL =
  (import.meta.env.VITE_CLOUD_MODEL as string | undefined) || "gemini-3.5-flash-lite";

let activeApp: FirebaseApp | null = null;
let activeAi: AI | null = null;
let activeAppCheckMode: "off" | "debug_token" | "recaptcha_v3" = "off";

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
    confirmation_questions: Schema.array({ items: Schema.string() }),
    plain_explanation: Schema.string(),
    draft_request_for_review: Schema.string({
      description:
        "Editable Request for Review using ONLY opaque placeholders [MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME]. Never invent real personal identifiers."
    })
  },
  required: [
    "mode_used",
    "cited_clause_id",
    "cited_clause_quote",
    "exception_applies",
    "needs_patient_confirmation",
    "confirmation_questions",
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
  appCheckMode: "off" | "debug_token" | "recaptcha_v3";
}> {
  if (!settings.config) {
    throw new Error("Paste your Firebase Web config in Settings first.");
  }

  for (const app of getApps()) {
    await deleteApp(app);
  }

  const g = self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean };
  const debugToken = settings.appCheckDebugToken.trim();
  const recaptchaKey = settings.recaptchaSiteKey.trim();

  if (debugToken) {
    g.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else {
    delete g.FIREBASE_APPCHECK_DEBUG_TOKEN;
  }

  activeApp = initializeApp(settings.config);

  if (debugToken) {
    initializeAppCheck(activeApp, {
      provider: new ReCaptchaV3Provider(recaptchaKey || "debug-placeholder-site-key"),
      isTokenAutoRefreshEnabled: true
    });
    activeAppCheckMode = "debug_token";
  } else if (recaptchaKey) {
    initializeAppCheck(activeApp, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true
    });
    activeAppCheckMode = "recaptcha_v3";
  } else {
    activeAppCheckMode = "off";
  }

  activeAi = getAI(activeApp, { backend: new GoogleAIBackend() });

  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(settings.config, null, 2));
  if (debugToken) localStorage.setItem(APPCHECK_DEBUG_STORAGE_KEY, debugToken);
  else localStorage.removeItem(APPCHECK_DEBUG_STORAGE_KEY);
  if (recaptchaKey) localStorage.setItem(RECAPTCHA_STORAGE_KEY, recaptchaKey);
  else localStorage.removeItem(RECAPTCHA_STORAGE_KEY);
  localStorage.setItem(CLOUD_MODEL_STORAGE_KEY, settings.cloudModel.trim() || DEFAULT_CLOUD_MODEL);

  return { projectId: settings.config.projectId, appCheckMode: activeAppCheckMode };
}

export function clearSavedFirebaseSettings(): void {
  localStorage.removeItem(CONFIG_STORAGE_KEY);
  localStorage.removeItem(APPCHECK_DEBUG_STORAGE_KEY);
  localStorage.removeItem(RECAPTCHA_STORAGE_KEY);
  activeAi = null;
  activeApp = null;
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

async function callWithTransientRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error)?.message || err);
      const is429 = /\b429\b|rate|quota/i.test(msg);
      const isTransient = is429 || /\b(500|503)\b|high demand|overloaded|temporarily/i.test(msg);
      if (!isTransient || attempt === maxAttempts) throw err;
      const delayMs = is429 ? 5000 * attempt : 1500 * attempt;
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
    const result = await localModel.generateContent(prompt);
    const latencyMs = Math.round(performance.now() - t0);
    const httpRequestsDuringLocal = getWireSlice(wireBefore).length;

    const parsed = JSON.parse(result.response.text()) as {
      identity_vault?: IdentityVault;
      allowlist_proposal?: AllowlistProposal;
    };

    const detVault = extractDeterministicVault(rawLetter, referenceDateIso);
    const mergedVault = mergeVaults(parsed.identity_vault, detVault);
    const dayOffsets = computeDeterministicDayOffsets(rawLetter, referenceDateIso);
    const detAfterHours = detectAfterHoursCue(rawLetter);

    const proposedAllowlist: AllowlistProposal = {
      ...(parsed.allowlist_proposal || {}),
      after_hours_visit_confirmed:
        parsed.allowlist_proposal?.after_hours_visit_confirmed === "YES" || detAfterHours === "YES"
          ? "YES"
          : parsed.allowlist_proposal?.after_hours_visit_confirmed || "NOT_MENTIONED",
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
}

/**
 * Step 2 of Cleave: strictly ONLY_IN_CLOUD analysis over the deterministic gate's allowlist JSON + generic EOC.
 */
export async function analyzeAllowlistInCloud(params: {
  allowlistPayload: Partial<Record<AllowlistKey, string | number>>;
  cloudModel: string;
  canariesToAudit?: readonly string[];
  customEoc?: PlanEoc | null;
}): Promise<CloudAnalysisOutcome> {
  const ai = requireAi();
  const { allowlistPayload, cloudModel, canariesToAudit = [], customEoc } = params;
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
  const policy: PlanEoc | null = planId ? customEoc || PLAN_EOCS[planId] || null : null;

  const prompt = policy
    ? `You are a health insurance policy analyst. You receive ONLY structured non-identifying claim facts and a generic Plan Evidence of Coverage (EOC).
Rules:
1. Check whether an EOC exception clause applies AND check the internal appeal filing deadline (Section 8.2 / 9.1: 180 calendar days using days_since_denial).
2. Cite the exact clause ID(s) and quote the controlling sentence verbatim.
3. For Section 4.2(a): if service_setting is EMERGENCY_OR_AFTER_HOURS_URGENT AND after_hours_visit_confirmed is YES (and days_since_denial <= 180), set exception_applies="YES" and needs_patient_confirmation=false (chart urgency documentation is only required for Section 5.1(c) imaging, NOT Section 4.2(a) after-hours care).
4. For Section 4.3(b) or 4.4(a): if network_status is IN_NETWORK and service_setting matches (and days_since_denial <= 180), set exception_applies="YES" and needs_patient_confirmation=false.
5. If an exception depends on an unconfirmed fact (such as Section 5.1(c) chart urgency documentation or Section 6.4(a) plan enrollment within 90 days), set exception_applies="CONDITIONAL", needs_patient_confirmation=true, and list the exact patient confirmation question(s). Never invent unconfirmed facts.
6. If no exception applies or days_since_denial > 180, set exception_applies="NO", needs_patient_confirmation=false, and cite the controlling rules (e.g. "4.1 / 8.2").
7. Write draft_request_for_review using ONLY opaque placeholders: [MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME].

ALLOWLIST CLAIM FACTS (JSON):
${JSON.stringify(allowlistPayload, null, 2)}

GENERIC PLAN EOC (${policy.plan_id} — ${policy.plan_name}):
${JSON.stringify(policy.clauses, null, 2)}`
    : `You are a health insurance appeal helper. The patient removed their Plan Policy Identifier, so NO specific Plan Evidence of Coverage is available.
Set mode_used="GENERAL_GUIDANCE_ONLY", cited_clause_id="NONE", cited_clause_quote="", exception_applies="UNKNOWN_NO_POLICY", needs_patient_confirmation=true.
Explain plainly what general appeal guidance applies from the remaining allowlisted fields, and explain clearly that matching a specific referral or prior-authorization waiver requires the plan identifier and Evidence of Coverage.
Use ONLY opaque placeholders ([MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME]) in draft_request_for_review.

ALLOWLIST CLAIM FACTS (JSON):
${JSON.stringify(allowlistPayload, null, 2)}`;

  const wireBefore = getWireCount();
  const t0 = performance.now();
  const result = await callWithTransientRetry(() => model.generateContent(prompt));
  const latencyMs = Math.round(performance.now() - t0);
  const wireEntries = getWireSlice(wireBefore);
  const allWireBodies = wireEntries.map((e) => e.bodyText).join("\n");
  const leakedCanaries = scanOutboundBodyForCanaries(allWireBodies, canariesToAudit);

  const analysis = JSON.parse(result.response.text()) as CloudAnalysis;
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
}): Promise<{
  inferenceSource: string;
  latencyMs: number;
  httpRequests: number;
  offlineDegraded: boolean;
  summaryText: string;
}> {
  const ai = requireAi();
  const { allowlistPayload, cloudModel, forceSimulateOffline } = params;
  const modelName = cloudModel.trim() || DEFAULT_CLOUD_MODEL;

  const wireBefore = getWireCount();
  const t0 = performance.now();

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

  const prompt = `In 3 short bullet points, give a quick offline appeal readiness checklist from ONLY these non-identifying claim fields (do not invent policy clause numbers):
${JSON.stringify(allowlistPayload)}`;

  const result = await model.generateContent(prompt);
  const latencyMs = Math.round(performance.now() - t0);
  const httpRequests = getWireSlice(wireBefore).length;
  const source = result.response.inferenceSource || (httpRequests === 0 ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD);

  return {
    inferenceSource: source,
    latencyMs,
    httpRequests,
    offlineDegraded: source === InferenceSource.ON_DEVICE,
    summaryText: result.response.text()
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
    rawPdfBase64LeakedOnWire: boolean;
    verdict: string;
  };
}> {
  const ai = requireAi();
  const syntheticPdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n% Elena Vasquez MBR-8841209 CLM-2026-991042";
  const pdfBase64 = btoa(syntheticPdf);
  const pdfPrompt = [
    { text: "Summarize this denial letter in 10 words." },
    { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }
  ];

  // 1. ONLY_ON_DEVICE (Cleave's mode) -> MUST fail closed locally with 0 HTTP requests
  const wireBeforeStrict = getWireCount();
  let onlyOnDevice: { threw: boolean; error?: string; httpRequests: number; verdict: string };
  try {
    const strictModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
    await strictModel.generateContent(pdfPrompt);
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

  // 2. PREFER_ON_DEVICE (naive wrapper mode) -> silently ships raw PDF Base64 to Google Cloud!
  const wireBeforePrefer = getWireCount();
  let preferOnDevice: {
    threw: boolean;
    error?: string;
    inferenceSource?: string;
    httpRequests: number;
    rawPdfBase64LeakedOnWire: boolean;
    verdict: string;
  };
  try {
    const preferModel = getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: { model: cloudModel.trim() || DEFAULT_CLOUD_MODEL }
    });
    const r = await preferModel.generateContent(pdfPrompt);
    const reqs = getWireSlice(wireBeforePrefer);
    const leaked = reqs.some((e) => e.bodyText.includes(pdfBase64.slice(0, 24)));
    preferOnDevice = {
      threw: false,
      inferenceSource: r.response.inferenceSource,
      httpRequests: reqs.length,
      rawPdfBase64LeakedOnWire: leaked,
      verdict: leaked
        ? "SILENT LEAK CONFIRMED: PREFER_ON_DEVICE bypassed Gemini Nano and uploaded raw PDF Base64 over HTTPS."
        : "Completed via cloud fallback."
    };
  } catch (err) {
    const reqs = getWireSlice(wireBeforePrefer);
    const leaked = reqs.some((e) => e.bodyText.includes(pdfBase64.slice(0, 24)));
    preferOnDevice = {
      threw: true,
      error: (err as Error)?.message || String(err),
      httpRequests: reqs.length,
      rawPdfBase64LeakedOnWire: leaked,
      verdict: leaked
        ? "SILENT LEAK CONFIRMED: Even before the server error, PREFER_ON_DEVICE transmitted raw PDF Base64 over HTTPS."
        : "Threw without network transmission."
    };
  }

  return { onlyOnDevice, preferOnDevice };
}

/**
 * Manual-Redaction Baseline for the reproducible 6-case / 50-canary eval runner.
 */
export async function runManualBaselineCloud(
  caseObj: SyntheticCase,
  cloudModel: string
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
  const result = await callWithTransientRetry(() => model.generateContent(prompt));
  const allWireBodies = getWireSlice(wireBefore)
    .map((e) => e.bodyText)
    .join("\n");
  const leakedCanaries = scanOutboundBodyForCanaries(allWireBodies, caseObj.canaries);

  return {
    policyMatched: Boolean(policy),
    leakedCanaries,
    analysis: JSON.parse(result.response.text()) as CloudAnalysis
  };
}
