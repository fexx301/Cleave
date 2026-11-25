// Display-only plain-English labels. Never use these for payloads, scoring, or trail notes: the enum codes stay the data.

const VALUE_LABELS: Record<string, string> = {
  MISSING_REFERRAL: "Missing referral",
  MISSING_PRIOR_AUTH: "Missing prior authorization",
  MISSING_REFERRAL_AND_OON: "Missing referral, out-of-network",
  OTHER: "Other",
  EMERGENCY_OR_AFTER_HOURS_URGENT: "Emergency or after-hours urgent care",
  OUTPATIENT_OBGYN: "OB-GYN visit",
  OUTPATIENT_BEHAVIORAL_HEALTH: "Behavioral health",
  ADVANCED_DIAGNOSTIC_IMAGING: "Advanced imaging (MRI / CT / PET)",
  POST_OP_SPECIALIST_FOLLOWUP: "Post-op specialist follow-up",
  ELECTIVE_OUTPATIENT_SPECIALIST: "Elective specialist visit",
  IN_NETWORK: "In network",
  OUT_OF_NETWORK: "Out of network",
  UNKNOWN: "Unknown",
  YES: "Yes",
  NO: "No",
  NOT_MENTIONED: "Not in letter"
};

const VAULT_KEY_LABELS: Record<string, string> = {
  member_name: "Member name",
  dob: "Date of birth",
  member_id: "Member ID",
  claim_id: "Claim number",
  group_id: "Group ID",
  address: "Address",
  email: "Email",
  phone: "Phone",
  physician: "Physician",
  facility_name: "Facility",
  notice_date: "Denial notice date",
  service_date: "Service date"
};

export const EXCEPTION_LABELS: Record<string, string> = {
  YES: "Exception applies",
  CONDITIONAL: "Exception possible — needs your confirmation",
  NO: "No exception applies",
  UNKNOWN_NO_POLICY: "Can't tell without your plan"
};

export const NANO_STATUS_LABELS: Record<string, string> = {
  available: "On-Device Ready",
  downloadable: "Model not downloaded yet",
  downloading: "Downloading model…",
  unavailable: "Unavailable on this device",
  unsupported_browser: "Not supported in this browser"
};

function sentenceCase(code: string): string {
  const words = code.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function humanizeValue(value: string): string {
  return VALUE_LABELS[value] ?? (/^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(value) ? sentenceCase(value) : value);
}

export function humanizeVaultKey(key: string): string {
  return VAULT_KEY_LABELS[key] ?? sentenceCase(key);
}

/** Rewrites third-person possessives in a confirmation sentence into the member's own voice. */
export function toMemberVoice(statement: string): string {
  return statement.replace(/\b(the) (patient|member)['’]s\b/gi, (_m, the: string) => (the === "The" ? "My" : "my"));
}

console.assert(humanizeValue("NOT_MENTIONED") === "Not in letter");
console.assert(humanizeValue("SOME_NEW_CODE") === "Some new code");
console.assert(humanizeValue("PLAN-HMO-2026-GOLD") === "PLAN-HMO-2026-GOLD");
console.assert(
  toMemberVoice("The ordering physician documented urgency in the patient's chart.") ===
    "The ordering physician documented urgency in my chart."
);
console.assert(toMemberVoice("The member’s enrollment began in 2026.") === "My enrollment began in 2026.");
