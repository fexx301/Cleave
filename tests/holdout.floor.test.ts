import { writeFileSync, mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BENCHMARK_REFERENCE_DATE } from "../src/lib/cases";
import { ALLOWED_KEYS, buildAndVerifyOutgoingPayload, extractWithLocalRules, scanOutboundBodyForCanaries } from "../src/lib/gate";
import { HOLDOUT_CASES, HOLDOUT_TOTAL_CANARIES, mechanicalRedact } from "../src/lib/holdoutCases";

/**
 * Held-out FLOOR: the code-only on-device path (no Gemini Nano, no network), the layer every device gets.
 * Measures what can actually fail, not just leaks: re-join coverage (identifiers the local vault captured),
 * day-count accuracy, and the mechanical manual-redaction baseline. Writes eval/holdout-floor.json.
 * Run: npm run eval:holdout
 */
const captured = (vaultValues: string[], canary: string) =>
  vaultValues.some((v) => v.toLowerCase().includes(canary.toLowerCase()) || (v.length >= 6 && canary.toLowerCase().includes(v.toLowerCase())));

describe("held-out floor (code-only on-device path)", () => {
  it("mechanical redaction blanks labelled identity lines and the salutation, and nothing else", () => {
    expect(mechanicalRedact("Member Name: Ada Lovelace\nPlan Policy: PLAN-X\nDear Ms. Ada Lovelace,\nMember | Ada")).toBe(
      "Member Name: [REDACTED]\nPlan Policy: PLAN-X\nDear [REDACTED],\nMember: [REDACTED]"
    );
  });

  it("scores all held-out letters and never puts a planted identifier in the outgoing payload", () => {
    const rows = HOLDOUT_CASES.map((c) => {
      const local = extractWithLocalRules(c.raw_letter, BENCHMARK_REFERENCE_DATE);
      if (!local.ok) return { id: c.id, refused: local.refusal };
      const gate = buildAndVerifyOutgoingPayload({
        proposedAllowlist: local.proposedAllowlist,
        enabledKeys: ALLOWED_KEYS,
        identityVault: local.identityVault
      });
      const payloadText = gate.ok ? JSON.stringify(gate.payload) : "";
      const vaultValues = Object.values(local.identityVault).filter(Boolean) as string[];
      return {
        id: c.id,
        refused: gate.ok ? null : gate.refusal,
        payloadLeaks: scanOutboundBodyForCanaries(payloadText, c.canaries),
        vaultCaptured: c.canaries.filter((k) => captured(vaultValues, k)).length,
        canaries: c.canaries.length,
        missedInVault: c.canaries.filter((k) => !captured(vaultValues, k)),
        daysServiceOk: local.proposedAllowlist.days_since_service === c.ground_truth.expected_days_since_service,
        daysDenialOk: local.proposedAllowlist.days_since_denial === c.ground_truth.expected_days_since_denial,
        manualBaselineLeaks: scanOutboundBodyForCanaries(c.manual_redacted_letter, c.canaries)
      };
    });

    const done = rows.filter((r) => !("refused" in r && r.refused)) as Array<Extract<(typeof rows)[number], { canaries: number }>>;
    const summary = {
      set: "holdout (12 letters, pre-registered)",
      referenceDate: BENCHMARK_REFERENCE_DATE,
      layer: "code-only on-device rules (extractWithLocalRules), no Gemini Nano, 0 network",
      letters: HOLDOUT_CASES.length,
      plantedIdentifiers: HOLDOUT_TOTAL_CANARIES,
      refusals: rows.length - done.length,
      cleavePayloadLeaks: done.reduce((s, r) => s + r.payloadLeaks.length, 0),
      manualBaselineLeaks: done.reduce((s, r) => s + r.manualBaselineLeaks.length, 0),
      rejoinCoverage: `${done.reduce((s, r) => s + r.vaultCaptured, 0)} / ${done.reduce((s, r) => s + r.canaries, 0)}`,
      daysSinceServiceCorrect: `${done.filter((r) => r.daysServiceOk).length} / ${done.length}`,
      daysSinceDenialCorrect: `${done.filter((r) => r.daysDenialOk).length} / ${done.length}`,
      cases: rows
    };
    // Report only on an explicit eval run (npm run eval:holdout), so plain `npm test` never "runs the held-out eval".
    if (process.env.HOLDOUT_REPORT) {
      mkdirSync("eval", { recursive: true });
      // HOLDOUT_OUT keeps the first-run record intact when re-running after fixes.
      writeFileSync(process.env.HOLDOUT_OUT || "eval/holdout-floor.json", JSON.stringify(summary, null, 2) + "\n");
      console.table(
      done.map((r) => ({
        id: r.id,
        payloadLeaks: r.payloadLeaks.length,
        manualLeaks: r.manualBaselineLeaks.length,
        vault: `${r.vaultCaptured}/${r.canaries}`,
        daysSvc: r.daysServiceOk,
        daysDen: r.daysDenialOk
      }))
    );
      console.log(JSON.stringify({ ...summary, cases: undefined }, null, 2));
    }

    // The one structural guarantee: typed enums and integers only, so no planted identifier can be in the payload.
    expect(summary.cleavePayloadLeaks).toBe(0);
  });
});
