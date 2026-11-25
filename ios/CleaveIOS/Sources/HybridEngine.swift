import FirebaseAILogic
import FirebaseCore
import Foundation
import FoundationModels

public struct LocalSplitOutcome: Sendable {
    public let vault: IdentityVault
    public let proposal: AllowlistProposal
    public let latencyMs: Int
    public let runtimeLabel: String
}

public struct CloudMatchOutcome: Sendable {
    public let analysis: CloudAnalysis
    public let policyMatched: Bool
    public let latencyMs: Int
    public let bytesSent: Int
    public let leakedIdentifiers: [String]
    public let runtimeLabel: String
}

public struct OfflineTriageOutcome: Sendable {
    public let summaryText: String
    public let latencyMs: Int
    public let runtimeLabel: String
}

public actor CleaveHybridEngine {
    public static let defaultCloudModel = "gemini-3.5-flash-lite"
    public static let sessionCloudCap = 40

    private var sessionCloudCalls = 0

    public init() {}

    public func appleModelAvailability() -> (available: Bool, label: String) {
        let model = SystemLanguageModel(useCase: .general, guardrails: .permissiveContentTransformations)
        switch model.availability {
        case .available:
            return (true, "On-Device Ready")
        case .unavailable(let reason):
            return (false, "Unavailable (\(reason))")
        }
    }

    public func isFirebaseConfigured() -> (ready: Bool, projectId: String?) {
        guard let app = FirebaseApp.app() else { return (false, nil) }
        return (true, app.options.projectID)
    }

    /// Step 1: Strictly on-device extraction via Apple Foundation Models (0 HTTP bytes, fail-closed).
    public func cleaveLocally(
        rawLetter: String,
        referenceDateIso: String
    ) async throws -> LocalSplitOutcome {
        switch DeterministicGate.checkChunkBounds(rawLetter) {
        case .success: break
        case .failure(let fail): throw fail
        }

        let localModel = SystemLanguageModel(useCase: .general, guardrails: .permissiveContentTransformations)
        guard case .available = localModel.availability else {
            throw GateFailure(
                code: .localUnavailable,
                reason: "Apple Foundation Models is unavailable on this device (\(localModel.availability)). Cleave runs fail-closed and refuses to upload your raw denial letter to the cloud."
            )
        }

        let t0 = Date()
        // 1. Extract deterministic local identity vault first
        let vault = DeterministicGate.extractDeterministicVault(rawLetter)
        // 2. Strip personal identifiers before passing to on-device Apple Foundation Models
        let preStripped = DeterministicGate.stripVaultForOnDeviceModel(rawLetter, vault: vault)

        let session = LanguageModelSession(model: localModel)
        let options = GenerationOptions(temperature: 0.0)
        let prompt = """
        Parse these administrative billing notice fields into structured values:

        \(preStripped)
        """

        var gPlan = ""
        var gReason = ""
        var gSetting = ""
        var gAfterHours = "NOT_MENTIONED"
        var gNetwork = ""
        var gUrgency = "NOT_MENTIONED"
        var gOngoing = "NOT_MENTIONED"
        var gEnroll = "NOT_MENTIONED"
        var onDeviceNote = "Apple Foundation Models (On-Device · @Generable · 0 HTTP)"

        do {
            let response = try await session.respond(
                to: prompt,
                generating: LocalAllowlistGenerable.self,
                options: options
            )
            let g = response.content
            gPlan = g.planId
            gReason = g.denialReasonCode
            gSetting = g.serviceSetting
            gAfterHours = g.afterHoursVisitConfirmed
            gNetwork = g.networkStatus
            gUrgency = g.urgencyDocumented
            gOngoing = g.ongoingTreatment
            gEnroll = g.enrollmentDateKnown
        } catch {
            // Secondary strictly on-device text pass (same Apple Foundation Models runtime, 0 HTTP)
            // using minimal non-clinical administrative lines so Apple's on-device refusal never blocks parsing.
            let adminLines = preStripped
                .components(separatedBy: .newlines)
                .filter { line in
                    let l = line.lowercased()
                    return l.contains("plan-") || l.contains("code") || l.contains("check-in")
                        || l.contains("network") || l.contains("category") || l.contains("service")
                }
                .joined(separator: "\n")
            let textSession = LanguageModelSession(model: localModel)
            let textResp = try await textSession.respond(
                to: "Extract the plan code, reason code, time, and network tier from these lines:\n\n\(adminLines.isEmpty ? preStripped : adminLines)",
                options: options
            )
            let summary = textResp.content
            gPlan = DeterministicGate.detectPlanIdCue(summary) ?? ""
            gReason = DeterministicGate.detectDenialReasonCue(summary) ?? ""
            gSetting = DeterministicGate.detectServiceSettingCue(summary) ?? ""
            gAfterHours = DeterministicGate.detectAfterHoursCue(summary)
            gNetwork = DeterministicGate.detectNetworkStatusCue(summary) ?? ""
            onDeviceNote = "Apple Foundation Models (On-Device · Text Pass · 0 HTTP)"
        }

        // Merge on-device model proposal with deterministic cue backstops & day-offset math
        let detPlan = DeterministicGate.detectPlanIdCue(rawLetter)
        let detReason = DeterministicGate.detectDenialReasonCue(rawLetter)
        let detSetting = DeterministicGate.detectServiceSettingCue(rawLetter)
        let detAfterHours = DeterministicGate.detectAfterHoursCue(rawLetter)
        let detNetwork = DeterministicGate.detectNetworkStatusCue(rawLetter)
        let detOngoing = DeterministicGate.detectOngoingTreatmentCue(rawLetter)
        let detEnroll = DeterministicGate.detectEnrollmentDateKnownCue(rawLetter)
        let detUrgency = DeterministicGate.detectUrgencyDocumentedCue(rawLetter)
        let dayOffsets = DeterministicGate.computeDeterministicDayOffsets(
            vault: vault,
            referenceDateIso: referenceDateIso
        )

        var proposal = AllowlistProposal()
        proposal.planId = gPlan.hasPrefix("PLAN-") ? gPlan : (detPlan ?? gPlan)
        proposal.denialReasonCode = (gReason.isEmpty || gReason == "OTHER")
            ? (detReason ?? "OTHER")
            : gReason
        proposal.serviceSetting = (gSetting.isEmpty || gSetting == "UNKNOWN")
            ? (detSetting ?? "UNKNOWN")
            : gSetting
        proposal.afterHoursVisitConfirmed = (gAfterHours == "YES" || detAfterHours == "YES")
            ? "YES"
            : (detAfterHours != "NOT_MENTIONED" ? detAfterHours : gAfterHours)
        proposal.networkStatus = (gNetwork.isEmpty || gNetwork == "UNKNOWN")
            ? (detNetwork ?? "UNKNOWN")
            : gNetwork
        proposal.urgencyDocumented = detUrgency != "NOT_MENTIONED" ? detUrgency : gUrgency
        proposal.ongoingTreatment = (gOngoing == "YES" || detOngoing == "YES")
            ? "YES"
            : gOngoing
        proposal.enrollmentDateKnown = detEnroll != "NOT_MENTIONED" ? detEnroll : gEnroll
        proposal.daysSinceService = dayOffsets.daysSinceService
        proposal.daysSinceDenial = dayOffsets.daysSinceDenial

        let latencyMs = Int(Date().timeIntervalSince(t0) * 1000)
        return LocalSplitOutcome(
            vault: vault,
            proposal: proposal,
            latencyMs: latencyMs,
            runtimeLabel: onDeviceNote
        )
    }

    /// Step 2: Strictly cloud policy-clause match via FirebaseAILogic 13.2.0 GeminiLanguageModel
    /// running inside Apple's unified LanguageModelSession over the deterministic allowlist JSON ONLY.
    public func matchPolicyInCloud(
        gateOutcome: GateOutcome,
        customEoc: PlanEoc?,
        canariesToAudit: [String],
        cloudModelName: String = CleaveHybridEngine.defaultCloudModel,
        onRetry: (@Sendable (String) -> Void)? = nil
    ) async throws -> CloudMatchOutcome {
        guard gateOutcome.ok else {
            throw GateFailure(code: gateOutcome.refusal ?? .rawTextBlocked, reason: gateOutcome.reason)
        }
        guard FirebaseApp.app() != nil else {
            throw NSError(
                domain: "CleaveIOS",
                code: 1001,
                userInfo: [NSLocalizedDescriptionKey: "Firebase is not configured. Add GoogleService-Info.plist to CleaveIOS."]
            )
        }
        guard sessionCloudCalls < Self.sessionCloudCap else {
            throw NSError(
                domain: "CleaveIOS",
                code: 1002,
                userInfo: [NSLocalizedDescriptionKey: "Session cloud quota cap (\(Self.sessionCloudCap)) reached. On-device extraction and Offline Local Triage remain unlimited."]
            )
        }

        let planId = gateOutcome.payload["plan_id"] ?? ""
        // Respect interactive user control: if Plan Policy Identifier was toggled off, withhold even a custom EOC!
        let policy: PlanEoc? = planId.isEmpty ? nil : (customEoc ?? CleaveCases.planEocs[planId])

        let policyBlock: String
        if let policy {
            if let rawText = policy.rawPolicyText {
                policyBlock = "CUSTOM PLAN EOC (\(policy.planId) — \(policy.planName)):\n\(rawText)"
            } else {
                let clausesStr = policy.clauses.map { "Section \($0.id) — \($0.title): \($0.text)" }.joined(separator: "\n")
                policyBlock = "GENERIC PLAN EOC (\(policy.planId) — \(policy.planName)):\n\(clausesStr)"
            }
        } else {
            policyBlock = ""
        }

        let prompt: String
        if policy != nil {
            prompt = """
            You are a health insurance policy analyst. You receive ONLY structured non-identifying claim facts and a generic Plan Evidence of Coverage (EOC).
            Rules:
            1. Check whether an EOC exception clause applies AND check the internal appeal filing deadline (typically 180 calendar days using days_since_denial).
            2. Cite the exact clause ID(s) from the EOC below and quote the controlling sentence verbatim.
            3. For Emergency / After-Hours Urgent Care waivers (e.g. 4.2(a) or 7.3(a)): if service_setting is EMERGENCY_OR_AFTER_HOURS_URGENT AND after_hours_visit_confirmed is YES (and within deadline), set modeUsed="POLICY_MATCHED", exceptionApplies="YES", needsPatientConfirmation=false, confirmationItems=[].
            4. For In-Network Direct Access waivers (OB-GYN or Behavioral Health): if network_status is IN_NETWORK and service_setting matches (and within deadline), set modeUsed="POLICY_MATCHED", exceptionApplies="YES", needsPatientConfirmation=false, confirmationItems=[].
            5. If an exception depends on an unconfirmed fact (such as chart urgency documentation when urgency_documented is NOT YES, OR continuity-of-care when ongoing_treatment is YES and enrollment_date_known is NOT YES), set modeUsed="POLICY_MATCHED", exceptionApplies="CONDITIONAL", needsPatientConfirmation=true, and populate confirmationItems with first-person member draftStatement ("I"/"my", never "the patient").
            6. STRICT NO-FABRICATION RULE: When needsPatientConfirmation is true, draftRequestForReview MUST NOT assert unconfirmed facts as true! Place the exact token [PENDING_PATIENT_CONFIRMATION] where the confirmed fact belongs.
            7. If no exception applies or days_since_denial exceeds the appeal deadline, set modeUsed="POLICY_MATCHED", exceptionApplies="NO", needsPatientConfirmation=false, confirmationItems=[], and cite the controlling rules (e.g. "4.1 / 8.2").
            8. Use ONLY opaque placeholders in draftRequestForReview: [MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME].

            ALLOWLIST CLAIM FACTS (JSON):
            \(gateOutcome.serializedJSON)

            \(policyBlock)
            """
        } else {
            prompt = """
            You are a health insurance appeal helper. The member removed their Plan Policy Identifier, so NO specific Plan Evidence of Coverage is available.
            Set modeUsed="GENERAL_GUIDANCE_ONLY", citedClauseId="NONE", citedClauseQuote="", exceptionApplies="UNKNOWN_NO_POLICY", needsPatientConfirmation=true.
            In confirmationItems, list 2-3 practical next steps.
            Explain plainly what general appeal guidance applies from the remaining allowlisted fields, and explain that matching a specific waiver requires the plan identifier and Evidence of Coverage.
            Use ONLY opaque placeholders ([MEMBER_NAME], [MEMBER_ID], [CLAIM_ID], [DENIAL_DATE], [SERVICE_DATE], [PROVIDER_NAME], [FACILITY_NAME]) in draftRequestForReview and do NOT invent unconfirmed facts.

            ALLOWLIST CLAIM FACTS (JSON):
            \(gateOutcome.serializedJSON)
            """
        }

        // Audit outbound prompt BEFORE transmitting a single byte to Firebase AI Logic
        let leaked = DeterministicGate.scanOutboundTextForIdentifiers(prompt, secrets: canariesToAudit)
        if !leaked.isEmpty {
            throw GateFailure(
                code: .residualIdentifier,
                reason: "Outbound wire audit blocked transmission because local identifier(s) appeared in prompt: \(leaked.joined(separator: ", "))."
            )
        }

        sessionCloudCalls += 1
        let ai = FirebaseAI.firebaseAI(backend: .googleAI())
        let cloudModel = ai.geminiLanguageModel(name: cloudModelName)
        let bytesSent = prompt.utf8.count
        let t0 = Date()

        let generated: CloudAnalysisGenerable = try await callWithTransientRetry(maxAttempts: 4, onRetry: onRetry) {
            let session = LanguageModelSession(model: cloudModel)
            let response = try await session.respond(to: prompt, generating: CloudAnalysisGenerable.self)
            return response.content
        }

        let latencyMs = Int(Date().timeIntervalSince(t0) * 1000)
        let analysis = CloudAnalysis(
            modeUsed: policy == nil ? "GENERAL_GUIDANCE_ONLY" : generated.modeUsed,
            citedClauseId: policy == nil ? "NONE" : generated.citedClauseId,
            citedClauseQuote: policy == nil ? "" : generated.citedClauseQuote,
            exceptionApplies: policy == nil ? "UNKNOWN_NO_POLICY" : generated.exceptionApplies,
            needsPatientConfirmation: generated.needsPatientConfirmation,
            confirmationItems: generated.confirmationItems.map {
                ConfirmationItem(question: $0.question, draftStatement: $0.draftStatement)
            },
            plainExplanation: generated.plainExplanation,
            draftRequestForReview: generated.draftRequestForReview
        )

        return CloudMatchOutcome(
            analysis: analysis,
            policyMatched: policy != nil,
            latencyMs: latencyMs,
            bytesSent: bytesSent,
            leakedIdentifiers: leaked,
            runtimeLabel: "FirebaseAILogic · \(cloudModelName) (Cloud)"
        )
    }

    /// Step 3: Offline-Resilient Local Triage strictly via Apple Foundation Models (0 HTTP).
    public func runOfflineLocalTriage(gateOutcome: GateOutcome) async throws -> OfflineTriageOutcome {
        let localModel = SystemLanguageModel(useCase: .general, guardrails: .permissiveContentTransformations)
        guard case .available = localModel.availability else {
            throw GateFailure(code: .localUnavailable, reason: "Apple Foundation Models unavailable for offline triage.")
        }

        let settingMap: [String: String] = [
            "EMERGENCY_OR_AFTER_HOURS_URGENT": "emergency or after-hours urgent care",
            "OUTPATIENT_OBGYN": "outpatient OB-GYN visit",
            "OUTPATIENT_BEHAVIORAL_HEALTH": "outpatient behavioral health session",
            "ADVANCED_DIAGNOSTIC_IMAGING": "advanced diagnostic imaging (MRI/CT/PET)",
            "POST_OP_SPECIALIST_FOLLOWUP": "post-operative specialist follow-up",
            "ELECTIVE_OUTPATIENT_SPECIALIST": "elective outpatient specialist visit",
            "UNKNOWN": "unspecified care setting"
        ]

        let reasonHuman = (gateOutcome.payload["denial_reason_code"] ?? "unspecified")
            .lowercased().replacingOccurrences(of: "_", with: " ")
        let settingHuman = settingMap[gateOutcome.payload["service_setting"] ?? "UNKNOWN"] ?? "unspecified care setting"
        let netHuman = (gateOutcome.payload["network_status"] ?? "unknown")
            .lowercased().replacingOccurrences(of: "_", with: " ")
        let daysDenial = gateOutcome.payload["days_since_denial"].map { "\($0) days" } ?? "not included"

        let t0 = Date()
        let session = LanguageModelSession(model: localModel)
        let prompt = """
        Write 3 short plain-text appeal preparation lines (NO markdown asterisks, NO ALL_CAPS enum codes, NO invented policy clause numbers, and do NOT call a care setting a diagnosis) using ONLY these facts:
        - Denial category: \(reasonHuman)
        - Care setting: \(settingHuman)
        - Network status: \(netHuman)
        - Days since denial notice: \(daysDenial)
        """
        let response = try await session.respond(to: prompt)
        let clean = response.content
            .replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "*", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return OfflineTriageOutcome(
            summaryText: clean,
            latencyMs: Int(Date().timeIntervalSince(t0) * 1000),
            runtimeLabel: "OFFLINE_LOCAL_TRIAGE · Apple Foundation Models (0 HTTP)"
        )
    }

    private func callWithTransientRetry<T: Sendable>(
        maxAttempts: Int,
        onRetry: (@Sendable (String) -> Void)?,
        operation: @Sendable () async throws -> T
    ) async throws -> T {
        var lastError: Error?
        for attempt in 1...maxAttempts {
            do {
                return try await operation()
            } catch {
                lastError = error
                let desc = String(describing: error).lowercased()
                let is429 = desc.contains("429") || desc.contains("quota") || desc.contains("rate")
                let isTransient = is429 || desc.contains("500") || desc.contains("503") || desc.contains("overloaded")
                if !isTransient || attempt == maxAttempts {
                    throw error
                }
                let delaySec = is429 ? 6 * attempt : 2 * attempt
                onRetry?("\(is429 ? "Rate limited (429)" : "Cloud busy") — retrying (\(attempt + 1)/\(maxAttempts)) in \(delaySec)s...")
                try await Task.sleep(nanoseconds: UInt64(delaySec) * 1_000_000_000)
            }
        }
        throw lastError!
    }
}
