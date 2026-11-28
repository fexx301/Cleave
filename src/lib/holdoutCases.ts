import type { SyntheticCase } from "./types";

/**
 * HELD-OUT SET (pre-registered). Twelve fictional denial letters written AFTER Cleave's code and prompts were
 * built, committed BEFORE any run, and never used for tuning. Ground truth was written with the letters.
 * Rules for this set (see eval/HOLDOUT.md):
 *  - The first run's numbers are the held-out result. Any later fix is reported separately as "after fixes".
 *  - Same reference date as the dev set (BENCHMARK_REFERENCE_DATE, 2026-11-25), so day counts are fixed.
 *  - Every person, ID, address, phone, email, provider and facility here is invented.
 *  - The manual-redaction baseline is mechanical (mechanicalRedact below), not hand-edited.
 */

/** Labels a careful person would black out: identity lines only. Plan, service and reason lines are kept. */
const IDENTITY_LABELS = [
  "member name", "name", "patient", "patient name", "subscriber", "subscriber name", "member", "enrollee",
  "member id", "id", "subscriber id", "member number", "date of birth", "dob", "address", "mailing address",
  "claim number", "claim no", "claim #", "claim id", "claim", "phone", "telephone", "email", "group number", "group"
];

/**
 * Mechanical manual-redaction baseline: replaces the value on any "Label: value" line whose label is an identity
 * label, and the name in a "Dear ..." salutation. Prose is left untouched, as a hurried person would.
 */
export function mechanicalRedact(letter: string): string {
  return letter
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*)([A-Za-z][A-Za-z #]*?)\s*[:#|]\s*(.+)$/);
      if (m && IDENTITY_LABELS.includes(m[2].trim().toLowerCase())) return `${m[1]}${m[2]}: [REDACTED]`;
      if (/^\s*Dear\s+/i.test(line)) return line.replace(/^(\s*Dear\s+).+?([,:])\s*$/i, "$1[REDACTED]$2");
      return line;
    })
    .join("\n");
}

type HoldoutDraft = Omit<SyntheticCase, "manual_redacted_letter">;

const DRAFTS: HoldoutDraft[] = [
  {
    id: "holdout-01",
    shortTitle: "Weekend urgent care, prose letter",
    title: "Held-out 01 — Weekend urgent care, identifiers in prose (4.2(a))",
    categoryTag: "Clear Waiver · Prose",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `ClearPath Health Plan
Member Services · PO Box 4410 · Springfield

November 9, 2026

Dear Ms. Adaeze Okafor,

We have reviewed claim 2026-1103-7781 for the urgent care visit you had at Lakeshore Urgent Care on Saturday, October 31, 2026. Your coverage is the ClearPath Gold HMO (plan PLAN-HMO-2026-GOLD), member ID W2287741903.

We are unable to pay this claim. Our records show no referral from your Primary Care Physician for this visit, and HMO visits require a PCP referral (reason REF-01). The treating provider was Dr. Priya Raman.

If you disagree, you may ask for a review. Please call us at (312) 555-0147 or write to us. We will send correspondence to 88 Birchwood Lane, Apt 4B.

Sincerely,
ClearPath Appeals Unit`,
    canaries: [
      "Adaeze Okafor",
      "2026-1103-7781",
      "Lakeshore Urgent Care",
      "October 31, 2026",
      "W2287741903",
      "Priya Raman",
      "(312) 555-0147",
      "88 Birchwood Lane"
    ],
    ground_truth: {
      expected_clause: "4.2(a)",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 25,
      expected_days_since_denial: 16
    }
  },
  {
    id: "holdout-02",
    shortTitle: "Child's therapy, dependent named",
    title: "Held-out 02 — Dependent's in-network behavioral health visit (4.4(a))",
    categoryTag: "Clear Waiver · Dependent",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN — NOTICE OF ADVERSE BENEFIT DETERMINATION
Notice Date: November 12, 2026
Plan Policy: PLAN-HMO-2026-GOLD

Subscriber: Grace Okeke
Subscriber ID: MBR-5530918
Patient: Jamal Okeke (dependent, DOB 03/14/2012)
Claim Number: CLM-2026-774310

Dear Grace Okeke,

Your son Jamal attended an outpatient psychotherapy session on November 2, 2026 with Hannah Lindqvist, LCSW, at Brightwater Family Counseling, an in-network behavioral health practice (provider NPI 1487726354).

DETERMINATION: DENIED
Reason Code: REF-01 (No Primary Care Physician referral on file).
The claim was processed as a specialist visit requiring a PCP referral.`,
    canaries: [
      "Grace Okeke",
      "MBR-5530918",
      "Jamal Okeke",
      "03/14/2012",
      "CLM-2026-774310",
      "Hannah Lindqvist",
      "Brightwater Family Counseling",
      "1487726354"
    ],
    ground_truth: {
      expected_clause: "4.4(a)",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 23,
      expected_days_since_denial: 13
    }
  },
  {
    id: "holdout-03",
    shortTitle: "MRI without prior auth, urgency unknown",
    title: "Held-out 03 — Urgent MRI, physician urgency documentation not stated (5.1(c))",
    categoryTag: "Unresolved Fact",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN
Notice Date: November 20, 2026
Plan Policy: PLAN-HMO-2026-GOLD (ClearPath Gold HMO)

Member Name: Tomasz Wielicki
Member ID: MBR-3307745
Date of Birth: 1971-02-08
Claim Number: CLM-2026-880214

Date of Service: November 15, 2026
Service: MRI, lumbar spine without contrast
Ordering Physician: Dr. Helena Marsh
Imaging Facility: Northgate Imaging Partners

DETERMINATION: DENIED
Reason Code: PA-02 (Prior authorization not obtained for advanced imaging).
Explanation: Advanced imaging requires prior authorization. No authorization request was received before the date of service.`,
    canaries: [
      "Tomasz Wielicki",
      "MBR-3307745",
      "1971-02-08",
      "CLM-2026-880214",
      "Helena Marsh",
      "Northgate Imaging Partners",
      "November 15, 2026"
    ],
    ground_truth: {
      expected_clause: "5.1(c)",
      exception_applies: "CONDITIONAL",
      requires_patient_confirmation: true,
      expected_confirmation_topic: "whether the ordering physician documented clinical urgency (request within 14 days)",
      expected_days_since_service: 10,
      expected_days_since_denial: 5
    }
  },
  {
    id: "holdout-04",
    shortTitle: "Elective out-of-network dermatology",
    title: "Held-out 04 — Weekday elective out-of-network specialist, no referral (honest negative, 4.1)",
    categoryTag: "Honest Negative",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN | ADVERSE BENEFIT DETERMINATION
Notice Date | October 20, 2026
Plan | PLAN-HMO-2026-GOLD

Member | Rosalind Achterberg
Member ID | MBR-6619027
Claim | CLM-2026-502238
Date of Service | October 6, 2026 (appointment 10:15 AM)
Provider | Dr. Felix Brandt, Cedar Hollow Dermatology (out-of-network)
Service | Routine elective skin check, new patient

DETERMINATION: DENIED
Reason Code: REF-01 (No PCP referral; out-of-network elective specialist visit).
Explanation: Elective visits to out-of-network specialists are not covered without a PCP referral.`,
    canaries: [
      "Rosalind Achterberg",
      "MBR-6619027",
      "CLM-2026-502238",
      "Felix Brandt",
      "Cedar Hollow Dermatology",
      "October 6, 2026"
    ],
    ground_truth: {
      expected_clause: "4.1",
      exception_applies: "NO",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 50,
      expected_days_since_denial: 36
    }
  },
  {
    id: "holdout-05",
    shortTitle: "New member, ongoing chemo",
    title: "Held-out 05 — New member in active oncology treatment, enrollment date not stated (6.4(a))",
    categoryTag: "Unresolved Fact",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN — ADVERSE BENEFIT DETERMINATION
Notice Date: November 13, 2026
Plan Policy: PLAN-HMO-2026-GOLD

Member Name: Desmond Afolabi-Reyes
Member ID: MBR-9004126
Address: 1450 Quarry Hill Road
Claim Number: CLM-2026-660197

Date of Service: November 3, 2026
Provider: Dr. Ingrid Solheim, Riverside Oncology Associates (non-participating)
Service: Cycle 4 of an ongoing chemotherapy course that began before your current plan coverage

DETERMINATION: DENIED
Reason Code: REF-01 (No PCP referral for a non-participating specialist).
Explanation: Services from non-participating specialists require a PCP referral.`,
    canaries: [
      "Desmond Afolabi-Reyes",
      "MBR-9004126",
      "1450 Quarry Hill Road",
      "CLM-2026-660197",
      "Ingrid Solheim",
      "Riverside Oncology Associates",
      "November 3, 2026"
    ],
    ground_truth: {
      expected_clause: "6.4(a)",
      exception_applies: "CONDITIONAL",
      requires_patient_confirmation: true,
      expected_confirmation_topic: "whether the plan effective date was within 90 days of the visit",
      expected_days_since_service: 22,
      expected_days_since_denial: 12
    }
  },
  {
    id: "holdout-06",
    shortTitle: "OB-GYN, OCR-damaged scan",
    title: "Held-out 06 — In-network OB-GYN visit, OCR-damaged scan (4.3(b))",
    categoryTag: "Clear Waiver · Messy OCR",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEAITH PLAN - ADVERSE BENEF1T DETERMINAT1ON
N0tice Date: November 6, 2026
Plan Po1icy: PLAN-HMO-2026-GOLD

Mernber Narne: Siobhan Kavanagh-Ruiz
Mernber 1D: MBR-2218840
Ciaim Nurnber: CLM-2026-439915
Date of Service: October 27, 2026
Provider: Dr. Amara Nwosu, Elmstead Women's Health (in-network OB-GYN)
Service: Acute gynecological visit, pelvic pain

DETERM1NATION: DEN1ED
Reason Code: REF-01 (No PCP referra1 on fi1e).
Exp1anation: Specia1ist visits require a PCP referra1.`,
    canaries: [
      "Siobhan Kavanagh-Ruiz",
      "MBR-2218840",
      "CLM-2026-439915",
      "Amara Nwosu",
      "Elmstead Women's Health",
      "October 27, 2026"
    ],
    ground_truth: {
      expected_clause: "4.3(b)",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 29,
      expected_days_since_denial: 19
    }
  },
  {
    id: "holdout-07",
    shortTitle: "Out-of-network OB-GYN annual exam",
    title: "Held-out 07 — Routine OB-GYN exam with an out-of-network provider (honest negative)",
    categoryTag: "Honest Negative",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `From: ClearPath Health Plan <noreply@clearpath-plan.example>
Subject: Claim decision for CLM-2026-118463

Notice Date: October 26, 2026
Plan Policy: PLAN-HMO-2026-GOLD

Hello Mei-Lin Castellanos,

Your claim CLM-2026-118463 (member MBR-7741352) for a routine annual gynecological exam on October 14, 2026 with Dr. Rafaela Dumont at Harborview Midwifery Collective has been denied. Harborview Midwifery Collective is not in the ClearPath network, and the visit was a routine preventive appointment.

Reason Code: REF-01 (No PCP referral; out-of-network provider).

Questions? Reply to this email or contact mlcastellanos@mailbox.example on file for updates.`,
    canaries: [
      "Mei-Lin Castellanos",
      "CLM-2026-118463",
      "MBR-7741352",
      "October 14, 2026",
      "Rafaela Dumont",
      "Harborview Midwifery Collective",
      "mlcastellanos@mailbox.example"
    ],
    ground_truth: {
      expected_clause: "4.3(b) / 4.1",
      exception_applies: "NO",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 42,
      expected_days_since_denial: 30
    }
  },
  {
    id: "holdout-08",
    shortTitle: "EPO emergency at non-participating ER",
    title: "Held-out 08 — Overnight emergency visit at a non-participating hospital (EPO 3.4(a))",
    categoryTag: "Clear Waiver · EPO",
    plan_id: "PLAN-EPO-2026-SELECT",
    raw_letter: `MERIDIAN HEALTH — EXPLANATION OF DENIAL
Notice Date: November 18, 2026
Plan Policy: PLAN-EPO-2026-SELECT (Meridian Select EPO)

Enrollee: Bartholomew Nkemelu
Member ID: MBR-4482019
Date of Birth: 1958-11-30
Claim Number: CLM-2026-937751

Date of Service: November 8, 2026 (arrival 2:10 AM)
Facility: Saint Brendan Hospital Emergency Department (non-participating)
Attending: Dr. Yusuf Haddad
Service: Emergency evaluation for chest pain

DETERMINATION: DENIED
Reason Code: NET-03 (Out-of-network facility; EPO plans do not cover non-participating providers).`,
    canaries: [
      "Bartholomew Nkemelu",
      "MBR-4482019",
      "1958-11-30",
      "CLM-2026-937751",
      "Saint Brendan Hospital",
      "Yusuf Haddad",
      "November 8, 2026"
    ],
    ground_truth: {
      expected_clause: "3.4(a)",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 17,
      expected_days_since_denial: 7
    }
  },
  {
    id: "holdout-09",
    shortTitle: "EPO in-network cardiology, referral demanded",
    title: "Held-out 09 — In-network specialist wrongly denied for a missing referral (EPO 3.1)",
    categoryTag: "Clear Waiver · EPO",
    plan_id: "PLAN-EPO-2026-SELECT",
    raw_letter: `MERIDIAN HEALTH
Date: November 10, 2026
Plan Policy: PLAN-EPO-2026-SELECT

Patient Name: Ottoline Fairweather
Member ID: MBR-1196604
Mailing Address: 23 Kestrel Court
Claim ID: CLM-2026-215580

Service Date: October 29, 2026
Provider: Dr. Kenji Watanabe, Summit Heart Clinic (participating cardiology)
Service: Follow-up cardiology consultation

DETERMINATION: DENIED
Reason Code: REF-01 (Referral from Primary Care Physician not received).`,
    canaries: [
      "Ottoline Fairweather",
      "MBR-1196604",
      "23 Kestrel Court",
      "CLM-2026-215580",
      "Kenji Watanabe",
      "Summit Heart Clinic",
      "October 29, 2026"
    ],
    ground_truth: {
      expected_clause: "3.1",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 27,
      expected_days_since_denial: 15
    }
  },
  {
    id: "holdout-10",
    shortTitle: "EPO CT scan, necessity unknown",
    title: "Held-out 10 — CT without prior auth inside the 10-day window, necessity not stated (EPO 5.2(b))",
    categoryTag: "Unresolved Fact · EPO",
    plan_id: "PLAN-EPO-2026-SELECT",
    raw_letter: `MERIDIAN HEALTH — ADVERSE DETERMINATION
Notice Date: November 21, 2026
Plan Policy: PLAN-EPO-2026-SELECT
Member Name: Lucinda Ferreira-Holt | Member ID: MBR-8820461 | Claim Number: CLM-2026-990087
Date of Service: November 19, 2026
Service: CT abdomen and pelvis with contrast, Westbrook Diagnostic Center
Ordering Provider: Dr. Samuel Okonkwo-Baird
DETERMINATION: DENIED. Reason Code: PA-02 (Prior authorization not obtained).`,
    canaries: [
      "Lucinda Ferreira-Holt",
      "MBR-8820461",
      "CLM-2026-990087",
      "Westbrook Diagnostic Center",
      "Samuel Okonkwo-Baird",
      "November 19, 2026"
    ],
    ground_truth: {
      expected_clause: "5.2(b)",
      exception_applies: "CONDITIONAL",
      requires_patient_confirmation: true,
      expected_confirmation_topic: "whether medical necessity was documented (request within 10 days)",
      expected_days_since_service: 6,
      expected_days_since_denial: 4
    }
  },
  {
    id: "holdout-11",
    shortTitle: "EPO out-of-network orthopedics",
    title: "Held-out 11 — Non-emergency out-of-network specialist, not pre-approved (honest negative, EPO 3.1)",
    categoryTag: "Honest Negative · EPO",
    plan_id: "PLAN-EPO-2026-SELECT",
    raw_letter: `MERIDIAN HEALTH
Notice Date: September 30, 2026
Plan Policy: PLAN-EPO-2026-SELECT

Dear Mr. Caspian Lindgren-Obi,

This letter is about claim CLM-2026-304412 for your visit on September 15, 2026 to Dr. Beatriz Montoya at Alder Ridge Orthopedics for a scheduled knee consultation. Alder Ridge Orthopedics does not participate in the Meridian Select EPO network, and no request for network-adequacy pre-approval was received before the visit. Your member number is MBR-5107733.

DETERMINATION: DENIED
Reason Code: NET-03 (Out-of-network non-emergency service).`,
    canaries: [
      "Caspian Lindgren-Obi",
      "CLM-2026-304412",
      "September 15, 2026",
      "Beatriz Montoya",
      "Alder Ridge Orthopedics",
      "MBR-5107733"
    ],
    ground_truth: {
      expected_clause: "3.1",
      exception_applies: "NO",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 71,
      expected_days_since_denial: 56
    }
  },
  {
    id: "holdout-12",
    shortTitle: "Labor Day urgent care",
    title: "Held-out 12 — Daytime urgent care on a public holiday (4.2(a))",
    categoryTag: "Clear Waiver · Holiday",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN — ADVERSE BENEFIT DETERMINATION
Notice Date: September 21, 2026
Plan Policy: PLAN-HMO-2026-GOLD

Member Name: Wilhelmina Oyelaran
Member ID: MBR-3390275
Phone: 614-555-0193
Email: w.oyelaran@mailbox.example
Claim Number: CLM-2026-271906

Date of Service: September 7, 2026 (Labor Day, check-in 2:05 PM)
Facility: Fernwood Urgent Care (out-of-network)
Clinician: Dr. Tobias Engel
Service: Urgent care visit for a deep hand laceration requiring sutures

DETERMINATION: DENIED
Reason Code: REF-01 (No PCP referral on file).`,
    canaries: [
      "Wilhelmina Oyelaran",
      "MBR-3390275",
      "614-555-0193",
      "w.oyelaran@mailbox.example",
      "CLM-2026-271906",
      "Fernwood Urgent Care",
      "Tobias Engel",
      "September 7, 2026"
    ],
    ground_truth: {
      expected_clause: "4.2(a)",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 79,
      expected_days_since_denial: 65
    }
  }
];

export const HOLDOUT_CASES: SyntheticCase[] = DRAFTS.map((c) => ({
  ...c,
  manual_redacted_letter: mechanicalRedact(c.raw_letter)
}));

export const HOLDOUT_TOTAL_CANARIES = HOLDOUT_CASES.reduce((acc, c) => acc + c.canaries.length, 0);
