export type RefusalCode =
  | "REFUSE_LOCAL_UNAVAILABLE"
  | "REFUSE_RAW_TEXT_BLOCKED"
  | "REFUSE_RESIDUAL_IDENTIFIER"
  | "REFUSE_CHUNK_OVERFLOW";

export interface IdentityVault {
  member_name?: string;
  dob?: string;
  member_id?: string;
  claim_id?: string;
  group_id?: string;
  address?: string;
  phone?: string;
  email?: string;
  physician?: string;
  facility_name?: string;
  notice_date?: string;
  service_date?: string;
  [extraKey: string]: string | undefined;
}

export type DenialReasonCode =
  | "MISSING_REFERRAL"
  | "MISSING_PRIOR_AUTH"
  | "MISSING_REFERRAL_AND_OON"
  | "OTHER";

export type ServiceSetting =
  | "EMERGENCY_OR_AFTER_HOURS_URGENT"
  | "OUTPATIENT_OBGYN"
  | "OUTPATIENT_BEHAVIORAL_HEALTH"
  | "ADVANCED_DIAGNOSTIC_IMAGING"
  | "POST_OP_SPECIALIST_FOLLOWUP"
  | "ELECTIVE_OUTPATIENT_SPECIALIST"
  | "UNKNOWN";

export type NetworkStatus = "IN_NETWORK" | "OUT_OF_NETWORK" | "UNKNOWN";
export type TriState = "YES" | "NO" | "NOT_MENTIONED";

export type AllowlistKey =
  | "plan_id"
  | "denial_reason_code"
  | "service_setting"
  | "after_hours_visit_confirmed"
  | "network_status"
  | "days_since_service"
  | "days_since_denial"
  | "urgency_documented"
  | "ongoing_treatment"
  | "enrollment_date_known";

export interface AllowlistProposal {
  plan_id?: string;
  denial_reason_code?: DenialReasonCode;
  service_setting?: ServiceSetting;
  after_hours_visit_confirmed?: TriState;
  network_status?: NetworkStatus;
  days_since_service?: number | null;
  days_since_denial?: number | null;
  urgency_documented?: TriState;
  ongoing_treatment?: TriState;
  enrollment_date_known?: TriState;
}

export interface AllowlistFieldMeta {
  key: AllowlistKey;
  label: string;
  shortHint: string;
  removalConsequence: string;
  kind: "code" | "enum" | "integer";
  allowed?: readonly string[];
  pattern?: RegExp;
  min?: number;
  max?: number;
}

export type GateResult =
  | {
      ok: true;
      payload: Partial<Record<AllowlistKey, string | number>>;
      serialized: string;
      droppedInvalidFields: string[];
      policyMatchEnabled: boolean;
    }
  | {
      ok: false;
      refusal: RefusalCode;
      reason: string;
      matchedSecretLength?: number;
    };

export interface PolicyClause {
  id: string;
  title: string;
  text: string;
}

export interface PlanEoc {
  plan_id: string;
  plan_name: string;
  clauses: PolicyClause[];
  /** Optional raw generic policy text when the user uploads/pastes their own Plan EOC PDF/text */
  rawPolicyText?: string;
}

export interface ConfirmationItem {
  question: string;
  draft_statement: string;
}

export interface CloudAnalysis {
  mode_used: "POLICY_MATCHED" | "GENERAL_GUIDANCE_ONLY" | "OFFLINE_LOCAL_TRIAGE";
  cited_clause_id: string;
  cited_clause_quote: string;
  exception_applies: "YES" | "CONDITIONAL" | "NO" | "UNKNOWN_NO_POLICY";
  needs_patient_confirmation: boolean;
  confirmation_items: ConfirmationItem[];
  plain_explanation: string;
  draft_request_for_review: string;
}

export interface RejoinedDraft {
  text: string;
  rejoinedTokens: Array<{ token: string; value: string }>;
  orphanPlaceholders: string[];
}

export type WireChannel = "cleave_production" | "fail_closed_lab" | "manual_baseline_eval" | "app_check";

export interface WireEntry {
  id: string;
  ts: string;
  url: string;
  method: string;
  bodyLength: number;
  bodyText: string;
  channel: WireChannel;
  caseLabel?: string;
  leakedValues?: string[];
}

export interface InferenceTrailStep {
  runId: string;
  caseLabel: string;
  step: string;
  modeRequested: "only_on_device" | "only_in_cloud" | "prefer_in_cloud" | "prefer_on_device" | "deterministic_code";
  inferenceSource: "on_device" | "in_cloud" | "local_code";
  latencyMs: number;
  httpRequests: number;
  bytesSent: number;
  note: string;
}

export interface SyntheticCaseGroundTruth {
  expected_clause: string;
  exception_applies: "YES" | "CONDITIONAL" | "NO";
  requires_patient_confirmation: boolean;
  expected_confirmation_topic: string | null;
  expected_days_since_service: number;
  expected_days_since_denial: number;
}

export interface SyntheticCase {
  id: string;
  shortTitle: string;
  title: string;
  categoryTag: string;
  plan_id: string;
  raw_letter: string;
  manual_redacted_letter: string;
  canaries: string[];
  ground_truth: SyntheticCaseGroundTruth;
}

export interface CaseScore {
  clauseMatch: boolean;
  exceptionMatch: boolean;
  confirmationMatch: boolean;
  exactPass: boolean;
}

export interface CaseEvalReport {
  id: string;
  title: string;
  canaryCount: number;
  groundTruth: SyntheticCaseGroundTruth;
  cleave: {
    status: "COMPLETED" | "FALSE_REFUSAL" | "FALSE_REFUSAL_AT_GATE" | "ERROR";
    refusal?: RefusalCode;
    reason?: string;
    localSource?: string;
    localNetworkRequests?: number;
    cloudSource?: string;
    outgoingPayload?: Partial<Record<AllowlistKey, string | number>>;
    leakedCanaries: string[];
    citedClause?: string;
    exceptionApplies?: string;
    needsConfirmation?: boolean;
    orphanPlaceholders?: string[];
    /** Planted identifiers the local vault captured (for the on-device re-join). */
    vaultCaptured?: number;
    score?: CaseScore;
  };
  manualBaseline?: {
    policyMatched: boolean;
    leakedCanaries: string[];
    citedClause: string;
    exceptionApplies: string;
    needsConfirmation: boolean;
    score: CaseScore;
  };
}

export interface SuiteEvalSummary {
  timestamp: string;
  cloudModel: string;
  totalCases: number;
  totalPlantedCanaries: number;
  completedCases: number;
  falseRefusals: number;
  validDeterministicRefusals: number;
  cleaveLeaks: number;
  cleaveClauseMatches: number;
  cleaveExactPasses: number;
  manualLeaks: number;
  manualClauseMatches: number;
  manualExactPasses: number;
  cases: CaseEvalReport[];
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}
