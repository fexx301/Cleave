import type { PlanEoc, SyntheticCase } from "./types";

// Reference date for deterministic benchmark day-offsets on the 6 synthetic cases
export const BENCHMARK_REFERENCE_DATE = "2026-11-25";

export const PLAN_EOCS: Record<string, PlanEoc> = {
  "PLAN-HMO-2026-GOLD": {
    plan_id: "PLAN-HMO-2026-GOLD",
    plan_name: "ClearPath Gold HMO (2026 Evidence of Coverage)",
    clauses: [
      {
        id: "4.1",
        title: "General Specialist Referral Requirement",
        text: "Except as expressly waived in Sections 4.2 through 4.4 or Section 6.4, covered outpatient specialist visits require a written referral from your assigned Primary Care Physician (PCP) prior to the date of service. Out-of-network elective visits without a referral are not covered."
      },
      {
        id: "4.2(a)",
        title: "Emergency and After-Hours Urgent Care Referral Waiver",
        text: "No PCP referral or prior authorization is required for Emergency Services or after-hours Urgent Care visits (between 8:00 PM and 8:00 AM local time, or on weekends/holidays) regardless of facility network status."
      },
      {
        id: "4.3(b)",
        title: "Direct Access to In-Network OB-GYN Care",
        text: "Members have direct access to any in-network Obstetrics and Gynecology (OB-GYN) provider for routine, preventive, or acute gynecological care without a PCP referral."
      },
      {
        id: "4.4(a)",
        title: "Direct Access to Outpatient Behavioral Health",
        text: "No PCP referral is required for outpatient behavioral health or psychotherapy visits rendered by an in-network licensed behavioral health clinician."
      },
      {
        id: "5.1(c)",
        title: "Retroactive Prior Authorization for Urgent Imaging",
        text: "Advanced diagnostic imaging (MRI, CT, PET) normally requires prior authorization. However, the Plan will grant retroactive prior authorization if requested within 14 calendar days of the date of service AND the ordering physician documents clinical urgency in the chart."
      },
      {
        id: "6.4(a)",
        title: "90-Day Continuity-of-Care Transition Exception",
        text: "Newly enrolled members (within 90 calendar days of their Plan effective date) who are in an active course of post-operative, oncology, or obstetric treatment with a non-participating specialist may continue treatment without a PCP referral during the 90-day transition window."
      },
      {
        id: "8.2",
        title: "Internal Appeal Filing Deadline",
        text: "A written Request for Review / Internal Appeal of an adverse benefit determination must be submitted within 180 calendar days from the date of the written denial notice."
      }
    ]
  },
  "PLAN-EPO-2026-SELECT": {
    plan_id: "PLAN-EPO-2026-SELECT",
    plan_name: "Meridian Select EPO (2026 Evidence of Coverage)",
    clauses: [
      {
        id: "3.1",
        title: "In-Network Direct Specialist Access",
        text: "No Primary Care Physician referral is required for covered visits to any participating in-network specialist. Out-of-network non-emergency services are excluded unless pre-approved for network adequacy."
      },
      {
        id: "3.4(a)",
        title: "Emergency & Stabilization Waiver",
        text: "Emergency services and urgent stabilization care are covered at in-network cost-sharing without prior authorization or referral regardless of facility participation."
      },
      {
        id: "5.2(b)",
        title: "Retroactive Prior Authorization (10-Day Window)",
        text: "Retroactive prior authorization for advanced imaging is considered only when submitted within 10 calendar days of service with documented medical necessity."
      },
      {
        id: "9.1",
        title: "Internal Appeal Filing Deadline",
        text: "Members have 180 calendar days from receipt of an adverse determination notice to file a written internal appeal."
      }
    ]
  }
};

export const SYNTHETIC_CASES: SyntheticCase[] = [
  {
    id: "case-1",
    shortTitle: "After-Hours Urgent Care",
    title: "Case 1 — After-Hours Urgent Care (Clause 4.2(a))",
    categoryTag: "Clear Waiver",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN — ADVERSE BENEFIT DETERMINATION
Notice Date: November 14, 2026
Plan Policy: PLAN-HMO-2026-GOLD (ClearPath Gold HMO)

Member Name: Elena Vasquez
Date of Birth: 1984-06-14
Member ID: MBR-8841209
Address: 412 Sycamore Ridge Rd
Claim Number: CLM-2026-991042

Date of Service: November 6, 2026 (Check-in time: 11:40 PM)
Facility: St. Jude Regional Medical Center (Out-of-Network Urgent Care Wing)
Attending Clinician: Dr. Marcus Thornton
Service Category: After-hours urgent care evaluation for acute ankle injury

DETERMINATION: DENIED
Reason Code: REF-01 (Missing Primary Care Physician Referral).
Explanation: Our records show no active PCP referral on file prior to your visit on November 6, 2026. Under standard HMO rules, visits without a prior PCP referral are not reimbursed.`,
    manual_redacted_letter: `CLEARPATH HEALTH PLAN — ADVERSE BENEFIT DETERMINATION
Notice Date: [REDACTED]
Plan Policy: [REDACTED]

Member Name: [REDACTED]
Date of Birth: [REDACTED]
Member ID: [REDACTED]
Address: [REDACTED]
Claim Number: [REDACTED]

Date of Service: [REDACTED] (Check-in time: [REDACTED])
Facility: [REDACTED] (Out-of-Network Urgent Care Wing)
Attending Clinician: Dr. Marcus Thornton
Service Category: Urgent care evaluation for acute ankle injury

DETERMINATION: DENIED
Reason Code: REF-01 (Missing Primary Care Physician Referral).
Explanation: Our records show no active PCP referral on file prior to your visit. Under standard HMO rules, visits without a prior PCP referral are not reimbursed.`,
    canaries: [
      "Elena Vasquez",
      "1984-06-14",
      "MBR-8841209",
      "CLM-2026-991042",
      "412 Sycamore Ridge Rd",
      "Dr. Marcus Thornton",
      "St. Jude Regional Medical Center",
      "November 6, 2026"
    ],
    ground_truth: {
      expected_clause: "4.2(a)",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 19,
      expected_days_since_denial: 11
    }
  },
  {
    id: "case-2",
    shortTitle: "In-Network OB-GYN",
    title: "Case 2 — In-Network OB-GYN Direct Access (Clause 4.3(b))",
    categoryTag: "Clear Waiver",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN — EXPLANATION OF DENIAL
Notice Date: November 10, 2026
Plan Policy: PLAN-HMO-2026-GOLD

Patient: Priya Natarajan
DOB: 1991-02-27
Member ID: MBR-7734118
Phone on file: 555-014-8821
Claim ID: CLM-2026-884510

Service Date: November 2, 2026
Provider: Dr. Hannah Kowalski, Cedar Valley Women's Clinic (In-Network OB-GYN)
Service Category: Outpatient OB-GYN consultation

DENIAL REASON: REF-01 — Missing PCP Referral.
Your claim for specialist services on November 2, 2026 has been denied because ClearPath Health Plan did not receive a referral from your assigned primary care doctor before the appointment.`,
    manual_redacted_letter: `CLEARPATH HEALTH PLAN — EXPLANATION OF DENIAL
Notice Date: November 10, 2026
Plan Policy: PLAN-HMO-2026-GOLD

Patient: [REDACTED]
DOB: [REDACTED]
Member ID: [REDACTED]
Phone on file: 555-014-8821
Claim ID: [REDACTED]

Service Date: [REDACTED]
Provider: [REDACTED]
Service Category: Outpatient consultation

DENIAL REASON: REF-01 — Missing PCP Referral.
Your claim for specialist services has been denied because ClearPath Health Plan did not receive a referral from your assigned primary care doctor before the appointment.`,
    canaries: [
      "Priya Natarajan",
      "1991-02-27",
      "MBR-7734118",
      "CLM-2026-884510",
      "Dr. Hannah Kowalski",
      "Cedar Valley Women's Clinic",
      "555-014-8821",
      "November 2, 2026"
    ],
    ground_truth: {
      expected_clause: "4.3(b)",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 23,
      expected_days_since_denial: 15
    }
  },
  {
    id: "case-3",
    shortTitle: "Retroactive MRI Auth",
    title: "Case 3 — Retroactive MRI Prior Auth (Needs Confirmation: 5.1(c))",
    categoryTag: "Unresolved Fact",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN — CLAIM DENIAL NOTICE
Notice Date: November 20, 2026
Plan Policy: PLAN-HMO-2026-GOLD

Member: David Okafor
DOB: 1978-11-03
Member ID: MBR-6190442
Address: 890 Birchwood Ave Apt 4B
Email: d.okafor78@example.net
Claim Reference: CLM-2026-773129

Service Date: November 15, 2026
Facility: Northside Diagnostic Imaging (In-Network)
Ordering Physician: Dr. Samuel Lindqvist
Service Category: Advanced Diagnostic Imaging — Lumbar MRI

DECISION: DENIED
Denial Code: PA-04 (No Prior Authorization on File).
Details: Advanced imaging requires prior authorization before service. Because no prior authorization number was submitted prior to November 15, 2026, this claim was denied. Note: The claim submission did not include chart notes regarding urgency.`,
    manual_redacted_letter: `CLEARPATH HEALTH PLAN — CLAIM DENIAL NOTICE
Notice Date: [REDACTED]
Plan Policy: PLAN-HMO-2026-GOLD

Member: [REDACTED]
DOB: [REDACTED]
Member ID: [REDACTED]
Address: [REDACTED]
Email: d.okafor78@example.net
Claim Reference: [REDACTED]

Service Date: [REDACTED]
Facility: [REDACTED] (In-Network)
Ordering Physician: [REDACTED]
Service Category: Advanced Diagnostic Imaging — Lumbar MRI

DECISION: DENIED
Denial Code: PA-04 (No Prior Authorization on File).
Details: Advanced imaging requires prior authorization before service. Because no prior authorization number was submitted prior to the visit, this claim was denied. Note: The claim submission did not include chart notes regarding urgency.`,
    canaries: [
      "David Okafor",
      "1978-11-03",
      "MBR-6190442",
      "CLM-2026-773129",
      "890 Birchwood Ave Apt 4B",
      "Dr. Samuel Lindqvist",
      "Northside Diagnostic Imaging",
      "d.okafor78@example.net",
      "November 15, 2026"
    ],
    ground_truth: {
      expected_clause: "5.1(c)",
      exception_applies: "CONDITIONAL",
      requires_patient_confirmation: true,
      expected_confirmation_topic: "clinical urgency documentation by ordering physician within 14-day window",
      expected_days_since_service: 10,
      expected_days_since_denial: 5
    }
  },
  {
    id: "case-4",
    shortTitle: "Continuity of Care",
    title: "Case 4 — Continuity-of-Care Post-Op (Needs Confirmation: 6.4(a))",
    categoryTag: "Unresolved Fact",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN — DENIAL OF COVERAGE
Notice Date: November 12, 2026
Plan Policy: PLAN-HMO-2026-GOLD
Employer Group: GRP-44910-ACME

Subscriber: Mei-Ling Zhou
DOB: 1969-09-19
Member ID: MBR-5049217
Claim #: CLM-2026-662018

Date of Service: October 28, 2026
Provider: Dr. Robert Alverez, Harborview Orthopedic Associates (Out-of-Network Specialist)
Service Category: Active post-operative orthopedic follow-up visit

STATUS: DENIED
Reason Code: REF-02 (Missing PCP Referral & Non-Participating Specialist).
Notice: Services rendered by an out-of-network specialist without a PCP referral are excluded unless an approved transition-of-care exception applies. Our billing record does not list your initial plan enrollment effective date.`,
    manual_redacted_letter: `CLEARPATH HEALTH PLAN — DENIAL OF COVERAGE
Notice Date: November 12, 2026
Plan Policy: PLAN-HMO-2026-GOLD
Employer Group: GRP-44910-ACME

Subscriber: [REDACTED]
DOB: [REDACTED]
Member ID: [REDACTED]
Claim #: [REDACTED]

Date of Service: [REDACTED]
Provider: [REDACTED], Harborview Orthopedic Associates (Out-of-Network Specialist)
Service Category: Active post-operative orthopedic follow-up visit

STATUS: DENIED
Reason Code: REF-02 (Missing PCP Referral & Non-Participating Specialist).
Notice: Services rendered by an out-of-network specialist without a PCP referral are excluded unless an approved transition-of-care exception applies. Our billing record does not list your initial plan enrollment effective date.`,
    canaries: [
      "Mei-Ling Zhou",
      "1969-09-19",
      "MBR-5049217",
      "CLM-2026-662018",
      "Dr. Robert Alverez",
      "Harborview Orthopedic Associates",
      "GRP-44910-ACME",
      "October 28, 2026"
    ],
    ground_truth: {
      expected_clause: "6.4(a)",
      exception_applies: "CONDITIONAL",
      requires_patient_confirmation: true,
      expected_confirmation_topic: "plan effective enrollment date within 90 calendar days",
      expected_days_since_service: 28,
      expected_days_since_denial: 13
    }
  },
  {
    id: "case-5",
    shortTitle: "Behavioral Health OCR",
    title: "Case 5 — Behavioral Health + Messy OCR (Clause 4.4(a))",
    categoryTag: "Messy OCR",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH  HLTH  PLAN — BENEFIT  DENIAL  (SCANNED COPY)
N0tice Date: November 18, 2026   |   Policy: PLAN-HMO-2026-GOLD
Re: Jordan Alvarez-Kim (born 04/12/1995), residing at 1740 Maple Creek Blvd.
Member#: MBR-3381905   Claim#: CLM-2026-550914
Contact: 555-019-3347 / jalvarez.kim@example.org

Svc Date: November 9, 2026
Clinician: Dr. Miriam Goldstein — Oakridge Behavioral Wellness [IN-NETWORK]
Service: Outpatient behavioral health psychotherapy session (45 min)

RESULT: DENIED — CODE REF-01 (No PCP Referral Submitted).
ClearPath denied payment because no Primary Care Physician referral was attached for Dr. Miriam Goldstein at Oakridge Behavioral Wellness.`,
    manual_redacted_letter: `CLEARPATH  HLTH  PLAN — BENEFIT  DENIAL  (SCANNED COPY)
N0tice Date: November 18, 2026   |   Policy: PLAN-HMO-2026-GOLD
Re: [REDACTED] (born 04/12/1995), residing at [REDACTED].
Member#: [REDACTED]   Claim#: [REDACTED]
Contact: [REDACTED]

Svc Date: November 9, 2026
Clinician: [REDACTED] [IN-NETWORK]
Service: Outpatient behavioral health psychotherapy session (45 min)

RESULT: DENIED — CODE REF-01 (No PCP Referral Submitted).
ClearPath denied payment because no Primary Care Physician referral was attached for Dr. Miriam Goldstein at Oakridge Behavioral Wellness.`,
    canaries: [
      "Jordan Alvarez-Kim",
      "04/12/1995",
      "MBR-3381905",
      "CLM-2026-550914",
      "1740 Maple Creek Blvd",
      "Dr. Miriam Goldstein",
      "Oakridge Behavioral Wellness",
      "555-019-3347",
      "jalvarez.kim@example.org"
    ],
    ground_truth: {
      expected_clause: "4.4(a)",
      exception_applies: "YES",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 16,
      expected_days_since_denial: 7
    }
  },
  {
    id: "case-6",
    shortTitle: "Expired Elective Visit",
    title: "Case 6 — Elective OON + Expired 180-Day Window (Honest Negative)",
    categoryTag: "Honest Negative",
    plan_id: "PLAN-HMO-2026-GOLD",
    raw_letter: `CLEARPATH HEALTH PLAN — ADVERSE BENEFIT DETERMINATION
Notice Date: April 29, 2026
Plan Policy: PLAN-HMO-2026-GOLD

Member Name: Thomas Henderson
DOB: 1982-01-30
Address: 205 Laurel Lane
Member ID: MBR-2219874
Claim Number: CLM-2026-104822

Date of Service: April 14, 2026 (2:15 PM, routine weekday appointment)
Provider: Dr. Claire Beaumont, Westside Aesthetic Dermatology (Out-of-Network Elective Specialist)
Service Category: Non-urgent elective cosmetic dermatology consultation

DETERMINATION: DENIED
Reason Code: REF-02 (Missing PCP Referral & Out-of-Network Elective Specialist).
Explanation: Elective out-of-network dermatology visits without a PCP referral are not covered. Internal appeals must be filed within 180 calendar days of April 29, 2026.`,
    manual_redacted_letter: `CLEARPATH HEALTH PLAN — ADVERSE BENEFIT DETERMINATION
Notice Date: [REDACTED]
Plan Policy: PLAN-HMO-2026-GOLD

Member Name: [REDACTED]
DOB: [REDACTED]
Address: [REDACTED]
Member ID: [REDACTED]
Claim Number: [REDACTED]

Date of Service: [REDACTED] (routine weekday appointment)
Provider: [REDACTED] (Out-of-Network Elective Specialist)
Service Category: Non-urgent elective cosmetic dermatology consultation

DETERMINATION: DENIED
Reason Code: REF-02 (Missing PCP Referral & Out-of-Network Elective Specialist).
Explanation: Elective out-of-network dermatology visits without a PCP referral are not covered. Internal appeals must be filed within 180 calendar days of the denial notice.`,
    canaries: [
      "Thomas Henderson",
      "1982-01-30",
      "MBR-2219874",
      "CLM-2026-104822",
      "Dr. Claire Beaumont",
      "Westside Aesthetic Dermatology",
      "205 Laurel Lane",
      "April 29, 2026"
    ],
    ground_truth: {
      expected_clause: "4.1 / 8.2",
      exception_applies: "NO",
      requires_patient_confirmation: false,
      expected_confirmation_topic: null,
      expected_days_since_service: 225,
      expected_days_since_denial: 210
    }
  }
];

export const TOTAL_CANARIES = SYNTHETIC_CASES.reduce((acc, c) => acc + c.canaries.length, 0);
