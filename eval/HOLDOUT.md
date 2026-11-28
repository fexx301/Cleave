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
