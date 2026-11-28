# Held-out evaluation: protocol (pre-registered)

The original benchmark (6 cases, 50 planted identifiers) is a **development set**: Cleave's code and prompts were built against it. This file defines a separate **held-out set** so the results can be trusted.

## What was frozen, and when

- **Letters and ground truth:** `src/lib/holdoutCases.ts`. Twelve fictional denial letters, 83 planted identifiers. They were written after Cleave's code and prompts, and committed before any run. The commit that adds this file is the pre-registration; its hash and timestamp are the evidence.
- **Scoring:** `scoreCaseAgainstGroundTruth` in `src/lib/gate.ts`. Clause plus verdict plus confirmation must all match for an exact pass, and `"A / B"` accepts either clause.
- **Manual baseline:** `mechanicalRedact` in `src/lib/holdoutCases.ts`. It is a fixed rule, not hand redaction:
  - It blanks the value on `Label: value` or `Label | value` lines whose label is an identity label (name, member ID, date of birth, address, claim number, phone, email, group), and the name in a "Dear …" salutation.
  - Prose is left untouched.
  - Known limitation: it does not recognise OCR-damaged labels (e.g. "Mernber Narne"), which a careful person would.
- **Reference date:** 2026-11-25 (`BENCHMARK_REFERENCE_DATE`), so day counts are fixed.

## Rules

1. The **first run** of each layer is the held-out result, reported as is, with every miss listed.
2. `src/lib/gate.ts`, `src/lib/firebaseAi.ts` (prompts and extraction) and the letters are not changed between pre-registration and the first run.
3. If anything is fixed afterwards because of these results, it is reported separately as **"after fixes on the held-out set"**. It never replaces the held-out number.

## What is measured

Leaks alone would be close to tautological: Cleave's payload is typed enums and integers, so it cannot carry a name. So the eval also scores the things that can fail:

- **Outgoing leaks:** planted identifiers found in the request that leaves the device. Cleave is compared against the mechanical manual baseline.
- **Re-join coverage:** planted identifiers the on-device vault captured. Any it misses can't be filled back into the appeal draft locally.
- **Day counts:** days since service and since the notice, against ground truth.
- **Clause, verdict and confirmation:** exact pass against ground truth. Live run only.
- **False refusals and orphan placeholders.** Live run only.

## Two layers

| Layer | How to run | Needs |
|---|---|---|
| **Floor**: code-only on-device rules, no model | `npm run eval:holdout` (writes `eval/holdout-floor.json`) | Nothing: Node only, 0 network |
| **Live hybrid**: Gemini Nano on device + Gemini via Firebase AI Logic | App → Proof → 6-Case Benchmark → Case set: **Held-out** → Run, then Export JSON | Chrome with Gemini Nano, a Firebase project |

## Composition

| | Clear waiver | Unresolved fact (should ask) | Honest negative |
|---|---|---|---|
| ClearPath Gold HMO | 01, 02, 06, 12 | 03, 05 | 04, 07 |
| Meridian Select EPO | 08, 09 | 10 | 11 |

What makes these letters harder than the dev set:
- identifiers in running prose (01, 07, 11);
- a dependent child (02);
- a provider NPI (02);
- a bracketed phone number (01);
- email addresses (07, 12);
- a pipe-table layout (04);
- an OCR-damaged scan (06);
- dates only in prose, or in unlabelled or pipe-format lines (01, 04, 07, 11);
- a public holiday instead of a clock time (12).

## Results: first run (the held-out result)

Pre-registered in commit `5ff5e3a` (2026-11-28 08:54 +01:00, pushed before any run). Both layers were run once, as below. No code, prompts or letters changed in between.

| | Cleave | Mechanical manual baseline |
|---|---|---|
| Planted identifiers in outgoing requests | **0 / 83** | 49 / 83 |
| Exact pass (clause + verdict + confirmation) | **10 / 12** | 9 / 12 |
| Correct clause cited | 10 / 12 | 12 / 12 |
| Completed / false refusals | 12 / 0 | n/a |

The baseline sends the whole redacted letter, so the cloud sees full context. That makes it about as accurate as Cleave, and it is why it leaks 59% of the identifiers.

**Live hybrid run** (`eval/holdout-live-run1.json`, 2026-11-28 07:59 UTC, Chrome with Gemini Nano + `gemini-3.5-flash-lite` via Firebase AI Logic). Every local step reported `on_device` and every cloud step `in_cloud`.

| What can fail | Live (Gemini Nano + rules) | Floor (rules only, `eval/holdout-floor.json`) |
|---|---|---|
| Re-join coverage (identifiers captured in the local vault) | **76 / 83** | 53 / 83 |
| Blanks left in drafts (identifiers not captured, member fills them in) | 7 | n/a |
| Days since service correct | 7 / 12 | 7 / 12 |
| Days since notice correct | 10 / 12 | 10 / 12 |
| Planted identifiers in Cleave's outgoing payload | 0 / 83 | 0 / 83 |

### Every miss

- **holdout-12 (Labor Day urgent care) — wrong verdict.** Cleave said NO (4.1); the truth is YES (4.2(a) covers holidays). The visit was at 2:05 PM on a public holiday, and no allowlist field could carry "holiday": after-hours was `NOT_MENTIONED` and setting `UNKNOWN`. The fact that decides the case never reached the cloud.
- **holdout-11 (EPO out-of-network orthopedics) — wrong verdict.** Cleave said CONDITIONAL via 3.4(a) and asked a question; the truth is NO (3.1). Gemini Nano labelled a scheduled knee consultation `EMERGENCY_OR_AFTER_HOURS_URGENT`, so the cloud reasoned from the emergency clause. Asking rather than refusing is the safer failure, but it is still a miss.
- **Day counts:** dates written only in prose (01, 02, 07, 11) or in a pipe table (04) were not counted. Those fields were left out of the payload rather than guessed; no case failed because of it.
- **Re-join:** 7 identifiers across 01, 02, 04, 07 and 11 were not captured locally. They are left as visible blanks in the draft, not sent anywhere.

### After fixes

None yet. Any fix made because of these results will be reported here as a separate row, never as the held-out number.
