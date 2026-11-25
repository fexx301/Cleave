import { describe, expect, it } from "vitest";
import { BENCHMARK_REFERENCE_DATE, SYNTHETIC_CASES, TOTAL_CANARIES } from "../src/lib/cases";
import {
  ALLOWED_KEYS,
  appendConfirmedPatientFacts,
  buildAndVerifyOutgoingPayload,
  checkChunkBounds,
  computeDeterministicDayOffsets,
  detectAfterHoursCue,
  detectDenialReasonCue,
  detectNetworkStatusCue,
  detectOngoingTreatmentCue,
  detectServiceSettingCue,
  extractDenialSentenceLocally,
  extractDeterministicVault,
  getDisplayVaultEntries,
  mergeVaults,
  rejoinDraftLocally,
  scanOutboundBodyForCanaries
} from "../src/lib/gate";

describe("Cleave deterministic code gate & allowlist boundary", () => {
  it("contains exactly 50 enumerated planted identity canaries across the 6 synthetic cases", () => {
    expect(SYNTHETIC_CASES).toHaveLength(6);
    expect(TOTAL_CANARIES).toBe(50);
  });

  it("computes exact relative day offsets deterministically for all 6 cases", () => {
    for (const c of SYNTHETIC_CASES) {
      const d = computeDeterministicDayOffsets(c.raw_letter, BENCHMARK_REFERENCE_DATE);
      expect(d.daysSinceService).toBe(c.ground_truth.expected_days_since_service);
      expect(d.daysSinceDenial).toBe(c.ground_truth.expected_days_since_denial);
    }
  });

  it("extracts member_name cleanly on a single line without bleeding across newlines (probe regression fix)", () => {
    const vault = extractDeterministicVault(SYNTHETIC_CASES[0].raw_letter, BENCHMARK_REFERENCE_DATE);
    expect(vault.member_name).toBe("Elena Vasquez");
    expect(vault.member_name).not.toContain("\n");
    expect(vault.member_id).toBe("MBR-8841209");
    expect(vault.claim_id).toBe("CLM-2026-991042");
    expect(vault.physician).toBe("Dr. Marcus Thornton");
  });

  it("detects after-hours cue cleanly on Case 1 and not on Case 6", () => {
    expect(detectAfterHoursCue(SYNTHETIC_CASES[0].raw_letter)).toBe("YES");
    expect(detectAfterHoursCue(SYNTHETIC_CASES[5].raw_letter)).toBe("NOT_MENTIONED");
  });

  it("enforces REFUSE_CHUNK_OVERFLOW for oversized inputs", () => {
    const res = checkChunkBounds("A".repeat(12000));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.refusal).toBe("REFUSE_CHUNK_OVERFLOW");
  });

  it("enforces REFUSE_RAW_TEXT_BLOCKED when an unallowlisted raw text key is injected", () => {
    const res = buildAndVerifyOutgoingPayload({
      proposedAllowlist: { plan_id: "PLAN-HMO-2026-GOLD", denial_reason_code: "MISSING_REFERRAL" },
      enabledKeys: ALLOWED_KEYS,
      identityVault: { member_name: "Elena Vasquez" },
      injectedPayload: { raw_letter: "Member Name: Elena Vasquez..." }
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.refusal).toBe("REFUSE_RAW_TEXT_BLOCKED");
  });

  it("enforces REFUSE_RESIDUAL_IDENTIFIER when any local vault secret or PII pattern slips into outgoing payload", () => {
    const resVault = buildAndVerifyOutgoingPayload({
      proposedAllowlist: { plan_id: "MBR-8841209" },
      enabledKeys: ALLOWED_KEYS,
      identityVault: { member_id: "MBR-8841209" }
    });
    expect(resVault.ok).toBe(false);
    if (!resVault.ok) expect(resVault.refusal).toBe("REFUSE_RESIDUAL_IDENTIFIER");

    // Even if vault missed it, deterministic PII regex still catches MBR- IDs!
    const resRegex = buildAndVerifyOutgoingPayload({
      proposedAllowlist: { plan_id: "MBR-9999999" },
      enabledKeys: ALLOWED_KEYS,
      identityVault: {}
    });
    expect(resRegex.ok).toBe(false);
    if (!resRegex.ok) expect(resRegex.refusal).toBe("REFUSE_RESIDUAL_IDENTIFIER");
  });

  it("degrades policyMatchEnabled to false when the patient toggles off plan_id", () => {
    const enabledWithoutPlan = ALLOWED_KEYS.filter((k) => k !== "plan_id");
    const res = buildAndVerifyOutgoingPayload({
      proposedAllowlist: {
        plan_id: "PLAN-HMO-2026-GOLD",
        denial_reason_code: "MISSING_REFERRAL",
        service_setting: "EMERGENCY_OR_AFTER_HOURS_URGENT",
        after_hours_visit_confirmed: "YES",
        network_status: "OUT_OF_NETWORK",
        days_since_service: 19,
        days_since_denial: 11
      },
      enabledKeys: enabledWithoutPlan,
      identityVault: extractDeterministicVault(SYNTHETIC_CASES[0].raw_letter)
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.policyMatchEnabled).toBe(false);
      expect(res.payload.plan_id).toBeUndefined();
      expect(scanOutboundBodyForCanaries(res.serialized, SYNTHETIC_CASES[0].canaries)).toEqual([]);
    }
  });

  it("leaks 0 of 50 canaries across structured allowlists while realistic manual redaction leaks 8 of 50", () => {
    let manualLeaks = 0;
    let allowlistLeaks = 0;

    for (const c of SYNTHETIC_CASES) {
      manualLeaks += scanOutboundBodyForCanaries(c.manual_redacted_letter, c.canaries).length;
      const d = computeDeterministicDayOffsets(c.raw_letter);
      const gate = buildAndVerifyOutgoingPayload({
        proposedAllowlist: {
          plan_id: c.plan_id,
          denial_reason_code: "MISSING_REFERRAL",
          service_setting: "EMERGENCY_OR_AFTER_HOURS_URGENT",
          network_status: "IN_NETWORK",
          days_since_service: d.daysSinceService,
          days_since_denial: d.daysSinceDenial
        },
        enabledKeys: ALLOWED_KEYS,
        identityVault: extractDeterministicVault(c.raw_letter)
      });
      expect(gate.ok).toBe(true);
      if (gate.ok) {
        allowlistLeaks += scanOutboundBodyForCanaries(gate.serialized, c.canaries).length;
      }
    }
    expect(allowlistLeaks).toBe(0);
    expect(manualLeaks).toBe(8);
  });

  it("re-joins local identity cleanly with 0 orphan placeholders and appends confirmed patient facts", () => {
    const vault = mergeVaults(
      { facility_name: "St. Jude Regional Medical Center" },
      extractDeterministicVault(SYNTHETIC_CASES[0].raw_letter)
    );
    const cloudDraft =
      "Claim [CLAIM_ID] for [MEMBER_NAME] ([MEMBER_ID]) seen on [SERVICE_DATE] by [PROVIDER_NAME] at [FACILITY_NAME], denied [DENIAL_DATE].";
    const rejoined = rejoinDraftLocally(cloudDraft, vault);
    expect(rejoined.orphanPlaceholders).toEqual([]);
    expect(rejoined.text).toContain("Elena Vasquez");
    expect(rejoined.text).toContain("CLM-2026-991042");
    expect(rejoined.text).toContain("St. Jude Regional Medical Center");
    expect(rejoined.text).toContain("November 6, 2026");

    const enriched = appendConfirmedPatientFacts(rejoined.text, [
      "Ordering physician documented clinical urgency in chart."
    ]);
    expect(enriched).toContain("Verified Member Confirmation:");

    // Slot replacement avoids awkward contradiction between pending caveat and confirmed fact
    const slotted = rejoinDraftLocally(
      "Claim [CLAIM_ID] for [MEMBER_NAME]. [PENDING_PATIENT_CONFIRMATION]",
      vault
    );
    expect(slotted.orphanPlaceholders).toEqual([]);
    const unchecked = appendConfirmedPatientFacts(slotted.text, []);
    expect(unchecked).toContain("Pending member confirmation");
    const checked = appendConfirmedPatientFacts(slotted.text, [
      "My ordering physician documented clinical urgency in my medical chart."
    ]);
    expect(checked).not.toContain("Pending member confirmation");
    expect(checked).toContain("My ordering physician documented clinical urgency in my medical chart.");
  });

  it("extracts a clean local denial sentence for side-by-side clause display across all 6 cases", () => {
    for (const c of SYNTHETIC_CASES) {
      const quote = extractDenialSentenceLocally(c.raw_letter);
      expect(quote).not.toMatch(/^Notice Date:/i);
      expect(quote).toMatch(/referral|prior authorization|denied|excluded/i);
    }
  });

  it("backstops Case 4 denial category, post-op setting, network status, and ongoing treatment deterministically", () => {
    const case4 = SYNTHETIC_CASES[3];
    expect(detectDenialReasonCue(case4.raw_letter)).toBe("MISSING_REFERRAL_AND_OON");
    expect(detectServiceSettingCue(case4.raw_letter)).toBe("POST_OP_SPECIALIST_FOLLOWUP");
    expect(detectOngoingTreatmentCue(case4.raw_letter)).toBe("YES");
    expect(detectNetworkStatusCue(case4.raw_letter)).toBe("OUT_OF_NETWORK");
  });

  it("detects Base64-encoded PDF canary leaks inside JSON inlineData wire payloads", () => {
    const syntheticPdf = "%PDF-1.4\n% Elena Vasquez MBR-8841209 CLM-2026-991042";
    const encoded = Buffer.from(syntheticPdf, "utf8").toString("base64");
    const wireBody = JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType: "application/pdf", data: encoded } }] }]
    });
    const found = scanOutboundBodyForCanaries(wireBody, ["Elena Vasquez", "MBR-8841209", "NotInPdf"]);
    expect(found).toEqual(["Elena Vasquez", "MBR-8841209"]);
  });

  it("filters _alt keys consistently in getDisplayVaultEntries so UI counts always agree", () => {
    const merged = mergeVaults(
      { member_name: "David Okafor", physician: "Dr. Lindqvist" },
      { member_name: "David Okafor", physician: "Dr. Samuel Lindqvist" }
    );
    expect(Object.keys(merged)).toContain("physician_alt");
    const displayed = getDisplayVaultEntries(merged);
    expect(displayed.map(([k]) => k)).not.toContain("physician_alt");
    expect(displayed).toHaveLength(2);
  });
});
