// Verified frozen snapshots recorded from real Chrome 158 (nano_v3_gpu_component)
// + Firebase AI Logic (gemini-3.5-flash-lite) runs on 2026-11-25.
// Used ONLY when a judge/reviewer explicitly clicks "Preview Recorded Run" on a browser
// without on-device Gemini Nano — never triggered silently and never breaks fail-closed ONLY_ON_DEVICE.

import { SYNTHETIC_CASES } from "./cases";
import type { AllowlistProposal, CloudAnalysis, IdentityVault } from "./types";

export interface RecordedReplaySnapshot {
  caseId: string;
  label: string;
  recordedAt: string;
  localMeta: { source: string; latencyMs: number; httpRequests: number };
  identityVault: IdentityVault;
  proposedAllowlist: AllowlistProposal;
  cloudMeta: {
    source: string;
    latencyMs: number;
    wireBytes: number;
    leakedCanaries: number;
    policyMatched: boolean;
  };
  cloudAnalysis: CloudAnalysis;
}

export const RECORDED_REPLAY_RUNS: Record<"case-1" | "case-3", RecordedReplaySnapshot> = {
  "case-1": {
    caseId: SYNTHETIC_CASES[0].id,
    label: "Case 1 — After-Hours Urgent Care (Clause 4.2(a))",
    recordedAt: "2026-11-25 (Chrome 158 · nano_v3_gpu_component + gemini-3.5-flash-lite)",
    localMeta: {
      source: "on_device (recorded replay)",
      latencyMs: 3120,
      httpRequests: 0
    },
    identityVault: {
      member_name: "Elena Vasquez",
      dob: "1984-06-14",
      member_id: "MBR-8841209",
      address: "412 Sycamore Ridge Rd",
      claim_id: "CLM-2026-991042",
      physician: "Dr. Marcus Thornton",
      facility_name: "St. Jude Regional Medical Center",
      service_date: "November 6, 2026",
      notice_date: "November 14, 2026"
    },
    proposedAllowlist: {
      plan_id: "PLAN-HMO-2026-GOLD",
      denial_reason_code: "MISSING_REFERRAL",
      service_setting: "EMERGENCY_OR_AFTER_HOURS_URGENT",
      after_hours_visit_confirmed: "YES",
      network_status: "OUT_OF_NETWORK",
      days_since_service: 19,
      days_since_denial: 11,
      urgency_documented: "NOT_MENTIONED",
      ongoing_treatment: "NOT_MENTIONED",
      enrollment_date_known: "NOT_MENTIONED"
    },
    cloudMeta: {
      source: "in_cloud (recorded replay)",
      latencyMs: 2480,
      wireBytes: 5859,
      leakedCanaries: 0,
      policyMatched: true
    },
    cloudAnalysis: {
      mode_used: "POLICY_MATCHED",
      cited_clause_id: "4.2(a) / 8.2",
      cited_clause_quote:
        "No PCP referral or prior authorization is required for Emergency Services or after-hours Urgent Care visits (between 8:00 PM and 8:00 AM local time, or on weekends/holidays) regardless of facility network status.",
      exception_applies: "YES",
      needs_patient_confirmation: false,
      confirmation_items: [],
      plain_explanation:
        "Under Section 4.2(a) of ClearPath Gold HMO (PLAN-HMO-2026-GOLD), after-hours urgent care visits do not require a PCP referral regardless of whether the facility is in-network or out-of-network. At 11 days since the denial notice, your Request for Review is well inside Section 8.2's 180-calendar-day filing window.",
      draft_request_for_review: `To: Appeals & Grievances Department — ClearPath Health Plan
Date: Timely Written Request for Review (within Section 8.2 180-day window)

Member Name: [MEMBER_NAME]
Member ID: [MEMBER_ID]
Claim Number: [CLAIM_ID]
Date of Service: [SERVICE_DATE]
Denial Notice Date: [DENIAL_DATE]
Provider / Facility: [PROVIDER_NAME], [FACILITY_NAME]

Dear Appeals Review Committee,

I am submitting a written Request for Review of the adverse benefit determination dated [DENIAL_DATE] denying Claim [CLAIM_ID] for a missing Primary Care Physician referral.

The visit on [SERVICE_DATE] at [FACILITY_NAME] was an after-hours urgent care visit. Under Section 4.2(a) of the PLAN-HMO-2026-GOLD Evidence of Coverage, "No PCP referral or prior authorization is required for Emergency Services or after-hours Urgent Care visits (between 8:00 PM and 8:00 AM local time, or on weekends/holidays) regardless of facility network status."

Because this waiver applies regardless of facility network participation, and this appeal is submitted well within the 180-calendar-day deadline set by Section 8.2, I respectfully request that ClearPath Health Plan overturn this denial and reprocess Claim [CLAIM_ID] for payment.

Sincerely,
[MEMBER_NAME]`
    }
  },
  "case-3": {
    caseId: SYNTHETIC_CASES[2].id,
    label: "Case 3 — Retroactive MRI Prior Auth (Clause 5.1(c))",
    recordedAt: "2026-11-25 (Chrome 158 · nano_v3_gpu_component + gemini-3.5-flash-lite)",
    localMeta: {
      source: "on_device (recorded replay)",
      latencyMs: 2890,
      httpRequests: 0
    },
    identityVault: {
      member_name: "David Okafor",
      dob: "1978-11-03",
      member_id: "MBR-6190442",
      address: "890 Birchwood Ave Apt 4B",
      email: "d.okafor78@example.net",
      claim_id: "CLM-2026-773129",
      physician: "Dr. Samuel Lindqvist",
      facility_name: "Northside Diagnostic Imaging",
      service_date: "November 15, 2026",
      notice_date: "November 20, 2026"
    },
    proposedAllowlist: {
      plan_id: "PLAN-HMO-2026-GOLD",
      denial_reason_code: "MISSING_PRIOR_AUTH",
      service_setting: "ADVANCED_DIAGNOSTIC_IMAGING",
      after_hours_visit_confirmed: "NOT_MENTIONED",
      network_status: "IN_NETWORK",
      days_since_service: 10,
      days_since_denial: 5,
      urgency_documented: "NO",
      ongoing_treatment: "NOT_MENTIONED",
      enrollment_date_known: "NOT_MENTIONED"
    },
    cloudMeta: {
      source: "in_cloud (recorded replay)",
      latencyMs: 2610,
      wireBytes: 6140,
      leakedCanaries: 0,
      policyMatched: true
    },
    cloudAnalysis: {
      mode_used: "POLICY_MATCHED",
      cited_clause_id: "5.1(c) / 8.2",
      cited_clause_quote:
        "Advanced diagnostic imaging (MRI, CT, PET) normally requires prior authorization. However, the Plan will grant retroactive prior authorization if requested within 14 calendar days of the date of service AND the ordering physician documents clinical urgency in the chart.",
      exception_applies: "CONDITIONAL",
      needs_patient_confirmation: true,
      confirmation_items: [
        {
          question: "Did your ordering physician document clinical urgency in your medical chart?",
          draft_statement: "My ordering physician documented clinical urgency in my medical chart."
        }
      ],
      plain_explanation:
        "At 10 days since the imaging visit, you are inside Section 5.1(c)'s 14-calendar-day window for retroactive prior authorization (and within Section 8.2's 180-day appeal window). However, the denial letter states chart urgency notes were not submitted, so Cleave will not claim urgency unless you confirm it below.",
      draft_request_for_review: `To: Appeals & Grievances Department — ClearPath Health Plan
Date: Retroactive Prior Authorization & Request for Review

Member Name: [MEMBER_NAME]
Member ID: [MEMBER_ID]
Claim Number: [CLAIM_ID]
Date of Service: [SERVICE_DATE]
Denial Notice Date: [DENIAL_DATE]
Ordering Physician / Facility: [PROVIDER_NAME], [FACILITY_NAME]

Dear Appeals Review Committee,

I am requesting retroactive prior authorization and review of Claim [CLAIM_ID], denied on [DENIAL_DATE] for missing prior authorization for an in-network advanced diagnostic imaging study performed on [SERVICE_DATE].

This request is submitted within 14 calendar days of the date of service as required by Section 5.1(c) of PLAN-HMO-2026-GOLD, and within the 180-day appeal window under Section 8.2. [PENDING_PATIENT_CONFIRMATION]

Please review the enclosed documentation under Section 5.1(c) and reprocess Claim [CLAIM_ID].

Sincerely,
[MEMBER_NAME]`
    }
  }
};
