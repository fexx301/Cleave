# Cleave

**Understand why this claim was denied and draft a response without uploading the original letter.**
*Split the secret from the math. Re-join only on your device.*

Built for **#BuildHybridAI 2026** using **Firebase AI Logic Hybrid Inference** (Chrome Built-in Gemini Nano + Cloud Gemini Developer API + Firebase App Check).

---

## The Trade-Off

Elena receives a hospital denial letter citing a missing Primary Care Physician referral. Her plan's Evidence of Coverage waives referrals for after-hours urgent care (Clause `4.2(a)`), and she checked in at 11:40 PM. To verify that clause and write a timely Request for Review, she faces two bad defaults:

1. **Upload the raw letter to Cloud AI** — or use a naive `PREFER_ON_DEVICE` wrapper that silently uploads her raw `application/pdf` letter to Google Cloud the moment Chrome's on-device adapter rejects the PDF MIME type or runs on an unsupported browser/device.
2. **Stay strictly on-device** — keeping her identity local, but losing multi-clause Evidence of Coverage policy reasoning and risking missed exceptions across dense policy text.

Most hybrid AI apps pick **local OR cloud per request** and display a fallback badge. **Cleave splits one task across both brains:**

`Local Letter / PDF (pdfjs-dist) → ONLY_ON_DEVICE Gemini Nano → Deterministic Allowlist Code Gate → Interactive User Control → ONLY_IN_CLOUD Policy Match → Local Re-Join`

---

## Honest Privacy Model (AI Proposes, Deterministic Code Decides)

- **Raw denial letter text never enters the cloud serializer.** Cleave constructs the outgoing cloud request exclusively from a small, typed allowlist of non-identifying claim fields (`plan_id`, `denial_reason_code`, `service_setting`, `after_hours_visit_confirmed`, `network_status`, relative integer `days_since_service` / `days_since_denial`, `urgency_documented`, `ongoing_treatment`, `enrollment_date_known`).
- **Even allowed fields can be sensitive health information or narrow identity in combination.** Before anything leaves the device, Cleave shows every exact outgoing value in plain English and lets the patient uncheck any field — visibly showing the trade-off (for example, unchecking `Plan Policy Identifier` degrades Cloud Gemini to `GENERAL_GUIDANCE_ONLY` because Cleave can no longer match the plan's Evidence of Coverage).
- **Four named deterministic refusals (code decides, never a small LLM grading itself):**
  - `REFUSE_LOCAL_UNAVAILABLE` — `ONLY_ON_DEVICE` throws; Cleave refuses to fall back to cloud.
  - `REFUSE_RAW_TEXT_BLOCKED` — unallowlisted key or free-text string blocked before serialization.
  - `REFUSE_RESIDUAL_IDENTIFIER` — deterministic scan of serialized JSON finds any locally extracted identifier or PII pattern (`MBR-`, `CLM-`, `GRP-`, email, phone, DOB, exact date, street address, `Dr.`).
  - `REFUSE_CHUNK_OVERFLOW` — document exceeds safe local bounds; refuses silent truncation or cloud spillover.

---

## Load-Bearing Firebase AI Logic Map

| Firebase Capability | Where Used in Code | What Breaks Without It |
|---|---|---|
| `InferenceMode.ONLY_ON_DEVICE` + `responseConstraint` | `src/lib/firebaseAi.ts` (`extractOnDevice`) | Fail-closed privacy guarantee breaks — `PREFER_ON_DEVICE` silently uploads unsupported `application/pdf` inputs or requests on ineligible hardware to the cloud. |
| `InferenceMode.ONLY_IN_CLOUD` + `responseSchema` | `src/lib/firebaseAi.ts` (`analyzeAllowlistInCloud`) | Exact Evidence of Coverage clause matching, unresolved-fact detection (`NEEDS_PATIENT_CONFIRMATION`), and structured placeholder draft generation break. |
| `InferenceMode.PREFER_IN_CLOUD` | `src/lib/firebaseAi.ts` (`runOfflineResilientTriage`) | Offline-resilient degraded triage (`OFFLINE_LOCAL_TRIAGE`) breaks when connectivity drops. |
| `response.inferenceSource` | `src/lib/firebaseAi.ts` + `WireProofModal.tsx` | Verifiable provenance trail stamping `on_device` vs `in_cloud` on every step breaks. |
| `Firebase App Check` (`ReCaptchaV3Provider` / debug token) | `src/lib/firebaseAi.ts` (`initializeCleaveFirebase`) | Client-side cloud inference calls lack attestation against quota abuse. |

---

## Verified Evaluation Evidence (Observed 2026-11-25 on Chrome 158 + Firebase AI Logic)

Tested live on **Chrome 158 (`nano_v3_gpu_component`)** + **Firebase AI Logic (`gemini-3.5-flash-lite`, Spark free tier)** across **6 pre-annotated synthetic missing-referral / prior-auth cases** containing **50 planted personal identifiers** (compared against a realistic stressed-patient manual-redaction baseline):

- **Planted identifiers in captured outbound HTTPS bodies:** **0 / 50** for Cleave vs **8 / 50** for realistic manual redaction.
- **Completed cases / false refusals (tracked separately):** **6 / 6** completed, **0 / 6** false refusals, **4 / 4** valid named refusals (including live `PREFER_ON_DEVICE` Base64 PDF leak proof vs `ONLY_ON_DEVICE` 0-HTTP fail-closed proof).
- **Exact ground-truth pass (clause + exception status + unresolved-fact confirmation):** **6 / 6** in the hardened Cleave Chrome Web rehearsal (up from 5 / 6 in the pre-build probe) vs **2 / 6** (3 / 6 in probe) for realistic manual redaction.
- **Orphan placeholders after local re-join:** **0** across all 6 cases.

*(Scope limit: synthetic single-page letters and two generic EOCs are used for reproducible evaluation; real-world multi-page scanned insurer letters and end-user demand remain outside what this benchmark proves. Cleave is an administrative policy-clause review aid, not legal or medical advice.)*

---

## Judge Quick Path (60 Seconds to 3 Minutes)

1. **Setup:** Run locally (`npm install && npm run dev`), open `http://localhost:5173` in **Chrome Desktop 139+** (with `chrome://flags/#prompt-api` enabled), open **Settings**, paste a free Spark Firebase Web config (with Firebase AI Logic / Gemini Developer API enabled), and confirm Gemini Nano is `available`.
2. **Happy Path + Interactive Control (60s):** On **Case 1 (After-Hours Urgent Care)**, click **Cleave Letter on Device** (`ONLY_ON_DEVICE`, `0` HTTP requests) → uncheck **Plan Policy Identifier** → click **Get General Guidance in Cloud** (`GENERAL_GUIDANCE_ONLY`) → re-check **Plan Policy Identifier** → click **Match Policy Clause in Cloud** (`POLICY_MATCHED · Clause 4.2(a)` + local re-join).
3. **Unresolved-Fact Discipline (30s):** Switch to **Case 3 (Retroactive MRI Auth)** → observe `NEEDS_PATIENT_CONFIRMATION` checklist and toggle confirmation to update the local draft.
4. **Fail-Closed Proof & Wire Audit (60s):** Open **Fail-Closed Lab** → click **Run Live PDF Comparison** (`ONLY_ON_DEVICE` = `0` HTTP calls vs `PREFER_ON_DEVICE` = raw PDF uploaded over HTTPS) and **Trigger All 4 Refusals** → open **Wire Proof** (or Chrome DevTools Network tab) to verify `0` vault identifiers in captured requests.
5. **Reproducible Benchmark (optional):** Open **6-Case Eval** → click **Run Live 6-Case Suite** and export the timestamped JSON report.

---

## Bring Your Own Plan EOC & Local PDF Support

- **Local PDF parsing (`pdfjs-dist`):** Drop any text-based denial `.pdf` (or download the included sample `/samples/case1-after-hours-denial.pdf`) — extracted strictly in browser memory with **0 bytes uploaded**. Cleave never passes `application/pdf` to `PREFER_ON_DEVICE`.
- **Bring Your Own Plan EOC:** Beyond the two built-in plans (`PLAN-HMO-2026-GOLD`, `PLAN-EPO-2026-SELECT`), patients can inspect built-in clauses or upload/paste any generic Plan Evidence of Coverage `.pdf`/`.txt` (sample included: `/samples/sample-custom-eoc.pdf` for Summit Regional Health PPO). Deterministic code (`verifyCustomEocSafety`) still scans uploaded EOCs to block accidental personal denial-letter uploads (`REFUSE_RESIDUAL_IDENTIFIER`). Unchecking `Plan Policy Identifier` withholds even a custom EOC and degrades honestly to `GENERAL_GUIDANCE_ONLY`.
- **Quota & Public Demo Safeguards:** Enforces a soft client-side session limit (40 cloud calls per browser session; unlimited local on-device extraction and Offline Local Triage) and surfaces clear recovery guidance if the free-tier Gemini Developer API returns `429`.

## Local Development & Firebase Hosting

```bash
npm install
npm test        # 16 unit tests (deterministic gate, allowlist, Base64 leak scan, real pdfjs-dist PDF extraction)
npm run build   # TypeScript strict check + Vite production bundle
npm run dev     # http://localhost:5173
```

To configure via environment variables (or bake public read-only Firebase Web config + App Check reCAPTCHA v3 site key into a Firebase Hosting build), copy `.env.example` to `.env.local` (gitignored) and deploy with `npx firebase-tools deploy --only hosting`. Firebase Hosting config and security headers live in [firebase.json](firebase.json).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
