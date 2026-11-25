import { BENCHMARK_REFERENCE_DATE } from "./cases";
import type {
  AllowlistFieldMeta,
  AllowlistKey,
  AllowlistProposal,
  CaseScore,
  CloudAnalysis,
  GateResult,
  IdentityVault,
  RefusalCode,
  RejoinedDraft,
  SyntheticCase
} from "./types";

export const MAX_LOCAL_CHARS = 10000;

export const ALLOWLIST_FIELDS: readonly AllowlistFieldMeta[] = [
  {
    key: "plan_id",
    label: "Plan Policy Identifier",
    shortHint: "Matches your plan's exact Evidence of Coverage clauses.",
    removalConsequence:
      "Removing this limits Cleave to general guidance because it cannot look up your specific policy's referral exceptions.",
    kind: "code",
    pattern: /^[A-Z0-9-]{4,32}$/
  },
  {
    key: "denial_reason_code",
    label: "Denial Category",
    shortHint: "Classifies whether the denial cites missing referral or prior auth.",
    removalConsequence: "Without the denial category, Cloud cannot pinpoint which waiver section applies.",
    kind: "enum",
    allowed: ["MISSING_REFERRAL", "MISSING_PRIOR_AUTH", "MISSING_REFERRAL_AND_OON", "OTHER"]
  },
  {
    key: "service_setting",
    label: "Care Setting",
    shortHint: "Distinguishes urgent care, OB-GYN, behavioral health, imaging, or elective visits.",
    removalConsequence: "Without care setting, setting-specific direct-access waivers cannot be checked.",
    kind: "enum",
    allowed: [
      "EMERGENCY_OR_AFTER_HOURS_URGENT",
      "OUTPATIENT_OBGYN",
      "OUTPATIENT_BEHAVIORAL_HEALTH",
      "ADVANCED_DIAGNOSTIC_IMAGING",
      "POST_OP_SPECIALIST_FOLLOWUP",
      "ELECTIVE_OUTPATIENT_SPECIALIST",
      "UNKNOWN"
    ]
  },
  {
    key: "after_hours_visit_confirmed",
    label: "After-Hours / Emergency Confirmed in Notice",
    shortHint: "Indicates whether the letter states an 8 PM–8 AM, weekend, or emergency check-in.",
    removalConsequence: "Cloud will ask you to confirm check-in time before citing an after-hours waiver.",
    kind: "enum",
    allowed: ["YES", "NO", "NOT_MENTIONED"]
  },
  {
    key: "network_status",
    label: "Provider Network Status",
    shortHint: "In-network vs out-of-network participation.",
    removalConsequence: "Without network status, in-network direct-access waivers cannot be confirmed.",
    kind: "enum",
    allowed: ["IN_NETWORK", "OUT_OF_NETWORK", "UNKNOWN"]
  },
  {
    key: "days_since_service",
    label: "Days Since Visit (Relative)",
    shortHint: "Integer day count — never your real calendar date.",
    removalConsequence: "Cannot verify time-bound retroactive prior authorization windows (e.g., 14 days).",
    kind: "integer",
    min: 0,
    max: 3650
  },
  {
    key: "days_since_denial",
    label: "Days Since Denial Notice (Relative)",
    shortHint: "Integer day count — never your real notice date.",
    removalConsequence: "Cannot verify whether the 180-calendar-day internal appeal window is still open.",
    kind: "integer",
    min: 0,
    max: 3650
  },
  {
    key: "urgency_documented",
    label: "Chart Urgency Documented",
    shortHint: "Whether the denial notice notes clinical urgency chart documentation.",
    removalConsequence: "Cloud will ask you to confirm whether your ordering doctor documented urgency.",
    kind: "enum",
    allowed: ["YES", "NO", "NOT_MENTIONED"]
  },
  {
    key: "ongoing_treatment",
    label: "Active Ongoing Treatment",
    shortHint: "Whether the letter mentions post-op, oncology, or obstetric ongoing care.",
    removalConsequence: "Cloud may miss 90-day continuity-of-care transition protections.",
    kind: "enum",
    allowed: ["YES", "NO", "NOT_MENTIONED"]
  },
  {
    key: "enrollment_date_known",
    label: "Enrollment Date Listed in Notice",
    shortHint: "Whether the insurer's notice already includes your plan effective date.",
    removalConsequence: "Cloud will ask you to confirm whether you enrolled within the past 90 days.",
    kind: "enum",
    allowed: ["YES", "NO", "NOT_MENTIONED"]
  }
] as const;

export const ALLOWLIST_BY_KEY: Record<AllowlistKey, AllowlistFieldMeta> = Object.fromEntries(
  ALLOWLIST_FIELDS.map((f) => [f.key, f])
) as Record<AllowlistKey, AllowlistFieldMeta>;

export const ALLOWED_KEYS: readonly AllowlistKey[] = ALLOWLIST_FIELDS.map((f) => f.key);

const DETERMINISTIC_PII_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: "phone", regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/ },
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "iso_or_slash_date", regex: /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/ },
  {
    name: "month_name_date",
    regex:
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i
  },
  { name: "member_or_claim_id", regex: /\b(?:MBR|CLM|GRP)-[A-Z0-9-]{4,}\b/i },
  { name: "doctor_title", regex: /\bDr\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z-]+)?\b/ },
  {
    name: "street_address",
    regex:
      /\b\d{2,5}\s+[A-Z][a-zA-Z0-9.\s]{2,30}\s+(?:Rd|Road|Ave|Avenue|Blvd|Boulevard|St|Street|Ln|Lane|Dr|Drive|Way|Ct|Court)\b/i
  }
];

export function checkChunkBounds(rawLetter: string): { ok: true } | { ok: false; refusal: RefusalCode; reason: string } {
  if (!rawLetter || typeof rawLetter !== "string" || !rawLetter.trim()) {
    return {
      ok: false,
      refusal: "REFUSE_RAW_TEXT_BLOCKED",
      reason: "Letter input is empty. Paste text or drop a local PDF first."
    };
  }
  if (rawLetter.length > MAX_LOCAL_CHARS) {
    return {
      ok: false,
      refusal: "REFUSE_CHUNK_OVERFLOW",
      reason: `Letter length (${rawLetter.length.toLocaleString()} chars) exceeds Cleave's safe local ceiling (${MAX_LOCAL_CHARS.toLocaleString()} chars). Refusing to silently truncate or spill over to the cloud.`
    };
  }
  return { ok: true };
}

export function computeDeterministicDayOffsets(
  rawLetter: string,
  referenceDateIso: string = BENCHMARK_REFERENCE_DATE
): {
  rawNoticeDate: string | null;
  rawServiceDate: string | null;
  daysSinceDenial: number | null;
  daysSinceService: number | null;
} {
  const refMs = Date.parse(`${referenceDateIso}T00:00:00Z`);
  const parseDateLine = (labelRegex: RegExp) => {
    const m = rawLetter.match(labelRegex);
    if (!m?.[1]) return { raw: null, days: null };
    const raw = m[1].trim();
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return { raw, days: null };
    const days = Math.max(0, Math.round((refMs - parsed) / 86400000));
    return { raw, days };
  };

  const notice = parseDateLine(
    /(?:Notice|N0tice)\s+Date:[ \t]*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  const service = parseDateLine(
    /(?:Date of Service|Service Date|Svc Date):[ \t]*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i
  );

  return {
    rawNoticeDate: notice.raw,
    rawServiceDate: service.raw,
    daysSinceDenial: notice.days,
    daysSinceService: service.days
  };
}

/**
 * Deterministic local identifier extraction (uses horizontal whitespace [ \t]+ so matches never bleed across lines).
 */
export function extractDeterministicVault(
  rawLetter: string,
  referenceDateIso: string = BENCHMARK_REFERENCE_DATE
): IdentityVault {
  const vault: IdentityVault = {};
  const grab = (key: keyof IdentityVault, regex: RegExp) => {
    const m = rawLetter.match(regex);
    if (m?.[1]) vault[key] = m[1].trim();
  };

  // Fixed probe defect: strictly horizontal spaces [ \t]+ so name never eats the next line ("Elena Vasquez\nDate")
  grab(
    "member_name",
    /(?:Member Name|Patient|Member|Subscriber|Re):[ \t]*([A-Z][a-zA-Z-]+(?:[ \t]+[A-Z][a-zA-Z-]+){1,2})/m
  );
  grab("dob", /(?:Date of Birth|DOB|born)[ \t]*:?[ \t]*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i);
  grab("member_id", /\b(MBR-[A-Z0-9-]+)\b/);
  grab("claim_id", /\b(CLM-[A-Z0-9-]+)\b/);
  grab("group_id", /\b(GRP-[A-Z0-9-]+)\b/);
  grab(
    "address",
    /(?:Address|residing at)[ \t]*:?[ \t]*([^\n.,]+?(?:Rd|Road|Ave|Avenue|Blvd|Boulevard|St|Street|Ln|Lane|Apt[ \t]+\w+))/i
  );
  grab("phone", /\b(\d{3}-\d{3}-\d{4})\b/);
  grab("email", /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  grab("physician", /\b(Dr\.?[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z-]+)?)\b/);

  const dates = computeDeterministicDayOffsets(rawLetter, referenceDateIso);
  if (dates.rawNoticeDate) vault.notice_date = dates.rawNoticeDate;
  if (dates.rawServiceDate) vault.service_date = dates.rawServiceDate;

  return vault;
}

export function mergeVaults(nanoVault: IdentityVault | undefined, detVault: IdentityVault): IdentityVault {
  const merged: IdentityVault = {};
  const keys = new Set([...Object.keys(nanoVault || {}), ...Object.keys(detVault)]);
  for (const k of keys) {
    const nVal = nanoVault?.[k]?.trim();
    const dVal = detVault[k]?.trim();
    if (nVal) {
      merged[k] = nVal;
      if (dVal && dVal.toLowerCase() !== nVal.toLowerCase()) {
        merged[`${k}_alt`] = dVal;
      }
    } else if (dVal) {
      merged[k] = dVal;
    }
  }
  return merged;
}

/**
 * Deterministic check for after-hours/emergency timestamp cues (8 PM–8 AM, weekend, holiday, ER).
 */
export function detectAfterHoursCue(rawLetter: string): "YES" | "NOT_MENTIONED" {
  const hasLateHour = /\b(?:8|9|10|11):\d{2}[ \t]*PM\b|\b(?:12|1|2|3|4|5|6|7):\d{2}[ \t]*AM\b/i.test(rawLetter);
  const hasExplicitPhrase = /\b(?:after-hours|after hours|emergency services|emergency room|weekend|holiday)\b/i.test(
    rawLetter
  );
  return hasLateHour || hasExplicitPhrase ? "YES" : "NOT_MENTIONED";
}

/**
 * Extracts the exact denial explanation sentence strictly on-device so the UI can show
 * Local Denial Sentence side-by-side with Cloud Cited EOC Clause.
 */
export function extractDenialSentenceLocally(rawLetter: string): string {
  const lines = rawLetter
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const match = lines.find((l) =>
    /^(?:Explanation:|Details:|Notice:|DENIAL REASON:|Reason Code:|RESULT:|ClearPath denied|Your claim)/i.test(l)
  );
  if (match) return match;

  const fallback = lines.find((l) => /denied|referral|prior authorization/i.test(l));
  return fallback || "Denial reason recorded locally on device.";
}

/**
 * Deterministic Code Gate (AI proposes, deterministic code decides):
 * 1. Rejects any raw text / unallowlisted field injection.
 * 2. Constructs a brand-new object strictly from ALLOWED_KEYS ∩ enabledKeys.
 * 3. Validates every field against strict enum/pattern/integer rules.
 * 4. Scans the serialized JSON against every extracted local vault identifier + PII regexes.
 */
export function buildAndVerifyOutgoingPayload(params: {
  proposedAllowlist: AllowlistProposal;
  enabledKeys: readonly AllowlistKey[];
  identityVault: IdentityVault;
  injectedPayload?: Record<string, unknown>;
}): GateResult {
  const { proposedAllowlist, enabledKeys, identityVault, injectedPayload } = params;

  if (injectedPayload) {
    const illegalKeys = Object.keys(injectedPayload).filter(
      (k) => !(ALLOWED_KEYS as readonly string[]).includes(k)
    );
    if (illegalKeys.length > 0) {
      return {
        ok: false,
        refusal: "REFUSE_RAW_TEXT_BLOCKED",
        reason: `Unallowlisted key(s) blocked before serialization: ${illegalKeys.join(", ")}. Raw letter text never enters the cloud serializer.`
      };
    }
  }

  const payload: Partial<Record<AllowlistKey, string | number>> = {};
  const droppedInvalidFields: string[] = [];

  for (const key of ALLOWED_KEYS) {
    if (!enabledKeys.includes(key)) continue;
    const spec = ALLOWLIST_BY_KEY[key];
    const val = proposedAllowlist[key];
    if (val === undefined || val === null || val === "") continue;

    if (spec.kind === "enum") {
      const s = String(val).trim();
      if (!spec.allowed?.includes(s)) {
        droppedInvalidFields.push(`${key}="${s}" rejected (not in allowed enum)`);
        continue;
      }
      payload[key] = s;
    } else if (spec.kind === "code") {
      const s = String(val).trim();
      if (spec.pattern && !spec.pattern.test(s)) {
        return {
          ok: false,
          refusal: "REFUSE_RAW_TEXT_BLOCKED",
          reason: `Field "${key}" failed strict identifier pattern (free text is blocked).`
        };
      }
      payload[key] = s;
    } else if (spec.kind === "integer") {
      const n = Number(val);
      if (!Number.isInteger(n) || (spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
        droppedInvalidFields.push(`${key}="${String(val)}" rejected (invalid integer)`);
        continue;
      }
      payload[key] = n;
    }
  }

  const serialized = JSON.stringify(payload);
  const serializedLower = serialized.toLowerCase();

  // Scan against EVERY extracted local identity value
  const vaultSecrets = Object.values(identityVault)
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length >= 3);

  for (const secret of vaultSecrets) {
    if (serializedLower.includes(secret.toLowerCase())) {
      return {
        ok: false,
        refusal: "REFUSE_RESIDUAL_IDENTIFIER",
        reason: `A locally extracted identifier (${secret.length} chars) appeared in the candidate outgoing payload. Transmission blocked by deterministic code gate.`,
        matchedSecretLength: secret.length
      };
    }
  }

  // Deterministic PII pattern scan (catches email/phone/DOB/ID/address/doctor even if missed by vault)
  for (const pat of DETERMINISTIC_PII_PATTERNS) {
    if (pat.regex.test(serialized)) {
      return {
        ok: false,
        refusal: "REFUSE_RESIDUAL_IDENTIFIER",
        reason: `Deterministic PII pattern (${pat.name}) matched inside outgoing payload. Transmission blocked.`
      };
    }
  }

  return {
    ok: true,
    payload,
    serialized,
    droppedInvalidFields,
    policyMatchEnabled: Boolean(payload.plan_id)
  };
}

export function scanOutboundBodyForCanaries(outboundText: string, canaries: readonly string[]): string[] {
  const haystack = String(outboundText || "").toLowerCase();
  return canaries.filter((c) => haystack.includes(c.toLowerCase()));
}

export function rejoinDraftLocally(cloudDraft: string, identityVault: IdentityVault): RejoinedDraft {
  if (!cloudDraft) {
    return { text: "", rejoinedTokens: [], orphanPlaceholders: [] };
  }

  const replacements: Array<[string, string | undefined]> = [
    ["[MEMBER_NAME]", identityVault.member_name],
    ["[DOB]", identityVault.dob],
    ["[MEMBER_ID]", identityVault.member_id],
    ["[CLAIM_ID]", identityVault.claim_id],
    ["[DENIAL_DATE]", identityVault.notice_date],
    ["[SERVICE_DATE]", identityVault.service_date],
    ["[FACILITY_NAME]", identityVault.facility_name],
    ["[PROVIDER_NAME]", identityVault.physician]
  ];

  let out = cloudDraft;
  const rejoinedTokens: Array<{ token: string; value: string }> = [];

  for (const [token, realVal] of replacements) {
    if (realVal && out.includes(token)) {
      out = out.split(token).join(realVal);
      rejoinedTokens.push({ token, value: realVal });
    }
  }

  const orphanPlaceholders = Array.from(new Set(out.match(/\[[A-Z0-9_]+\]/g) || []));
  return { text: out, rejoinedTokens, orphanPlaceholders };
}

export function appendConfirmedPatientFacts(baseDraft: string, confirmedFacts: string[]): string {
  if (confirmedFacts.length === 0) return baseDraft;
  const block = [
    "",
    "Patient-Confirmed Supporting Facts:",
    ...confirmedFacts.map((fact) => `- Confirmed by member: ${fact}`)
  ].join("\n");
  return `${baseDraft.trim()}${block}`;
}

export function scoreCaseAgainstGroundTruth(caseObj: SyntheticCase, analysis: CloudAnalysis): CaseScore {
  const gt = caseObj.ground_truth;
  const cited = String(analysis.cited_clause_id || "").toLowerCase();
  const clauseMatch =
    gt.expected_clause === "4.1 / 8.2"
      ? cited.includes("4.1") || cited.includes("8.2")
      : cited.includes(gt.expected_clause.toLowerCase());
  const exceptionMatch = analysis.exception_applies === gt.exception_applies;
  const confirmationMatch = Boolean(analysis.needs_patient_confirmation) === Boolean(gt.requires_patient_confirmation);
  return {
    clauseMatch,
    exceptionMatch,
    confirmationMatch,
    exactPass: clauseMatch && exceptionMatch && confirmationMatch
  };
}
