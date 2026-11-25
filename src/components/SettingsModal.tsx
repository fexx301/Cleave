import { useEffect, useState } from "react";
import {
  clearSavedFirebaseSettings,
  DEFAULT_CLOUD_MODEL,
  downloadOrWarmNano,
  initializeCleaveFirebase,
  parseFirebaseConfigSnippet,
  type NanoAvailability,
  type RuntimeSettings
} from "../lib/firebaseAi";
import { CloseIcon } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: RuntimeSettings;
  nanoStatus: NanoAvailability;
  onSettingsSaved: (next: RuntimeSettings, info: { projectId: string; appCheckMode: "off" | "debug_token" | "recaptcha_enterprise" }) => void;
  onCleared: () => void;
  onNanoStatusChange: (next: NanoAvailability) => void;
}

export function SettingsModal({
  open,
  onClose,
  settings,
  nanoStatus,
  onSettingsSaved,
  onCleared,
  onNanoStatusChange
}: Props) {
  const [configText, setConfigText] = useState(
    settings.config ? JSON.stringify(settings.config, null, 2) : ""
  );
  const [debugToken, setDebugToken] = useState(settings.appCheckDebugToken);
  const [recaptchaKey, setRecaptchaKey] = useState(settings.recaptchaSiteKey);
  const [cloudModel, setCloudModel] = useState(settings.cloudModel || DEFAULT_CLOUD_MODEL);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [warming, setWarming] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSave() {
    setError(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      const parsed = parseFirebaseConfigSnippet(configText);
      const next: RuntimeSettings = {
        config: parsed,
        appCheckDebugToken: debugToken.trim(),
        recaptchaSiteKey: recaptchaKey.trim(),
        cloudModel: cloudModel.trim() || DEFAULT_CLOUD_MODEL
      };
      const info = await initializeCleaveFirebase(next);
      onSettingsSaved(next, info);
      setStatusMsg(`Initialized Firebase project "${info.projectId}" (App Check: ${info.appCheckMode}).`);
    } catch (err) {
      setError((err as Error)?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleClear() {
    clearSavedFirebaseSettings();
    setConfigText("");
    setDebugToken("");
    setRecaptchaKey("");
    setStatusMsg("Cleared saved Firebase credentials from browser localStorage.");
    onCleared();
  }

  async function handleWarmNano() {
    setError(null);
    setWarming(true);
    setDownloadPct(0);
    try {
      const next = await downloadOrWarmNano((pct) => setDownloadPct(pct));
      onNanoStatusChange(next);
      setStatusMsg(`Chrome Gemini Nano status: ${next}.`);
    } catch (err) {
      setError((err as Error)?.message || String(err));
    } finally {
      setWarming(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Firebase and On-Device Settings">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Firebase AI Logic &amp; On-Device Setup</h2>
            <p className="pane-desc">
              Configuration is kept strictly in your browser&apos;s localStorage or local gitignored <code>.env.local</code>.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close settings">
            <CloseIcon />
          </button>
        </div>

        <div className="field">
          <label htmlFor="fb-cfg">Firebase Web Config (paste raw JSON or JS snippet from Firebase Console)</label>
          <textarea
            id="fb-cfg"
            rows={7}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            placeholder={`const firebaseConfig = {\n  apiKey: "...",\n  projectId: "cleave-5a82b",\n  appId: "1:...:web:..."\n};`}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="cloud-model">Cloud Model (Gemini Developer API)</label>
            <select id="cloud-model" value={cloudModel} onChange={(e) => setCloudModel(e.target.value)}>
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Fast Spark free tier)</option>
              <option value="gemini-3.8-flash">gemini-3.8-flash (Higher reasoning)</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="ac-debug">App Check Debug Token (localhost with enforcement on)</label>
            <input
              id="ac-debug"
              value={debugToken}
              onChange={(e) => setDebugToken(e.target.value)}
              placeholder="Optional UUID from App Check -> Manage debug tokens"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="ac-recaptcha">App Check Fraud Defense / reCAPTCHA Enterprise Site Key (for deployed domains)</label>
          <input
            id="ac-recaptcha"
            value={recaptchaKey}
            onChange={(e) => setRecaptchaKey(e.target.value)}
            placeholder="Optional Fraud Defense (reCAPTCHA Enterprise) site key"
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Initializing..." : "Save & Initialize Firebase"}
          </button>
          <button className="btn btn-danger-soft" onClick={handleClear}>
            Clear Saved Config
          </button>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong style={{ color: "var(--ink-primary)" }}>Chrome Built-in Gemini Nano</strong>
              <p className="pane-desc" style={{ marginTop: 2 }}>
                Required for fail-closed <code>ONLY_ON_DEVICE</code> splitting (Chrome 139+ with <code>chrome://flags/#prompt-api</code> enabled).
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`tag ${nanoStatus === "available" ? "tag-green" : "tag-yellow"}`}>
                <span className="dot" /> {nanoStatus}
              </span>
              <button className="btn" onClick={handleWarmNano} disabled={warming}>
                {warming
                  ? downloadPct !== null && downloadPct < 100
                    ? `Downloading ${downloadPct}%`
                    : "Warming Nano..."
                  : nanoStatus === "available"
                    ? "Warm Up Local Model"
                    : "Download Gemini Nano"}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="callout callout-red" style={{ marginTop: 14 }}>{error}</div>}
        {statusMsg && <div className="callout callout-green" style={{ marginTop: 14 }}>{statusMsg}</div>}
      </div>
    </div>
  );
}
