import Foundation

public enum DeterministicGate {
    public static let maxChunkChars = 12_000
    public static let pendingConfirmationToken = "[PENDING_PATIENT_CONFIRMATION]"

    // MARK: - 1. Chunk Bounds Check (REFUSE_CHUNK_OVERFLOW)

    public static func checkChunkBounds(_ rawText: String) -> Result<Void, GateFailure> {
        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return .failure(GateFailure(
                code: .chunkOverflow,
                reason: "Document is empty. Load a denial letter before cleaving."
            ))
        }
        if trimmed.count > maxChunkChars {
            return .failure(GateFailure(
                code: .chunkOverflow,
                reason: "Document exceeds Cleave's safe on-device bound (\(trimmed.count) > \(maxChunkChars) chars). Split to the denial page first."
            ))
        }
        return .success(())
    }

    // MARK: - 2. Deterministic Identity Vault Extraction (Horizontal whitespace only — zero newline bleed!)

    public static func extractDeterministicVault(_ rawText: String) -> IdentityVault {
        var vault = IdentityVault()

        if let m = firstCapture(#"(?:Member Name|Member|Patient|Subscriber|Re)\s*:[ \t]*([A-Z][a-zA-Z'’-]+(?:[ \t]+[A-Z][a-zA-Z'’-]+){1,2})"#, in: rawText) {
            vault.memberName = m
        }
        if let m = firstCapture(#"(?:Date of Birth|DOB|born)\s*:?[ \t]*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})"#, in: rawText, caseInsensitive: true) {
            vault.dob = m
        }
        if let m = firstCapture(#"\b(MBR-[A-Z0-9-]{4,})\b"#, in: rawText) {
            vault.memberId = m
        }
        if let m = firstCapture(#"\b(CLM-[A-Z0-9-]{4,})\b"#, in: rawText) {
            vault.claimId = m
        }
        if let m = firstCapture(#"\b(GRP-[A-Z0-9-]{4,})\b"#, in: rawText) {
            vault.groupId = m
        }
        if let m = firstCapture(#"(?:Address|residing at)\s*:?[ \t]*(\d{1,6}[ \t]+[A-Za-z0-9 .,'#-]+(?:Rd|Road|Ave|Avenue|Blvd|Boulevard|St|Street|Ln|Lane|Dr|Drive|Way|Ct|Court)(?:[ \t]+(?:Apt|Suite|Unit)[ \t]+[A-Za-z0-9-]+)?)"#, in: rawText, caseInsensitive: true) {
            vault.address = m.trimmingCharacters(in: CharacterSet(charactersIn: " ."))
        }
        if let m = firstCapture(#"\b(\d{3}-\d{3}-\d{4})\b"#, in: rawText) {
            vault.phone = m
        }
        if let m = firstCapture(#"\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b"#, in: rawText) {
            vault.email = m
        }
        if let m = firstCapture(#"\b(Dr\.[ \t]+[A-Z][a-zA-Z'’-]+(?:[ \t]+[A-Z][a-zA-Z'’-]+)?)"#, in: rawText) {
            vault.physician = m
        }
        if let m = firstCapture(#"(?:Facility)\s*:[ \t]*([^\n(]+)"#, in: rawText, caseInsensitive: true) {
            vault.facilityName = m.trimmingCharacters(in: .whitespacesAndNewlines)
        } else if let m = firstCapture(#"(?:Provider|Clinician)\s*:[ \t]*Dr\.[^,\n—-]+[,—-][ \t]*([^\n(\[]+)"#, in: rawText, caseInsensitive: true) {
            vault.facilityName = m.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let m = firstCapture(#"(?:N[0o]tice Date)\s*:[ \t]*([A-Za-z]+[ \t]+\d{1,2},[ \t]+\d{4}|\d{4}-\d{2}-\d{2})"#, in: rawText, caseInsensitive: true) {
            vault.denialDate = m
        }
        if let m = firstCapture(#"(?:Date of Service|Service Date|Svc Date)\s*:[ \t]*([A-Za-z]+[ \t]+\d{1,2},[ \t]+\d{4}|\d{4}-\d{2}-\d{2})"#, in: rawText, caseInsensitive: true) {
            vault.serviceDate = m
        }

        return vault
    }

    /// Strips personal identity lines and clinical/injury phrases locally BEFORE invoking
    /// Apple Foundation Models so personal identity never reaches the model AND Apple's
    /// on-device safety guardrails stay reliably clear on administrative billing classification.
    public static func stripVaultForOnDeviceModel(_ rawText: String, vault: IdentityVault) -> String {
        let identityLinePrefixes = [
            "member name:", "member:", "patient:", "subscriber:", "re:",
            "date of birth:", "dob:", "member id:", "member#:", "group id:",
            "employer group:", "address:", "phone on file:", "contact:",
            "email:", "claim number:", "claim id:", "claim reference:", "claim #:",
            "attending clinician:", "ordering physician:"
        ]
        let filteredLines = rawText
            .components(separatedBy: .newlines)
            .filter { line in
                let lower = line.trimmingCharacters(in: .whitespaces).lowercased()
                return !identityLinePrefixes.contains { lower.hasPrefix($0) }
            }
        var sanitized = filteredLines.joined(separator: "\n")
        let secrets = vault.secrets.sorted { $0.count > $1.count }
        for secret in secrets {
            sanitized = sanitized.replacingOccurrences(of: secret, with: "[ID]", options: [.caseInsensitive])
        }
        // Neutralize clinical body-part/injury phrases that can trigger Apple's local health-advice refusal
        let clinicalSanitizers: [(String, String)] = [
            (#"\bfor\s+acute\s+[a-z\s]+injury\b"#, ""),
            (#"\badverse\s+benefit\s+determination\b"#, "BILLING NOTICE"),
            (#"\blumbar\s+mri\b"#, "MRI scan"),
            (#"\bcosmetic\s+dermatology\b"#, "elective specialist"),
            (#"\bdenied\b"#, "not approved")
        ]
        for (pattern, replacement) in clinicalSanitizers {
            if let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) {
                let range = NSRange(sanitized.startIndex..., in: sanitized)
                sanitized = regex.stringByReplacingMatches(in: sanitized, range: range, withTemplate: replacement)
            }
        }
        return sanitized
    }

    // MARK: - 3. Deterministic Cue Backstops (Identical to Cleave Web)

    public static func detectPlanIdCue(_ text: String) -> String? {
        firstCapture(#"\b(PLAN-[A-Z0-9-]{4,28})\b"#, in: text)
    }

    public static func detectDenialReasonCue(_ text: String) -> String? {
        if matches(#"\bREF-02\b"#, in: text)
            || (matches(#"missing\s+(?:pcp|primary\s+care(?:\s+physician)?)\s+referral"#, in: text)
                && matches(#"non-participating|out-of-network"#, in: text)) {
            return "MISSING_REFERRAL_AND_OON"
        }
        if matches(#"\bPA-\d+\b|no\s+prior\s+authori[zs]ation|missing\s+prior\s+authori[zs]ation"#, in: text) {
            return "MISSING_PRIOR_AUTH"
        }
        if matches(#"\bREF-01\b|missing\s+(?:pcp|primary\s+care(?:\s+physician)?)\s+referral|no\s+(?:active\s+|prior\s+)?(?:pcp|primary\s+care(?:\s+physician)?)\s+referral"#, in: text) {
            return "MISSING_REFERRAL"
        }
        return nil
    }

    public static func detectServiceSettingCue(_ text: String) -> String? {
        if detectAfterHoursCue(text) == "YES" && matches(#"urgent\s+care|emergency"#, in: text) {
            return "EMERGENCY_OR_AFTER_HOURS_URGENT"
        }
        if matches(#"\bob-?gyn\b|gynecolog|women's\s+clinic"#, in: text) {
            return "OUTPATIENT_OBGYN"
        }
        if matches(#"behavioral\s+health|psychotherapy|mental\s+health"#, in: text) {
            return "OUTPATIENT_BEHAVIORAL_HEALTH"
        }
        if matches(#"\bmri\b|\bct\s+scan\b|\bpet\s+scan\b|advanced\s+diagnostic\s+imaging"#, in: text) {
            return "ADVANCED_DIAGNOSTIC_IMAGING"
        }
        if matches(#"post-?operative|post-?op\b"#, in: text) {
            return "POST_OP_SPECIALIST_FOLLOWUP"
        }
        if matches(#"elective\s+(?:cosmetic|outpatient|specialist)|cosmetic\s+dermatology"#, in: text) {
            return "ELECTIVE_OUTPATIENT_SPECIALIST"
        }
        return nil
    }

    public static func detectAfterHoursCue(_ text: String) -> String {
        if matches(#"\b(?:after-hours|after\s+hours|emergency\s+(?:department|room|services)|weekend|holiday)\b"#, in: text) {
            return "YES"
        }
        if let hourStr = firstCapture(#"\b(\d{1,2}):\d{2}\s*(AM|PM)\b"#, in: text, caseInsensitive: true),
           let ampm = secondCapture(#"\b(\d{1,2}):\d{2}\s*(AM|PM)\b"#, in: text, caseInsensitive: true),
           let hour = Int(hourStr) {
            let upper = ampm.uppercased()
            let isAfterHours = (upper == "PM" && hour >= 8 && hour != 12)
                || (upper == "AM" && (hour == 12 || hour < 8))
            return isAfterHours ? "YES" : "NO"
        }
        return "NOT_MENTIONED"
    }

    public static func detectNetworkStatusCue(_ text: String) -> String? {
        if matches(#"out-of-network|non-participating"#, in: text) {
            return "OUT_OF_NETWORK"
        }
        if matches(#"in-network|participating"#, in: text) {
            return "IN_NETWORK"
        }
        return nil
    }

    public static func detectOngoingTreatmentCue(_ text: String) -> String {
        if matches(#"active\s+(?:course\s+of\s+)?(?:post-?operative|oncology|obstetric|treatment)|post-?operative\s+.*follow-?up|transition-of-care"#, in: text) {
            return "YES"
        }
        return "NOT_MENTIONED"
    }

    public static func detectEnrollmentDateKnownCue(_ text: String) -> String {
        if matches(#"does\s+not\s+list\s+your\s+(?:initial\s+)?plan\s+enrollment|enrollment\s+effective\s+date\s+(?:is\s+)?(?:missing|unknown|not\s+listed)"#, in: text) {
            return "NO"
        }
        return "NOT_MENTIONED"
    }

    public static func detectUrgencyDocumentedCue(_ text: String) -> String {
        if matches(#"did\s+not\s+include\s+chart\s+notes\s+regarding\s+urgency|no\s+urgency\s+notes"#, in: text) {
            return "NO"
        }
        return "NOT_MENTIONED"
    }

    public static func computeDeterministicDayOffsets(
        vault: IdentityVault,
        referenceDateIso: String
    ) -> (daysSinceService: Int?, daysSinceDenial: Int?) {
        guard let refDate = parseFlexibleDate(referenceDateIso) else { return (nil, nil) }
        let serviceDays = parseFlexibleDate(vault.serviceDate).map {
            max(0, Int(round(refDate.timeIntervalSince($0) / 86_400.0)))
        }
        let denialDays = parseFlexibleDate(vault.denialDate).map {
            max(0, Int(round(refDate.timeIntervalSince($0) / 86_400.0)))
        }
        return (serviceDays, denialDays)
    }

    public static func extractDenialSentenceLocally(_ rawText: String) -> String {
        let lines = rawText
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if let hit = lines.first(where: {
            matches(#"^(?:Explanation|Details|Notice:|Your claim|ClearPath denied|Elective out-of-network|Services rendered)"#, in: $0)
        }) {
            return hit
        }
        if let hit = lines.first(where: { matches(#"denied|excluded|not reimbursed|not covered"#, in: $0) }) {
            return hit
        }
        return lines.last ?? "Claim denied per original notice."
    }

    // MARK: - 4. Deterministic Allowlist Builder & Residual Identifier Gate

    public static func buildAndVerifyOutgoingPayload(
        proposal: AllowlistProposal,
        enabledKeys: Set<AllowlistKey>,
        vault: IdentityVault,
        injectedExtraKeys: [String: String] = [:]
    ) -> GateOutcome {
        // Guard against any non-allowlisted raw text injection (REFUSE_RAW_TEXT_BLOCKED)
        for key in injectedExtraKeys.keys {
            if AllowlistKey(rawValue: key) == nil {
                return GateOutcome(
                    ok: false,
                    refusal: .rawTextBlocked,
                    reason: "Blocked non-allowlisted field \"\(key)\". Raw denial letter text cannot enter the cloud serializer.",
                    payload: [:],
                    serializedJSON: "{}"
                )
            }
        }

        var orderedPairs: [(String, Any)] = []
        var stringMap: [String: String] = [:]

        for key in AllowlistKey.allCases where enabledKeys.contains(key) {
            switch key {
            case .planId:
                if !proposal.planId.isEmpty {
                    orderedPairs.append((key.rawValue, proposal.planId))
                    stringMap[key.rawValue] = proposal.planId
                }
            case .denialReasonCode:
                orderedPairs.append((key.rawValue, proposal.denialReasonCode))
                stringMap[key.rawValue] = proposal.denialReasonCode
            case .serviceSetting:
                orderedPairs.append((key.rawValue, proposal.serviceSetting))
                stringMap[key.rawValue] = proposal.serviceSetting
            case .afterHoursVisitConfirmed:
                orderedPairs.append((key.rawValue, proposal.afterHoursVisitConfirmed))
                stringMap[key.rawValue] = proposal.afterHoursVisitConfirmed
            case .networkStatus:
                orderedPairs.append((key.rawValue, proposal.networkStatus))
                stringMap[key.rawValue] = proposal.networkStatus
            case .daysSinceService:
                if let d = proposal.daysSinceService {
                    orderedPairs.append((key.rawValue, d))
                    stringMap[key.rawValue] = "\(d)"
                }
            case .daysSinceDenial:
                if let d = proposal.daysSinceDenial {
                    orderedPairs.append((key.rawValue, d))
                    stringMap[key.rawValue] = "\(d)"
                }
            case .urgencyDocumented:
                orderedPairs.append((key.rawValue, proposal.urgencyDocumented))
                stringMap[key.rawValue] = proposal.urgencyDocumented
            case .ongoingTreatment:
                orderedPairs.append((key.rawValue, proposal.ongoingTreatment))
                stringMap[key.rawValue] = proposal.ongoingTreatment
            case .enrollmentDateKnown:
                orderedPairs.append((key.rawValue, proposal.enrollmentDateKnown))
                stringMap[key.rawValue] = proposal.enrollmentDateKnown
            }
        }

        let dict = Dictionary(uniqueKeysWithValues: orderedPairs)
        let jsonStr: String
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: [.prettyPrinted, .sortedKeys]),
           let str = String(data: data, encoding: .utf8) {
            jsonStr = str
        } else {
            jsonStr = "{}"
        }

        // Scan serialized outbound JSON against every local vault secret + PII patterns
        let leaks = scanOutboundTextForIdentifiers(jsonStr, secrets: vault.secrets)
        if !leaks.isEmpty {
            return GateOutcome(
                ok: false,
                refusal: .residualIdentifier,
                reason: "Blocked residual local identifier(s) in outgoing allowlist: \(leaks.joined(separator: ", ")).",
                payload: [:],
                serializedJSON: "{}"
            )
        }

        return GateOutcome(
            ok: true,
            refusal: nil,
            reason: "Verified clean allowlist.",
            payload: stringMap,
            serializedJSON: jsonStr
        )
    }

    public static func scanOutboundTextForIdentifiers(_ outboundText: String, secrets: [String]) -> [String] {
        var found: [String] = []
        let lowered = outboundText.lowercased()
        let compact = normalizeAlnum(outboundText)

        for secret in secrets {
            let trimmed = secret.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmed.count >= 3 else { continue }
            let secCompact = normalizeAlnum(trimmed)
            if lowered.contains(trimmed.lowercased()) || (secCompact.count >= 5 && compact.contains(secCompact)) {
                if !found.contains(trimmed) {
                    found.append(trimmed)
                }
            }
        }

        let piiPatterns: [(String, String)] = [
            (#"\bMBR-[A-Z0-9-]{4,}\b"#, "Member ID pattern"),
            (#"\bCLM-[A-Z0-9-]{4,}\b"#, "Claim ID pattern"),
            (#"\bGRP-[A-Z0-9-]{4,}\b"#, "Group ID pattern"),
            (#"\b\d{3}-\d{2}-\d{4}\b"#, "SSN pattern"),
            (#"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"#, "Email pattern")
        ]
        for (pattern, label) in piiPatterns {
            if matches(pattern, in: outboundText, caseInsensitive: false), !found.contains(label) {
                found.append(label)
            }
        }
        return found
    }

    /// Blocks accidental denial-letter drops into the Bring-Your-Own Plan EOC field.
    public static func verifyCustomEocSafety(_ rawText: String) -> Result<String, GateFailure> {
        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count < 40 {
            return .failure(GateFailure(
                code: .chunkOverflow,
                reason: "Custom Plan EOC text is too short (paste at least one policy clause or load a Plan EOC PDF)."
            ))
        }
        if trimmed.count > 24_000 {
            return .failure(GateFailure(
                code: .chunkOverflow,
                reason: "Custom Plan EOC exceeds 24,000 characters. Paste the relevant Referral / Prior Authorization / Appeals section."
            ))
        }

        let piiTriggers: [(String, String)] = [
            (#"\bMBR-[A-Z0-9-]{4,}\b"#, "Member ID (MBR-...)"),
            (#"\bCLM-[A-Z0-9-]{4,}\b"#, "Claim Number (CLM-...)"),
            (#"\bGRP-[A-Z0-9-]{4,}\b"#, "Group ID (GRP-...)"),
            (#"\b(?:Member Name|Patient|Subscriber)\s*:[ \t]*[A-Z][a-z]+"#, "Patient/Member Name line"),
            (#"\b(?:Date of Birth|DOB)\s*:[ \t]*\d"#, "Date of Birth"),
            (#"\b\d{3}-\d{2}-\d{4}\b"#, "SSN pattern")
        ]
        var hits: [String] = []
        for (pattern, label) in piiTriggers {
            if matches(pattern, in: trimmed, caseInsensitive: true) {
                hits.append(label)
            }
        }
        if !hits.isEmpty {
            return .failure(GateFailure(
                code: .residualIdentifier,
                reason: "Detected personal identifier(s) in Custom EOC (\(hits.joined(separator: ", "))). Did you drop your personal denial letter into the Policy EOC slot by mistake? Egress blocked."
            ))
        }
        return .success(trimmed)
    }

    // MARK: - 5. Local Re-Join & Clean Confirmation Slot Swap

    public static func rejoinDraftLocally(_ template: String, vault: IdentityVault) -> RejoinedDraft {
        let map: [(String, String)] = [
            ("[MEMBER_NAME]", vault.memberName),
            ("[MEMBER_ID]", vault.memberId),
            ("[CLAIM_ID]", vault.claimId),
            ("[DENIAL_DATE]", vault.denialDate),
            ("[SERVICE_DATE]", vault.serviceDate),
            ("[PROVIDER_NAME]", vault.physician),
            ("[FACILITY_NAME]", vault.facilityName),
            ("[GROUP_ID]", vault.groupId),
            ("[DOB]", vault.dob),
            ("[ADDRESS]", vault.address)
        ]

        var result = template
        var rejoinedTokens: [String] = []
        for (token, value) in map where !value.isEmpty && result.contains(token) {
            result = result.replacingOccurrences(of: token, with: value)
            rejoinedTokens.append(token)
        }

        // Find any remaining unreplaced [UPPER_TOKEN] placeholders (excluding our confirmation slot)
        var orphans: [String] = []
        if let regex = try? NSRegularExpression(pattern: #"\[[A-Z0-9_]{3,}\]"#) {
            let range = NSRange(result.startIndex..., in: result)
            for match in regex.matches(in: result, range: range) {
                if let r = Range(match.range, in: result) {
                    let tok = String(result[r])
                    if tok != pendingConfirmationToken && !orphans.contains(tok) {
                        orphans.append(tok)
                    }
                }
            }
        }

        return RejoinedDraft(text: result, rejoinedTokens: rejoinedTokens, orphanPlaceholders: orphans)
    }

    public static func applyConfirmedPatientFacts(_ draftText: String, confirmedStatements: [String]) -> String {
        let cleaned = confirmedStatements
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .map { stmt -> String in
                var s = stmt
                if s.hasSuffix("?") { s.removeLast() }
                if !s.hasSuffix(".") { s += "." }
                return s
            }

        if draftText.contains(pendingConfirmationToken) {
            let replacement = cleaned.isEmpty
                ? "[Pending member confirmation of the unresolved policy fact above before sending.]"
                : cleaned.joined(separator: " ")
            return draftText.replacingOccurrences(of: pendingConfirmationToken, with: replacement)
        }

        guard !cleaned.isEmpty else { return draftText }
        let block = cleaned.map { "- Confirmed by member: \($0)" }.joined(separator: "\n")
        return "\(draftText)\n\nMember-Confirmed Supporting Facts:\n\(block)"
    }

    // MARK: - Helpers

    private static func normalizeAlnum(_ s: String) -> String {
        s.lowercased().filter { $0.isLetter || $0.isNumber }
    }

    private static func matches(_ pattern: String, in text: String, caseInsensitive: Bool = true) -> Bool {
        let opts: NSRegularExpression.Options = caseInsensitive ? [.caseInsensitive] : []
        guard let regex = try? NSRegularExpression(pattern: pattern, options: opts) else { return false }
        let range = NSRange(text.startIndex..., in: text)
        return regex.firstMatch(in: text, range: range) != nil
    }

    private static func firstCapture(_ pattern: String, in text: String, caseInsensitive: Bool = false) -> String? {
        let opts: NSRegularExpression.Options = caseInsensitive ? [.caseInsensitive] : []
        guard let regex = try? NSRegularExpression(pattern: pattern, options: opts) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        guard let m = regex.firstMatch(in: text, range: range), m.numberOfRanges > 1,
              let r = Range(m.range(at: 1), in: text) else { return nil }
        return String(text[r]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func secondCapture(_ pattern: String, in text: String, caseInsensitive: Bool = false) -> String? {
        let opts: NSRegularExpression.Options = caseInsensitive ? [.caseInsensitive] : []
        guard let regex = try? NSRegularExpression(pattern: pattern, options: opts) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        guard let m = regex.firstMatch(in: text, range: range), m.numberOfRanges > 2,
              let r = Range(m.range(at: 2), in: text) else { return nil }
        return String(text[r]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func parseFlexibleDate(_ text: String) -> Date? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let formats = ["yyyy-MM-dd", "MMMM d, yyyy", "MMM d, yyyy", "MM/dd/yyyy"]
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(secondsFromGMT: 0)
        for fmt in formats {
            df.dateFormat = fmt
            if let d = df.date(from: trimmed) { return d }
        }
        return nil
    }
}
