import PDFKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

// Display-only plain-English labels; payloads and scoring keep the enum codes.
private func plainLabel(_ code: String) -> String {
    let labels: [String: String] = [
        "MISSING_REFERRAL": "Missing referral",
        "MISSING_PRIOR_AUTH": "Missing prior authorization",
        "MISSING_REFERRAL_AND_OON": "Missing referral, out-of-network",
        "EMERGENCY_OR_AFTER_HOURS_URGENT": "Emergency or after-hours urgent care",
        "OUTPATIENT_OBGYN": "OB-GYN visit",
        "OUTPATIENT_BEHAVIORAL_HEALTH": "Behavioral health",
        "ADVANCED_DIAGNOSTIC_IMAGING": "Advanced imaging (MRI / CT / PET)",
        "POST_OP_SPECIALIST_FOLLOWUP": "Post-op specialist follow-up",
        "ELECTIVE_OUTPATIENT_SPECIALIST": "Elective specialist visit",
        "IN_NETWORK": "In network",
        "OUT_OF_NETWORK": "Out of network",
        "NOT_MENTIONED": "Not in letter",
        "UNKNOWN": "Unknown",
        "OTHER": "Other",
        "YES": "Yes",
        "NO": "No"
    ]
    return labels[code] ?? code
}

private func exceptionLabel(_ code: String) -> String {
    switch code {
    case "YES": return "Exception applies"
    case "CONDITIONAL": return "Exception possible — needs your confirmation"
    case "NO": return "No exception applies"
    case "UNKNOWN_NO_POLICY": return "Can't tell without your plan"
    default: return "Exception: \(code)"
    }
}

@MainActor
final class CleaveViewModel: ObservableObject {
    private let engine = CleaveHybridEngine()

    // Status
    @Published var appleModelsAvailable = false
    @Published var appleModelsLabel = "Checking..."
    @Published var firebaseReady = false
    @Published var firebaseProjectId: String? = nil

    // Document & Case Intake
    @Published var selectedCaseId: String? = CleaveCases.syntheticCases[0].id
    @Published var rawLetter: String = CleaveCases.syntheticCases[0].rawLetter
    @Published var uploadedFileNote: String? = nil
    @Published var editingLetter = false

    // Local Split Output
    @Published var cleaving = false
    @Published var localError: String? = nil
    @Published var identityVault: IdentityVault? = nil
    @Published var proposedAllowlist: AllowlistProposal? = nil
    @Published var enabledKeys: Set<AllowlistKey> = Set(AllowlistKey.allCases)
    @Published var localLatencyMs: Int = 0
    @Published var vaultExpanded = true

    // Bring-Your-Own Plan EOC
    @Published var eocSourceMode: EocSourceMode = .builtIn
    @Published var eocDrawerExpanded = false
    @Published var customEocName = "Summit Regional Health PPO (Custom EOC)"
    @Published var customEocText = ""

    // Cloud & Offline Output
    @Published var analyzingCloud = false
    @Published var cloudRetryNote = ""
    @Published var runningOffline = false
    @Published var cloudError: String? = nil
    @Published var cloudAnalysis: CloudAnalysis? = nil
    @Published var cloudBytesSent = 0
    @Published var cloudLatencyMs = 0
    @Published var cloudRuntimeLabel = ""
    @Published var cloudSnapshot = ""
    @Published var offlineTriageText: String? = nil
    @Published var offlineLatencyMs = 0

    // Re-joined Draft + Confirmations
    @Published var rejoinedDraft: RejoinedDraft? = nil
    @Published var confirmedIndices: Set<Int> = []
    @Published var editableDraft = ""
    @Published var copiedToast = false

    // Wire Proof Audit
    @Published var wireLog: [WireAuditEntry] = []
    @Published var sessionVaultSecrets: [String] = []
    @Published var showWireSheet = false

    enum EocSourceMode: String, CaseIterable {
        case builtIn = "Built-in EOC"
        case custom = "Bring Your Own EOC"
    }

    var activeSampleCase: SyntheticCase? {
        CleaveCases.syntheticCases.first { $0.id == selectedCaseId }
    }

    var activeCaseLabel: String {
        if let c = activeSampleCase { return "\(c.id): \(c.shortTitle)" }
        return uploadedFileNote != nil ? "Local PDF Letter" : "Custom Denial Letter"
    }

    var planIdEnabled: Bool {
        enabledKeys.contains(.planId)
    }

    var customEocSafety: Result<String, GateFailure>? {
        guard eocSourceMode == .custom else { return nil }
        return DeterministicGate.verifyCustomEocSafety(customEocText)
    }

    var customEocBlocked: Bool {
        guard eocSourceMode == .custom, planIdEnabled, let check = customEocSafety else { return false }
        if case .failure = check { return true }
        return false
    }

    var activeCustomEoc: PlanEoc? {
        guard eocSourceMode == .custom, let check = customEocSafety, case .success(let cleaned) = check else {
            return nil
        }
        let detectedId = DeterministicGate.detectPlanIdCue(cleaned) ?? proposedAllowlist?.planId ?? "CUSTOM-EOC"
        return PlanEoc(
            planId: detectedId,
            planName: customEocName.isEmpty ? "Custom Uploaded Plan EOC" : customEocName,
            clauses: [],
            rawPolicyText: cleaned
        )
    }

    var effectiveAllowlist: AllowlistProposal? {
        guard var base = proposedAllowlist else { return nil }
        if let custom = activeCustomEoc, custom.planId.hasPrefix("PLAN-") {
            base.planId = custom.planId
        }
        return base
    }

    var liveGate: GateOutcome? {
        guard let eff = effectiveAllowlist, let vault = identityVault else { return nil }
        return DeterministicGate.buildAndVerifyOutgoingPayload(
            proposal: eff,
            enabledKeys: enabledKeys,
            vault: vault
        )
    }

    var currentSnapshot: String {
        "\(liveGate?.serializedJSON ?? "")|\(eocSourceMode.rawValue)|\(customEocText.count)"
    }

    var isResultStale: Bool {
        cloudAnalysis != nil && !cloudSnapshot.isEmpty && cloudSnapshot != currentSnapshot
    }

    var totalLeaksAcrossSession: Int {
        wireLog.reduce(0) { $0 + $1.leakedIdentifiers.count }
    }

    var cloudRequestCount: Int {
        wireLog.filter(\.isCloud).count
    }

    func refreshRuntimeStatus() async {
        let apple = await engine.appleModelAvailability()
        let fb = await engine.isFirebaseConfigured()
        appleModelsAvailable = apple.available
        appleModelsLabel = apple.label
        firebaseReady = fb.ready
        firebaseProjectId = fb.projectId
    }

    func selectCase(_ c: SyntheticCase) {
        selectedCaseId = c.id
        rawLetter = c.rawLetter
        uploadedFileNote = nil
        editingLetter = false
        resetOutputs()
    }

    func importLocalDocument(url: URL) {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }

        resetOutputs()
        selectedCaseId = nil
        editingLetter = false

        do {
            let data = try Data(contentsOf: url)
            let sizeLabel = data.count < 1024
                ? "\(data.count) B"
                : String(format: "%.1f KB", Double(data.count) / 1024.0)

            if url.pathExtension.lowercased() == "pdf" {
                guard let pdf = PDFDocument(data: data) else {
                    localError = "Could not open PDF locally."
                    return
                }
                let text = (0..<pdf.pageCount)
                    .compactMap { pdf.page(at: $0)?.string }
                    .joined(separator: "\n\n")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else {
                    localError = "This PDF has no selectable text. Paste the text directly or use a text-based PDF."
                    return
                }
                rawLetter = text
                uploadedFileNote = "Parsed \"\(url.lastPathComponent)\" locally via PDFKit (\(pdf.pageCount) page\(pdf.pageCount == 1 ? "" : "s"), \(sizeLabel) — 0 bytes uploaded)"
            } else {
                guard let text = String(data: data, encoding: .utf8) else {
                    localError = "Could not decode text file as UTF-8."
                    return
                }
                rawLetter = text
                uploadedFileNote = "Loaded \"\(url.lastPathComponent)\" locally (\(sizeLabel) — 0 bytes uploaded)"
            }
        } catch {
            localError = "Failed to read local file: \(error.localizedDescription)"
        }
    }

    func loadSummitPpoSampleEoc() {
        cloudError = nil
        eocSourceMode = .custom
        customEocName = "Summit Regional Health PPO (Sample EOC)"
        customEocText = CleaveCases.sampleSummitPpoEocText
        eocDrawerExpanded = true
    }

    func purgeVault() {
        identityVault = nil
        proposedAllowlist = nil
        rejoinedDraft = nil
        editableDraft = ""
        confirmedIndices = []
        if selectedCaseId == nil {
            rawLetter = ""
            uploadedFileNote = nil
        }
    }

    func resetOutputs() {
        localError = nil
        identityVault = nil
        proposedAllowlist = nil
        localLatencyMs = 0
        cloudError = nil
        cloudAnalysis = nil
        offlineTriageText = nil
        rejoinedDraft = nil
        confirmedIndices = []
        editableDraft = ""
        enabledKeys = Set(AllowlistKey.allCases)
        cloudSnapshot = ""
    }

    func toggleAllowlistKey(_ key: AllowlistKey) {
        if enabledKeys.contains(key) {
            enabledKeys.remove(key)
        } else {
            enabledKeys.insert(key)
        }
    }

    func cleaveOnDevice() async {
        cleaving = true
        localError = nil
        cloudError = nil
        cloudAnalysis = nil
        offlineTriageText = nil
        rejoinedDraft = nil
        confirmedIndices = []

        let refDate = activeSampleCase != nil
            ? CleaveCases.benchmarkReferenceDate
            : ISO8601DateFormatter().string(from: Date()).prefix(10).description

        do {
            let outcome = try await engine.cleaveLocally(rawLetter: rawLetter, referenceDateIso: refDate)
            identityVault = outcome.vault
            proposedAllowlist = outcome.proposal
            enabledKeys = Set(AllowlistKey.allCases)
            localLatencyMs = outcome.latencyMs
            editingLetter = false

            let merged = Set(sessionVaultSecrets).union(outcome.vault.secrets)
            sessionVaultSecrets = Array(merged).sorted()

            wireLog.append(WireAuditEntry(
                timestamp: Date(),
                caseLabel: activeCaseLabel,
                stepName: "1. Local Identity Split",
                runtimeLabel: outcome.runtimeLabel,
                isCloud: false,
                bytesSent: 0,
                latencyMs: outcome.latencyMs,
                leakedIdentifiers: [],
                outboundJSON: "0 bytes transmitted — raw letter stayed strictly in device memory.",
                note: "Held \(outcome.vault.displayEntries.count) identifier(s) locally on-device."
            ))
        } catch let fail as GateFailure {
            localError = "\(fail.code.rawValue): \(fail.reason)"
            wireLog.append(WireAuditEntry(
                timestamp: Date(),
                caseLabel: activeCaseLabel,
                stepName: "1. Local Split (\(fail.code.rawValue))",
                runtimeLabel: "Fail-Closed Local Guard",
                isCloud: false,
                bytesSent: 0,
                latencyMs: 0,
                leakedIdentifiers: [],
                outboundJSON: "0 bytes transmitted.",
                note: fail.reason
            ))
        } catch {
            localError = "REFUSE_LOCAL_UNAVAILABLE: \(error.localizedDescription)"
        }

        cleaving = false
    }

    func matchClauseInCloud() async {
        guard let gate = liveGate, let vault = identityVault else { return }
        guard gate.ok else {
            cloudError = "\(gate.refusal?.rawValue ?? "REFUSED"): \(gate.reason)"
            return
        }
        if customEocBlocked, case .failure(let fail) = customEocSafety {
            cloudError = "\(fail.code.rawValue): \(fail.reason)"
            return
        }

        analyzingCloud = true
        cloudRetryNote = ""
        cloudError = nil
        offlineTriageText = nil

        let canaries = activeSampleCase?.canaries ?? vault.secrets

        do {
            let outcome = try await engine.matchPolicyInCloud(
                gateOutcome: gate,
                customEoc: activeCustomEoc,
                canariesToAudit: canaries,
                onRetry: { [weak self] msg in
                    Task { @MainActor in
                        self?.cloudRetryNote = msg
                    }
                }
            )
            let joined = DeterministicGate.rejoinDraftLocally(
                outcome.analysis.draftRequestForReview,
                vault: vault
            )

            cloudAnalysis = outcome.analysis
            cloudBytesSent = outcome.bytesSent
            cloudLatencyMs = outcome.latencyMs
            cloudRuntimeLabel = outcome.runtimeLabel
            cloudSnapshot = currentSnapshot
            rejoinedDraft = joined
            confirmedIndices = []
            editableDraft = DeterministicGate.applyConfirmedPatientFacts(joined.text, confirmedStatements: [])

            wireLog.append(WireAuditEntry(
                timestamp: Date(),
                caseLabel: activeCaseLabel,
                stepName: outcome.policyMatched ? "2. Cloud Policy Match" : "2. Cloud General Guidance",
                runtimeLabel: outcome.runtimeLabel,
                isCloud: true,
                bytesSent: outcome.bytesSent,
                latencyMs: outcome.latencyMs,
                leakedIdentifiers: outcome.leakedIdentifiers,
                outboundJSON: gate.serializedJSON,
                note: "\(outcome.analysis.modeUsed) · Clause \(outcome.analysis.citedClauseId) · \(outcome.leakedIdentifiers.count) identifier leaks · \(joined.orphanPlaceholders.count) orphan placeholders."
            ))
        } catch let fail as GateFailure {
            cloudError = "\(fail.code.rawValue): \(fail.reason)"
        } catch {
            cloudError = error.localizedDescription
        }

        analyzingCloud = false
        cloudRetryNote = ""
    }

    func runOfflineTriage() async {
        guard let gate = liveGate, gate.ok else { return }
        runningOffline = true
        cloudError = nil
        do {
            let res = try await engine.runOfflineLocalTriage(gateOutcome: gate)
            offlineTriageText = res.summaryText
            offlineLatencyMs = res.latencyMs
            wireLog.append(WireAuditEntry(
                timestamp: Date(),
                caseLabel: activeCaseLabel,
                stepName: "Offline Local Triage",
                runtimeLabel: res.runtimeLabel,
                isCloud: false,
                bytesSent: 0,
                latencyMs: res.latencyMs,
                leakedIdentifiers: [],
                outboundJSON: "0 bytes transmitted — offline Apple Foundation Models triage.",
                note: "Explicitly labeled OFFLINE_LOCAL_TRIAGE — no policy clause fabricated."
            ))
        } catch {
            cloudError = error.localizedDescription
        }
        runningOffline = false
    }

    func toggleConfirmation(_ index: Int) {
        guard let analysis = cloudAnalysis, let joined = rejoinedDraft else { return }
        if confirmedIndices.contains(index) {
            confirmedIndices.remove(index)
        } else {
            confirmedIndices.insert(index)
        }
        let statements = confirmedIndices.sorted().compactMap { idx -> String? in
            guard idx < analysis.confirmationItems.count else { return nil }
            return analysis.confirmationItems[idx].draftStatement
        }
        editableDraft = DeterministicGate.applyConfirmedPatientFacts(joined.text, confirmedStatements: statements)
    }

    func copyDraft() {
        UIPasteboard.general.string = editableDraft
        copiedToast = true
        Task {
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            copiedToast = false
        }
    }

    /// Automated end-to-end Simulator verification harness (invoked only when CLEAVE_IOS_SELFTEST=1).
    func runAutomatedSelfTestIfRequested() async {
        guard ProcessInfo.processInfo.environment["CLEAVE_IOS_SELFTEST"] == "1" else { return }
        let outURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("selftest-report.txt")
        var report: [String] = []

        await refreshRuntimeStatus()
        report.append("APPLE_MODELS=\(appleModelsAvailable) (\(appleModelsLabel))")
        report.append("FIREBASE_READY=\(firebaseReady) (project=\(firebaseProjectId ?? "nil"))")

        // 1. Deterministic Refusal Verification (4 checks)
        let overflowRes = DeterministicGate.checkChunkBounds(String(repeating: "X", count: 13_000))
        let overflowPass: Bool = { if case .failure(let f) = overflowRes { return f.code == .chunkOverflow }; return false }()
        let rawBlock = DeterministicGate.buildAndVerifyOutgoingPayload(
            proposal: AllowlistProposal(planId: "PLAN-HMO-2026-GOLD"),
            enabledKeys: Set(AllowlistKey.allCases),
            vault: IdentityVault(memberName: "Elena Vasquez"),
            injectedExtraKeys: ["raw_text": "Elena Vasquez"]
        )
        let residualBlock = DeterministicGate.buildAndVerifyOutgoingPayload(
            proposal: AllowlistProposal(planId: "MBR-8841209"),
            enabledKeys: Set(AllowlistKey.allCases),
            vault: IdentityVault(memberId: "MBR-8841209")
        )
        let eocPiiGuard = DeterministicGate.verifyCustomEocSafety(CleaveCases.syntheticCases[0].rawLetter)
        let eocGuardPass: Bool = { if case .failure(let f) = eocPiiGuard { return f.code == .residualIdentifier }; return false }()
        report.append("DET_REFUSALS: overflow=\(overflowPass) rawBlock=\(rawBlock.refusal?.rawValue ?? "none") residual=\(residualBlock.refusal?.rawValue ?? "none") eocPii=\(eocGuardPass)")

        // 2. Live Case 1 end-to-end (On-Device Apple Foundation Models -> Gate -> FirebaseAILogic Cloud -> Local Re-Join)
        selectCase(CleaveCases.syntheticCases[0])
        await cleaveOnDevice()
        report.append("CASE1_LOCAL: vaultCount=\(identityVault?.displayEntries.count ?? 0) plan=\(proposedAllowlist?.planId ?? "nil") setting=\(proposedAllowlist?.serviceSetting ?? "nil") afterHours=\(proposedAllowlist?.afterHoursVisitConfirmed ?? "nil") ms=\(localLatencyMs) err=\(localError ?? "none")")

        await matchClauseInCloud()
        report.append("CASE1_CLOUD: mode=\(cloudAnalysis?.modeUsed ?? "nil") clause=\(cloudAnalysis?.citedClauseId ?? "nil") exception=\(cloudAnalysis?.exceptionApplies ?? "nil") bytes=\(cloudBytesSent) ms=\(cloudLatencyMs) leaks=\(totalLeaksAcrossSession) orphans=\(rejoinedDraft?.orphanPlaceholders.count ?? -1) rejoined=\(rejoinedDraft?.rejoinedTokens.count ?? 0) err=\(cloudError ?? "none")")

        // 3. Live Case 3 (Unresolved fact + checkbox slot swap)
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        selectCase(CleaveCases.syntheticCases[2])
        await cleaveOnDevice()
        await matchClauseInCloud()
        let beforeTickHasRawToken = editableDraft.contains(DeterministicGate.pendingConfirmationToken)
        if let items = cloudAnalysis?.confirmationItems, !items.isEmpty {
            toggleConfirmation(0)
        }
        let afterTickHasPending = editableDraft.contains("Pending member confirmation")
        report.append("CASE3_CLOUD: mode=\(cloudAnalysis?.modeUsed ?? "nil") clause=\(cloudAnalysis?.citedClauseId ?? "nil") exception=\(cloudAnalysis?.exceptionApplies ?? "nil") confirm=\(cloudAnalysis?.needsPatientConfirmation ?? false) items=\(cloudAnalysis?.confirmationItems.count ?? 0) rawTokenBefore=\(beforeTickHasRawToken) pendingAfter=\(afterTickHasPending) err=\(cloudError ?? "none")")

        // 4. Switch back to Case 1 for clean Simulator display & verify offline triage (0 HTTP)
        selectCase(CleaveCases.syntheticCases[0])
        await cleaveOnDevice()
        await runOfflineTriage()
        report.append("CASE1_OFFLINE: hasText=\(offlineTriageText != nil) ms=\(offlineLatencyMs) cloudReqs=\(cloudRequestCount)")

        let text = report.joined(separator: "\n")
        try? text.write(to: outURL, atomically: true, encoding: .utf8)
        print("CLEAVE_IOS_SELFTEST_REPORT:\n\(text)")
    }
}

struct ContentView: View {
    @StateObject private var vm = CleaveViewModel()
    @State private var showDocumentImporter = false

    var body: some View {
        NavigationStack {
            ZStack {
                CleavePalette.canvas.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        headerSection
                        heroSection
                        intakeSection
                        localLetterCard
                        seamDivider
                        allowlistCard
                        if let offline = vm.offlineTriageText {
                            offlineTriageCard(text: offline)
                        }
                        if vm.cloudAnalysis != nil && vm.rejoinedDraft != nil {
                            resultsSection
                        }
                        footerNote
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $vm.showWireSheet) {
                WireProofSheet(vm: vm)
            }
            .fileImporter(
                isPresented: $showDocumentImporter,
                allowedContentTypes: [.pdf, .plainText],
                allowsMultipleSelection: false
            ) { result in
                if case .success(let urls) = result, let url = urls.first {
                    vm.importLocalDocument(url: url)
                }
            }
            .task {
                await vm.refreshRuntimeStatus()
                await vm.runAutomatedSelfTestIfRequested()
            }
        }
    }

    // MARK: - Top Bar

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                CleaveLogoLockup()
                Spacer()
                Button {
                    vm.showWireSheet = true
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "checkmark.shield")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Wire Proof (\(vm.cloudRequestCount))")
                            .font(.system(size: 12.5, weight: .semibold))
                    }
                }
                .buttonStyle(CleaveSecondaryButtonStyle())
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    CleavePillTag(
                        vm.appleModelsAvailable ? "Apple AI: Ready" : "Apple AI: Off",
                        tone: vm.appleModelsAvailable ? .green : .yellow
                    )
                    CleavePillTag(
                        vm.firebaseReady ? "Firebase: \(vm.firebaseProjectId ?? "Ready")" : "Firebase: Setup",
                        tone: vm.firebaseReady ? .blue : .neutral
                    )
                    CleavePillTag(
                        "\(vm.totalLeaksAcrossSession) Leaks",
                        tone: vm.totalLeaksAcrossSession == 0 ? .green : .red
                    )
                }
            }
        }
        .padding(.bottom, 4)
    }

    // MARK: - Hero

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("FIREBASE AI LOGIC · APPLE FOUNDATION MODELS")
                .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                .foregroundStyle(CleavePalette.inkMuted)
                .tracking(0.6)

            Text("Understand why this claim was denied and draft a response without uploading the original letter.")
                .font(.system(size: 25, weight: .regular, design: .serif))
                .foregroundStyle(CleavePalette.inkPrimary)
                .fixedSize(horizontal: false, vertical: true)

            Text("AI running on your iPhone pulls out your personal details and keeps them here. You review a short list of facts that don't identify you, and only those go to the cloud to find the part of your plan that can overturn the denial.")
                .font(.system(size: 13.5))
                .foregroundStyle(CleavePalette.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Intake Bar

    private var intakeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("1. SELECT DENIAL LETTER OR OPEN LOCAL PDF")
                    .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                    .foregroundStyle(CleavePalette.inkMuted)
                Spacer()
                Button {
                    showDocumentImporter = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.badge.arrow.up")
                            .font(.system(size: 12))
                        Text("Open PDF")
                            .font(.system(size: 12, weight: .semibold))
                    }
                }
                .buttonStyle(CleaveSecondaryButtonStyle())
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(CleaveCases.syntheticCases) { item in
                        let isSelected = vm.selectedCaseId == item.id
                        Button {
                            vm.selectCase(item)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.shortTitle)
                                    .font(.system(size: 12.5, weight: .semibold))
                                    .foregroundStyle(isSelected ? .white : CleavePalette.inkPrimary)
                                Text(item.categoryTag)
                                    .font(.system(size: 10.5, design: .monospaced))
                                    .foregroundStyle(isSelected ? .white.opacity(0.8) : CleavePalette.inkMuted)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                isSelected ? CleavePalette.inkPrimary : CleavePalette.surface,
                                in: RoundedRectangle(cornerRadius: 8)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(isSelected ? CleavePalette.inkPrimary : CleavePalette.hairline, lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if let note = vm.uploadedFileNote {
                Text(note)
                    .font(.system(size: 12))
                    .foregroundStyle(CleavePalette.greenInk)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(CleavePalette.greenBg, in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Local Denial Letter Pane

    private var localLetterCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    CleavePillTag("STAYS ON YOUR DEVICE · ON-DEVICE ONLY", tone: .green)
                    Text("Original Denial Letter")
                        .font(.system(size: 20, weight: .regular, design: .serif))
                        .foregroundStyle(CleavePalette.inkPrimary)
                }
                Spacer()
                Button(vm.editingLetter ? "Done" : "Edit") {
                    vm.editingLetter.toggle()
                }
                .buttonStyle(CleaveSecondaryButtonStyle())
            }

            if vm.editingLetter {
                TextEditor(text: $vm.rawLetter)
                    .font(.system(size: 12.5, design: .monospaced))
                    .frame(minHeight: 160)
                    .padding(8)
                    .background(CleavePalette.recessed, in: RoundedRectangle(cornerRadius: 8))
            } else {
                Text(highlightedLetterString)
                    .font(.system(size: 12.5, design: .monospaced))
                    .foregroundStyle(CleavePalette.inkBody)
                    .lineSpacing(3)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(CleavePalette.recessed, in: RoundedRectangle(cornerRadius: 8))
            }

            if let err = vm.localError {
                Text(err)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(CleavePalette.redInk)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(CleavePalette.redBg, in: RoundedRectangle(cornerRadius: 8))
            }

            if let vault = vm.identityVault {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Personal details kept on this device (\(vault.displayEntries.count))")
                                .font(.system(size: 12.5, weight: .semibold))
                                .foregroundStyle(CleavePalette.inkPrimary)
                            Text("0 network requests · \(String(format: "%.1fs", Double(vm.localLatencyMs) / 1000.0))")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(CleavePalette.greenInk)
                        }
                        Spacer()
                        Button(vm.vaultExpanded ? "Hide" : "Show") {
                            vm.vaultExpanded.toggle()
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(CleavePalette.inkMuted)
                        Button("Purge") {
                            vm.purgeVault()
                        }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(CleavePalette.redInk)
                    }

                    if vm.vaultExpanded {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                            ForEach(vault.displayEntries, id: \.key) { entry in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.label.uppercased())
                                        .font(.system(size: 9.5, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(CleavePalette.inkMuted)
                                    Text(entry.value)
                                        .font(.system(size: 11.5, weight: .medium))
                                        .foregroundStyle(CleavePalette.inkPrimary)
                                        .lineLimit(2)
                                }
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(CleavePalette.greenBg.opacity(0.65), in: RoundedRectangle(cornerRadius: 6))
                            }
                        }
                    }
                }
                .padding(10)
                .background(CleavePalette.recessed, in: RoundedRectangle(cornerRadius: 8))
            }

            Button {
                Task { await vm.cleaveOnDevice() }
            } label: {
                HStack(spacing: 8) {
                    if vm.cleaving { ProgressView().tint(.white).controlSize(.small) }
                    Text(vm.cleaving ? "Cleaving via Apple Foundation Models..." : "Cleave Letter on Device")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(CleavePrimaryButtonStyle())
            .disabled(vm.cleaving || vm.rawLetter.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .editorialCard()
    }

    private var highlightedLetterString: AttributedString {
        var attributed = AttributedString(vm.rawLetter)
        guard let vault = vm.identityVault else { return attributed }
        for secret in vault.secrets.sorted(by: { $0.count > $1.count }) {
            var searchStart = attributed.startIndex
            while searchStart < attributed.endIndex,
                  let range = attributed[searchStart..<attributed.endIndex].range(of: secret, options: .caseInsensitive) {
                attributed[range].backgroundColor = CleavePalette.greenBg
                attributed[range].foregroundColor = CleavePalette.greenInk
                searchStart = range.upperBound
            }
        }
        return attributed
    }

    // MARK: - Center Seam

    private var seamDivider: some View {
        HStack(spacing: 10) {
            Rectangle().fill(CleavePalette.hairline).frame(height: 1)
            HStack(spacing: 5) {
                Image(systemName: "scissors")
                    .font(.system(size: 11))
                Text("PRIVACY BOUNDARY")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
            }
            .foregroundStyle(CleavePalette.inkMuted)
            Rectangle().fill(CleavePalette.hairline).frame(height: 1)
        }
        .padding(.vertical, 2)
    }

    // MARK: - Outgoing Allowlist Pane

    private var allowlistCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                CleavePillTag("YOU CHOOSE WHAT LEAVES", tone: .blue)
                Text("What Gets Sent")
                    .font(.system(size: 20, weight: .regular, design: .serif))
                    .foregroundStyle(CleavePalette.inkPrimary)
                Text("Only these facts go to the cloud, and none of them name you. Toggle any off to keep it back.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(CleavePalette.inkMuted)
            }

            if let effective = vm.effectiveAllowlist {
                // Policy EOC status & Bring-Your-Own EOC drawer
                eocControlSection(effective: effective)

                // Interactive Allowlist toggles
                VStack(spacing: 8) {
                    ForEach(AllowlistKey.allCases) { key in
                        if let val = effective.displayValue(for: key) {
                            let isChecked = vm.enabledKeys.contains(key)
                            Button {
                                vm.toggleAllowlistKey(key)
                            } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: isChecked ? "checkmark.square.fill" : "square")
                                        .foregroundStyle(isChecked ? CleavePalette.inkPrimary : CleavePalette.inkMuted)
                                        .font(.system(size: 17))
                                        .padding(.top, 1)

                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack {
                                            Text(key.label)
                                                .font(.system(size: 13, weight: .semibold))
                                                .foregroundStyle(CleavePalette.inkPrimary)
                                            Spacer()
                                            Text(plainLabel(val))
                                                .font(.system(size: 11.5, weight: .medium, design: .monospaced))
                                                .foregroundStyle(isChecked ? CleavePalette.blueInk : CleavePalette.inkMuted)
                                                .lineLimit(1)
                                        }
                                        Text(isChecked ? key.shortHint : key.removalConsequence)
                                            .font(.system(size: 11.5))
                                            .foregroundStyle(isChecked ? CleavePalette.inkMuted : CleavePalette.yellowInk)
                                            .multilineTextAlignment(.leading)
                                    }
                                }
                                .padding(10)
                                .background(
                                    isChecked ? CleavePalette.surface : CleavePalette.recessed,
                                    in: RoundedRectangle(cornerRadius: 8)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(CleavePalette.hairline, lineWidth: 1)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let gate = vm.liveGate {
                    if gate.ok {
                        HStack {
                            Text("Code Gate: 0 local IDs matched · \(gate.serializedJSON.utf8.count) B JSON")
                                .font(.system(size: 11.5, weight: .medium, design: .monospaced))
                                .foregroundStyle(CleavePalette.greenInk)
                            Spacer()
                            Button("Inspect") {
                                vm.showWireSheet = true
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(CleavePalette.blueInk)
                        }
                        .padding(10)
                        .background(CleavePalette.recessed, in: RoundedRectangle(cornerRadius: 8))
                    } else {
                        Text("\(gate.refusal?.rawValue ?? "REFUSED"): \(gate.reason)")
                            .font(.system(size: 12.5, weight: .medium))
                            .foregroundStyle(CleavePalette.redInk)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(CleavePalette.redBg, in: RoundedRectangle(cornerRadius: 8))
                    }
                }

                if let err = vm.cloudError {
                    Text(err)
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(CleavePalette.redInk)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(CleavePalette.redBg, in: RoundedRectangle(cornerRadius: 8))
                }

                VStack(spacing: 8) {
                    Button {
                        Task { await vm.matchClauseInCloud() }
                    } label: {
                        HStack(spacing: 8) {
                            if vm.analyzingCloud { ProgressView().tint(.white).controlSize(.small) }
                            Text(
                                vm.analyzingCloud
                                    ? (vm.cloudRetryNote.isEmpty ? "Matching via FirebaseAILogic Cloud..." : vm.cloudRetryNote)
                                    : (vm.planIdEnabled ? "Match Policy Clause in Cloud" : "Get General Guidance in Cloud")
                            )
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(CleavePrimaryButtonStyle())
                    .disabled(vm.analyzingCloud || vm.runningOffline || !(vm.liveGate?.ok ?? false) || vm.customEocBlocked)

                    Button {
                        Task { await vm.runOfflineTriage() }
                    } label: {
                        HStack(spacing: 8) {
                            if vm.runningOffline { ProgressView().controlSize(.small) }
                            Text(vm.runningOffline ? "Running Offline Local Triage..." : "Offline Local Triage (0 HTTP)")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(CleaveSecondaryButtonStyle())
                    .disabled(vm.analyzingCloud || vm.runningOffline || !(vm.liveGate?.ok ?? false))
                }
            } else {
                Text("Nothing has left your device. Tap \"Cleave Letter on Device\" above to read your letter on this iPhone.")
                    .font(.system(size: 13))
                    .foregroundStyle(CleavePalette.blueInk)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(CleavePalette.blueBg, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .editorialCard()
    }

    @ViewBuilder
    private func eocControlSection(effective: AllowlistProposal) -> some View {
        let matchedBuiltIn = CleaveCases.planEocs[effective.planId]
        let hasActivePolicy = vm.planIdEnabled && (vm.activeCustomEoc != nil || matchedBuiltIn != nil)

        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(hasActivePolicy ? "Policy matching enabled" : "Plan Policy Identifier removed")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(hasActivePolicy ? CleavePalette.greenInk : CleavePalette.yellowInk)
                    Text(
                        hasActivePolicy
                            ? (vm.activeCustomEoc?.planName ?? matchedBuiltIn?.planName ?? effective.planId)
                            : "Cleave will give general guidance only, since it can't look up your plan."
                    )
                    .font(.system(size: 11.5))
                    .foregroundStyle(CleavePalette.inkBody)
                }
                Spacer()
                if vm.planIdEnabled {
                    Button(vm.eocDrawerExpanded ? "Hide EOC" : "Own EOC") {
                        vm.eocDrawerExpanded.toggle()
                    }
                    .buttonStyle(CleaveSecondaryButtonStyle())
                }
            }
            .padding(10)
            .background(
                hasActivePolicy ? CleavePalette.greenBg : CleavePalette.yellowBg,
                in: RoundedRectangle(cornerRadius: 8)
            )

            if vm.eocDrawerExpanded && vm.planIdEnabled {
                VStack(alignment: .leading, spacing: 10) {
                    Picker("EOC Source", selection: $vm.eocSourceMode) {
                        ForEach(CleaveViewModel.EocSourceMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: vm.eocSourceMode) { _, _ in
                        vm.cloudError = nil
                    }

                    if vm.eocSourceMode == .custom {
                        HStack {
                            Text("Paste generic policy clauses (PII-guarded):")
                                .font(.system(size: 11.5))
                                .foregroundStyle(CleavePalette.inkMuted)
                            Spacer()
                            Button("Try Summit PPO") {
                                vm.loadSummitPpoSampleEoc()
                            }
                            .font(.system(size: 11.5, weight: .semibold))
                            .foregroundStyle(CleavePalette.blueInk)
                        }

                        TextEditor(text: $vm.customEocText)
                            .font(.system(size: 11.5, design: .monospaced))
                            .frame(minHeight: 100)
                            .padding(6)
                            .background(CleavePalette.surface, in: RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(CleavePalette.hairline, lineWidth: 1))
                            .onChange(of: vm.customEocText) { _, _ in
                                vm.cloudError = nil
                            }

                        if let safety = vm.customEocSafety {
                            switch safety {
                            case .success(let cleaned):
                                Text("Custom EOC verified clean (\(cleaned.count) chars) — 0 personal identifiers detected.")
                                    .font(.system(size: 11.5, weight: .medium))
                                    .foregroundStyle(CleavePalette.greenInk)
                                    .padding(8)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(CleavePalette.greenBg, in: RoundedRectangle(cornerRadius: 6))
                            case .failure(let fail):
                                Text("\(fail.code.rawValue): \(fail.reason)")
                                    .font(.system(size: 11.5, weight: .medium))
                                    .foregroundStyle(CleavePalette.redInk)
                                    .padding(8)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(CleavePalette.redBg, in: RoundedRectangle(cornerRadius: 6))
                            }
                        }
                    }
                }
                .padding(10)
                .background(CleavePalette.recessed, in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Offline Triage Card

    private func offlineTriageCard(text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                CleavePillTag("OFFLINE_LOCAL_TRIAGE · ON-DEVICE", tone: .yellow)
                Spacer()
                Text("0 HTTP · \(String(format: "%.1fs", Double(vm.offlineLatencyMs) / 1000.0))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(CleavePalette.inkMuted)
            }
            Text(text)
                .font(.system(size: 13.5))
                .foregroundStyle(CleavePalette.inkBody)
                .lineSpacing(4)
        }
        .editorialCard()
    }

    // MARK: - Policy Results & Re-Joined Draft

    @ViewBuilder
    private var resultsSection: some View {
        if let analysis = vm.cloudAnalysis, let joined = vm.rejoinedDraft {
            VStack(alignment: .leading, spacing: 14) {
                if vm.isResultStale {
                    HStack {
                        Text("What gets sent has changed since this result.")
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(CleavePalette.yellowInk)
                        Spacer()
                        Button("Re-Run") {
                            Task { await vm.matchClauseInCloud() }
                        }
                        .buttonStyle(CleaveSecondaryButtonStyle())
                        .disabled(vm.analyzingCloud || vm.customEocBlocked)
                    }
                    .padding(12)
                    .background(CleavePalette.yellowBg, in: RoundedRectangle(cornerRadius: 10))
                }

                // Denial Sentence vs. Cited Policy Clause
                VStack(alignment: .leading, spacing: 12) {
                    CleavePillTag("FROM LOCAL LETTER (NEVER UPLOADED)", tone: .green)
                    Text("Insurer's Denial Sentence")
                        .font(.system(size: 18, weight: .regular, design: .serif))
                        .foregroundStyle(CleavePalette.inkPrimary)
                    Text(DeterministicGate.extractDenialSentenceLocally(vm.rawLetter))
                        .font(.system(size: 13.5))
                        .foregroundStyle(CleavePalette.inkBody)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(CleavePalette.recessed, in: RoundedRectangle(cornerRadius: 8))
                }
                .editorialCard()

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        CleavePillTag(
                            analysis.modeUsed == "POLICY_MATCHED"
                                ? "Matched your plan · Section \(analysis.citedClauseId)"
                                : "General guidance · no plan section",
                            tone: analysis.modeUsed == "POLICY_MATCHED" ? .blue : .yellow
                        )
                        Spacer()
                        CleavePillTag(
                            exceptionLabel(analysis.exceptionApplies),
                            tone: analysis.exceptionApplies == "YES"
                                ? .green
                                : (analysis.exceptionApplies == "CONDITIONAL" ? .yellow : .red)
                        )
                    }

                    Text(
                        analysis.citedClauseQuote.isEmpty
                            ? "General Guidance"
                            : "What Your Plan Says (Section \(analysis.citedClauseId))"
                    )
                    .font(.system(size: 18, weight: .regular, design: .serif))
                    .foregroundStyle(CleavePalette.inkPrimary)

                    if !analysis.citedClauseQuote.isEmpty {
                        Text("\"\(analysis.citedClauseQuote)\"")
                            .font(.system(size: 13.5, design: .serif))
                            .italic()
                            .foregroundStyle(CleavePalette.inkPrimary)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(CleavePalette.blueBg.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
                    }

                    Text(analysis.plainExplanation)
                        .font(.system(size: 13.5))
                        .foregroundStyle(CleavePalette.inkBody)
                        .lineSpacing(3)

                    Text("Checked what was sent: 0 of your personal details in \(vm.cloudBytesSent) bytes.")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(CleavePalette.inkMuted)
                }
                .editorialCard()

                // Interactive Confirmation Checklist (No-Fabrication Discipline)
                if analysis.needsPatientConfirmation && !analysis.confirmationItems.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        CleavePillTag(
                            analysis.modeUsed == "POLICY_MATCHED" ? "Needs your confirmation" : "Next steps without your plan",
                            tone: .yellow
                        )
                        Text(
                            analysis.modeUsed == "POLICY_MATCHED"
                                ? "Confirm Unresolved Facts Before Sending"
                                : "What to Check Before Filing"
                        )
                        .font(.system(size: 18, weight: .regular, design: .serif))
                        .foregroundStyle(CleavePalette.yellowInk)

                        ForEach(Array(analysis.confirmationItems.enumerated()), id: \.offset) { idx, item in
                            if analysis.modeUsed == "POLICY_MATCHED" {
                                let checked = vm.confirmedIndices.contains(idx)
                                Button {
                                    vm.toggleConfirmation(idx)
                                } label: {
                                    HStack(alignment: .top, spacing: 10) {
                                        Image(systemName: checked ? "checkmark.square.fill" : "square")
                                            .foregroundStyle(CleavePalette.yellowInk)
                                            .font(.system(size: 17))
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(item.question)
                                                .font(.system(size: 13, weight: .semibold))
                                                .foregroundStyle(CleavePalette.inkPrimary)
                                            Text("Inserts: \"\(item.draftStatement)\"")
                                                .font(.system(size: 11.5))
                                                .foregroundStyle(CleavePalette.inkMuted)
                                        }
                                    }
                                    .multilineTextAlignment(.leading)
                                    .padding(10)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(CleavePalette.surface, in: RoundedRectangle(cornerRadius: 8))
                                }
                                .buttonStyle(.plain)
                            } else {
                                Text("• \(item.question)")
                                    .font(.system(size: 13))
                                    .foregroundStyle(CleavePalette.inkPrimary)
                            }
                        }
                    }
                    .padding(16)
                    .background(CleavePalette.yellowBg, in: RoundedRectangle(cornerRadius: 12))
                }

                // Editable Locally Re-Joined Draft
                VStack(alignment: .leading, spacing: 10) {
                    CleavePillTag(
                        joined.orphanPlaceholders.isEmpty ? "Filled in on this device" : "\(joined.orphanPlaceholders.count) blanks left to fill",
                        tone: joined.orphanPlaceholders.isEmpty ? .green : .yellow
                    )
                    Text("Your Appeal Draft")
                        .font(.system(size: 20, weight: .regular, design: .serif))
                        .foregroundStyle(CleavePalette.inkPrimary)

                    Text("The cloud wrote this with blanks like [MEMBER_NAME]; your iPhone filled in \(joined.rejoinedTokens.count) personal details. Edit freely before sending.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(CleavePalette.inkMuted)

                    TextEditor(text: $vm.editableDraft)
                        .font(.system(size: 13))
                        .frame(minHeight: 200)
                        .padding(10)
                        .background(CleavePalette.recessed, in: RoundedRectangle(cornerRadius: 8))

                    HStack(spacing: 10) {
                        Button(vm.copiedToast ? "Copied" : "Copy Draft") {
                            vm.copyDraft()
                        }
                        .buttonStyle(CleavePrimaryButtonStyle())

                        ShareLink(item: vm.editableDraft) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(CleaveSecondaryButtonStyle())

                        Spacer()
                    }
                }
                .editorialCard()
            }
        }
    }

    private var footerNote: some View {
        Text("Cleave is an administrative policy-clause review tool, not legal or medical advice. Native iOS 27 twin powered by Apple Foundation Models + FirebaseAILogic.")
            .font(.system(size: 11.5))
            .foregroundStyle(CleavePalette.inkMuted)
            .padding(.top, 6)
            .padding(.bottom, 20)
    }
}

struct WireProofSheet: View {
    @ObservedObject var vm: CleaveViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(
                        vm.totalLeaksAcrossSession == 0
                            ? "Verified: 0 of \(vm.sessionVaultSecrets.count) local vault identifiers detected across \(vm.cloudRequestCount) FirebaseAILogic cloud request(s)."
                            : "Warning: \(vm.totalLeaksAcrossSession) leak(s) detected."
                    )
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(vm.totalLeaksAcrossSession == 0 ? CleavePalette.greenInk : CleavePalette.redInk)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        vm.totalLeaksAcrossSession == 0 ? CleavePalette.greenBg : CleavePalette.redBg,
                        in: RoundedRectangle(cornerRadius: 8)
                    )

                    ForEach(vm.wireLog.reversed()) { entry in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(entry.stepName)
                                    .font(.system(size: 13.5, weight: .semibold))
                                    .foregroundStyle(CleavePalette.inkPrimary)
                                Spacer()
                                CleavePillTag(
                                    entry.isCloud ? "\(entry.bytesSent) B" : "0 HTTP",
                                    tone: entry.isCloud ? .blue : .green
                                )
                            }
                            Text("\(entry.caseLabel) · \(entry.runtimeLabel) · \(entry.latencyMs) ms")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(CleavePalette.inkMuted)
                            Text(entry.note)
                                .font(.system(size: 12.5))
                                .foregroundStyle(CleavePalette.inkBody)
                            Text(entry.outboundJSON)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(CleavePalette.inkBody)
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(CleavePalette.recessed, in: RoundedRectangle(cornerRadius: 6))
                        }
                        .editorialCard()
                    }
                }
                .padding(16)
            }
            .background(CleavePalette.canvas)
            .navigationTitle("Wire Proof Audit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
