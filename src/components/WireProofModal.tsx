import { clearWireEntries } from "../lib/wireSpy";
import { scanOutboundBodyForCanaries } from "../lib/gate";
import type { IdentityVault, InferenceTrailStep, WireEntry } from "../lib/types";
import { CloseIcon } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  wireEntries: WireEntry[];
  trail: InferenceTrailStep[];
  identityVault: IdentityVault | null;
}

export function WireProofModal({ open, onClose, wireEntries, trail, identityVault }: Props) {
  if (!open) return null;

  const vaultValues = Object.values(identityVault || {})
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length >= 3);

  const allWireText = wireEntries.map((e) => e.bodyText).join("\n");
  const leakedVaultValues = scanOutboundBodyForCanaries(allWireText, vaultValues);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Wire Proof and Inference Provenance">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Wire Proof &amp; Inference Provenance</h2>
            <p className="pane-desc">
              Read-only capture of actual outbound HTTPS <code>fetch()</code> requests made during this session. Verify independently in Chrome DevTools &rarr; Network.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close wire proof">
            <CloseIcon />
          </button>
        </div>

        <div className={`callout ${leakedVaultValues.length === 0 ? "callout-green" : "callout-red"}`} style={{ marginBottom: 16 }}>
          {leakedVaultValues.length === 0 ? (
            <>
              <strong>Verified across {wireEntries.length} captured HTTPS request(s):</strong> 0 of {vaultValues.length} extracted local identity field(s) appeared in outbound request bodies.
            </>
          ) : (
            <>
              <strong>Warning:</strong> {leakedVaultValues.length} vault identifier(s) detected in captured traffic: {leakedVaultValues.join(", ")}
            </>
          )}
        </div>

        <h3 style={{ margin: "0 0 8px", fontSize: 13, fontFamily: "var(--font-mono)", textTransform: "uppercase", color: "var(--ink-muted)" }}>
          Execution Provenance Trail
        </h3>
        {trail.length === 0 ? (
          <p className="pane-desc" style={{ marginBottom: 16 }}>
            Run &ldquo;Cleave Letter on Device&rdquo; and &ldquo;Match Policy Clause in Cloud&rdquo; to populate the inference provenance trail.
          </p>
        ) : (
          <table className="data-table" style={{ marginBottom: 20 }}>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Requested Mode</th>
                <th>Observed Source</th>
                <th>HTTP Reqs</th>
                <th>Bytes Sent</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {trail.map((step, i) => (
                <tr key={i}>
                  <td>
                    <strong>{step.step}</strong>
                    <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>{step.note}</div>
                  </td>
                  <td><code>{step.modeRequested}</code></td>
                  <td>
                    <span className={`tag ${step.inferenceSource === "on_device" ? "tag-green" : step.inferenceSource === "in_cloud" ? "tag-blue" : "tag-neutral"}`}>
                      {step.inferenceSource}
                    </span>
                  </td>
                  <td><code>{step.httpRequests}</code></td>
                  <td><code>{step.bytesSent.toLocaleString()} B</code></td>
                  <td><code>{step.latencyMs} ms</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontFamily: "var(--font-mono)", textTransform: "uppercase", color: "var(--ink-muted)" }}>
            Captured Outbound HTTPS Requests ({wireEntries.length})
          </h3>
          {wireEntries.length > 0 && (
            <button className="btn btn-sm" onClick={clearWireEntries}>
              Clear Log
            </button>
          )}
        </div>

        {wireEntries.length === 0 ? (
          <div className="callout callout-green">
            Zero outbound HTTPS requests recorded so far. On-device extraction via <code>ONLY_ON_DEVICE</code> generates zero network traffic.
          </div>
        ) : (
          wireEntries.map((entry) => (
            <div key={entry.id} style={{ marginBottom: 12, border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                <code>
                  {entry.method} {entry.url}
                </code>
                <span className="tag tag-blue">{entry.bodyLength.toLocaleString()} bytes</span>
              </div>
              <pre className="code-block">{entry.bodyText || "(empty body)"}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
