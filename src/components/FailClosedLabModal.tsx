import { useState } from "react";
import { runFailClosedPdfComparison } from "../lib/firebaseAi";
import { ALLOWED_KEYS, buildAndVerifyOutgoingPayload, checkChunkBounds } from "../lib/gate";
import { CloseIcon } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  cloudModel: string;
  firebaseReady: boolean;
  onOpenSettings: () => void;
}

export function FailClosedLabModal({ open, onClose, cloudModel, firebaseReady, onOpenSettings }: Props) {
  const [runningPdf, setRunningPdf] = useState(false);
  const [pdfResult, setPdfResult] = useState<Awaited<ReturnType<typeof runFailClosedPdfComparison>> | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Record<string, unknown> | null>(null);

  if (!open) return null;

  async function handleRunPdfComparison() {
    setPdfError(null);
    setRunningPdf(true);
    try {
      const res = await runFailClosedPdfComparison(cloudModel);
      setPdfResult(res);
    } catch (err) {
      setPdfError((err as Error)?.message || String(err));
    } finally {
      setRunningPdf(false);
    }
  }

  function handleRunRefusals() {
    setRefusals({
      REFUSE_CHUNK_OVERFLOW: checkChunkBounds("X".repeat(15000)),
      REFUSE_RAW_TEXT_BLOCKED: buildAndVerifyOutgoingPayload({
        proposedAllowlist: { plan_id: "PLAN-HMO-2026-GOLD", denial_reason_code: "MISSING_REFERRAL" },
        enabledKeys: ALLOWED_KEYS,
        identityVault: { member_name: "Elena Vasquez" },
        injectedPayload: { raw_letter: "Member Name: Elena Vasquez, MBR-8841209..." }
      }),
      REFUSE_RESIDUAL_IDENTIFIER: buildAndVerifyOutgoingPayload({
        proposedAllowlist: { plan_id: "MBR-8841209" },
        enabledKeys: ALLOWED_KEYS,
        identityVault: { member_id: "MBR-8841209" }
      }),
      REFUSE_LOCAL_UNAVAILABLE: {
        ok: false,
        refusal: "REFUSE_LOCAL_UNAVAILABLE",
        reason:
          "Triggered whenever ONLY_ON_DEVICE throws (unsupported browser/device such as Safari or iPhone 14 Pro Max, or unsupported MIME type). Cleave refuses to switch to PREFER_ON_DEVICE."
      }
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Fail-Closed Hybrid Lab and Named Refusals">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Fail-Closed Lab &amp; Named Refusals</h2>
            <p className="pane-desc">
              Why Cleave forbids <code>PREFER_ON_DEVICE</code> on sensitive documents — and enforces four machine-readable refusals in deterministic code.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close fail-closed lab">
            <CloseIcon />
          </button>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ maxWidth: 500 }}>
              <span className="tag tag-red" style={{ marginBottom: 6 }}>Isolated Live SDK Proof</span>
              <h3 style={{ margin: "4px 0 4px", fontSize: 16, color: "var(--ink-primary)" }}>
                <code>ONLY_ON_DEVICE</code> vs. <code>PREFER_ON_DEVICE</code> on a Denial PDF
              </h3>
              <p className="pane-desc">
                In <code>@firebase/ai</code>, Chrome&apos;s on-device adapter accepts JPEG/PNG images, not <code>application/pdf</code>.
                Passing a denial PDF to <code>PREFER_ON_DEVICE</code> silently uploads the raw PDF Base64 to Google Cloud. Cleave parses PDFs locally with <code>pdfjs-dist</code> and locks extraction to <code>ONLY_ON_DEVICE</code>.
              </p>
            </div>
            {firebaseReady ? (
              <button className="btn btn-primary" onClick={handleRunPdfComparison} disabled={runningPdf}>
                {runningPdf ? "Running Live Comparison..." : "Run Live PDF Comparison"}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onOpenSettings}>
                Configure Firebase First
              </button>
            )}
          </div>

          {pdfError && <div className="callout callout-red" style={{ marginTop: 12 }}>{pdfError}</div>}

          {pdfResult && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <div className="callout callout-green">
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>
                  Cleave Mode: ONLY_ON_DEVICE
                </div>
                <strong>{pdfResult.onlyOnDevice.verdict}</strong>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  HTTP Requests: <code>{pdfResult.onlyOnDevice.httpRequests}</code>
                  {pdfResult.onlyOnDevice.error ? ` · Local error: ${pdfResult.onlyOnDevice.error}` : ""}
                </div>
              </div>
              <div className="callout callout-red">
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>
                  Naive Wrapper: PREFER_ON_DEVICE
                </div>
                <strong>{pdfResult.preferOnDevice.verdict}</strong>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  HTTP Requests: <code>{pdfResult.preferOnDevice.httpRequests}</code> · Raw PDF on Wire:{" "}
                  <code>{String(pdfResult.preferOnDevice.rawPdfBase64LeakedOnWire)}</code>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "var(--ink-primary)" }}>
                Four Named Deterministic Refusals
              </h3>
              <p className="pane-desc">
                The on-device model proposes fields; deterministic code inspects the serialized payload and decides whether egress is permitted.
              </p>
            </div>
            <button className="btn" onClick={handleRunRefusals}>
              Trigger All 4 Refusals
            </button>
          </div>

          {refusals && <pre className="code-block" style={{ marginTop: 12 }}>{JSON.stringify(refusals, null, 2)}</pre>}
        </div>
      </div>
    </div>
  );
}
