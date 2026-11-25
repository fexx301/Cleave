import { describe, expect, it } from "vitest";
import { BENCHMARK_REFERENCE_DATE, SYNTHETIC_CASES, TOTAL_CANARIES } from "../src/lib/cases";
import {
  ALLOWED_KEYS,
  appendConfirmedPatientFacts,
  buildAndVerifyOutgoingPayload,
  checkChunkBounds,
  computeDeterministicDayOffsets,
  detectAfterHoursCue,
  extractDenialSentenceLocally,
  extractDeterministicVault,
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
    expect(enriched).toContain("Patient-Confirmed Supporting Facts:");
  });

  it("extracts a clean local denial sentence for side-by-side clause display across all 6 cases", () => {
    for (const c of SYNTHETIC_CASES) {
      const quote = extractDenialSentenceLocally(c.raw_letter);
      expect(quote).not.toMatch(/^Notice Date:/i);
      expect(quote).toMatch(/referral|prior authorization|denied|excluded/i);
    }
  });
});
