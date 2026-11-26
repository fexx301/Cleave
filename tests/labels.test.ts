import { describe, expect, it } from "vitest";
import { ALLOWED_KEYS, appendConfirmedPatientFacts, buildAndVerifyOutgoingPayload, rejoinDraftLocally } from "../src/lib/gate";
import { humanizeValue, humanizeVaultKey, toMemberVoice } from "../src/lib/labels";
import { RECORDED_REPLAY_RUNS } from "../src/lib/recordedReplay";

describe("Plain-English labels & Recorded Replay integrity", () => {
  it("humanizes allowlist enum values, vault keys, and third-person member voice cleanly", () => {
    expect(humanizeValue("EMERGENCY_OR_AFTER_HOURS_URGENT")).toBe("Emergency or after-hours urgent care");
    expect(humanizeValue("NOT_MENTIONED")).toBe("Not in letter");
    expect(humanizeValue("PLAN-HMO-2026-GOLD")).toBe("PLAN-HMO-2026-GOLD");
    expect(humanizeVaultKey("claim_id")).toBe("Claim number");
    expect(toMemberVoice("The ordering physician documented urgency in the patient's chart.")).toBe(
      "The ordering physician documented urgency in my chart."
    );
  });

  it("verifies recorded replay snapshots pass the deterministic gate with 0 leaks and 0 orphan placeholders", () => {
    for (const snap of Object.values(RECORDED_REPLAY_RUNS)) {
      const gate = buildAndVerifyOutgoingPayload({
        proposedAllowlist: snap.proposedAllowlist,
        enabledKeys: ALLOWED_KEYS,
        identityVault: snap.identityVault
      });
      expect(gate.ok).toBe(true);

      const joined = rejoinDraftLocally(snap.cloudAnalysis.draft_request_for_review, snap.identityVault);
      expect(joined.orphanPlaceholders).toEqual([]);
      expect(joined.rejoinedTokens.length).toBeGreaterThanOrEqual(5);

      if (snap.cloudAnalysis.needs_patient_confirmation) {
        const beforeTick = appendConfirmedPatientFacts(joined.text, []);
        expect(beforeTick).not.toContain("[PENDING_PATIENT_CONFIRMATION]");
        const afterTick = appendConfirmedPatientFacts(joined.text, [
          snap.cloudAnalysis.confirmation_items[0].draft_statement
        ]);
        expect(afterTick).toContain("My ordering physician documented clinical urgency in my medical chart.");
        expect(afterTick).not.toContain("Pending member confirmation");
      }
    }
  });
});

describe("plainCodesInProse", () => {
  it("turns fact codes into plain words but leaves placeholders alone", async () => {
    const { plainCodesInProse } = await import("../src/lib/labels");
    const draft =
      "This claim was denied under denial code MISSING_REFERRAL_AND_OON for [MEMBER_NAME]. [PENDING_PATIENT_CONFIRMATION] Network: OUT_OF_NETWORK. Ref UNLISTED_CODE.";
    expect(plainCodesInProse(draft)).toBe(
      "This claim was denied under denial code missing referral, out-of-network for [MEMBER_NAME]. [PENDING_PATIENT_CONFIRMATION] Network: out of network. Ref UNLISTED_CODE."
    );
  });
});
