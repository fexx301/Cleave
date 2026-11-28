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

### After fixes (not the held-out number)

Two fixes were made *because of* the misses above. This means the held-out set has now influenced the code, so the numbers below are **not** a held-out result.

1. **Weekends and named public holidays count as after-hours** (`detectAfterHoursCue`): "Saturday", "Sunday", "Labor Day", "Thanksgiving" and the other US federal holidays. Plan clauses like 4.2(a) cover weekends and holidays.
2. **Code overrules an on-device "emergency" label** when the letter says the visit was scheduled, routine, elective, preventive or non-emergency, and has no emergency, urgent-care or after-hours cue (`detectScheduledNonUrgentCue`).

Checked before re-running: across all 18 letters (dev + held-out), the fixes change the detected cues of exactly three: held-out 01 (Saturday, newly flagged after-hours), 11 and 12. None of the six dev cases changes.

| Run | Cleave exact | Cleave leaks | Baseline exact | Baseline leaks | Vault capture | Draft blanks |
|---|---|---|---|---|---|---|
| Held-out, first run (the result) | 10 / 12 | 0 / 83 | 9 / 12 | 49 / 83 | 76 / 83 | 7 |
| Held-out, after fixes (`eval/holdout-live-after-fixes.json`) | 12 / 12 | 0 / 83 | 11 / 12 | 49 / 83 | 75 / 83 | 8 |
| Dev set, after fixes, regression check (`eval/dev-live-after-fixes.json`) | 6 / 6 | 0 / 50 | 4 / 6 | 8 / 50 | 50 / 50 | 0 |

**Read with care:**
- The baseline's code did not change, yet it went from 9/12 to 11/12. That is run-to-run variation in the cloud model.
- One run per row cannot separate Cleave's fix from that noise. What *is* shown is the mechanism: the two failing letters now carry the deciding fact (holiday or after-hours, and a non-emergency setting) in their outgoing payload, and both pass.
- Vault capture also varies by run (76 then 75), because Gemini Nano's output is not fully deterministic.
- The floor (code-only) numbers are unchanged after the fixes (`eval/holdout-floor-after-fixes.json`), because the floor does not score verdicts.
