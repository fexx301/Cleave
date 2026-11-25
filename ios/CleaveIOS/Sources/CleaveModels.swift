import Foundation
import FoundationModels

public enum RefusalCode: String, Codable, Sendable, Error {
    case localUnavailable = "REFUSE_LOCAL_UNAVAILABLE"
    case chunkOverflow = "REFUSE_CHUNK_OVERFLOW"
    case rawTextBlocked = "REFUSE_RAW_TEXT_BLOCKED"
    case residualIdentifier = "REFUSE_RESIDUAL_IDENTIFIER"
}

public struct GateFailure: Error, Sendable, Equatable {
    public let code: RefusalCode
    public let reason: String

    public init(code: RefusalCode, reason: String) {
        self.code = code
        self.reason = reason
    }
}

public enum AllowlistKey: String, CaseIterable, Identifiable, Codable, Sendable {
    case planId = "plan_id"
    case denialReasonCode = "denial_reason_code"
    case serviceSetting = "service_setting"
    case afterHoursVisitConfirmed = "after_hours_visit_confirmed"
    case networkStatus = "network_status"
    case daysSinceService = "days_since_service"
    case daysSinceDenial = "days_since_denial"
    case urgencyDocumented = "urgency_documented"
    case ongoingTreatment = "ongoing_treatment"
    case enrollmentDateKnown = "enrollment_date_known"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .planId: return "Plan Policy Identifier"
        case .denialReasonCode: return "Denial Category"
        case .serviceSetting: return "Care Setting"
        case .afterHoursVisitConfirmed: return "After-Hours / Emergency Visit"
        case .networkStatus: return "Provider Network Status"
        case .daysSinceService: return "Days Since Visit"
        case .daysSinceDenial: return "Days Since Denial Notice"
        case .urgencyDocumented: return "Chart Urgency Documented"
        case .ongoingTreatment: return "Active Ongoing Treatment"
        case .enrollmentDateKnown: return "Plan Enrollment Date Listed"
        }
    }

    public var shortHint: String {
        switch self {
        case .planId: return "Selects the generic public Plan Evidence of Coverage."
        case .denialReasonCode: return "Broad denial reason category (no claim text)."
        case .serviceSetting: return "Broad setting class (not a clinical diagnosis)."
        case .afterHoursVisitConfirmed: return "Whether visit occurred after hours or as emergency."
        case .networkStatus: return "In-network vs. out-of-network participation."
        case .daysSinceService: return "Relative day count only (exact calendar date stays local)."
        case .daysSinceDenial: return "Relative day count to check the 180-day appeal window."
        case .urgencyDocumented: return "Whether chart urgency notes were included."
        case .ongoingTreatment: return "Checks continuity-of-care transition exceptions."
        case .enrollmentDateKnown: return "Whether the notice lists initial enrollment date."
        }
    }

    public var removalConsequence: String {
        switch self {
        case .planId: return "Removed — Cleave will degrade honestly to General Guidance Only."
        case .denialReasonCode: return "Removed — Cloud cannot distinguish referral vs. prior-auth rules."
        case .serviceSetting: return "Removed — Cloud cannot check setting-specific waivers."
        case .afterHoursVisitConfirmed: return "Removed — Cloud cannot verify after-hours waivers."
        case .networkStatus: return "Removed — Cloud cannot verify in-network direct-access waivers."
        case .daysSinceService: return "Removed — Cloud cannot verify retroactive auth windows."
        case .daysSinceDenial: return "Removed — Cloud cannot verify the 180-day filing deadline."
        case .urgencyDocumented: return "Removed — Cloud will treat clinical urgency as unconfirmed."
        case .ongoingTreatment: return "Removed — Cloud cannot evaluate continuity-of-care."
        case .enrollmentDateKnown: return "Removed — Cloud will ask you to confirm enrollment date."
        }
    }
}

public struct IdentityVault: Codable, Sendable, Equatable {
    public var memberName: String = ""
    public var dob: String = ""
    public var memberId: String = ""
    public var claimId: String = ""
    public var groupId: String = ""
    public var address: String = ""
    public var phone: String = ""
    public var email: String = ""
    public var physician: String = ""
    public var facilityName: String = ""
    public var denialDate: String = ""
    public var serviceDate: String = ""

    public var displayEntries: [(key: String, label: String, value: String)] {
        let pairs: [(String, String, String)] = [
            ("member_name", "Member Name", memberName),
            ("dob", "Date of Birth", dob),
            ("member_id", "Member ID", memberId),
            ("claim_id", "Claim Number", claimId),
            ("group_id", "Group ID", groupId),
            ("address", "Address", address),
            ("phone", "Phone", phone),
            ("email", "Email", email),
            ("physician", "Clinician", physician),
            ("facility_name", "Facility", facilityName),
            ("denial_date", "Notice Date", denialDate),
            ("service_date", "Service Date", serviceDate)
        ]
        return pairs.filter { !$0.2.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    public var secrets: [String] {
        displayEntries.map(\.value).filter { $0.count >= 3 }
    }
}

public struct AllowlistProposal: Codable, Sendable, Equatable {
    public var planId: String = ""
    public var denialReasonCode: String = "OTHER"
    public var serviceSetting: String = "UNKNOWN"
    public var afterHoursVisitConfirmed: String = "NOT_MENTIONED"
    public var networkStatus: String = "UNKNOWN"
    public var daysSinceService: Int? = nil
    public var daysSinceDenial: Int? = nil
    public var urgencyDocumented: String = "NOT_MENTIONED"
    public var ongoingTreatment: String = "NOT_MENTIONED"
    public var enrollmentDateKnown: String = "NOT_MENTIONED"

    public func displayValue(for key: AllowlistKey) -> String? {
        switch key {
        case .planId: return planId.isEmpty ? nil : planId
        case .denialReasonCode: return denialReasonCode
        case .serviceSetting: return serviceSetting
        case .afterHoursVisitConfirmed: return afterHoursVisitConfirmed
        case .networkStatus: return networkStatus
        case .daysSinceService: return daysSinceService.map { "\($0) days" }
        case .daysSinceDenial: return daysSinceDenial.map { "\($0) days" }
        case .urgencyDocumented: return urgencyDocumented
        case .ongoingTreatment: return ongoingTreatment
        case .enrollmentDateKnown: return enrollmentDateKnown
        }
    }
}

public struct PolicyClause: Identifiable, Codable, Sendable {
    public let id: String
    public let title: String
    public let text: String
}

public struct PlanEoc: Identifiable, Codable, Sendable {
    public var id: String { planId }
    public let planId: String
    public let planName: String
    public let clauses: [PolicyClause]
    public let rawPolicyText: String?
}

public struct SyntheticCase: Identifiable, Sendable {
    public let id: String
    public let shortTitle: String
    public let title: String
    public let categoryTag: String
    public let planId: String
    public let rawLetter: String
    public let canaries: [String]
    public let expectedClause: String
    public let expectedException: String
    public let requiresPatientConfirmation: Bool
}

public struct ConfirmationItem: Identifiable, Codable, Sendable, Equatable {
    public let id: UUID
    public let question: String
    public let draftStatement: String

    public init(id: UUID = UUID(), question: String, draftStatement: String) {
        self.id = id
        self.question = question
        self.draftStatement = draftStatement
    }
}

public struct CloudAnalysis: Sendable, Equatable {
    public let modeUsed: String
    public let citedClauseId: String
    public let citedClauseQuote: String
    public let exceptionApplies: String
    public let needsPatientConfirmation: Bool
    public let confirmationItems: [ConfirmationItem]
    public let plainExplanation: String
    public let draftRequestForReview: String
}

public struct RejoinedDraft: Sendable, Equatable {
    public let text: String
    public let rejoinedTokens: [String]
    public let orphanPlaceholders: [String]
}

public struct GateOutcome: Sendable, Equatable {
    public let ok: Bool
    public let refusal: RefusalCode?
    public let reason: String
    public let payload: [String: String]
    public let serializedJSON: String
}

public struct WireAuditEntry: Identifiable, Sendable {
    public let id = UUID()
    public let timestamp: Date
    public let caseLabel: String
    public let stepName: String
    public let runtimeLabel: String
    public let isCloud: Bool
    public let bytesSent: Int
    public let latencyMs: Int
    public let leakedIdentifiers: [String]
    public let outboundJSON: String
    public let note: String
}

// MARK: - Apple Foundation Models & FirebaseAILogic @Generable Schemas

@Generable
public struct LocalAllowlistGenerable: Sendable {
    @Guide(description: "Policy code starting with PLAN- (e.g. PLAN-HMO-2026-GOLD), or empty string if absent")
    public var planId: String

    @Guide(description: "Billing code category: MISSING_REFERRAL, MISSING_PRIOR_AUTH, MISSING_REFERRAL_AND_OON, or OTHER")
    public var denialReasonCode: String

    @Guide(description: "Service category: EMERGENCY_OR_AFTER_HOURS_URGENT, OUTPATIENT_OBGYN, OUTPATIENT_BEHAVIORAL_HEALTH, ADVANCED_DIAGNOSTIC_IMAGING, POST_OP_SPECIALIST_FOLLOWUP, ELECTIVE_OUTPATIENT_SPECIALIST, or UNKNOWN")
    public var serviceSetting: String

    @Guide(description: "After-hours indicator: YES if visit was between 8 PM and 8 AM or weekend/emergency, NO if weekday daytime, NOT_MENTIONED otherwise")
    public var afterHoursVisitConfirmed: String

    @Guide(description: "Network tier: IN_NETWORK, OUT_OF_NETWORK, or UNKNOWN")
    public var networkStatus: String

    @Guide(description: "Documentation flag: YES if supporting notes were attached, NO if notes were not included, NOT_MENTIONED otherwise")
    public var urgencyDocumented: String

    @Guide(description: "Continuing-care flag: YES if active follow-up or ongoing course is noted, NO or NOT_MENTIONED otherwise")
    public var ongoingTreatment: String

    @Guide(description: "Enrollment date flag: NO if notice says enrollment effective date is missing/not listed, YES if listed, NOT_MENTIONED otherwise")
    public var enrollmentDateKnown: String
}

@Generable
public struct ConfirmationItemGenerable: Sendable {
    @Guide(description: "Concise yes/no factual question shown to the member")
    public var question: String

    @Guide(description: "Clean first-person member factual statement using I/my (e.g. My ordering physician documented clinical urgency in my medical chart) inserted ONLY if checked; never a question and never third-person 'the patient'")
    public var draftStatement: String
}

@Generable
public struct CloudAnalysisGenerable: Sendable {
    @Guide(description: "Either POLICY_MATCHED or GENERAL_GUIDANCE_ONLY")
    public var modeUsed: String

    @Guide(description: "Exact controlling policy clause ID (e.g. 4.2(a), 4.3(b), 4.4(a), 5.1(c), 6.4(a), 7.3(a), 4.1 / 8.2) or NONE if no policy EOC was provided")
    public var citedClauseId: String

    @Guide(description: "Verbatim controlling policy sentence from the provided EOC, or empty string if NONE")
    public var citedClauseQuote: String

    @Guide(description: "Exactly one of: YES, CONDITIONAL, NO, UNKNOWN_NO_POLICY")
    public var exceptionApplies: String

    @Guide(description: "True only when the exception depends on an unresolved fact not established by the allowlist, or when no policy was provided")
    public var needsPatientConfirmation: Bool

    @Guide(description: "Unresolved factual confirmation items; empty array if needsPatientConfirmation is false")
    public var confirmationItems: [ConfirmationItemGenerable]

    @Guide(description: "Clear plain-English explanation of whether the policy exception applies and whether the appeal window is open")
    public var plainExplanation: String

    @Guide(description: "Editable Request for Review using ONLY opaque placeholders [MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME]. CRITICAL: when needsPatientConfirmation is true, never assert unconfirmed facts as already true; place [PENDING_PATIENT_CONFIRMATION] where the confirmed fact belongs.")
    public var draftRequestForReview: String
}
