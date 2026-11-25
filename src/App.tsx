import React, { useEffect, useMemo, useRef, useState } from "react";
import { EvalSuiteModal } from "./components/EvalSuiteModal";
import { FailClosedLabModal } from "./components/FailClosedLabModal";
import { HighlightedLetter } from "./components/HighlightedLetter";
import {
  CleaveMarkIcon,
  CloudSplitIcon,
  DeviceLockIcon,
  DocumentUploadIcon,
  SeamScissorsIcon
} from "./components/Icons";
import { SettingsModal } from "./components/SettingsModal";
import { WireProofModal } from "./components/WireProofModal";
import { BENCHMARK_REFERENCE_DATE, PLAN_EOCS, SYNTHETIC_CASES } from "./lib/cases";
import {
  analyzeAllowlistInCloud,
  checkNanoAvailability,
  extractOnDevice,
  initializeCleaveFirebase,
  loadSavedSettings,
  runOfflineResilientTriage,
  type NanoAvailability,
  type RuntimeSettings
} from "./lib/firebaseAi";
import {
  ALLOWED_KEYS,
  ALLOWLIST_FIELDS,
  appendConfirmedPatientFacts,
  buildAndVerifyOutgoingPayload,
  extractDenialSentenceLocally,
  getDisplayVaultEntries,
  rejoinDraftLocally
} from "./lib/gate";
import { extractPdfTextLocally } from "./lib/pdf";
import type {
  AllowlistKey,
  AllowlistProposal,
  CloudAnalysis,
  IdentityVault,
  InferenceTrailStep,
  RefusalCode,
  RejoinedDraft,
  WireEntry
} from "./lib/types";
import { getAllWireEntries, subscribeWire } from "./lib/wireSpy";

type ModalKey = null | "settings" | "wire" | "lab" | "eval";

export default function App() {
  const [settings, setSettings] = useState<RuntimeSettings>(() => loadSavedSettings());
  const [firebaseInfo, setFirebaseInfo] = useState<{
    ready: boolean;
    projectId: string | null;
    appCheckMode: "off" | "debug_token" | "recaptcha_v3";
  }>({ ready: false, projectId: null, appCheckMode: "off" });
  const [nanoStatus, setNanoStatus] = useState<NanoAvailability>("unavailable");
  const [activeModal, setActiveModal] = useState<ModalKey>(null);

  // Document & case state (stays strictly in local browser memory)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(SYNTHETIC_CASES[0].id);
  const [rawLetter, setRawLetter] = useState<string>(SYNTHETIC_CASES[0].raw_letter);
  const [uploadedFileNote, setUploadedFileNote] = useState<string | null>(null);
  const [letterEditMode, setLetterEditMode] = useState<boolean>(false);
  const [vaultExpanded, setVaultExpanded] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Local ONLY_ON_DEVICE split state
  const [cleaving, setCleaving] = useState(false);
  const [localError, setLocalError] = useState<{ refusal?: RefusalCode; message: string } | null>(null);
  const [identityVault, setIdentityVault] = useState<IdentityVault | null>(null);
  const [proposedAllowlist, setProposedAllowlist] = useState<AllowlistProposal | null>(null);
  const [enabledKeys, setEnabledKeys] = useState<AllowlistKey[]>([...ALLOWED_KEYS]);
  const [localMeta, setLocalMeta] = useState<{ source: string; latencyMs: number; httpRequests: number } | null>(null);
  const [activeRunId, setActiveRunId] = useState<string>("run-init");

  // Cloud ONLY_IN_CLOUD / Offline PREFER_IN_CLOUD separate loading states
  const [analyzingCloud, setAnalyzingCloud] = useState(false);
  const [runningOffline, setRunningOffline] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudAnalysis, setCloudAnalysis] = useState<CloudAnalysis | null>(null);
  const [cloudMeta, setCloudMeta] = useState<{
    source: string;
    latencyMs: number;
    wireBytes: number;
    leakedCanaries: number;
    policyMatched: boolean;
    allowlistSnapshot: string;
  } | null>(null);
  const [offlineTriage, setOfflineTriage] = useState<{
    source: string;
    latencyMs: number;
    httpRequests: number;
    summaryText: string;
  } | null>(null);

  // Local re-joined draft + interactive patient confirmation state
  const [rejoined, setRejoined] = useState<RejoinedDraft | null>(null);
  const [confirmedIndices, setConfirmedIndices] = useState<number[]>([]);
  const [editableDraft, setEditableDraft] = useState<string>("");
  const [copiedBanner, setCopiedBanner] = useState(false);

  // Wire spy, provenance trail, and session-wide vault secrets for cross-case audit
  const [wireEntries, setWireEntries] = useState<WireEntry[]>(() => getAllWireEntries());
  const [trail, setTrail] = useState<InferenceTrailStep[]>([]);
  const [sessionVaultSecrets, setSessionVaultSecrets] = useState<string[]>([]);

  useEffect(() => {
    const unsub = subscribeWire(() => setWireEntries(getAllWireEntries()));
    checkNanoAvailability().then(setNanoStatus);

    const saved = loadSavedSettings();
    if (saved.config) {
      initializeCleaveFirebase(saved)
        .then((info) => {
          setFirebaseInfo({ ready: true, projectId: info.projectId, appCheckMode: info.appCheckMode });
        })
        .catch(() => {
          setFirebaseInfo({ ready: false, projectId: null, appCheckMode: "off" });
        });
    }
    return unsub;
  }, []);

  const activeSampleCase = useMemo(
    () => SYNTHETIC_CASES.find((c) => c.id === selectedCaseId) || null,
    [selectedCaseId]
  );

  const activeCaseLabel = activeSampleCase
    ? `${activeSampleCase.id}: ${activeSampleCase.shortTitle}`
    : uploadedFileNote
      ? "Local Uploaded Letter"
      : "Custom Denial Letter";

  // Live deterministic code gate evaluation whenever checkboxes change
  const liveGate = useMemo(() => {
    if (!proposedAllowlist || !identityVault) return null;
    return buildAndVerifyOutgoingPayload({
      proposedAllowlist,
      enabledKeys,
      identityVault
    });
  }, [proposedAllowlist, enabledKeys, identityVault]);

  const localDenialSentence = useMemo(() => extractDenialSentenceLocally(rawLetter), [rawLetter]);
  const vaultEntries = useMemo(() => getDisplayVaultEntries(identityVault), [identityVault]);
  const prodWireCount = useMemo(
    () => wireEntries.filter((e) => e.channel === "cleave_production").length,
    [wireEntries]
  );

  function resetOutputs() {
    setLocalError(null);
    setIdentityVault(null);
    setProposedAllowlist(null);
    setLocalMeta(null);
    setCloudError(null);
    setCloudAnalysis(null);
    setCloudMeta(null);
    setOfflineTriage(null);
    setRejoined(null);
    setConfirmedIndices([]);
    setEditableDraft("");
    setEnabledKeys([...ALLOWED_KEYS]);
  }

  function handleSelectSample(caseId: string) {
    const found = SYNTHETIC_CASES.find((c) => c.id === caseId);
    if (!found) return;
    setSelectedCaseId(found.id);
    setRawLetter(found.raw_letter);
    setUploadedFileNote(null);
    setLetterEditMode(false);
    resetOutputs();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    resetOutputs();
    setSelectedCaseId(null);
    setLetterEditMode(false);
    try {
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        const res = await extractPdfTextLocally(file);
        setRawLetter(res.text);
        setUploadedFileNote(
          `Parsed "${res.fileName}" locally in browser (${res.pageCount} page${res.pageCount === 1 ? "" : "s"}, ${Math.round(
            res.byteLength / 1024
          )} KB — 0 bytes uploaded)`
        );
      } else {
        const text = await file.text();
        setRawLetter(text);
        setUploadedFileNote(`Loaded local text file "${file.name}" (0 bytes uploaded)`);
      }
    } catch (err) {
      setLocalError({ message: (err as Error)?.message || String(err) });
    } finally {
      e.target.value = "";
    }
  }

  function handlePurgeLocalVault() {
    setIdentityVault(null);
    setProposedAllowlist(null);
    setLocalMeta(null);
    setRejoined(null);
    setEditableDraft("");
    setConfirmedIndices([]);
    if (!selectedCaseId) {
      setRawLetter("");
      setUploadedFileNote(null);
    }
  }

  async function handleCleaveLocally() {
    if (!firebaseInfo.ready) {
      setActiveModal("settings");
      return;
    }
    const nextRunId = `run-${Date.now()}`;
    setActiveRunId(nextRunId);
    setCleaving(true);
    setLocalError(null);
    setCloudError(null);
    setCloudAnalysis(null);
    setCloudMeta(null);
    setOfflineTriage(null);
    setRejoined(null);
    setConfirmedIndices([]);

    const refDate = activeSampleCase
      ? BENCHMARK_REFERENCE_DATE
      : new Date().toISOString().slice(0, 10);

    const res = await extractOnDevice(rawLetter, refDate);
    setCleaving(false);

    if (!res.ok) {
      setLocalError({ refusal: res.refusal, message: res.reason });
      setTrail((prev) => [
        ...prev,
        {
          runId: nextRunId,
          caseLabel: activeCaseLabel,
          step: `Local Split (${res.refusal})`,
          modeRequested: "only_on_device",
          inferenceSource: "local_code",
          latencyMs: res.latencyMs,
          httpRequests: res.httpRequestsDuringLocal,
          bytesSent: 0,
          note: res.reason
        }
      ]);
      return;
    }

    const displayEntries = getDisplayVaultEntries(res.identityVault);
    setIdentityVault(res.identityVault);
    setProposedAllowlist(res.proposedAllowlist);
    setEnabledKeys([...ALLOWED_KEYS]);
    setLocalMeta({
      source: res.inferenceSource,
      latencyMs: res.latencyMs,
      httpRequests: res.httpRequestsDuringLocal
    });
    setLetterEditMode(false);
    setNanoStatus("available");

    // Accumulate session-wide local vault identifiers so Wire Proof audits earlier cases too
    const nextSecrets = displayEntries.map(([, v]) => v).filter((v) => v.length >= 3);
    setSessionVaultSecrets((prev) => Array.from(new Set([...prev, ...nextSecrets])));

    setTrail((prev) => [
      ...prev,
      {
        runId: nextRunId,
        caseLabel: activeCaseLabel,
        step: "1. Local Identity Split",
        modeRequested: "only_on_device",
        inferenceSource: "on_device",
        latencyMs: res.latencyMs,
        httpRequests: res.httpRequestsDuringLocal,
        bytesSent: 0,
        note: `Held ${displayEntries.length} identifier(s) locally; proposed allowlist fields.`
      }
    ]);
  }

  function toggleAllowlistKey(key: AllowlistKey) {
    setEnabledKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleMatchClauseInCloud() {
    if (!firebaseInfo.ready) {
      setActiveModal("settings");
      return;
    }
    if (!liveGate || !identityVault) return;
    if (!liveGate.ok) {
      setCloudError(`${liveGate.refusal}: ${liveGate.reason}`);
      return;
    }

    setAnalyzingCloud(true);
    setCloudError(null);
    setOfflineTriage(null);

    try {
      const canaries = activeSampleCase
        ? activeSampleCase.canaries
        : vaultEntries.map(([, v]) => v);

      const out = await analyzeAllowlistInCloud({
        allowlistPayload: liveGate.payload,
        cloudModel: settings.cloudModel,
        canariesToAudit: canaries,
        caseLabel: activeCaseLabel
      });

      const localJoined = rejoinDraftLocally(out.analysis.draft_request_for_review, identityVault);
      setCloudAnalysis(out.analysis);
      setCloudMeta({
        source: out.inferenceSource,
        latencyMs: out.latencyMs,
        wireBytes: out.wireBytes,
        leakedCanaries: out.leakedCanaries.length,
        policyMatched: out.policyMatched,
        allowlistSnapshot: liveGate.serialized
      });
      setRejoined(localJoined);
      setConfirmedIndices([]);
      setEditableDraft(appendConfirmedPatientFacts(localJoined.text, []));

      setTrail((prev) => [
        ...prev,
        {
          runId: activeRunId,
          caseLabel: activeCaseLabel,
          step: "2. Deterministic Gate",
          modeRequested: "deterministic_code",
          inferenceSource: "local_code",
          latencyMs: 1,
          httpRequests: 0,
          bytesSent: 0,
          note: `Serialized ${Object.keys(liveGate.payload).length} allowlist fields (${liveGate.serialized.length} B); 0 local identifiers matched.`
        },
        {
          runId: activeRunId,
          caseLabel: activeCaseLabel,
          step: out.policyMatched ? "3. Cloud Policy Clause Match" : "3. Cloud General Guidance",
          modeRequested: "only_in_cloud",
          inferenceSource: "in_cloud",
          latencyMs: out.latencyMs,
          httpRequests: out.wireEntries.length,
          bytesSent: out.wireBytes,
          note: `${out.analysis.mode_used} · clause ${out.analysis.cited_clause_id} · ${out.leakedCanaries.length} identifier leaks.`
        },
        {
          runId: activeRunId,
          caseLabel: activeCaseLabel,
          step: "4. Local Draft Re-Join",
          modeRequested: "deterministic_code",
          inferenceSource: "local_code",
          latencyMs: 1,
          httpRequests: 0,
          bytesSent: 0,
          note: `Re-inserted ${localJoined.rejoinedTokens.length} local vault token(s); ${localJoined.orphanPlaceholders.length} orphan placeholders.`
        }
      ]);
    } catch (err) {
      setCloudError((err as Error)?.message || String(err));
    } finally {
      setAnalyzingCloud(false);
    }
  }

  async function handleOfflineTriage() {
    if (!firebaseInfo.ready || !liveGate?.ok) return;
    setRunningOffline(true);
    setCloudError(null);
    try {
      const res = await runOfflineResilientTriage({
        allowlistPayload: liveGate.payload,
        cloudModel: settings.cloudModel,
        forceSimulateOffline: true,
        caseLabel: activeCaseLabel
      });
      setOfflineTriage({
        source: res.inferenceSource,
        latencyMs: res.latencyMs,
        httpRequests: res.httpRequests,
        summaryText: res.summaryText
      });
      setTrail((prev) => [
        ...prev,
        {
          runId: activeRunId,
          caseLabel: activeCaseLabel,
          step: "Offline Fallback Triage",
          modeRequested: "prefer_in_cloud",
          inferenceSource: res.offlineDegraded ? "on_device" : "in_cloud",
          latencyMs: res.latencyMs,
          httpRequests: res.httpRequests,
          bytesSent: 0,
          note: "Explicitly labeled OFFLINE_LOCAL_TRIAGE — no policy clause fabricated offline."
        }
      ]);
    } catch (err) {
      setCloudError((err as Error)?.message || String(err));
    } finally {
      setRunningOffline(false);
    }
  }

  function handleToggleConfirmation(index: number) {
    if (!cloudAnalysis || !rejoined) return;
    const next = confirmedIndices.includes(index)
      ? confirmedIndices.filter((i) => i !== index)
      : [...confirmedIndices, index];
    setConfirmedIndices(next);
    const chosenStatements = next
      .sort((a, b) => a - b)
      .map((i) => cloudAnalysis.confirmation_items[i]?.draft_statement)
      .filter((s): s is string => Boolean(s));
    setEditableDraft(appendConfirmedPatientFacts(rejoined.text, chosenStatements));
  }

  async function handleCopyDraft() {
    await navigator.clipboard.writeText(editableDraft);
    setCopiedBanner(true);
    setTimeout(() => setCopiedBanner(false), 1800);
  }

  function handleDownloadDraft() {
    const blob = new Blob([editableDraft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cleave-request-for-review-${identityVault?.claim_id || "draft"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const planIdEnabled = enabledKeys.includes("plan_id");
  const matchedPlan =
    proposedAllowlist?.plan_id && PLAN_EOCS[proposedAllowlist.plan_id]
      ? PLAN_EOCS[proposedAllowlist.plan_id]
      : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <CleaveMarkIcon size={20} />
            <span className="brand-name">Cleave</span>
            <span className="brand-divider" />
            <div className="status-strip">
              <span className={`tag ${nanoStatus === "available" ? "tag-green" : "tag-yellow"}`}>
                <span className="dot" />
                Nano: {nanoStatus === "available" ? "On-Device Ready" : nanoStatus}
              </span>
              <span className={`tag ${firebaseInfo.ready ? "tag-blue" : "tag-neutral"}`}>
                <span className="dot" />
                {firebaseInfo.ready ? `Firebase: ${firebaseInfo.projectId}` : "Firebase: Setup Required"}
              </span>
              {firebaseInfo.ready && firebaseInfo.appCheckMode !== "off" && (
                <span className="tag tag-green">App Check: Active</span>
              )}
            </div>
          </div>

          <nav className="nav-actions" aria-label="Workspace tools">
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveModal("wire")}>
              Wire Proof ({prodWireCount})
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveModal("lab")}>
              Fail-Closed Lab
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveModal("eval")}>
              6-Case Eval
            </button>
            <button className="btn btn-sm" onClick={() => setActiveModal("settings")}>
              Settings
            </button>
          </nav>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-eyebrow">
            <span>Firebase AI Logic Hybrid Inference</span>
            <span>/</span>
            <span>Split the secret from the math</span>
          </div>
          <h1 className="hero-title">
            Understand why this claim was denied and draft a response without uploading the original letter.
          </h1>
          <p className="hero-sub">
            Gemini Nano extracts your personal details strictly on this device. Deterministic code builds an allowlist of
            non-identifying claim facts that you review and edit before Cloud Gemini matches your policy&apos;s exception
            clauses.
          </p>
        </section>

        {!firebaseInfo.ready && (
          <div
            className="callout callout-yellow"
            style={{
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <div>
              <strong>Connect your free Spark Firebase project to run live hybrid inference.</strong> Paste your Web
              config once in Settings (kept in local browser storage only).
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setActiveModal("settings")}>
              Open Firebase Setup
            </button>
          </div>
        )}

        {/* Step 1: Sample Selector & Local PDF Intake */}
        <section className="intake-bar" aria-label="Denial letter source">
          <div className="intake-header">
            <span className="intake-label">1. Load a Synthetic Sample Denial or Open a Local PDF / Text File</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>
                <DocumentUploadIcon /> Open Local PDF / .txt
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSelectedCaseId(null);
                  setRawLetter("");
                  setUploadedFileNote(null);
                  setLetterEditMode(true);
                  resetOutputs();
                }}
              >
                Paste Custom Letter
              </button>
            </div>
          </div>

          <div className="sample-strip">
            {SYNTHETIC_CASES.map((c) => (
              <button
                key={c.id}
                className={`sample-chip ${selectedCaseId === c.id ? "active" : ""}`}
                onClick={() => handleSelectSample(c.id)}
              >
                <span>{c.shortTitle}</span>
                <span className="sample-chip-meta">{c.categoryTag}</span>
              </button>
            ))}
          </div>

          {uploadedFileNote && (
            <div className="callout callout-green" style={{ padding: "8px 12px", fontSize: 12.5 }}>
              {uploadedFileNote}
            </div>
          )}
        </section>

        {/* Step 2: Signature Counterfoil Split Workspace */}
        <section className="cleave-workspace" aria-label="Local and Cloud Split Workspace">
          {/* LEFT PANE: STAYS STRICTLY ON DEVICE */}
          <div className="pane">
            <div className="pane-head">
              <div>
                <span className="tag tag-green">
                  <DeviceLockIcon /> Stays on Your Device · ONLY_ON_DEVICE
                </span>
                <h2 className="pane-title">Original Denial Letter</h2>
                <p className="pane-desc">
                  Raw letter text never enters the cloud serializer. Extracted identifiers stay strictly in local memory.
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setLetterEditMode((m) => !m)}>
                {letterEditMode ? "View Highlights" : "Edit Text"}
              </button>
            </div>

            {letterEditMode ? (
              <textarea
                className="letter-editor"
                value={rawLetter}
                onChange={(e) => {
                  setRawLetter(e.target.value);
                  setSelectedCaseId(null);
                }}
                placeholder="Paste a claim denial letter here (stays strictly on your device)..."
              />
            ) : (
              <HighlightedLetter text={rawLetter} vault={identityVault} />
            )}

            {localError && (
              <div className="callout callout-red">
                <strong>{localError.refusal || "Local Extraction Refused"}:</strong> {localError.message}
              </div>
            )}

            {identityVault && (
              <div className="vault-box">
                <div className="vault-header">
                  <div>
                    <strong style={{ fontSize: 12.5, color: "var(--ink-primary)" }}>
                      Local Identity Vault ({vaultEntries.length} held on-device)
                    </strong>
                    {localMeta && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--pastel-green-ink)"
                        }}
                      >
                        {localMeta.source} · {localMeta.httpRequests} HTTP req · {(localMeta.latencyMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setVaultExpanded((v) => !v)}>
                      {vaultExpanded ? "Hide" : "Show"}
                    </button>
                    <button className="btn btn-danger-soft btn-sm" onClick={handlePurgeLocalVault}>
                      Purge Vault
                    </button>
                  </div>
                </div>
                {vaultExpanded && (
                  <div className="vault-grid">
                    {vaultEntries.map(([k, v]) => (
                      <div className="vault-item" key={k}>
                        <span className="vault-key">{k}</span>
                        <span className="vault-val">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="pane-actions">
              <button
                className="btn btn-primary"
                onClick={handleCleaveLocally}
                disabled={cleaving || !rawLetter.trim()}
              >
                {cleaving && <span className="spinner" />}
                {cleaving ? "Cleaving on Device (Gemini Nano)..." : "Cleave Letter on Device"}
              </button>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                {cleaving
                  ? "First local run can take ~15–20s to warm GPU weights."
                  : "Fail-closed: throws instead of falling back to cloud."}
              </span>
            </div>
          </div>

          {/* CENTER SEAM */}
          <div className="cleave-seam" aria-hidden="true">
            <div className="cleave-seam-badge" title="Deterministic allowlist boundary">
              <SeamScissorsIcon />
            </div>
          </div>

          {/* RIGHT PANE: INTERACTIVE ALLOWLIST & CLOUD BOUNDARY */}
          <div className="pane">
            <div className="pane-head">
              <div>
                <span className="tag tag-blue">
                  <CloudSplitIcon /> You Choose What Leaves · ONLY_IN_CLOUD
                </span>
                <h2 className="pane-title">Outgoing Allowlist Control</h2>
                <p className="pane-desc">
                  Inspect exact values before anything crosses the wire. Uncheck any field to see how the result changes.
                </p>
              </div>
            </div>

            {!proposedAllowlist ? (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, padding: "12px 4px" }}>
                <div className="callout callout-blue">
                  <strong>Nothing has left your device.</strong> Click <em>Cleave Letter on Device</em> on the left to
                  extract a structured allowlist locally via Chrome Gemini Nano.
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "var(--ink-primary)" }}>Honest privacy claim:</strong> Even non-identifying
                    claim fields can be sensitive health information or narrow identity in combination. Cleave never
                    hides what it sends — every outgoing value is shown here in plain English before transmission.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {planIdEnabled && matchedPlan ? (
                  <div className="callout callout-green">
                    <strong>Policy matching enabled:</strong> Cloud Gemini will check your allowlisted facts against{" "}
                    <code>{matchedPlan.plan_id}</code> ({matchedPlan.plan_name}). Uncheck <em>Plan Policy Identifier</em>{" "}
                    below to test general guidance without sharing your plan code.
                  </div>
                ) : (
                  <div className="callout callout-yellow">
                    <strong>Plan Policy Identifier removed:</strong> Cleave can no longer match your specific Evidence of
                    Coverage clauses and will degrade honestly to <em>General Guidance Only</em>.
                  </div>
                )}

                <div className="allowlist-list">
                  {ALLOWLIST_FIELDS.map((field) => {
                    const checked = enabledKeys.includes(field.key);
                    const val = proposedAllowlist[field.key];
                    if (val === undefined || val === null || val === "") return null;
                    return (
                      <label key={field.key} className={`allowlist-row ${checked ? "" : "unchecked"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAllowlistKey(field.key)}
                        />
                        <div className="allowlist-row-main">
                          <div className="allowlist-row-top">
                            <span className="allowlist-label">{field.label}</span>
                            <span className="allowlist-val">
                              {field.kind === "integer" ? `${val} days` : String(val)}
                            </span>
                          </div>
                          <div className="allowlist-hint">
                            {checked ? field.shortHint : field.removalConsequence}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {liveGate &&
                  (liveGate.ok ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "var(--bg-recessed)",
                        border: "1px solid var(--border)",
                        fontSize: 12
                      }}
                    >
                      <span>
                        <strong>Deterministic Code Gate:</strong> 0 local identifiers matched ·{" "}
                        <code>{liveGate.serialized.length} bytes</code> JSON
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setActiveModal("wire")}>
                        Inspect Raw JSON
                      </button>
                    </div>
                  ) : (
                    <div className="callout callout-red">
                      <strong>{liveGate.refusal}:</strong> {liveGate.reason}
                    </div>
                  ))}
              </>
            )}

            {cloudError && <div className="callout callout-red">{cloudError}</div>}

            <div className="pane-actions">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={handleMatchClauseInCloud}
                  disabled={analyzingCloud || runningOffline || !liveGate?.ok}
                >
                  {analyzingCloud && <span className="spinner" />}
                  {analyzingCloud
                    ? "Analyzing Allowlist in Cloud..."
                    : planIdEnabled
                      ? "Match Policy Clause in Cloud"
                      : "Get General Guidance in Cloud"}
                </button>
                <button
                  className="btn"
                  onClick={handleOfflineTriage}
                  disabled={analyzingCloud || runningOffline || !liveGate?.ok}
                  title="Demonstrates PREFER_IN_CLOUD fallback labeled honestly as OFFLINE_LOCAL_TRIAGE"
                >
                  {runningOffline && <span className="spinner spinner-dark" />}
                  {runningOffline ? "Running Offline Triage..." : "Offline Local Triage"}
                </button>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)" }}>
                {settings.cloudModel}
              </span>
            </div>
          </div>
        </section>

        {/* Offline Fallback Card (if triggered) */}
        {offlineTriage && (
          <section className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <span className="tag tag-yellow">OFFLINE_LOCAL_TRIAGE · {offlineTriage.source}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                {offlineTriage.httpRequests} HTTP requests · {(offlineTriage.latencyMs / 1000).toFixed(1)}s
              </span>
            </div>
            <p className="pane-desc" style={{ marginBottom: 10 }}>
              When connectivity is unavailable, Cleave labels this output explicitly as local-only triage rather than
              fabricating exact policy clause citations.
            </p>
            <div
              className="code-block"
              style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, lineHeight: 1.65 }}
            >
              {offlineTriage.summaryText}
            </div>
          </section>
        )}

        {/* Step 3: Policy Clause Match, Confirmation Checklist & Re-Joined Draft */}
        {cloudAnalysis && rejoined && (
          <section className="results-section" aria-label="Policy analysis and editable appeal draft">
            {cloudMeta && liveGate?.ok && cloudMeta.allowlistSnapshot !== liveGate.serialized && (
              <div
                className="callout callout-yellow"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
              >
                <span>
                  <strong>Allowlist changed since this result was generated.</strong> Re-run Cloud analysis to update the
                  policy match and draft for your current field selection.
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleMatchClauseInCloud}
                  disabled={analyzingCloud || runningOffline}
                >
                  {planIdEnabled ? "Re-Run Policy Match" : "Re-Run General Guidance"}
                </button>
              </div>
            )}
            <div className="clause-compare-grid">
              <div className="card">
                <span className="tag tag-green">From Your Local Letter (Never Uploaded)</span>
                <h3
                  style={{
                    margin: "10px 0 8px",
                    fontFamily: "var(--font-serif)",
                    fontSize: 20,
                    fontWeight: 500,
                    color: "var(--ink-primary)"
                  }}
                >
                  Insurer&apos;s Denial Sentence
                </h3>
                <blockquote className="clause-quote">{localDenialSentence}</blockquote>
                {cloudMeta && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                    Verified wire audit: <strong>{cloudMeta.leakedCanaries}</strong> identifier leaks across{" "}
                    <strong>{cloudMeta.wireBytes.toLocaleString()} bytes</strong> sent ({cloudMeta.source}).
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span
                    className={`tag tag-preserve-case ${
                      cloudAnalysis.mode_used === "POLICY_MATCHED" ? "tag-blue" : "tag-yellow"
                    }`}
                  >
                    {cloudAnalysis.mode_used === "POLICY_MATCHED"
                      ? `POLICY MATCHED · Clause ${cloudAnalysis.cited_clause_id}`
                      : `GENERAL GUIDANCE · Clause ${cloudAnalysis.cited_clause_id || "NONE"}`}
                  </span>
                  <span
                    className={`tag ${
                      cloudAnalysis.exception_applies === "YES"
                        ? "tag-green"
                        : cloudAnalysis.exception_applies === "CONDITIONAL"
                          ? "tag-yellow"
                          : cloudAnalysis.exception_applies === "NO"
                            ? "tag-red"
                            : "tag-neutral"
                    }`}
                  >
                    Exception: {cloudAnalysis.exception_applies}
                  </span>
                </div>

                <h3
                  style={{
                    margin: "10px 0 6px",
                    fontFamily: "var(--font-serif)",
                    fontSize: 20,
                    fontWeight: 500,
                    color: "var(--ink-primary)"
                  }}
                >
                  {cloudAnalysis.cited_clause_quote
                    ? `Controlling Policy Text (${cloudAnalysis.cited_clause_id})`
                    : "General Guidance (No Policy Document Matched)"}
                </h3>

                {cloudAnalysis.cited_clause_quote && (
                  <blockquote className="clause-quote">&ldquo;{cloudAnalysis.cited_clause_quote}&rdquo;</blockquote>
                )}
                <p style={{ margin: "8px 0 0", color: "var(--ink-body)" }}>{cloudAnalysis.plain_explanation}</p>
              </div>
            </div>

            {/* Confirmation Card: Interactive factual checkboxes for POLICY_MATCHED; calm next-step list for GENERAL_GUIDANCE_ONLY */}
            {cloudAnalysis.needs_patient_confirmation && cloudAnalysis.confirmation_items.length > 0 && (
              <div className="callout callout-yellow" style={{ padding: 20 }}>
                {cloudAnalysis.mode_used === "POLICY_MATCHED" ? (
                  <>
                    <span className="tag tag-yellow" style={{ background: "#ffffff", marginBottom: 6 }}>
                      NEEDS_PATIENT_CONFIRMATION
                    </span>
                    <h3
                      style={{
                        margin: "4px 0 4px",
                        fontFamily: "var(--font-serif)",
                        fontSize: 20,
                        fontWeight: 500,
                        color: "#6e4a00"
                      }}
                    >
                      Confirm Unresolved Facts Before Sending
                    </h3>
                    <p style={{ margin: 0, fontSize: 13 }}>
                      The denial letter and policy leave these decisive facts unresolved, so the draft below does not
                      claim them. Check any fact you can verify to insert its factual statement into your draft.
                    </p>
                    <div style={{ marginTop: 12 }}>
                      {cloudAnalysis.confirmation_items.map((item, idx) => (
                        <label key={idx} className="confirm-item">
                          <input
                            type="checkbox"
                            checked={confirmedIndices.includes(idx)}
                            onChange={() => handleToggleConfirmation(idx)}
                          />
                          <div>
                            <div style={{ color: "var(--ink-primary)", fontSize: 13.5, fontWeight: 500 }}>
                              {item.question}
                            </div>
                            <div style={{ color: "var(--ink-muted)", fontSize: 12, marginTop: 2 }}>
                              Inserts into draft: &ldquo;{item.draft_statement}&rdquo;
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tag tag-yellow" style={{ background: "#ffffff", marginBottom: 6 }}>
                      NEXT STEPS WITHOUT PLAN POLICY
                    </span>
                    <h3
                      style={{
                        margin: "4px 0 6px",
                        fontFamily: "var(--font-serif)",
                        fontSize: 20,
                        fontWeight: 500,
                        color: "#6e4a00"
                      }}
                    >
                      What to Check Before Filing
                    </h3>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--ink-primary)", fontSize: 13.5 }}>
                      {cloudAnalysis.confirmation_items.map((item, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          {item.question}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {/* Locally Re-Joined Editable Request for Review */}
            <div className="card">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 14
                }}
              >
                <div>
                  <span className="tag tag-green">
                    Re-Joined Strictly on Device · {rejoined.orphanPlaceholders.length} Orphan Placeholders
                  </span>
                  <h3
                    style={{
                      margin: "8px 0 4px",
                      fontFamily: "var(--font-serif)",
                      fontSize: 22,
                      fontWeight: 500,
                      color: "var(--ink-primary)"
                    }}
                  >
                    Editable Request for Review
                  </h3>
                  <p className="pane-desc">
                    Cloud returned opaque placeholders (<code>[MEMBER_NAME]</code>, <code>[CLAIM_ID]</code>,{" "}
                    <code>[DENIAL_DATE]</code>); Cleave re-inserted <strong>{rejoined.rejoinedTokens.length}</strong>{" "}
                    personal identifier(s) locally in browser memory.
                  </p>
                </div>

                <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-primary btn-sm" onClick={handleCopyDraft}>
                    {copiedBanner ? "Copied to Clipboard" : "Copy Draft"}
                  </button>
                  <button className="btn btn-sm" onClick={handleDownloadDraft}>
                    Download .txt
                  </button>
                  <button className="btn btn-sm" onClick={() => window.print()}>
                    Print / Save PDF
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setActiveModal("wire")}>
                    Verify Wire Proof
                  </button>
                </div>
              </div>

              <textarea
                className="draft-editor"
                value={editableDraft}
                onChange={(e) => setEditableDraft(e.target.value)}
                aria-label="Editable locally re-joined Request for Review"
              />
            </div>
          </section>
        )}

        <footer className="footer-note">
          <span>
            Cleave is an administrative policy-clause review tool, not legal or medical advice. Built for #BuildHybridAI
            2026 with Firebase AI Logic.
          </span>
          <span>
            Press <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> &rarr; Network to cross-check wire traffic independently.
          </span>
        </footer>
      </main>

      <SettingsModal
        open={activeModal === "settings"}
        onClose={() => setActiveModal(null)}
        settings={settings}
        nanoStatus={nanoStatus}
        onSettingsSaved={(next, info) => {
          setSettings(next);
          setFirebaseInfo({ ready: true, projectId: info.projectId, appCheckMode: info.appCheckMode });
        }}
        onCleared={() => {
          setSettings({ ...settings, config: null, appCheckDebugToken: "", recaptchaSiteKey: "" });
          setFirebaseInfo({ ready: false, projectId: null, appCheckMode: "off" });
        }}
        onNanoStatusChange={setNanoStatus}
      />

      <WireProofModal
        open={activeModal === "wire"}
        onClose={() => setActiveModal(null)}
        wireEntries={wireEntries}
        trail={trail}
        identityVault={identityVault}
        sessionVaultSecrets={sessionVaultSecrets}
      />

      <FailClosedLabModal
        open={activeModal === "lab"}
        onClose={() => setActiveModal(null)}
        cloudModel={settings.cloudModel}
        firebaseReady={firebaseInfo.ready}
        onOpenSettings={() => setActiveModal("settings")}
        onRecordLabTrail={(steps) => setTrail((prev) => [...prev, ...steps])}
      />

      <EvalSuiteModal
        open={activeModal === "eval"}
        onClose={() => setActiveModal(null)}
        cloudModel={settings.cloudModel}
        firebaseReady={firebaseInfo.ready}
        onOpenSettings={() => setActiveModal("settings")}
      />
    </>
  );
}
