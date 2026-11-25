import { useEffect, useMemo, useState } from "react";
import { getDisplayVaultEntries, scanOutboundBodyForCanaries } from "../lib/gate";
import type { IdentityVault, InferenceTrailStep, WireEntry } from "../lib/types";
import { clearWireEntries } from "../lib/wireSpy";
import { CloseIcon } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  wireEntries: WireEntry[];
  trail: InferenceTrailStep[];
  identityVault: IdentityVault | null;
  sessionVaultSecrets: string[];
}

export function WireProofModal({ open, onClose, wireEntries, trail, identityVault, sessionVaultSecrets }: Props) {
  const [tab, setTab] = useState<"production" | "lab_eval">("production");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const prodEntries = useMemo(
    () => wireEntries.filter((e) => e.channel === "cleave_production"),
    [wireEntries]
  );
  const labAndEvalEntries = useMemo(
    () => wireEntries.filter((e) => e.channel !== "cleave_production"),
    [wireEntries]
  );

  // Audit EVERY Cleave production request against ALL local vault secrets seen across the entire session (plain + Base64).
  // App Check token requests are scanned too, so moving them out of the production count never hides a leak.
  const currentVaultCount = getDisplayVaultEntries(identityVault).length;
  const allProdBody = wireEntries
    .filter((e) => e.channel === "cleave_production" || e.channel === "app_check")
    .map((e) => e.bodyText)
    .join("\n");
  const crossCaseProdLeaks = useMemo(
    () => scanOutboundBodyForCanaries(allProdBody, sessionVaultSecrets),
    [allProdBody, sessionVaultSecrets]
  );
  const perRequestProdLeaks = useMemo(
    () => Array.from(new Set(prodEntries.flatMap((e) => e.leakedValues || []))),
    [prodEntries]
  );
  const totalProdLeaks = Array.from(new Set([...crossCaseProdLeaks, ...perRequestProdLeaks]));

  // Group provenance trail cleanly by runId
  const groupedTrail = useMemo(() => {
    const groups: Array<{ runId: string; caseLabel: string; steps: InferenceTrailStep[] }> = [];
    for (const step of trail) {
      const last = groups[groups.length - 1];
      if (last && last.runId === step.runId) {
        last.steps.push(step);
      } else {
        groups.push({ runId: step.runId, caseLabel: step.caseLabel, steps: [step] });
      }
    }
    return groups;
  }, [trail]);

  if (!open) return null;

  const shownEntries = tab === "production" ? prodEntries : labAndEvalEntries;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Wire Proof and Inference Provenance"
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Wire Proof &amp; Inference Provenance</h2>
            <p className="pane-desc">
              Read-only capture of actual outbound HTTPS <code>fetch()</code> requests (including Base64 inlineData decoding).
              Cleave production traffic is audited separately from deliberate Fail-Closed Lab and Manual-Baseline Eval requests.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close wire proof">
            <CloseIcon />
          </button>
        </div>

        <div
          className={`callout ${totalProdLeaks.length === 0 ? "callout-green" : "callout-red"}`}
          style={{ marginBottom: 16 }}
        >
          {totalProdLeaks.length === 0 ? (
            <>
              <strong>Cleave Production Traffic Verified ({prodEntries.length} HTTPS request(s)):</strong> 0 of{" "}
              {sessionVaultSecrets.length} session-wide local vault identifier(s) ({currentVaultCount} in active case)
              appeared in plain or Base64-decoded outbound request bodies.
            </>
          ) : (
            <>
              <strong>Production Leak Alert:</strong> {totalProdLeaks.length} local identifier(s) detected in Cleave
              production traffic: {totalProdLeaks.join(", ")}
            </>
          )}
        </div>

        <h3
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            color: "var(--ink-muted)"
          }}
        >
          Execution Provenance Trail (Grouped by Run)
        </h3>

        {groupedTrail.length === 0 ? (
          <p className="pane-desc" style={{ marginBottom: 16 }}>
            Run &ldquo;Cleave Letter on Device&rdquo; and &ldquo;Match Policy Clause in Cloud&rdquo; to populate the
            provenance trail.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {groupedTrail.map((group) => (
              <div
                key={group.runId}
                style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}
              >
                <div
                  style={{
                    padding: "7px 12px",
                    background: "var(--bg-recessed)",
                    borderBottom: "1px solid var(--border)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--ink-primary)",
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                >
                  <strong>{group.caseLabel}</strong>
                  <span style={{ color: "var(--ink-muted)" }}>
                    {group.steps.reduce((sum, s) => sum + s.httpRequests, 0)} HTTP req(s)
                  </span>
                </div>
                <table className="data-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Mode</th>
                      <th>Source</th>
                      <th>HTTP</th>
                      <th>Bytes</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.steps.map((step, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{step.step}</strong>
                          <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>{step.note}</div>
                        </td>
                        <td>
                          <code>{step.modeRequested}</code>
                        </td>
                        <td>
                          <span
                            className={`tag ${
                              step.inferenceSource === "on_device"
                                ? "tag-green"
                                : step.inferenceSource === "in_cloud"
                                  ? "tag-blue"
                                  : "tag-neutral"
                            }`}
                          >
                            {step.inferenceSource}
                          </span>
                        </td>
                        <td>
                          <code>{step.httpRequests}</code>
                        </td>
                        <td>
                          <code>{step.bytesSent.toLocaleString()} B</code>
                        </td>
                        <td>
                          <code>{step.latencyMs} ms</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <div className="tab-bar" role="tablist">
          <button
            className={`tab-btn ${tab === "production" ? "active" : ""}`}
            onClick={() => setTab("production")}
            role="tab"
            aria-selected={tab === "production"}
          >
            Cleave Production ({prodEntries.length})
          </button>
          <button
            className={`tab-btn ${tab === "lab_eval" ? "active" : ""}`}
            onClick={() => setTab("lab_eval")}
            role="tab"
            aria-selected={tab === "lab_eval"}
          >
            Lab, Eval &amp; App Check ({labAndEvalEntries.length})
          </button>
          {wireEntries.length > 0 && (
            <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={clearWireEntries}>
              Clear Log
            </button>
          )}
        </div>

        {shownEntries.length === 0 ? (
          <div className="callout callout-green">
            {tab === "production"
              ? "Zero Cleave production HTTPS requests recorded yet. On-device ONLY_ON_DEVICE extraction produces zero network traffic."
              : "No Fail-Closed Lab, Manual-Baseline evaluation, or App Check requests captured yet."}
          </div>
        ) : (
          shownEntries.map((entry) => {
            const leaks = entry.leakedValues || [];
            return (
              <div
                key={entry.id}
                style={{
                  marginBottom: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 12
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                    fontSize: 12,
                    alignItems: "center"
                  }}
                >
                  <div>
                    <strong>{entry.caseLabel || entry.channel}</strong>{" "}
                    <code style={{ color: "var(--ink-muted)" }}>
                      {entry.method} {entry.url}
                    </code>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span className="tag tag-blue">{entry.bodyLength.toLocaleString()} bytes</span>
                    <span className={`tag ${leaks.length === 0 ? "tag-green" : "tag-red"}`}>
                      {leaks.length === 0 ? "0 leaks" : `${leaks.length} leaked (${leaks.join(", ")})`}
                    </span>
                  </div>
                </div>
                <pre className="code-block">{entry.bodyText || "(empty body)"}</pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
