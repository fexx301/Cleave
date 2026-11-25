import { useEffect, useState } from "react";
import { BENCHMARK_REFERENCE_DATE, SYNTHETIC_CASES, TOTAL_CANARIES } from "../lib/cases";
import { analyzeAllowlistInCloud, extractOnDevice, runManualBaselineCloud } from "../lib/firebaseAi";
import {
  ALLOWED_KEYS,
  buildAndVerifyOutgoingPayload,
  checkChunkBounds,
  rejoinDraftLocally,
  scoreCaseAgainstGroundTruth
} from "../lib/gate";
import type { CaseEvalReport, SuiteEvalSummary } from "../lib/types";
import { CloseIcon } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  cloudModel: string;
  firebaseReady: boolean;
  onOpenSettings: () => void;
}

export function EvalSuiteModal({ open, onClose, cloudModel, firebaseReady, onOpenSettings }: Props) {
  const [running, setRunning] = useState(false);
  const [progressLine, setProgressLine] = useState<string>("");
  const [summary, setSummary] = useState<SuiteEvalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleRunSuite() {
    setRunning(true);
    setError(null);
    setSummary(null);

    const caseReports: CaseEvalReport[] = [];
    let completedCases = 0;
    let falseRefusals = 0;
    let cleaveLeaks = 0;
    let cleaveClauseMatches = 0;
    let cleaveExactPasses = 0;
    let manualLeaks = 0;
    let manualClauseMatches = 0;
    let manualExactPasses = 0;

    const validDetChecks = [
      checkChunkBounds("X".repeat(15000)).ok === false,
      buildAndVerifyOutgoingPayload({
        proposedAllowlist: { plan_id: "PLAN-HMO-2026-GOLD" },
        enabledKeys: ALLOWED_KEYS,
        identityVault: { member_name: "Elena Vasquez" },
        injectedPayload: { raw_text: "Elena Vasquez" }
      }).ok === false,
      buildAndVerifyOutgoingPayload({
        proposedAllowlist: { plan_id: "MBR-8841209" },
        enabledKeys: ALLOWED_KEYS,
        identityVault: { member_id: "MBR-8841209" }
      }).ok === false
    ].filter(Boolean).length;

    try {
      for (let i = 0; i < SYNTHETIC_CASES.length; i++) {
        const c = SYNTHETIC_CASES[i];
        setProgressLine(`Running ${i + 1} / ${SYNTHETIC_CASES.length}: ${c.shortTitle}...`);

        const report: CaseEvalReport = {
          id: c.id,
          title: c.title,
          canaryCount: c.canaries.length,
          groundTruth: c.ground_truth,
          cleave: { status: "ERROR", leakedCanaries: [] }
        };

        const localRes = await extractOnDevice(c.raw_letter, BENCHMARK_REFERENCE_DATE);
        if (!localRes.ok) {
          falseRefusals += 1;
          report.cleave = {
            status: "FALSE_REFUSAL",
            refusal: localRes.refusal,
            reason: localRes.reason,
            leakedCanaries: []
          };
        } else {
          const gateRes = buildAndVerifyOutgoingPayload({
            proposedAllowlist: localRes.proposedAllowlist,
            enabledKeys: ALLOWED_KEYS,
            identityVault: localRes.identityVault
          });

          if (!gateRes.ok) {
            falseRefusals += 1;
            report.cleave = {
              status: "FALSE_REFUSAL_AT_GATE",
              refusal: gateRes.refusal,
              reason: gateRes.reason,
              leakedCanaries: []
            };
          } else {
            const cloudRes = await analyzeAllowlistInCloud({
              allowlistPayload: gateRes.payload,
              cloudModel,
              canariesToAudit: c.canaries,
              caseLabel: `Eval Cleave (${c.id})`,
              onRetry: (n) =>
                setProgressLine(
                  `${i + 1}/${SYNTHETIC_CASES.length} (${c.shortTitle}): ${
                    n.isRateLimit ? "Rate limited (429)" : "Cloud busy"
                  } — retrying (${n.nextAttempt}/${n.maxAttempts}) in ${n.delaySec}s...`
                )
            });
            const rejoined = rejoinDraftLocally(cloudRes.analysis.draft_request_for_review, localRes.identityVault);
            const score = scoreCaseAgainstGroundTruth(c, cloudRes.analysis);

            completedCases += 1;
            cleaveLeaks += cloudRes.leakedCanaries.length;
            if (score.clauseMatch) cleaveClauseMatches += 1;
            if (score.exactPass) cleaveExactPasses += 1;

            report.cleave = {
              status: "COMPLETED",
              localSource: localRes.inferenceSource,
              localNetworkRequests: localRes.httpRequestsDuringLocal,
              cloudSource: cloudRes.inferenceSource,
              outgoingPayload: gateRes.payload,
              leakedCanaries: cloudRes.leakedCanaries,
              citedClause: cloudRes.analysis.cited_clause_id,
              exceptionApplies: cloudRes.analysis.exception_applies,
              needsConfirmation: cloudRes.analysis.needs_patient_confirmation,
              orphanPlaceholders: rejoined.orphanPlaceholders,
              score
            };
          }
        }

        const manualRes = await runManualBaselineCloud(c, cloudModel, (n) =>
          setProgressLine(
            `${i + 1}/${SYNTHETIC_CASES.length} Manual Baseline: ${
              n.isRateLimit ? "Rate limited (429)" : "Cloud busy"
            } — retrying (${n.nextAttempt}/${n.maxAttempts}) in ${n.delaySec}s...`
          )
        );
        const manualScore = scoreCaseAgainstGroundTruth(c, manualRes.analysis);
        manualLeaks += manualRes.leakedCanaries.length;
        if (manualScore.clauseMatch) manualClauseMatches += 1;
        if (manualScore.exactPass) manualExactPasses += 1;

        report.manualBaseline = {
          policyMatched: manualRes.policyMatched,
          leakedCanaries: manualRes.leakedCanaries,
          citedClause: manualRes.analysis.cited_clause_id,
          exceptionApplies: manualRes.analysis.exception_applies,
          needsConfirmation: manualRes.analysis.needs_patient_confirmation,
          score: manualScore
        };

        caseReports.push(report);
        if (i < SYNTHETIC_CASES.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      setSummary({
        timestamp: new Date().toISOString(),
        cloudModel,
        totalCases: SYNTHETIC_CASES.length,
        totalPlantedCanaries: TOTAL_CANARIES,
        completedCases,
        falseRefusals,
        validDeterministicRefusals: validDetChecks,
        cleaveLeaks,
        cleaveClauseMatches,
        cleaveExactPasses,
        manualLeaks,
        manualClauseMatches,
        manualExactPasses,
        cases: caseReports
      });
      setProgressLine("Completed all 6 cases.");
    } catch (err) {
      setError((err as Error)?.message || String(err));
    } finally {
      setRunning(false);
    }
  }

  function handleExport() {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cleave-eval-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="6-Case 50-Identifier Evaluation Suite"
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title">6-Case / 50-Identifier Benchmark</h2>
            <p className="pane-desc">
              Runs 6 synthetic missing-referral &amp; prior-auth cases (50 planted personal identifiers) live against both
              Cleave and a realistic manual-redaction baseline, tracking completed cases, refusals, leaks, and clause
              accuracy separately. Manual-baseline traffic is isolated from Cleave&apos;s production Wire Proof audit.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close evaluation suite">
            <CloseIcon />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {firebaseReady ? (
            <button className="btn btn-primary" onClick={handleRunSuite} disabled={running}>
              {running ? progressLine || "Running..." : "Run Live 6-Case Suite"}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onOpenSettings}>
              Configure Firebase First
            </button>
          )}
          {summary && (
            <button className="btn" onClick={handleExport}>
              Export JSON Report
            </button>
          )}
        </div>

        {error && <div className="callout callout-red">{error}</div>}

        {summary && (
          <>
            <div className="metrics-grid">
              <div className="metric-box">
                <div className="metric-label">Cleave Leaks</div>
                <div className="metric-value">
                  {summary.cleaveLeaks} / {summary.totalPlantedCanaries}
                </div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Manual Baseline Leaks</div>
                <div className="metric-value">
                  {summary.manualLeaks} / {summary.totalPlantedCanaries}
                </div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Cleave Exact Pass</div>
                <div className="metric-value">
                  {summary.cleaveExactPasses} / {summary.totalCases}
                </div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Manual Exact Pass</div>
                <div className="metric-value">
                  {summary.manualExactPasses} / {summary.totalCases}
                </div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Completed / False Refusals</div>
                <div className="metric-value">
                  {summary.completedCases}/6 · {summary.falseRefusals}
                </div>
              </div>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Ground Truth</th>
                  <th>Cleave (Clause · Verdict · Leaks)</th>
                  <th>Manual Redaction</th>
                </tr>
              </thead>
              <tbody>
                {summary.cases.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.id}</strong></td>
                    <td>
                      <code>{r.groundTruth.expected_clause}</code> · {r.groundTruth.exception_applies}
                      {r.groundTruth.requires_patient_confirmation ? " · confirm" : ""}
                    </td>
                    <td>
                      <code>{r.cleave.citedClause || "—"}</code> · {r.cleave.exceptionApplies || r.cleave.status}
                      {r.cleave.needsConfirmation ? " · confirm" : ""} ·{" "}
                      <span className={`tag ${r.cleave.leakedCanaries.length === 0 ? "tag-green" : "tag-red"}`}>
                        {r.cleave.leakedCanaries.length} leaks
                      </span>{" "}
                      <span className={`tag ${r.cleave.score?.exactPass ? "tag-green" : "tag-neutral"}`}>
                        {r.cleave.score?.exactPass ? "pass" : "miss"}
                      </span>
                    </td>
                    <td>
                      <code>{r.manualBaseline?.citedClause || "—"}</code> · {r.manualBaseline?.exceptionApplies || "—"}
                      {r.manualBaseline?.needsConfirmation ? " · confirm" : ""} ·{" "}
                      <span className={`tag ${(r.manualBaseline?.leakedCanaries.length || 0) === 0 ? "tag-green" : "tag-red"}`}>
                        {r.manualBaseline?.leakedCanaries.length || 0} leaks
                      </span>{" "}
                      <span className={`tag ${r.manualBaseline?.score?.exactPass ? "tag-green" : "tag-neutral"}`}>
                        {r.manualBaseline?.score?.exactPass ? "pass" : "miss"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
