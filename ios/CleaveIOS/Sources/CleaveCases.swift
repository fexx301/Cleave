import Foundation

public enum CleaveCases {
    public static let benchmarkReferenceDate = "2026-11-25"

    public static let sampleSummitPpoEocText = """
    SUMMIT REGIONAL HEALTH PPO — 2026 EVIDENCE OF COVERAGE (PUBLIC SUMMARY)
    Plan Policy Code: PLAN-PPO-2026-SUMMIT

    Section 7.1 — Standard Referral Rule
    Routine outpatient specialty care may require a Primary Care Physician referral unless covered by an exception in Sections 7.2 through 7.5.

    Section 7.3(a) — Late-Evening and Weekend Urgent Care Referral Waiver
    Members receiving acute evaluation at any Urgent Care Clinic or Emergency Department between 7:00 PM and 8:00 AM local time, or on weekends, are exempt from prior PCP referral requirements regardless of network tier.

    Section 9.2(c) — Written Appeal Filing Window
    A member may submit a written Request for Review within 180 calendar days from the date of the adverse benefit determination notice.
    """

    public static let planEocs: [String: PlanEoc] = [
        "PLAN-HMO-2026-GOLD": PlanEoc(
            planId: "PLAN-HMO-2026-GOLD",
            planName: "ClearPath Gold HMO (2026 Evidence of Coverage)",
            clauses: [
                PolicyClause(
                    id: "4.1",
                    title: "General Specialist Referral Requirement",
                    text: "Except as expressly waived in Sections 4.2 through 4.4 or Section 6.4, covered outpatient specialist visits require a written referral from your assigned Primary Care Physician (PCP) prior to the date of service. Out-of-network elective visits without a referral are not covered."
                ),
                PolicyClause(
                    id: "4.2(a)",
                    title: "Emergency and After-Hours Urgent Care Referral Waiver",
                    text: "No PCP referral or prior authorization is required for Emergency Services or after-hours Urgent Care visits (between 8:00 PM and 8:00 AM local time, or on weekends/holidays) regardless of facility network status."
                ),
                PolicyClause(
                    id: "4.3(b)",
                    title: "Direct Access to In-Network OB-GYN Care",
                    text: "Members have direct access to any in-network Obstetrics and Gynecology (OB-GYN) provider for routine, preventive, or acute gynecological care without a PCP referral."
                ),
                PolicyClause(
                    id: "4.4(a)",
                    title: "Direct Access to Outpatient Behavioral Health",
                    text: "No PCP referral is required for outpatient behavioral health or psychotherapy visits rendered by an in-network licensed behavioral health clinician."
                ),
                PolicyClause(
                    id: "5.1(c)",
                    title: "Retroactive Prior Authorization for Urgent Imaging",
                    text: "Advanced diagnostic imaging (MRI, CT, PET) normally requires prior authorization. However, the Plan will grant retroactive prior authorization if requested within 14 calendar days of the date of service AND the ordering physician documents clinical urgency in the chart."
                ),
                PolicyClause(
                    id: "6.4(a)",
                    title: "90-Day Continuity-of-Care Transition Exception",
                    text: "Newly enrolled members (within 90 calendar days of their Plan effective date) who are in an active course of post-operative, oncology, or obstetric treatment with a non-participating specialist may continue treatment without a PCP referral during the 90-day transition window."
                ),
                PolicyClause(
                    id: "8.2",
                    title: "Internal Appeal Filing Deadline",
                    text: "A written Request for Review / Internal Appeal of an adverse benefit determination must be submitted within 180 calendar days from the date of the written denial notice."
                )
            ],
            rawPolicyText: nil
        ),
        "PLAN-EPO-2026-SELECT": PlanEoc(
            planId: "PLAN-EPO-2026-SELECT",
            planName: "Meridian Select EPO (2026 Evidence of Coverage)",
            clauses: [
                PolicyClause(
                    id: "3.1",
                    title: "In-Network Direct Specialist Access",
                    text: "No Primary Care Physician referral is required for covered visits to any participating in-network specialist. Out-of-network non-emergency services are excluded unless pre-approved for network adequacy."
                ),
                PolicyClause(
                    id: "3.4(a)",
                    title: "Emergency & Stabilization Waiver",
                    text: "Emergency services and urgent stabilization care are covered at in-network cost-sharing without prior authorization or referral regardless of facility participation."
                ),
                PolicyClause(
                    id: "5.2(b)",
                    title: "Retroactive Prior Authorization (10-Day Window)",
                    text: "Retroactive prior authorization for advanced imaging is considered only when submitted within 10 calendar days of service with documented medical necessity."
                ),
                PolicyClause(
                    id: "9.1",
                    title: "Internal Appeal Filing Deadline",
                    text: "Members have 180 calendar days from receipt of an adverse determination notice to file a written internal appeal."
                )
            ],
            rawPolicyText: nil
        )
    ]

    public static let syntheticCases: [SyntheticCase] = [
        SyntheticCase(
            id: "case-1",
            shortTitle: "After-Hours Urgent Care",
            title: "Case 1 — After-Hours Urgent Care (Clause 4.2(a))",
            categoryTag: "Clear Waiver",
            planId: "PLAN-HMO-2026-GOLD",
            rawLetter: """
            CLEARPATH HEALTH PLAN — ADVERSE BENEFIT DETERMINATION
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
            Explanation: Our records show no active PCP referral on file prior to your visit on November 6, 2026. Under standard HMO rules, visits without a prior PCP referral are not reimbursed.
            """,
            canaries: [
                "Elena Vasquez", "1984-06-14", "MBR-8841209", "CLM-2026-991042",
                "412 Sycamore Ridge Rd", "Dr. Marcus Thornton",
                "St. Jude Regional Medical Center", "November 6, 2026"
            ],
            expectedClause: "4.2(a)",
            expectedException: "YES",
            requiresPatientConfirmation: false
        ),
        SyntheticCase(
            id: "case-2",
            shortTitle: "In-Network OB-GYN",
            title: "Case 2 — In-Network OB-GYN Direct Access (Clause 4.3(b))",
            categoryTag: "Clear Waiver",
            planId: "PLAN-HMO-2026-GOLD",
            rawLetter: """
            CLEARPATH HEALTH PLAN — EXPLANATION OF DENIAL
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
            Your claim for specialist services on November 2, 2026 has been denied because ClearPath Health Plan did not receive a referral from your assigned primary care doctor before the appointment.
            """,
            canaries: [
                "Priya Natarajan", "1991-02-27", "MBR-7734118", "CLM-2026-884510",
                "Dr. Hannah Kowalski", "Cedar Valley Women's Clinic", "555-014-8821", "November 2, 2026"
            ],
            expectedClause: "4.3(b)",
            expectedException: "YES",
            requiresPatientConfirmation: false
        ),
        SyntheticCase(
            id: "case-3",
            shortTitle: "Retroactive MRI Auth",
            title: "Case 3 — Retroactive MRI Prior Auth (Needs Confirmation: 5.1(c))",
            categoryTag: "Unresolved Fact",
            planId: "PLAN-HMO-2026-GOLD",
            rawLetter: """
            CLEARPATH HEALTH PLAN — CLAIM DENIAL NOTICE
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
            Details: Advanced imaging requires prior authorization before service. Because no prior authorization number was submitted prior to November 15, 2026, this claim was denied. Note: The claim submission did not include chart notes regarding urgency.
            """,
            canaries: [
                "David Okafor", "1978-11-03", "MBR-6190442", "CLM-2026-773129",
                "890 Birchwood Ave Apt 4B", "Dr. Samuel Lindqvist",
                "Northside Diagnostic Imaging", "d.okafor78@example.net", "November 15, 2026"
            ],
            expectedClause: "5.1(c)",
            expectedException: "CONDITIONAL",
            requiresPatientConfirmation: true
        ),
        SyntheticCase(
            id: "case-4",
            shortTitle: "Continuity of Care",
            title: "Case 4 — Continuity-of-Care Post-Op (Needs Confirmation: 6.4(a))",
            categoryTag: "Unresolved Fact",
            planId: "PLAN-HMO-2026-GOLD",
            rawLetter: """
            CLEARPATH HEALTH PLAN — DENIAL OF COVERAGE
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
            Notice: Services rendered by an out-of-network specialist without a PCP referral are excluded unless an approved transition-of-care exception applies. Our billing record does not list your initial plan enrollment effective date.
            """,
            canaries: [
                "Mei-Ling Zhou", "1969-09-19", "MBR-5049217", "CLM-2026-662018",
                "Dr. Robert Alverez", "Harborview Orthopedic Associates",
                "GRP-44910-ACME", "October 28, 2026"
            ],
            expectedClause: "6.4(a)",
            expectedException: "CONDITIONAL",
            requiresPatientConfirmation: true
        ),
        SyntheticCase(
            id: "case-5",
            shortTitle: "Behavioral Health OCR",
            title: "Case 5 — Behavioral Health + Messy OCR (Clause 4.4(a))",
            categoryTag: "Messy OCR",
            planId: "PLAN-HMO-2026-GOLD",
            rawLetter: """
            CLEARPATH  HLTH  PLAN — BENEFIT  DENIAL  (SCANNED COPY)
            N0tice Date: November 18, 2026   |   Policy: PLAN-HMO-2026-GOLD
            Re: Jordan Alvarez-Kim (born 04/12/1995), residing at 1740 Maple Creek Blvd.
            Member#: MBR-3381905   Claim#: CLM-2026-550914
            Contact: 555-019-3347 / jalvarez.kim@example.org

            Svc Date: November 9, 2026
            Clinician: Dr. Miriam Goldstein — Oakridge Behavioral Wellness [IN-NETWORK]
            Service: Outpatient behavioral health psychotherapy session (45 min)

            RESULT: DENIED — CODE REF-01 (No PCP Referral Submitted).
            ClearPath denied payment because no Primary Care Physician referral was attached for Dr. Miriam Goldstein at Oakridge Behavioral Wellness.
            """,
            canaries: [
                "Jordan Alvarez-Kim", "04/12/1995", "MBR-3381905", "CLM-2026-550914",
                "1740 Maple Creek Blvd", "Dr. Miriam Goldstein",
                "Oakridge Behavioral Wellness", "555-019-3347", "jalvarez.kim@example.org"
            ],
            expectedClause: "4.4(a)",
            expectedException: "YES",
            requiresPatientConfirmation: false
        ),
        SyntheticCase(
            id: "case-6",
            shortTitle: "Expired Elective Visit",
            title: "Case 6 — Elective OON + Expired 180-Day Window (Honest Negative)",
            categoryTag: "Honest Negative",
            planId: "PLAN-HMO-2026-GOLD",
            rawLetter: """
            CLEARPATH HEALTH PLAN — ADVERSE BENEFIT DETERMINATION
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
            Explanation: Elective out-of-network dermatology visits without a PCP referral are not covered. Internal appeals must be filed within 180 calendar days of April 29, 2026.
            """,
            canaries: [
                "Thomas Henderson", "1982-01-30", "MBR-2219874", "CLM-2026-104822",
                "Dr. Claire Beaumont", "Westside Aesthetic Dermatology", "205 Laurel Lane", "April 29, 2026"
            ],
            expectedClause: "4.1 / 8.2",
            expectedException: "NO",
            requiresPatientConfirmation: false
        )
    ]
}
