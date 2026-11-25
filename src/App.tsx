import React, { useEffect, useMemo, useRef, useState } from "react";
import { EvalSuiteModal } from "./components/EvalSuiteModal";
import { FailClosedLabModal } from "./components/FailClosedLabModal";
import { HighlightedLetter } from "./components/HighlightedLetter";
import {
  ChevronDownIcon,
  CleaveLogo,
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
  detectPlanIdCue,
  extractDenialSentenceLocally,
  getDisplayVaultEntries,
  rejoinDraftLocally,
  verifyCustomEocSafety
} from "./lib/gate";
import { EXCEPTION_LABELS, NANO_STATUS_LABELS, humanizeValue, humanizeVaultKey, toMemberVoice } from "./lib/labels";
import { extractPdfTextLocally } from "./lib/pdf";
import { RECORDED_REPLAY_RUNS } from "./lib/recordedReplay";
import type {
  AllowlistKey,
  AllowlistProposal,
  CloudAnalysis,
  IdentityVault,
  InferenceTrailStep,
  PlanEoc,
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
    appCheckMode: "off" | "debug_token" | "recaptcha_enterprise";
  }>({ ready: false, projectId: null, appCheckMode: "off" });
  const [nanoStatus, setNanoStatus] = useState<NanoAvailability>("unavailable");
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const [proofMenuOpen, setProofMenuOpen] = useState<boolean>(false);
  const proofMenuRef = useRef<HTMLDivElement | null>(null);
  const [replayCaseKey, setReplayCaseKey] = useState<null | "case-1" | "case-3">(null);

  // Document & case state (stays strictly in local browser memory)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(SYNTHETIC_CASES[0].id);
  const [rawLetter, setRawLetter] = useState<string>(SYNTHETIC_CASES[0].raw_letter);
  const [uploadedFileNote, setUploadedFileNote] = useState<string | null>(null);
  const [letterEditMode, setLetterEditMode] = useState<boolean>(false);
  const [vaultExpanded, setVaultExpanded] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const eocFileInputRef = useRef<HTMLInputElement | null>(null);

  // Bring-Your-Own Plan EOC state (generic public policy document — guarded against accidental PII!)
  const [eocSourceMode, setEocSourceMode] = useState<"auto" | "custom">("auto");
  const [eocDrawerOpen, setEocDrawerOpen] = useState<boolean>(false);
  const [customEocName, setCustomEocName] = useState<string>("Custom Uploaded Plan EOC");
  const [customEocText, setCustomEocText] = useState<string>("");
  const [cleaveStageNote, setCleaveStageNote] = useState<string>("");

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
  const [cloudRetryNote, setCloudRetryNote] = useState<string>("");
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

  // Bring each new result into view; results render below the fold after a long wait.
  const resultsRef = useRef<HTMLElement | null>(null);
  const offlineRef = useRef<HTMLElement | null>(null);
  const scrollIntoViewGently = (el: HTMLElement | null) =>
    el?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
  useEffect(() => {
    if (cloudAnalysis) scrollIntoViewGently(resultsRef.current);
  }, [cloudAnalysis]);
  useEffect(() => {
    if (offlineTriage) scrollIntoViewGently(offlineRef.current);
  }, [offlineTriage]);

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

  const planIdEnabled = enabledKeys.includes("plan_id");

  const customEocCheck = useMemo(() => {
    if (eocSourceMode !== "custom") return null;
    return verifyCustomEocSafety(customEocText);
  }, [eocSourceMode, customEocText]);

  // A refusal from the last Match click is stale once the EOC source or text changes.
  useEffect(() => setCloudError(null), [eocSourceMode, customEocText]);

  const customEocBlocked =
    eocSourceMode === "custom" && planIdEnabled && Boolean(customEocCheck && !customEocCheck.ok);

  const activeCustomEoc: PlanEoc | null = useMemo(() => {
    if (eocSourceMode !== "custom" || !customEocCheck?.ok) return null;
    const detectedPlanId = detectPlanIdCue(customEocCheck.cleanedText);
    return {
      plan_id: detectedPlanId || proposedAllowlist?.plan_id || "CUSTOM-EOC",
      plan_name: customEocName.trim() || "Custom Uploaded Plan EOC",
      clauses: [],
      rawPolicyText: customEocCheck.cleanedText
    };
  }, [eocSourceMode, customEocCheck, customEocName, proposedAllowlist?.plan_id]);

  // When a custom EOC carries its own PLAN-... code (e.g. Summit PPO), keep the outgoing allowlist plan_id in sync.
  const effectiveAllowlist: AllowlistProposal | null = useMemo(() => {
    if (!proposedAllowlist) return null;
    if (activeCustomEoc?.plan_id && /^PLAN-[A-Z0-9-]{4,28}$/.test(activeCustomEoc.plan_id)) {
      return { ...proposedAllowlist, plan_id: activeCustomEoc.plan_id };
    }
    return proposedAllowlist;
  }, [proposedAllowlist, activeCustomEoc]);

  // Live deterministic code gate evaluation whenever checkboxes or custom EOC change
  const liveGate = useMemo(() => {
    if (!effectiveAllowlist || !identityVault) return null;
    return buildAndVerifyOutgoingPayload({
      proposedAllowlist: effectiveAllowlist,
      enabledKeys,
      identityVault
    });
  }, [effectiveAllowlist, enabledKeys, identityVault]);

  const localDenialSentence = useMemo(() => extractDenialSentenceLocally(rawLetter), [rawLetter]);
  const vaultEntries = useMemo(() => getDisplayVaultEntries(identityVault), [identityVault]);
  const prodWireCount = useMemo(
    () => wireEntries.filter((e) => e.channel === "cleave_production").length,
    [wireEntries]
  );

  useEffect(() => {
    if (!proofMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (proofMenuRef.current && !proofMenuRef.current.contains(e.target as Node)) {
        setProofMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProofMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [proofMenuOpen]);

  function resetOutputs() {
    setReplayCaseKey(null);
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

  function handleLoadRecordedReplay(key: "case-1" | "case-3") {
    const snap = RECORDED_REPLAY_RUNS[key];
    const sample = SYNTHETIC_CASES.find((c) => c.id === snap.caseId);
    if (!sample) return;
    const replayRunId = `replay-${key}-${Date.now()}`;
    const gate = buildAndVerifyOutgoingPayload({
      proposedAllowlist: snap.proposedAllowlist,
      enabledKeys: ALLOWED_KEYS,
      identityVault: snap.identityVault
    });
    const localJoined = rejoinDraftLocally(snap.cloudAnalysis.draft_request_for_review, snap.identityVault);
    const displayEntries = getDisplayVaultEntries(snap.identityVault);

    setProofMenuOpen(false);
    setSelectedCaseId(sample.id);
    setRawLetter(sample.raw_letter);
    setUploadedFileNote(null);
    setLetterEditMode(false);
    setEocSourceMode("auto");
    setLocalError(null);
    setCloudError(null);
    setOfflineTriage(null);
    setReplayCaseKey(key);
    setIdentityVault(snap.identityVault);
    setProposedAllowlist(snap.proposedAllowlist);
    setEnabledKeys([...ALLOWED_KEYS]);
    setLocalMeta(snap.localMeta);
    setCloudAnalysis({
      ...snap.cloudAnalysis,
      confirmation_items: snap.cloudAnalysis.confirmation_items.map((item) => ({
        ...item,
        draft_statement: toMemberVoice(item.draft_statement)
      }))
    });
    setCloudMeta({
      ...snap.cloudMeta,
      allowlistSnapshot: `${gate.ok ? gate.serialized : ""}|auto|0`
    });
    setRejoined(localJoined);
    setConfirmedIndices([]);
    setEditableDraft(appendConfirmedPatientFacts(localJoined.text, []));
    setSessionVaultSecrets((prev) =>
      Array.from(new Set([...prev, ...displayEntries.map(([, v]) => v).filter((v) => v.length >= 3)]))
    );
    setTrail((prev) => [
      ...prev,
      {
        runId: replayRunId,
        caseLabel: `Recorded Replay · ${snap.label}`,
        step: "1. Local Identity Split (Recorded)",
        modeRequested: "only_on_device",
        inferenceSource: "on_device",
        latencyMs: snap.localMeta.latencyMs,
        httpRequests: 0,
        bytesSent: 0,
        note: `Recorded Chrome 158 snapshot: held ${displayEntries.length} identifiers on-device (0 HTTP calls).`
      },
      {
        runId: replayRunId,
        caseLabel: `Recorded Replay · ${snap.label}`,
        step: "2. Cloud Policy Match (Recorded)",
        modeRequested: "only_in_cloud",
        inferenceSource: "in_cloud",
        latencyMs: snap.cloudMeta.latencyMs,
        httpRequests: 1,
        bytesSent: snap.cloudMeta.wireBytes,
        note: `Recorded snapshot: ${snap.cloudAnalysis.mode_used} · clause ${snap.cloudAnalysis.cited_clause_id} · 0 leaks.`
      }
    ]);
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
        const sizeLabel =
          res.byteLength < 1024 ? `${res.byteLength} B` : `${(res.byteLength / 1024).toFixed(1)} KB`;
        setRawLetter(res.text);
        setUploadedFileNote(
          `Parsed "${res.fileName}" locally in browser (${res.pageCount} page${res.pageCount === 1 ? "" : "s"}, ${sizeLabel} — 0 bytes uploaded)`
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

  async function handleCustomEocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCloudError(null);
    try {
      let text = "";
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        const res = await extractPdfTextLocally(file);
        text = res.text;
      } else {
        text = await file.text();
      }
      setEocSourceMode("custom");
      setCustomEocName(file.name.replace(/\.(pdf|txt)$/i, ""));
      setCustomEocText(text);
      setEocDrawerOpen(true);
    } catch (err) {
      setCloudError((err as Error)?.message || String(err));
    } finally {
      e.target.value = "";
    }
  }

  async function handleLoadSampleCustomEoc() {
    setCloudError(null);
    try {
      const resp = await fetch("/samples/sample-custom-eoc.pdf");
      const blob = await resp.blob();
      const file = new File([blob], "sample-custom-eoc.pdf", { type: "application/pdf" });
      const res = await extractPdfTextLocally(file);
      setEocSourceMode("custom");
      setCustomEocName("Summit Regional Health PPO (Uploaded Sample PDF)");
      setCustomEocText(res.text);
      setEocDrawerOpen(true);
    } catch (err) {
      setCloudError(`Could not load sample custom EOC PDF: ${(err as Error)?.message || String(err)}`);
    }
  }

  function handlePurgeLocalVault() {
    setReplayCaseKey(null);
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
    setReplayCaseKey(null);
    setActiveRunId(nextRunId);
    setCleaving(true);
    setCleaveStageNote("1/2 Warming up the on-device model and finding your personal details…");
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

    const stageTimer = window.setTimeout(() => {
      setCleaveStageNote("2/2 Building the list of safe facts and running the privacy check…");
    }, 3500);

    const res = await extractOnDevice(rawLetter, refDate);
    window.clearTimeout(stageTimer);
    setCleaving(false);
    setCleaveStageNote("");

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
      setCloudError(`Blocked before sending: ${liveGate.reason} (${liveGate.refusal})`);
      return;
    }
    if (eocSourceMode === "custom" && planIdEnabled && customEocCheck && !customEocCheck.ok) {
      setCloudError(`Blocked before sending: ${customEocCheck.reason} (${customEocCheck.refusal})`);
      return;
    }

    setAnalyzingCloud(true);
    setCloudRetryNote("");
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
        customEoc: activeCustomEoc,
        caseLabel: activeCaseLabel,
        onRetry: (n) =>
          setCloudRetryNote(
            `${n.isRateLimit ? "Cloud rate limit" : "Cloud busy"} — retrying (${n.nextAttempt}/${n.maxAttempts}) in ${n.delaySec}s…`
          )
      });

      const localJoined = rejoinDraftLocally(out.analysis.draft_request_for_review, identityVault);
      // The prompt asks for first-person statements; normalize once so preview and inserted text agree.
      setCloudAnalysis({
        ...out.analysis,
        confirmation_items: out.analysis.confirmation_items.map((item) => ({
          ...item,
          draft_statement: toMemberVoice(item.draft_statement)
        }))
      });
      setCloudMeta({
        source: out.inferenceSource,
        latencyMs: out.latencyMs,
        wireBytes: out.wireBytes,
        leakedCanaries: out.leakedCanaries.length,
        policyMatched: out.policyMatched,
        allowlistSnapshot: `${liveGate.serialized}|${eocSourceMode}|${customEocText.length}`
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
      setCloudRetryNote("");
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

  const matchedPlan =
    proposedAllowlist?.plan_id && PLAN_EOCS[proposedAllowlist.plan_id]
      ? PLAN_EOCS[proposedAllowlist.plan_id]
      : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <CleaveLogo height={28} />
            <span className="brand-divider" />
            <div className="status-strip">
              <span className={`tag ${nanoStatus === "available" ? "tag-green" : "tag-yellow"}`}>
                <span className="dot" />
                Nano: {NANO_STATUS_LABELS[nanoStatus] ?? humanizeValue(nanoStatus)}
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
            <div className="proof-menu-wrap" ref={proofMenuRef}>
              <button
                className="btn btn-ghost btn-sm"
                aria-expanded={proofMenuOpen}
                aria-haspopup="menu"
                onClick={() => setProofMenuOpen((o) => !o)}
              >
                <span>Proof{prodWireCount > 0 ? ` (${prodWireCount})` : ""}</span>
                <ChevronDownIcon />
              </button>
              {proofMenuOpen && (
                <div className="proof-menu-popover" role="menu" aria-label="Verification and proof tools">
                  <button
                    className="proof-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setProofMenuOpen(false);
                      setActiveModal("wire");
                    }}
                  >
                    <span className="proof-menu-item-top">
                      <span>Wire Proof</span>
                      <span className="mode-code">{prodWireCount} req</span>
                    </span>
                    <span className="proof-menu-item-desc">
                      Inspect exact outbound JSON and verify 0 local identifiers on the wire.
                    </span>
                  </button>
                  <button
                    className="proof-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setProofMenuOpen(false);
                      setActiveModal("lab");
                    }}
                  >
                    <span className="proof-menu-item-top">
                      <span>Fail-Closed PDF Lab</span>
                      <span className="mode-code">4 refusals</span>
                    </span>
                    <span className="proof-menu-item-desc">
                      Live ONLY_ON_DEVICE vs. PREFER_ON_DEVICE PDF upload comparison.
                    </span>
                  </button>
                  <button
                    className="proof-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setProofMenuOpen(false);
                      setActiveModal("eval");
                    }}
                  >
                    <span className="proof-menu-item-top">
                      <span>6-Case Benchmark</span>
                      <span className="mode-code">50 canaries</span>
                    </span>
                    <span className="proof-menu-item-desc">
                      Run all 6 synthetic cases against a realistic manual-redaction baseline.
                    </span>
                  </button>
                  <div className="proof-menu-divider" />
                  <button
                    className="proof-menu-item"
                    role="menuitem"
                    onClick={() => handleLoadRecordedReplay("case-1")}
                  >
                    <span className="proof-menu-item-top">
                      <span>Preview Recorded Run</span>
                      <span className="mode-code">No Nano</span>
                    </span>
                    <span className="proof-menu-item-desc">
                      Explore a frozen Chrome 158 run end-to-end without uploading anything.
                    </span>
                  </button>
                </div>
              )}
            </div>
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
            AI running in your browser pulls out your personal details and keeps them here. You review a short list of
            facts that don&apos;t identify you, and only those go to the cloud to find the part of your plan that can
            overturn the denial.
          </p>
        </section>

        {(nanoStatus === "unsupported_browser" || nanoStatus === "unavailable" || nanoStatus === "downloadable") && (
          <div
            className="callout callout-yellow"
            style={{
              marginBottom: 20,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap"
            }}
          >
            <div style={{ flex: "1 1 380px" }}>
              <strong>
                {nanoStatus === "downloadable"
                  ? "On-device Gemini Nano is ready to download in Chrome."
                  : "This browser doesn't have on-device Gemini Nano ready."}
              </strong>{" "}
              Rather than quietly uploading your letter to the cloud, Cleave fails closed here.{" "}
              <code className="mode-code">{nanoStatus} · ONLY_ON_DEVICE</code>
              <details className="setup-details">
                <summary>How to enable Chrome Gemini Nano (3 steps for live testing)</summary>
                <ol>
                  <li>
                    Open this page in <strong>Google Chrome Desktop 139+</strong>.
                  </li>
                  <li>
                    Visit <code>chrome://flags/#prompt-api</code> (set to <strong>Enabled</strong>) and{" "}
                    <code>chrome://flags/#optimization-guide-on-device-model</code> (set to{" "}
                    <strong>Enabled BypassPerfRequirement</strong>), then relaunch Chrome.
                  </li>
                  <li>
                    Open <strong>Settings → Download Gemini Nano</strong> (or check <code>chrome://components</code> →{" "}
                    <em>Optimization Guide On Device Model</em>).
                  </li>
                </ol>
              </details>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleLoadRecordedReplay("case-1")}>
                Preview Recorded Run
              </button>
              {nanoStatus === "downloadable" ? (
                <button className="btn btn-sm" onClick={() => setActiveModal("settings")}>
                  Download Nano
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => setActiveModal("lab")}>
                  Fail-Closed Lab
                </button>
              )}
            </div>
          </div>
        )}

        {replayCaseKey && (
          <div
            className="callout callout-blue"
            style={{
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <div style={{ flex: "1 1 380px" }}>
              <strong>Recorded Replay Mode ({RECORDED_REPLAY_RUNS[replayCaseKey].recordedAt}):</strong>{" "}
              Viewing a frozen real run so you can test the split highlights, live allowlist gate checkboxes,
              confirmation swap, and locally re-joined draft without Gemini Nano. Live{" "}
              <em>Cleave Letter on Device</em> remains strictly fail-closed.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-sm"
                onClick={() => handleLoadRecordedReplay(replayCaseKey === "case-1" ? "case-3" : "case-1")}
              >
                {replayCaseKey === "case-1" ? "Preview Case 3 (Confirmation)" : "Preview Case 1 (Waiver)"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={resetOutputs}>
                Exit Replay
              </button>
            </div>
          </div>
        )}

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
            <span className="intake-label">1. Pick a sample denial or use your own letter</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
              <a
                className="btn btn-ghost btn-sm"
                href="/samples/case1-after-hours-denial.pdf"
                download="case1-after-hours-denial.pdf"
                style={{ textDecoration: "none" }}
              >
                Sample .pdf
              </a>
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
                  <DeviceLockIcon /> Stays on your device
                </span>
                <h2 className="pane-title">Original Denial Letter</h2>
                <p className="pane-desc">
                  Your letter is read here and never uploaded. Personal details stay in this browser.{" "}
                  <code className="mode-code">ONLY_ON_DEVICE</code>
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
                      Personal details kept on this device ({vaultEntries.length})
                    </strong>
                    {localMeta && (
                      <span
                        title={`Inference source: ${localMeta.source}`}
                        style={{
                          marginLeft: 8,
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--pastel-green-ink)"
                        }}
                      >
                        {localMeta.httpRequests} network requests · {(localMeta.latencyMs / 1000).toFixed(1)}s
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
                        <span className="vault-key">{humanizeVaultKey(k)}</span>
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
                {cleaving ? "Reading on this device…" : "Cleave Letter on Device"}
              </button>
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                {cleaving
                  ? cleaveStageNote || "First run can take 15–30s while the on-device model warms up."
                  : "If on-device AI is unavailable, Cleave stops instead of uploading."}
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
                  <CloudSplitIcon /> You choose what leaves
                </span>
                <h2 className="pane-title">What Gets Sent</h2>
                <p className="pane-desc">
                  Only these facts go to the cloud, and none of them name you. Uncheck any to keep it back.{" "}
                  <code className="mode-code">ONLY_IN_CLOUD</code>
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
                {planIdEnabled && (activeCustomEoc || matchedPlan) ? (
                  <div className="callout callout-green">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <strong>Checking against your plan:</strong>{" "}
                        {activeCustomEoc ? (
                          <>
                            <strong>{activeCustomEoc.plan_name}</strong> (your uploaded document)
                          </>
                        ) : (
                          <>
                            {matchedPlan!.plan_name} <code>{matchedPlan!.plan_id}</code>
                          </>
                        )}
                      </div>
                      <button className="btn btn-sm" onClick={() => setEocDrawerOpen((o) => !o)}>
                        {eocDrawerOpen ? "Hide plan document" : "View or use my own plan"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="callout callout-yellow">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <strong>
                          {planIdEnabled ? "We don't have your plan's document:" : "Plan ID not sent:"}
                        </strong>{" "}
                        {planIdEnabled
                          ? "Add your plan's public coverage booklet (PDF or text), or continue with general guidance."
                          : "Cleave can't look up your plan's rules, so you'll get general guidance only."}
                      </div>
                      {planIdEnabled && (
                        <button className="btn btn-sm" onClick={() => setEocDrawerOpen((o) => !o)}>
                          {eocDrawerOpen ? "Hide plan document" : "Add my plan document"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {eocDrawerOpen && planIdEnabled && (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: 12,
                      background: "var(--bg-recessed)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          className={`btn btn-sm ${eocSourceMode === "auto" ? "btn-primary" : ""}`}
                          onClick={() => setEocSourceMode("auto")}
                        >
                          Built-in EOC ({matchedPlan?.plan_id || "Auto"})
                        </button>
                        <button
                          className={`btn btn-sm ${eocSourceMode === "custom" ? "btn-primary" : ""}`}
                          onClick={() => setEocSourceMode("custom")}
                        >
                          Bring Your Own EOC (.pdf / .txt)
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <input
                          ref={eocFileInputRef}
                          type="file"
                          accept=".pdf,.txt,application/pdf,text/plain"
                          onChange={handleCustomEocUpload}
                          style={{ display: "none" }}
                        />
                        <button className="btn btn-sm" onClick={() => eocFileInputRef.current?.click()}>
                          <DocumentUploadIcon /> Upload EOC PDF
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={handleLoadSampleCustomEoc}>
                          Try Summit PPO PDF
                        </button>
                      </div>
                    </div>

                    {eocSourceMode === "auto" ? (
                      matchedPlan ? (
                        <div style={{ fontSize: 12, color: "var(--ink-body)", maxHeight: 160, overflowY: "auto" }}>
                          {matchedPlan.clauses.map((cl) => (
                            <div key={cl.id} style={{ marginBottom: 6 }}>
                              <code>{cl.id}</code> <strong>{cl.title}:</strong> {cl.text}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="pane-desc">
                          No built-in EOC matches <code>{proposedAllowlist.plan_id || "this plan"}</code>. Switch to{" "}
                          <strong>Bring Your Own EOC</strong> above to upload or paste your insurer&apos;s public Evidence of Coverage.
                        </p>
                      )
                    ) : (
                      <>
                        <p className="pane-desc">
                          Generic Evidence of Coverage booklets contain no personal patient identity. Cleave still runs a
                          deterministic PII check here to block accidental denial-letter uploads.
                        </p>
                        <textarea
                          className="letter-editor"
                          style={{ minHeight: 120, maxHeight: 200 }}
                          value={customEocText}
                          onChange={(e) => setCustomEocText(e.target.value)}
                          placeholder="Paste your plan's Referral / Prior Authorization / Appeals policy clauses, or click Upload EOC PDF above..."
                        />
                        {customEocCheck &&
                          (customEocCheck.ok ? (
                            <div className="callout callout-green" style={{ padding: "6px 10px", fontSize: 12 }}>
                              <strong>Custom EOC verified clean ({customEocCheck.cleanedText.length.toLocaleString()} chars):</strong>{" "}
                              0 personal identifier patterns detected — ready for Cloud clause matching.
                            </div>
                          ) : (
                            <div className="callout callout-red" style={{ padding: "8px 10px", fontSize: 12 }}>
                              <strong>Blocked before sending:</strong> {customEocCheck.reason}{" "}
                              <code className="mode-code">{customEocCheck.refusal}</code>
                            </div>
                          ))}
                      </>
                    )}
                  </div>
                )}

                <div className="allowlist-list">
                  {ALLOWLIST_FIELDS.map((field) => {
                    const checked = enabledKeys.includes(field.key);
                    const val = (effectiveAllowlist || proposedAllowlist)[field.key];
                    if (val === undefined || val === null || val === "") return null;
                    const hintId = `allowlist-hint-${field.key}`;
                    return (
                      <label key={field.key} className={`allowlist-row ${checked ? "" : "unchecked"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAllowlistKey(field.key)}
                          aria-describedby={hintId}
                        />
                        <div className="allowlist-row-main">
                          <div className="allowlist-row-top">
                            <span className="allowlist-label" title={field.shortHint}>
                              {field.label}
                            </span>
                            <span className="allowlist-val" title={String(val)}>
                              {field.kind === "integer"
                                ? `${val} days`
                                : field.kind === "enum"
                                  ? humanizeValue(String(val))
                                  : String(val)}
                            </span>
                          </div>
                          {/* Checked rows stay one line; the hint remains available to screen readers. */}
                          <div id={hintId} className={checked ? "sr-only" : "allowlist-hint"}>
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
                      <span title="Deterministic code gate: 0 local identifiers matched in the serialized payload">
                        <strong>Privacy check passed:</strong> none of your personal details are in this{" "}
                        <code>{liveGate.serialized.length}-byte</code> request.
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setActiveModal("wire")}>
                        Inspect Raw JSON
                      </button>
                    </div>
                  ) : (
                    <div className="callout callout-red">
                      <strong>Blocked before sending:</strong> {liveGate.reason}{" "}
                      <code className="mode-code">{liveGate.refusal}</code>
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
                  disabled={analyzingCloud || runningOffline || !liveGate?.ok || customEocBlocked}
                >
                  {analyzingCloud && <span className="spinner" />}
                  {analyzingCloud
                    ? cloudRetryNote || "Matching your plan in the cloud…"
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
          <section ref={offlineRef} className="card scroll-target" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <span className="tag tag-yellow" title={`OFFLINE_LOCAL_TRIAGE · ${offlineTriage.source}`}>
                Offline triage · on this device
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                {offlineTriage.httpRequests} network requests · {(offlineTriage.latencyMs / 1000).toFixed(1)}s
              </span>
            </div>
            <p className="pane-desc" style={{ marginBottom: 10 }}>
              A quick checklist made without the internet. It doesn&apos;t cite plan sections, because it can&apos;t see
              your plan offline. <code className="mode-code">OFFLINE_LOCAL_TRIAGE</code>
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
          <section
            ref={resultsRef}
            className="results-section scroll-target"
            aria-label="Policy analysis and editable appeal draft"
          >
            {cloudMeta &&
              liveGate?.ok &&
              cloudMeta.allowlistSnapshot !== `${liveGate.serialized}|${eocSourceMode}|${customEocText.length}` && (
              <div
                className="callout callout-yellow"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
              >
                <span>
                  <strong>What gets sent has changed since this result.</strong> Re-run to update the plan match and
                  draft for your current selection.
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleMatchClauseInCloud}
                  disabled={analyzingCloud || runningOffline || customEocBlocked}
                >
                  {analyzingCloud && cloudRetryNote
                    ? cloudRetryNote
                    : planIdEnabled
                      ? "Re-Run Policy Match"
                      : "Re-Run General Guidance"}
                </button>
              </div>
            )}
            <div className="clause-compare-grid">
              <div className="card">
                <span className="tag tag-green">From your letter · never uploaded</span>
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
                  <div
                    title={`Verified wire audit (${cloudMeta.source})`}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-muted)" }}
                  >
                    Checked what was sent: <strong>{cloudMeta.leakedCanaries}</strong> of your personal details in{" "}
                    <strong>{cloudMeta.wireBytes.toLocaleString()} bytes</strong>.
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span
                    className={`tag tag-preserve-case ${
                      cloudAnalysis.mode_used === "POLICY_MATCHED" ? "tag-blue" : "tag-yellow"
                    }`}
                    title={`${cloudAnalysis.mode_used} · clause ${cloudAnalysis.cited_clause_id || "NONE"}`}
                  >
                    {cloudAnalysis.mode_used === "POLICY_MATCHED"
                      ? `Matched your plan · Section ${cloudAnalysis.cited_clause_id}`
                      : "General guidance · no plan section"}
                  </span>
                  <span
                    className={`tag tag-preserve-case ${
                      cloudAnalysis.exception_applies === "YES"
                        ? "tag-green"
                        : cloudAnalysis.exception_applies === "CONDITIONAL"
                          ? "tag-yellow"
                          : cloudAnalysis.exception_applies === "NO"
                            ? "tag-red"
                            : "tag-neutral"
                    }`}
                    title={`exception_applies: ${cloudAnalysis.exception_applies}`}
                  >
                    {EXCEPTION_LABELS[cloudAnalysis.exception_applies] ?? humanizeValue(cloudAnalysis.exception_applies)}
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
                    ? `What Your Plan Says (Section ${cloudAnalysis.cited_clause_id})`
                    : "General Guidance"}
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
                    <span
                      className="tag tag-yellow"
                      style={{ background: "#ffffff", marginBottom: 6 }}
                      title="NEEDS_PATIENT_CONFIRMATION"
                    >
                      Needs your confirmation
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
                      Your letter doesn&apos;t say whether these are true, so the draft below doesn&apos;t claim them. Tick
                      any you can confirm and its sentence is added to your draft.
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
                              Adds to your draft: &ldquo;{item.draft_statement}&rdquo;
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tag tag-yellow" style={{ background: "#ffffff", marginBottom: 6 }}>
                      Next steps without your plan
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
                  <span
                    className={`tag ${rejoined.orphanPlaceholders.length ? "tag-yellow" : "tag-green"}`}
                    title={`Re-joined on device · ${rejoined.orphanPlaceholders.length} orphan placeholders`}
                  >
                    {rejoined.orphanPlaceholders.length
                      ? `${rejoined.orphanPlaceholders.length} blanks left to fill`
                      : `${rejoined.rejoinedTokens.length} details filled in on this device`}
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
                    Your Appeal Draft
                  </h3>
                  <p className="pane-desc">

                    The cloud only ever saw blanks like <code>[MEMBER_NAME]</code>. Edit freely before sending.
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
