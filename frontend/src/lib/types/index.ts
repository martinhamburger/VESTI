// ============================================================
// --- types/index.ts ---
// All interface definitions for Vesti (kept in sync with frontend)
// ============================================================

import type { AstRoot, AstVersion } from "./ast";

export type Platform =
  | "ChatGPT"
  | "Claude"
  | "Gemini"
  | "DeepSeek"
  | "Qwen"
  | "Doubao"
  | "Kimi"
  | "Yuanbao";

export interface Topic {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: number;
  updated_at: number;
  count?: number;
  children?: Topic[];
}

export interface GardenerStep {
  step: string;
  status: "pending" | "running" | "completed";
  details?: string;
}

export interface GardenerResult {
  tags: string[];
  matchedTopic?: Topic;
  createdTopic?: Topic;
  steps: GardenerStep[];
}

export interface Conversation {
  id: number;
  uuid: string;
  platform: Platform;
  title: string;
  snippet: string;
  url: string;
  source_created_at: number | null;
  first_captured_at: number;
  last_captured_at: number;
  created_at: number;
  updated_at: number;
  message_count: number;
  turn_count: number;
  is_archived: boolean;
  is_trash: boolean;
  tags: string[];
  topic_id: number | null;
  is_starred: boolean;
  has_note?: boolean;
}

export interface SearchConversationMatchesQuery {
  query: string;
  conversationIds?: number[];
}

export interface ConversationMatchSummary {
  conversationId: number;
  firstMatchedMessageId: number;
  bestExcerpt: string;
}

export interface VectorRecord {
  id?: number;
  conversation_id: number;
  text_hash: string;
  embedding: Float32Array;
}

export interface RelatedConversation {
  id: number;
  title: string;
  platform: Platform;
  similarity: number;
}

export type ExploreMode = "search" | "ask";

export type ExploreSearchScopeMode = "all" | "selected";

export interface ExploreSearchScope {
  mode: ExploreSearchScopeMode;
  conversationIds?: number[];
}

export interface ExploreAskOptions {
  searchScope?: ExploreSearchScope;
}

export type ExploreIntentType =
  | "fact_lookup"
  | "cross_conversation_summary"
  | "weekly_review"
  | "timeline"
  | "clarification_needed";

export type ExploreRequestedTimeScopePreset =
  | "none"
  | "current_week_to_date"
  | "last_7_days"
  | "last_full_week"
  | "custom";

export interface ExploreRequestedTimeScope {
  preset: ExploreRequestedTimeScopePreset;
  label?: string;
  startDate?: string;
  endDate?: string;
}

export interface ExploreResolvedTimeScope {
  preset: Exclude<ExploreRequestedTimeScopePreset, "none">;
  label: string;
  rangeStart: number;
  rangeEnd: number;
  startDate: string;
  endDate: string;
}

export type ExplorePlannerPath = "rag" | "weekly_summary" | "clarify";

export type ExploreToolName =
  | "intent_router"
  | "time_scope_resolver"
  | "weekly_summary_tool"
  | "query_planner"
  | "search_rag"
  | "summary_tool"
  | "context_compiler"
  | "answer_synthesizer";

export type ExploreToolStatus = "completed" | "failed" | "skipped";

export interface ExploreToolCall {
  id: string;
  name: ExploreToolName;
  status: ExploreToolStatus;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  description?: string;
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
}

export interface ExploreContextCandidate {
  conversationId: number;
  title: string;
  platform: Platform;
  similarity: number;
  matchType?: "semantic" | "time_scope" | "capsule" | "lexical" | "window";
  selectionReason?: string;
  summarySnippet?: string;
  excerpt?: string;
}

export type RetrievalAssetState =
  | "missing"
  | "building"
  | "ready"
  | "stale"
  | "failed";

export type RetrievalQueryClass =
  | "engineering_exact"
  | "time_or_summary"
  | "general_semantic";

export type RetrievalFollowupType =
  | "refine"
  | "compare"
  | "continue"
  | "drill_down";

export interface EvidenceRefV1 {
  conversationId: number;
  windowId: string;
  messageStartId?: number;
  messageEndId?: number;
}

export interface CapsuleEvidenceItemV1 {
  text: string;
  evidenceRefs: EvidenceRefV1[];
}

export interface ConversationCapsuleRefsV1 {
  filePaths: string[];
  commands: string[];
  apis: string[];
  hosts: string[];
  urls: string[];
}

export interface ConversationArtifactV1 {
  kind: string;
  label: string;
  refs?: string[];
}

export interface ConversationCapsuleStatsV1 {
  messageCount: number;
  windowCount: number;
  hasCode: boolean;
  hasArtifacts: boolean;
  lastMessageAt?: number;
}

export interface ConversationCapsuleV1 {
  conversationId: number;
  sourceUpdatedAt: number;
  sourceHash: string;
  title?: string;
  shortSummary: string;
  coreQuestion?: string;
  keywords: string[];
  entities?: string[];
  tags?: string[];
  decisions: CapsuleEvidenceItemV1[];
  openQuestions: CapsuleEvidenceItemV1[];
  actionItems: CapsuleEvidenceItemV1[];
  refs: ConversationCapsuleRefsV1;
  artifacts: ConversationArtifactV1[];
  stats: ConversationCapsuleStatsV1;
  createdAt: number;
  updatedAt: number;
}

export type EvidenceWindowLabel =
  | "code"
  | "command-heavy"
  | "error-heavy"
  | "artifact-heavy"
  | "decision-labeled"
  | "question-answer-adjacent"
  | "topic-shift"
  | "citation-heavy";

export interface EvidenceWindowV1 {
  id: string;
  conversationId: number;
  sourceHash: string;
  windowIndex: number;
  messageStartId?: number;
  messageEndId?: number;
  text: string;
  tokenEstimate: number;
  labels: EvidenceWindowLabel[];
  lexicalTerms: string[];
  artifactRefs: string[];
  hasCode: boolean;
  hasCommand: boolean;
  hasErrorLikeText: boolean;
  createdAt: number;
}

export interface RetrievalAssetStatusV1 {
  conversationId: number;
  sourceHash: string;
  sourceUpdatedAt: number;
  state: RetrievalAssetState;
  capsuleUpdatedAt?: number;
  lastBuiltAt?: number;
  windowCount: number;
  windowVectorCount: number;
  error?: string;
}

export interface RetrievalDiagnosticsSnapshot {
  capsuleReadyCount: number;
  windowReadyCount: number;
  staleCount: number;
  failedCount: number;
  totalCapsules: number;
  totalWindows: number;
  capsuleReadyRatio: number;
  windowReadyRatio: number;
  lastBuildAt: number | null;
  lastRetrievalRoute?: string;
  averageBundleWindows: number;
}

export interface QueryRewriteHintsV1 {
  standaloneQuery: string;
  preservedTerms: string[];
  expandedTerms?: string[];
  inferredEntities?: string[];
  inferredTimeScope?: string;
  followupType?: RetrievalFollowupType;
}

export interface EvidenceBundleConversationV1 {
  conversationId: number;
  title: string;
  platform: Platform;
  score: number;
  matchType: "capsule" | "lexical" | "dense" | "exact_ref";
  shortSummary?: string;
  keywords?: string[];
  sourceHash?: string;
}

export interface EvidenceBundleWindowV1 extends EvidenceWindowV1 {
  score: number;
  lexicalScore: number;
  denseScore: number;
  structurePrior: number;
  freshnessPrior: number;
  conversationTitle: string;
  platform: Platform;
}

export interface EvidenceBundleGroupV1 {
  conversationId: number;
  title: string;
  platform: Platform;
  score: number;
  windowIds: string[];
}

export interface EvidenceBundleAssetStatusV1 {
  scopedConversationCount: number;
  readyConversationCount: number;
  staleConversationIds: number[];
  missingConversationIds: number[];
}

export interface EvidenceBundleSynthesisHintsV1 {
  stablePrefix: string;
  evidenceOrdering: "score_desc";
  recommendedWindowCount: number;
}

export interface EvidenceBundleV1 {
  query: string;
  queryHash: string;
  queryClass: RetrievalQueryClass;
  searchScope: ExploreSearchScope;
  rewriteHints: QueryRewriteHintsV1;
  generatedAt: number;
  assetVersion: "retrieval_assets_v1";
  conversations: EvidenceBundleConversationV1[];
  windows: EvidenceBundleWindowV1[];
  groupedEvidence: EvidenceBundleGroupV1[];
  synthesisHints: EvidenceBundleSynthesisHintsV1;
  assetStatus: EvidenceBundleAssetStatusV1;
}

export interface RetrievalMetaV1 {
  retrievalVersion: "retrieval_assets_v1";
  queryClass: RetrievalQueryClass;
  route: "deterministic_rag" | "weekly_summary" | "local_fallback";
  bundleId: string;
  queryHash: string;
  candidateConversationIds: number[];
  selectedWindowIds: string[];
  assetStatus: EvidenceBundleAssetStatusV1;
  llmCalls: number;
}

export interface ExploreRouteSummary {
  mode: ExploreMode;
  routeLabel: string;
  evidenceCount: number;
  scopeLabel: string;
  llmCalls: number;
  timeScopeLabel?: string;
}

export type VerificationClaimVerdict =
  | "supported"
  | "partially_supported"
  | "unsupported"
  | "contradicted"
  | "not_enough_evidence";

export interface VerificationClaimV1 {
  claimId: string;
  text: string;
  verdict: VerificationClaimVerdict;
  confidence: number;
  evidenceRefs: EvidenceRefV1[];
  missingEvidence?: string[];
  contradictionNotes?: string[];
  riskLevel: "low" | "medium" | "high";
  failureType?:
    | "retrieval_miss"
    | "reasoning_jump"
    | "summary_drift"
    | "citation_mismatch";
}

export interface VerificationResultV1 {
  overallVerdict: "supported" | "partially_supported" | "unsupported" | "contradicted";
  overallConfidence: number;
  claims: VerificationClaimV1[];
  answerDiagnostics: {
    supportedClaims: number;
    unsupportedClaims: number;
    contradictedClaims: number;
    criticalUnsupportedClaims: number;
    coverageRatio: number;
  };
  block: boolean;
}

export interface ExploreRouteDecision {
  intent: ExploreIntentType;
  reason: string;
  preferredPath: ExplorePlannerPath;
  sourceLimit: number;
  needsClarification?: boolean;
  clarifyingQuestion?: string;
  requestedTimeScope?: ExploreRequestedTimeScope;
  resolvedTimeScope?: ExploreResolvedTimeScope;
  toolPlan?: ExploreToolName[];
}

export type ExploreAgentPlan = ExploreRouteDecision;

export interface ExploreInspectMeta {
  mode: ExploreMode;
  query?: string;
  searchScope?: ExploreSearchScope;
  routeDecision?: ExploreRouteDecision;
  toolCalls: ExploreToolCall[];
  retrievalMeta?: RetrievalMetaV1;
  evidenceBrief?: string;
  contextCandidates?: ExploreContextCandidate[];
  selectedContextConversationIds?: number[];
  totalDurationMs?: number;
  routeSummary?: ExploreRouteSummary;
  // Legacy aliases kept for persisted Explore records.
  plan?: ExploreRouteDecision;
  contextDraft?: string;
}

export type ExploreAgentMeta = ExploreInspectMeta;

export interface RagResponse {
  answer: string;
  sources: RelatedConversation[];
  inspect?: ExploreInspectMeta;
  agent?: ExploreInspectMeta;
  retrievalMeta?: RetrievalMetaV1;
  assetStatus?: EvidenceBundleAssetStatusV1;
  bundleId?: string;
  queryHash?: string;
}

export interface ExploreSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExploreMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  sources?: RelatedConversation[];
  inspectMeta?: ExploreInspectMeta;
  agentMeta?: ExploreInspectMeta;
  timestamp: number;
}

export type MessageCitationSourceType =
  | "inline_pill"
  | "search_card"
  | "reference_list"
  | "unknown";

export interface MessageCitation {
  label: string;
  href: string;
  host: string;
  sourceType: MessageCitationSourceType;
}

export type MessageArtifactKind =
  | "canvas"
  | "preview"
  | "code_artifact"
  | "download_card"
  | "standalone_artifact"
  | "unknown";

export type MessageArtifactCaptureMode =
  | "presence_only"
  | "embedded_dom_snapshot"
  | "standalone_artifact";

export interface MessageArtifact {
  kind: MessageArtifactKind;
  label?: string;
  captureMode?: MessageArtifactCaptureMode;
  renderDimensions?: { width: number; height: number };
  plainText?: string;
  markdownSnapshot?: string;
  normalizedHtmlSnapshot?: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "ai";
  content_text: string;
  content_ast?: AstRoot | null;
  content_ast_version?: AstVersion | null;
  degraded_nodes_count?: number;
  citations?: MessageCitation[];
  artifacts?: MessageArtifact[];
  normalized_html_snapshot?: string | null;
  created_at: number;
}

export interface Annotation {
  id: number;
  conversation_id: number;
  message_id: number;
  content_text: string;
  created_at: number;
  days_after: number;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  linked_conversation_ids: number[];
}

export interface DashboardStats {
  totalConversations: number;
  totalTokens: number;
  firstCaptureStreak: number;
  firstCapturedTodayCount: number;
  platformDistribution: Record<Platform, number>;
  firstCaptureHeatmapData: { date: string; count: number }[];
}

export type ExportFormat = "json" | "txt" | "md";

export interface ExportPayload {
  content: string;
  mime: string;
  filename: string;
}

export type StorageUsageStatus = "ok" | "warning" | "blocked";

export interface StorageUsageSnapshot {
  originUsed: number;
  originQuota: number | null;
  localUsed: number;
  unlimitedStorageEnabled: boolean;
  softLimit: number;
  hardLimit: number;
  status: StorageUsageStatus;
}

export interface DataOverviewSnapshot {
  storage: StorageUsageSnapshot;
  totalConversations: number;
  compactedThreads: number;
  summaryRecordCount: number;
  weeklyReportCount: number;
  lastCompactionAt: number | null;
  indexedDbName: string;
  retrievalDiagnostics?: RetrievalDiagnosticsSnapshot;
}

export type CapsuleState = "RECORDING" | "STANDBY" | "PAUSED" | "SAVED";

export type CaptureMode = "mirror" | "smart" | "manual";

export interface CaptureSettings {
  mode: CaptureMode;
  smartConfig: {
    minTurns: number;
    blacklistKeywords: string[];
  };
}

export type CaptureDecision = "committed" | "held" | "rejected";

export type CaptureDecisionReason =
  | "missing_conversation_id"
  | "force_archive"
  | "mode_mirror"
  | "mode_manual_hold"
  | "smart_below_min_turns"
  | "smart_keyword_blocked"
  | "smart_pass"
  | "empty_payload"
  | "storage_limit_blocked"
  | "persist_failed";

export interface CaptureDecisionMeta {
  mode: CaptureMode;
  decision: CaptureDecision;
  reason: CaptureDecisionReason;
  messageCount: number;
  turnCount: number;
  blacklistHit: boolean;
  forceFlag: boolean;
  intercepted: boolean;
  occurredAt: number;
}

export type ActiveCaptureStatusReason =
  | "ok"
  | "mode_mirror"
  | "unsupported_tab"
  | "no_transient"
  | "content_unreachable";

export interface ActiveCaptureStatus {
  mode: CaptureMode;
  supported: boolean;
  available: boolean;
  reason: ActiveCaptureStatusReason;
  platform?: Platform;
  sessionUUID?: string;
  transientKey?: string;
  messageCount?: number;
  turnCount?: number;
  lastDecision?: CaptureDecisionMeta;
  firstObservedAt?: number;
  updatedAt?: number;
}

export interface ForceArchiveTransientResult {
  forced: true;
  saved: boolean;
  newMessages: number;
  conversationId?: number;
  decision: CaptureDecisionMeta;
}

export type PageId = "timeline" | "insights" | "data" | "settings";
export type UiThemeMode = "light" | "dark";

export interface UiSettings {
  themeMode: UiThemeMode;
}

export type NotionAuthMode = "disconnected" | "oauth_public" | "legacy_manual";

export interface NotionSettings {
  authMode: NotionAuthMode;
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  selectedDatabaseId: string;
  selectedDatabaseTitle: string;
  updatedAt: number;
}

export interface NotionDatabaseOption {
  id: string;
  title: string;
  url?: string;
}

export type UiSemanticLayer = "app_shell" | "artifact_content";
export type TypographySemantic = "ui_sans" | "reading_serif";
export type VisualDensityMode = "guardrail_v1_1" | "target_v1_2";

export type LlmProvider = "modelscope";
export type LlmAccessMode = "demo_proxy" | "custom_byok";
export type StreamMode = "off" | "on";
export type ReasoningPolicy = "off" | "auto" | "force";
export type CapabilitySource = "model_id_heuristic" | "provider_catalog";
export type ThinkHandlingPolicy = "strip" | "keep_debug" | "keep_raw";

export interface LlmConfig {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  updatedAt: number;
  mode?: LlmAccessMode;
  proxyBaseUrl?: string;
  proxyUrl?: string;
  proxyServiceToken?: string;
  gatewayLock?: "modelscope";
  customModelId?: string;
  streamMode?: StreamMode;
  reasoningPolicy?: ReasoningPolicy;
  capabilitySource?: CapabilitySource;
  thinkHandlingPolicy?: ThinkHandlingPolicy;
}

export type InsightFormat = "plain_text" | "structured_v1" | "fallback_plain_text";
export type InsightStatus = "ok" | "fallback";

export interface ConversationSummaryV1 {
  topic_title: string;
  key_takeaways: string[];
  sentiment: "neutral" | "positive" | "negative";
  action_items?: string[];
  tech_stack_detected: string[];
}

export interface ConversationSummaryV2 {
  core_question: string;
  thinking_journey: Array<{
    step: number;
    speaker: "User" | "AI";
    assertion: string;
    real_world_anchor: string | null;
  }>;
  key_insights: Array<{
    term: string;
    definition: string;
  }>;
  unresolved_threads: string[];
  meta_observations: {
    thinking_style: string;
    emotional_tone: string;
    depth_level: "superficial" | "moderate" | "deep";
  };
  actionable_next_steps: string[];
}

export interface ConversationSummaryV2Legacy {
  core_question: string;
  thinking_journey: {
    initial_state: string;
    key_turns: string[];
    final_understanding: string;
  };
  key_insights: string[];
  unresolved_threads: string[];
  meta_observations: {
    thinking_style: string;
    emotional_tone: string;
    depth_level: "superficial" | "moderate" | "deep";
  };
  actionable_next_steps: string[];
}

export interface WeeklyReportV1 {
  period_title: string;
  main_themes: string[];
  key_takeaways: string[];
  action_items?: string[];
  tech_stack_detected: string[];
}

export interface WeeklyLiteReportV1 {
  time_range: {
    start: string;
    end: string;
    total_conversations: number;
  };
  highlights: string[];
  recurring_questions: string[];
  cross_domain_echoes: Array<{
    domain_a: string;
    domain_b: string;
    shared_logic: string;
    evidence_ids: number[];
  }>;
  unresolved_threads: string[];
  suggested_focus: string[];
  evidence: Array<{
    conversation_id: number;
    note: string;
  }>;
  insufficient_data: boolean;
}

export interface SummaryRecord {
  id: number;
  conversationId: number;
  content: string;
  structured?:
    | ConversationSummaryV1
    | ConversationSummaryV2
    | ConversationSummaryV2Legacy
    | null;
  format?: InsightFormat;
  status?: InsightStatus;
  schemaVersion?: "conversation_summary.v1" | "conversation_summary.v2";
  modelId: string;
  createdAt: number;
  sourceUpdatedAt: number;
  sourceHash?: string;
}

export interface WeeklyReportRecord {
  id: number;
  rangeStart: number;
  rangeEnd: number;
  content: string;
  structured?: WeeklyReportV1 | WeeklyLiteReportV1 | null;
  format?: InsightFormat;
  status?: InsightStatus;
  schemaVersion?: "weekly_report.v1" | "weekly_lite.v1";
  modelId: string;
  createdAt: number;
  sourceHash: string;
}

export type AsyncStatus = "idle" | "loading" | "ready" | "error";
