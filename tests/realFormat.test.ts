import { describe, expect, it } from "vitest";
import {
  buildAndVerifyOutgoingPayload,
  computeDeterministicDayOffsets,
  detectPlanIdCue,
  dropPlanCodeFromVault
} from "../src/lib/gate";
import type { AllowlistKey, IdentityVault } from "../src/lib/types";

// Shape of a CMS-10003 Medicare Advantage denial notice (fictional plan and member).
const CMS_STYLE_LETTER = `EXAMPLE HEALTH ADVANTAGE (HMO)
Notice of Denial of Medical Coverage (or Payment)

Date: November 6, 2026
Name: Daniel R. Whitcombe
Member number: M1047-339-82
Plan: Example Health Advantage (HMO) H9999-001
Date of service: October 17, 2026 (Saturday, check-in time 9:42 PM)`;

describe("real-format (CMS-10003) letters", () => {
  it("reads the bare 'Date:' header as the notice date, not 'Date of service'", () => {
    const d = computeDeterministicDayOffsets(CMS_STYLE_LETTER, "2026-11-26");
    expect(d.rawNoticeDate).toBe("November 6, 2026");
    expect(d.daysSinceDenial).toBe(20);
    expect(d.rawServiceDate).toBe("October 17, 2026");
  });

  it("finds a Medicare contract-PBP number only on a Plan line", () => {
    expect(detectPlanIdCue(CMS_STYLE_LETTER)).toBe("H9999-001");
    expect(detectPlanIdCue("Member number: H1234-567")).toBeNull();
    expect(detectPlanIdCue("Plan Policy: PLAN-HMO-2026-GOLD")).toBe("PLAN-HMO-2026-GOLD");
  });

  it("lets the plan code leave the vault so the gate can send it, but keeps the member", () => {
    const vault: IdentityVault = { member_name: "Daniel R. Whitcombe", member_id: "M1047-339-82", group_id: "H9999-001" };
    const cleaned = dropPlanCodeFromVault(vault, CMS_STYLE_LETTER);
    expect(cleaned.group_id).toBeUndefined();
    expect(cleaned.member_id).toBe("M1047-339-82");

    const enabledKeys: AllowlistKey[] = ["plan_id", "network_status"];
    const proposedAllowlist = { plan_id: "H9999-001", network_status: "OUT_OF_NETWORK" } as const;
    expect(buildAndVerifyOutgoingPayload({ proposedAllowlist, enabledKeys, identityVault: vault }).ok).toBe(false);
    expect(buildAndVerifyOutgoingPayload({ proposedAllowlist, enabledKeys, identityVault: cleaned }).ok).toBe(true);
  });

  it("never frees a code that Nano filed as the member or claim number", () => {
    const vault: IdentityVault = { member_id: "H9999-001" };
    expect(dropPlanCodeFromVault(vault, CMS_STYLE_LETTER).member_id).toBe("H9999-001");
  });
});
