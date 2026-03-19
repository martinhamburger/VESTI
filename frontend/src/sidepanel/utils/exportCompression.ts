import { getPrompt } from "~lib/prompts";
import type { ExportCompressionPromptPayload } from "~lib/prompts";
import {
  FUTURE_MODELSCOPE_EXPORT_MODEL_CANDIDATES,
  FUTURE_MOONSHOT_DIRECT_EXPORT_MODEL_CANDIDATES,
  getEffectiveModelId,
} from "~lib/services/llmConfig";
import {
  getLlmModelProfile,
  type ExportPromptProfile,
} from "~lib/services/llmModelProfile";
import {
  callInference,
  getLlmDiagnostic,
  type LlmDiagnostic,
  sanitizeSummaryText,
  truncateForContext,
} from "~lib/services/llmService";
import { getLlmSettings } from "~lib/services/llmSettingsService";
import { getConversationOriginAt } from "~lib/conversations/timestamps";
import type { Conversation, Message } from "~lib/types";
import { logger } from "~lib/utils/logger";
import type {
  ConversationExportContentMode,
  ConversationExportNotice,
} from "../types/export";

export type ExportCompressionMode = Exclude<
  ConversationExportContentMode,
  "full"
>;
export type ExportCompressionRoute =
  | "current_llm_settings"
  | "moonshot_direct";
export type ExportCompressionSource = "llm" | "local_fallback";
export type ExportCompressionInvalidReasonCode =
  | "export_output_too_short"
  | "export_missing_required_headings"
  | "export_grounded_sections_insufficient"
  | "export_artifact_signal_missing";

type CompressionDialogueShape =
  | "debug_troubleshooting"
  | "architecture_tradeoff"
  | "learning_explanation"
  | "process_alignment"
  | "decision_support"
  | "general";

type CompressionScoreMode = "observe";
type CompressionClassifierSource = "rules_only" | "rules_plus_llm_review";

interface CompressionRouteWeight {
  shape: CompressionDialogueShape;
  weight: number;
}

interface CompressionSegmentObservation {
  segmentIndex: number;
  startMessageIndex: number;
  endMessageIndex: number;
  dialogueShape: CompressionDialogueShape;
  confidence: number;
}

type CompressionGateRecommendation = "none" | "suggest_fallback";

interface CompressionGateThreshold {
  quality: number;
  mssCoverage: number;
  artifactPreservation: number;
}

interface GuardedFallbackConfig {
  enabled: boolean;
  rolloutPercent: number;
  minMessages: number;
}

interface LlmStrategyReviewConfig {
  enabled: boolean;
  lowConfidenceThreshold: number;
  ambiguityDeltaThreshold: number;
  minMessages: number;
  maxTranscriptChars: number;
}

interface CompressionLlmReview {
  reviewed: boolean;
  agreed: boolean | null;
  suggestedShape?: CompressionDialogueShape;
  suggestedConfidence?: number;
  reason?: string;
  errorCode?: string;
}

export interface ConversationExportDatasetItem {
  conversation: Conversation;
  messages: Message[];
}

export interface CompressedConversationExport {
  conversation: Conversation;
  messages: Message[];
  body: string;
  mode: ExportCompressionMode;
  source: ExportCompressionSource;
  route?: ExportCompressionRoute;
  usedFallbackPrompt: boolean;
  fallbackReason?: string;
  diagnostic?: LlmDiagnostic;
  modelId?: string;
  exportPromptProfile?: ExportPromptProfile;
  primaryInvalidReason?: ExportCompressionInvalidReasonCode;
  fallbackInvalidReason?: ExportCompressionInvalidReasonCode;
  dialogueShape?: CompressionDialogueShape;
  strategyConfidence?: number;
  qualityScore?: number;
  mssCoverage?: number;
  missingMssSignals?: string[];
  scoreMode?: CompressionScoreMode;
  routeWeights?: CompressionRouteWeight[];
  segmentObservations?: CompressionSegmentObservation[];
  gateRecommendation?: CompressionGateRecommendation;
  gateReasons?: string[];
  gateThresholds?: CompressionGateThreshold;
  gateApplied?: boolean;
  guardedFallbackConfig?: GuardedFallbackConfig;
  classifierSource?: CompressionClassifierSource;
  llmReview?: CompressionLlmReview;
}

interface CompressionStrategySignals {
  questionDensity: number;
  constraintDensity: number;
  decisionDensity: number;
  unresolvedDensity: number;
  artifactDensity: number;
  bilingualMixScore: number;
}

interface CompressionStrategyPlan {
  dialogueShape: CompressionDialogueShape;
  confidence: number;
  priorities: string[];
  routeWeights: CompressionRouteWeight[];
}

interface CompressionQualityEvaluation {
  overall: number;
  mssCoverage: number;
  groundedness: number;
  artifactPreservation: number;
  pseudoStructureRate: number;
  missingSignals: string[];
}

interface ExportCompressionAdapter {
  route: ExportCompressionRoute;
  compress: (
    item: ConversationExportDatasetItem,
    mode: ExportCompressionMode
  ) => Promise<CompressedConversationExport>;
}

interface ExportCompressionValidationResult {
  valid: boolean;
  issueCode?: ExportCompressionInvalidReasonCode;
}

interface ExportCompressionFailureContext {
  route: ExportCompressionRoute;
  modelId?: string;
  exportPromptProfile?: ExportPromptProfile;
  primaryInvalidReason?: ExportCompressionInvalidReasonCode;
  fallbackInvalidReason?: ExportCompressionInvalidReasonCode;
  classifierSource?: CompressionClassifierSource;
  llmReview?: CompressionLlmReview;
}

class ExportCompressionValidationError extends Error {
  readonly context: ExportCompressionFailureContext;

  constructor(
    reason: string,
    context: ExportCompressionFailureContext
  ) {
    super(reason);
    this.name = "ExportCompressionValidationError";
    this.context = context;
  }
}

const ACTIVE_EXPORT_COMPRESSION_ROUTE: ExportCompressionRoute =
  "current_llm_settings";
const PROMPT_BUDGETS: Record<
  ExportPromptProfile,
  { primary: number; fallback: number }
> = {
  legacy_handoff_balanced: {
    primary: 14000,
    fallback: 11000,
  },
  kimi_handoff_rich: {
    primary: 18000,
    fallback: 14000,
  },
  step_flash_concise: {
    primary: 12000,
    fallback: 9000,
  },
};
const MIN_VALID_OUTPUT_LENGTH = 48;
const COMPRESSION_SCORE_MODE: CompressionScoreMode = "observe";
const GUARDED_FALLBACK_CONFIG: GuardedFallbackConfig = {
  enabled: false,
  rolloutPercent: 0,
  minMessages: 6,
};
const LLM_STRATEGY_REVIEW_CONFIG: LlmStrategyReviewConfig = {
  enabled: false,
  lowConfidenceThreshold: 0.68,
  ambiguityDeltaThreshold: 0.12,
  minMessages: 8,
  maxTranscriptChars: 6000,
};
const QUESTION_CUE =
  /(?:[?？]$|^(?:how|why|what|which|should|can|could|would|is|are|do|does|did|where|when|whether|how do|how should|what should|如何|为什么|为何|怎么|是否|能否|需不需要|应该|要不要))/i;
const CONSTRAINT_CUE =
  /(?:\b(?:must|should|need to|needs to|avoid|without|only|do not|don't|keep|preserve|require|strict|cannot|can't|leave room|whitelist)\b|必须|不要|不能|保持|保留|避免|仅|只|不改|不引入|继续|白名单|兼容|默认|要求)/i;
const DECISION_CUE =
  /(?:\b(?:use|keep|switch|prefer|decide|decided|choose|adopt|implement|fix|route|fallback|preserve|drop|align|lock|ship|merge|split|stage|replace|reuse|extend|support|move|toggle|prune)\b|保留|改为|改成|采用|决定|锁定|使用|对齐|修复|切换|收口|合并|提交|复用|扩展|支持|替换|接入)/i;
const UNRESOLVED_CUE =
  /(?:\b(?:todo|next|follow[- ]?up|remaining|still need|not yet|later|future|pending|verify|validate|check|smoke|manual|open question|unresolved|left to do|needs follow-up)\b|后续|下一步|仍需|尚未|待|未来|验证|检查|手测|未解决|继续推进|留到后续)/i;
const PATH_PATTERN =
  /(?:[A-Za-z]:\\[^\s`"')]+|(?:\.?\.?(?:\/|\\))?(?:[\w.-]+(?:\/|\\))+[\w./\\-]*[\w-]+(?:\.[A-Za-z0-9]+)?)/g;
const COMMAND_PATTERN =
  /(?:^|\s)(?:pnpm|npm|git|node|python|pytest|rg|gh|curl|yarn|tsx|ts-node)\b[^\n]*/gim;
const API_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\([^()\n]{0,80}\)/g;
const BACKTICK_PATTERN = /`[^`\n]{2,120}`/g;
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const PLACEHOLDER_PATTERNS = [
  /no .*captured/i,
  /no .*available/i,
  /none grounded/i,
  /none available/i,
  /fallback-local/i,
  /local fallback/i,
  /not enabled/i,
  /unknown$/i,
  /未(?:明确|捕获|提供|出现|记录)/,
  /无(?:可用|明确|复用)/,
] as const;
const EXPECTED_HEADINGS: Record<ExportCompressionMode, string[]> = {
  compact: [
    "## Background",
    "## Key Questions",
    "## Decisions And Answers",
    "## Reusable Artifacts",
    "## Unresolved",
  ],
  summary: [
    "## TL;DR",
    "## Problem Frame",
    "## Important Moves",
    "## Reusable Snippets",
    "## Next Steps",
    "## Tags",
  ],
};

const GATE_THRESHOLDS_BY_SHAPE: Record<CompressionDialogueShape, CompressionGateThreshold> = {
  debug_troubleshooting: { quality: 0.72, mssCoverage: 0.7, artifactPreservation: 1 },
  architecture_tradeoff: { quality: 0.68, mssCoverage: 0.65, artifactPreservation: 0.8 },
  learning_explanation: { quality: 0.64, mssCoverage: 0.6, artifactPreservation: 0 },
  process_alignment: { quality: 0.62, mssCoverage: 0.6, artifactPreservation: 0 },
  decision_support: { quality: 0.64, mssCoverage: 0.62, artifactPreservation: 0 },
  general: { quality: 0.6, mssCoverage: 0.55, artifactPreservation: 0 },
};

const MSS_RULES: Record<CompressionDialogueShape, string[]> = {
  debug_troubleshooting: [
    "questions",
    "constraints",
    "decisions",
    "artifacts",
    "unresolved",
  ],
  architecture_tradeoff: ["questions", "constraints", "decisions", "artifacts"],
  learning_explanation: ["questions", "decisions", "role_moves"],
  process_alignment: ["constraints", "decisions", "unresolved"],
  decision_support: ["questions", "constraints", "decisions", "unresolved"],
  general: ["questions", "decisions", "artifacts"],
};

const ROUTE_STATUS: Record<
  ExportCompressionRoute,
  { enabled: boolean; note: string }
> = {
  current_llm_settings: {
    enabled: true,
    note: "Shipping baseline. Reuses current Settings/llmConfig/callInference path.",
  },
  moonshot_direct: {
    enabled: false,
    note: "Dormant seam reserved for future Moonshot official API validation.",
  },
};

function hasRegexMatch(value: string, pattern: RegExp): boolean {
  const flags = pattern.flags.replace(/g/g, "");
  return new RegExp(pattern.source, flags).test(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function shorten(value: string, maxChars = 180): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
}

function toOrderedMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.created_at - b.created_at);
}

function detectLocale(): "zh" | "en" {
  if (typeof navigator === "undefined") {
    return "zh";
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function buildPromptPayload(
  item: ConversationExportDatasetItem,
  profile: ExportPromptProfile,
  plan?: CompressionStrategyPlan
): ExportCompressionPromptPayload {
  const requiredSignals = plan
    ? getRequiredSignalsFromPlan(plan)
    : MSS_RULES.general;
  return {
    conversationTitle: item.conversation.title,
    conversationPlatform: item.conversation.platform,
    conversationOriginAt: getConversationOriginAt(item.conversation),
    messages: item.messages,
    locale: detectLocale(),
    profile,
    strategyGuidance: plan
      ? {
          dialogueShape: plan.dialogueShape,
          confidence: plan.confidence,
          routeWeights: plan.routeWeights,
          priorities: plan.priorities,
          requiredSignals,
        }
      : undefined,
  };
}

function normalizeCompressionBody(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeWhitespace(value).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function stripBulletPrefix(value: string): string {
  return value.replace(/^[-*]\s+/, "").trim();
}

function countCjkChars(value: string): number {
  return (value.match(/[\u3400-\u9FFF]/g) || []).length;
}

function countAsciiWords(value: string): number {
  return (
    value.match(/[A-Za-z0-9][A-Za-z0-9+/_\-.]*/g) || []
  ).length;
}

function hasMeaningfulText(value: string): boolean {
  const compact = normalizeWhitespace(
    value.replace(/[`#>*_]/g, " ").replace(/&middot;/g, " ")
  );
  if (!compact) {
    return false;
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(compact))) {
    return false;
  }

  return (
    countCjkChars(compact) >= 4 ||
    countAsciiWords(compact) >= 3 ||
    compact.length >= 18
  );
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[。！？!?])\s*|(?<=[.!?])\s+/))
    .map((line) => stripBulletPrefix(line.trim()))
    .filter((line) => line && !line.startsWith("```"));
}

function buildStrategySignals(messages: Message[]): CompressionStrategySignals {
  const total = Math.max(messages.length, 1);
  const questions = collectQuestionCandidates(messages, 6).length;
  const constraints = collectConstraintLines(messages, 6).length;
  const decisions = collectDecisionLines(messages, 8).length;
  const unresolved = collectUnresolvedLines(messages, 6).length;
  const transcript = messages.map((message) => message.content_text).join("\n");
  const asciiWords = countAsciiWords(transcript);
  const cjkChars = countCjkChars(transcript);
  const artifactSignal = detectArtifactSignals(messages);
  const artifactDensity =
    [
      artifactSignal.hasCode,
      artifactSignal.hasCommand,
      artifactSignal.hasPath,
      artifactSignal.hasApi,
    ].filter(Boolean).length / 4;

  return {
    questionDensity: clamp01(questions / total),
    constraintDensity: clamp01(constraints / total),
    decisionDensity: clamp01(decisions / total),
    unresolvedDensity: clamp01(unresolved / total),
    artifactDensity,
    bilingualMixScore:
      asciiWords > 0 && cjkChars > 0
        ? clamp01(Math.min(asciiWords / 120, cjkChars / 220))
        : 0,
  };
}

function toRouteWeights(
  scoreMap: Record<CompressionDialogueShape, number>
): CompressionRouteWeight[] {
  const entries = Object.entries(scoreMap) as Array<
    [CompressionDialogueShape, number]
  >;
  const total = entries.reduce((sum, [, score]) => sum + Math.max(score, 0), 0);
  if (total <= 0) {
    return [{ shape: "general", weight: 1 }];
  }
  return entries
    .map(([shape, score]) => ({
      shape,
      weight: Number((Math.max(score, 0) / total).toFixed(4)),
    }))
    .sort((a, b) => b.weight - a.weight);
}

function buildShapeScoreMap(
  signals: CompressionStrategySignals
): Record<CompressionDialogueShape, number> {
  const map: Record<CompressionDialogueShape, number> = {
    debug_troubleshooting:
      signals.artifactDensity * 0.34 +
      signals.unresolvedDensity * 0.24 +
      signals.decisionDensity * 0.22 +
      signals.constraintDensity * 0.2,
    architecture_tradeoff:
      signals.decisionDensity * 0.36 +
      signals.constraintDensity * 0.28 +
      signals.questionDensity * 0.22 +
      signals.artifactDensity * 0.14,
    learning_explanation:
      signals.questionDensity * 0.44 +
      signals.decisionDensity * 0.26 +
      (1 - signals.artifactDensity) * 0.18 +
      signals.bilingualMixScore * 0.12,
    process_alignment:
      signals.constraintDensity * 0.44 +
      signals.unresolvedDensity * 0.26 +
      signals.decisionDensity * 0.2 +
      signals.questionDensity * 0.1,
    decision_support:
      signals.questionDensity * 0.34 +
      signals.constraintDensity * 0.32 +
      signals.decisionDensity * 0.24 +
      signals.unresolvedDensity * 0.1,
    general:
      0.24 +
      (1 - Math.max(signals.questionDensity, signals.decisionDensity)) * 0.32 +
      signals.bilingualMixScore * 0.08,
  };

  return map;
}

function buildSegmentObservations(
  messages: Message[],
  segmentSize = 12
): CompressionSegmentObservation[] {
  const ordered = toOrderedMessages(messages);
  if (ordered.length <= segmentSize) {
    return [];
  }

  const observations: CompressionSegmentObservation[] = [];
  let segmentIndex = 0;
  for (let start = 0; start < ordered.length; start += segmentSize) {
    const end = Math.min(ordered.length, start + segmentSize);
    const segment = ordered.slice(start, end);
    const segmentPlan = buildStrategyPlan(segment);
    observations.push({
      segmentIndex,
      startMessageIndex: start,
      endMessageIndex: end - 1,
      dialogueShape: segmentPlan.dialogueShape,
      confidence: Number(segmentPlan.confidence.toFixed(3)),
    });
    segmentIndex += 1;
  }

  return observations;
}

function buildStrategyPlan(messages: Message[]): CompressionStrategyPlan {
  const signals = buildStrategySignals(messages);
  const routeWeights = toRouteWeights(buildShapeScoreMap(signals));
  const top = routeWeights[0] || { shape: "general" as const, weight: 1 };

  if (top.shape === "debug_troubleshooting") {
    return {
      dialogueShape: "debug_troubleshooting",
      confidence: clamp01(0.55 + top.weight * 0.45),
      priorities: [
        "retain_environment",
        "retain_attempt_sequence",
        "retain_artifacts",
        "retain_unresolved",
      ],
      routeWeights,
    };
  }

  if (top.shape === "architecture_tradeoff") {
    return {
      dialogueShape: "architecture_tradeoff",
      confidence: clamp01(0.52 + top.weight * 0.46),
      priorities: [
        "retain_tradeoff_matrix",
        "retain_constraints",
        "retain_decision_rationale",
        "retain_artifacts",
      ],
      routeWeights,
    };
  }

  if (top.shape === "learning_explanation") {
    return {
      dialogueShape: "learning_explanation",
      confidence: clamp01(0.5 + top.weight * 0.44),
      priorities: [
        "retain_core_concepts",
        "retain_derivation_steps",
        "retain_misconception_fixes",
      ],
      routeWeights,
    };
  }

  if (top.shape === "process_alignment") {
    return {
      dialogueShape: "process_alignment",
      confidence: clamp01(0.5 + top.weight * 0.44),
      priorities: [
        "retain_constraints",
        "retain_decisions",
        "retain_unresolved",
      ],
      routeWeights,
    };
  }

  if (top.shape === "decision_support") {
    return {
      dialogueShape: "decision_support",
      confidence: clamp01(0.5 + top.weight * 0.42),
      priorities: [
        "retain_question",
        "retain_constraints",
        "retain_alternatives",
        "retain_risks",
      ],
      routeWeights,
    };
  }

  return {
    dialogueShape: "general",
    confidence: clamp01(0.45 + top.weight * 0.35 + signals.bilingualMixScore * 0.16),
    priorities: ["retain_questions", "retain_decisions", "retain_artifacts"],
    routeWeights,
  };
}

function isRouteAmbiguous(plan: CompressionStrategyPlan): boolean {
  const first = plan.routeWeights[0]?.weight || 0;
  const second = plan.routeWeights[1]?.weight || 0;
  return first - second <= LLM_STRATEGY_REVIEW_CONFIG.ambiguityDeltaThreshold;
}

function shouldRunLlmStrategyReview(
  item: ConversationExportDatasetItem,
  plan: CompressionStrategyPlan
): boolean {
  if (!LLM_STRATEGY_REVIEW_CONFIG.enabled) {
    return false;
  }
  if (item.messages.length < LLM_STRATEGY_REVIEW_CONFIG.minMessages) {
    return false;
  }
  return (
    plan.confidence < LLM_STRATEGY_REVIEW_CONFIG.lowConfidenceThreshold ||
    isRouteAmbiguous(plan)
  );
}

function buildStrategyReviewPrompt(
  item: ConversationExportDatasetItem,
  plan: CompressionStrategyPlan
): string {
  const transcript = toOrderedMessages(item.messages)
    .map((message, index) => {
      const role = message.role === "user" ? "user" : "assistant";
      return `${index + 1}. [${role}] ${shorten(message.content_text, 240)}`;
    })
    .join("\n")
    .slice(0, LLM_STRATEGY_REVIEW_CONFIG.maxTranscriptChars);
  const topWeights = plan.routeWeights
    .slice(0, 3)
    .map((entry) => `${entry.shape}:${entry.weight.toFixed(2)}`)
    .join(", ");

  return `Review the conversation and classify dialogue shape.

Candidate shapes:
- debug_troubleshooting
- architecture_tradeoff
- learning_explanation
- process_alignment
- decision_support
- general

Current rules decision:
- dominant_shape: ${plan.dialogueShape}
- confidence: ${plan.confidence.toFixed(2)}
- top_weights: ${topWeights || "general:1.00"}

Transcript:
${transcript}

Return strict JSON only:
{"suggested_shape":"...","suggested_confidence":0.0,"reason":"..."}`;
}

function normalizeDialogueShape(value: string | undefined): CompressionDialogueShape {
  switch ((value || "").trim()) {
    case "debug_troubleshooting":
    case "architecture_tradeoff":
    case "learning_explanation":
    case "process_alignment":
    case "decision_support":
    case "general":
      return value as CompressionDialogueShape;
    default:
      return "general";
  }
}

function parseStrategyReviewResult(content: string): {
  suggestedShape: CompressionDialogueShape;
  suggestedConfidence: number;
  reason: string;
} | null {
  try {
    const parsed = JSON.parse(content) as {
      suggested_shape?: string;
      suggested_confidence?: number;
      reason?: string;
    };
    return {
      suggestedShape: normalizeDialogueShape(parsed.suggested_shape),
      suggestedConfidence: clamp01(Number(parsed.suggested_confidence ?? 0.5)),
      reason: shorten(parsed.reason || "llm_review", 180),
    };
  } catch {
    return null;
  }
}

function getSignalCandidates(
  item: ConversationExportDatasetItem,
  signal: string
): string[] {
  switch (signal) {
    case "questions":
      return collectQuestionCandidates(item.messages, 4);
    case "constraints":
      return collectConstraintLines(item.messages, 4);
    case "decisions":
      return collectDecisionLines(item.messages, 5);
    case "artifacts":
      return collectArtifactLines(item.messages, 5);
    case "unresolved":
      return collectUnresolvedLines(item.messages, 4);
    case "role_moves":
      return collectRoleAwareTurns(item.messages, 4);
    default:
      return [];
  }
}

function normalizeForMatch(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[`*_#>\-]/g, " ")
    .replace(/\s+/g, " ");
}

function isCandidateCoveredByBody(candidate: string, body: string): boolean {
  const normalizedCandidate = normalizeForMatch(candidate).replace(/[?？。.!]$/g, "");
  if (!normalizedCandidate) {
    return false;
  }
  const normalizedBody = normalizeForMatch(body);
  if (normalizedBody.includes(normalizedCandidate)) {
    return true;
  }
  const shortCandidate = normalizedCandidate.slice(0, 26).trim();
  return shortCandidate.length >= 12 && normalizedBody.includes(shortCandidate);
}

function evaluateCompressionQuality(
  body: string,
  item: ConversationExportDatasetItem,
  mode: ExportCompressionMode,
  plan: CompressionStrategyPlan
): CompressionQualityEvaluation {
  const sections = extractSections(body, mode);
  const groundedness = sections
    ? countGroundedSections(sections) / EXPECTED_HEADINGS[mode].length
    : 0;
  const pseudoStructureRate = 1 - groundedness;
  const artifactPreservation = preservesArtifactSignal(body, item.messages) ? 1 : 0;
  const requiredSignals = getRequiredSignalsFromPlan(plan);

  let eligibleSignals = 0;
  let coveredSignals = 0;
  const missingSignals: string[] = [];

  for (const signal of requiredSignals) {
    const candidates = getSignalCandidates(item, signal);
    if (candidates.length === 0) {
      continue;
    }
    eligibleSignals += 1;
    const covered = candidates.some((candidate) =>
      isCandidateCoveredByBody(candidate, body)
    );
    if (covered) {
      coveredSignals += 1;
    } else {
      missingSignals.push(signal);
    }
  }

  const mssCoverage = eligibleSignals === 0 ? 1 : coveredSignals / eligibleSignals;
  const overall = clamp01(
    mssCoverage * 0.45 + groundedness * 0.35 + artifactPreservation * 0.2
  );

  return {
    overall,
    mssCoverage,
    groundedness,
    artifactPreservation,
    pseudoStructureRate,
    missingSignals,
  };
}

function getRequiredSignalsFromPlan(plan: CompressionStrategyPlan): string[] {
  const activeShapes = plan.routeWeights
    .filter((entry, index) => index < 2 && entry.weight >= 0.2)
    .map((entry) => entry.shape);
  return unique(
    (activeShapes.length > 0 ? activeShapes : [plan.dialogueShape]).flatMap(
      (shape) => MSS_RULES[shape]
    )
  );
}

function resolveGateThreshold(plan: CompressionStrategyPlan): CompressionGateThreshold {
  const dominant = plan.routeWeights[0]?.shape || plan.dialogueShape;
  return GATE_THRESHOLDS_BY_SHAPE[dominant] || GATE_THRESHOLDS_BY_SHAPE.general;
}

function deriveGateRecommendation(
  quality: CompressionQualityEvaluation,
  plan: CompressionStrategyPlan
): {
  recommendation: CompressionGateRecommendation;
  reasons: string[];
  thresholds: CompressionGateThreshold;
} {
  const thresholds = resolveGateThreshold(plan);
  const reasons: string[] = [];

  if (quality.overall < thresholds.quality) {
    reasons.push("quality_below_threshold");
  }
  if (quality.mssCoverage < thresholds.mssCoverage) {
    reasons.push("mss_below_threshold");
  }
  if (quality.artifactPreservation < thresholds.artifactPreservation) {
    reasons.push("artifact_below_threshold");
  }

  return {
    recommendation: reasons.length > 0 ? "suggest_fallback" : "none",
    reasons,
    thresholds,
  };
}

function shouldApplyGuardedFallback(
  recommendation: CompressionGateRecommendation,
  conversationId: number,
  messageCount: number
): boolean {
  if (recommendation !== "suggest_fallback") {
    return false;
  }
  if (!GUARDED_FALLBACK_CONFIG.enabled) {
    return false;
  }
  if (messageCount < GUARDED_FALLBACK_CONFIG.minMessages) {
    return false;
  }
  return isInGuardedFallbackRollout(conversationId);
}

function isInGuardedFallbackRollout(conversationId: number): boolean {
  const rolloutPercent = Math.max(
    0,
    Math.min(100, GUARDED_FALLBACK_CONFIG.rolloutPercent)
  );
  if (rolloutPercent <= 0) {
    return false;
  }
  if (rolloutPercent >= 100) {
    return true;
  }
  const bucket = Math.abs(conversationId) % 100;
  return bucket < rolloutPercent;
}

function scoreCandidate(value: string): number {
  let score = 0;
  if (QUESTION_CUE.test(value)) score += 3;
  if (CONSTRAINT_CUE.test(value)) score += 3;
  if (DECISION_CUE.test(value)) score += 4;
  if (UNRESOLVED_CUE.test(value)) score += 3;
  if (hasRegexMatch(value, PATH_PATTERN)) score += 4;
  if (hasRegexMatch(value, COMMAND_PATTERN)) score += 4;
  if (hasRegexMatch(value, API_PATTERN) || hasRegexMatch(value, BACKTICK_PATTERN)) score += 3;
  score += Math.min(4, Math.floor(normalizeWhitespace(value).length / 32));
  return score;
}

function dedupeAndRank(values: string[], maxItems: number): string[] {
  return unique(values)
    .map((value, index) => ({
      value,
      index,
      score: scoreCandidate(value),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxItems)
    .map((entry) => entry.value);
}

function collectRoleAwareTurns(
  messages: Message[],
  maxItems = 4
): string[] {
  const ordered = toOrderedMessages(messages);
  const firstUser = ordered.find((message) => message.role === "user");
  const firstAi = ordered.find((message) => message.role === "ai");
  const latestAi = [...ordered].reverse().find((message) => message.role === "ai");
  const latestUser = [...ordered]
    .reverse()
    .find((message) => message.role === "user");

  return unique(
    [firstUser, firstAi, latestAi, latestUser]
      .filter((value): value is Message => Boolean(value))
      .map((message) => shorten(message.content_text, 220))
  ).slice(0, maxItems);
}

function collectQuestionCandidates(messages: Message[], maxItems = 3): string[] {
  const candidates = toOrderedMessages(messages)
    .filter((message) => message.role === "user")
    .flatMap((message) => splitIntoSentences(message.content_text))
    .filter((sentence) => QUESTION_CUE.test(sentence))
    .map((sentence) => shorten(sentence, 180));

  if (candidates.length === 0) {
    const firstUser = toOrderedMessages(messages).find(
      (message) => message.role === "user"
    );
    if (firstUser) {
      candidates.push(shorten(firstUser.content_text, 180));
    }
  }

  return dedupeAndRank(candidates, maxItems);
}

function collectConstraintLines(messages: Message[], maxItems = 3): string[] {
  const candidates = toOrderedMessages(messages)
    .filter((message) => message.role === "user")
    .flatMap((message) => splitIntoSentences(message.content_text))
    .filter((sentence) => CONSTRAINT_CUE.test(sentence))
    .map((sentence) => shorten(sentence, 180));

  return dedupeAndRank(candidates, maxItems);
}

function collectDecisionLines(messages: Message[], maxItems = 4): string[] {
  const ordered = toOrderedMessages(messages);
  const aiCandidates = ordered
    .filter((message) => message.role === "ai")
    .flatMap((message) => splitIntoSentences(message.content_text))
    .filter((sentence) => DECISION_CUE.test(sentence))
    .map((sentence) => shorten(sentence, 220));
  const userCandidates = ordered
    .filter((message) => message.role === "user")
    .flatMap((message) => splitIntoSentences(message.content_text))
    .filter((sentence) => DECISION_CUE.test(sentence))
    .map((sentence) => shorten(sentence, 220));

  const combined = [...aiCandidates, ...userCandidates];
  if (combined.length === 0) {
    return dedupeAndRank(
      ordered
        .filter((message) => message.role === "ai")
        .slice(-3)
        .map((message) => shorten(message.content_text, 220)),
      maxItems
    );
  }

  return dedupeAndRank(combined, maxItems);
}

function collectUnresolvedLines(messages: Message[], maxItems = 3): string[] {
  const ordered = toOrderedMessages(messages);
  const candidates = [...ordered]
    .reverse()
    .flatMap((message) => splitIntoSentences(message.content_text))
    .filter((sentence) => UNRESOLVED_CUE.test(sentence))
    .map((sentence) => shorten(sentence, 220));

  if (candidates.length === 0) {
    const lastUser = [...ordered].reverse().find((message) => message.role === "user");
    if (lastUser) {
      candidates.push(shorten(lastUser.content_text, 220));
    }
  }

  return dedupeAndRank(candidates, maxItems);
}

function collectCodeBlocks(messages: Message[], maxItems = 2): string[] {
  const snippets: string[] = [];
  for (const message of messages) {
    const matches = message.content_text.match(CODE_BLOCK_PATTERN) || [];
    for (const block of matches) {
      const inner = block
        .replace(/```[a-zA-Z0-9_-]*\s*/, "")
        .replace(/```$/, "")
        .trim();
      if (!inner) continue;
      const firstLines = inner
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(" | ");
      if (firstLines) {
        snippets.push(`Code: \`${shorten(firstLines, 140)}\``);
      }
    }
  }

  return dedupeAndRank(snippets, maxItems);
}

function collectFilePathLines(messages: Message[], maxItems = 4): string[] {
  const matches: string[] = [];
  for (const message of messages) {
    for (const found of message.content_text.match(PATH_PATTERN) || []) {
      if (!/[\\/.]/.test(found)) continue;
      matches.push(`Path: ${shorten(found, 140)}`);
    }
  }

  return dedupeAndRank(matches, maxItems);
}

function collectCommandLines(messages: Message[], maxItems = 4): string[] {
  const matches: string[] = [];
  for (const message of messages) {
    for (const found of message.content_text.match(COMMAND_PATTERN) || []) {
      const normalized = shorten(found.trim(), 160);
      if (normalized) {
        matches.push(`Command: ${normalized}`);
      }
    }
  }

  return dedupeAndRank(matches, maxItems);
}

function collectApiHints(messages: Message[], maxItems = 4): string[] {
  const matches: string[] = [];
  for (const message of messages) {
    for (const found of message.content_text.match(API_PATTERN) || []) {
      matches.push(`API/Function: ${shorten(found, 120)}`);
    }
    for (const found of message.content_text.match(BACKTICK_PATTERN) || []) {
      matches.push(`Reference: ${shorten(found, 120)}`);
    }
  }

  return dedupeAndRank(matches, maxItems);
}

function collectArtifactLines(messages: Message[], maxItems = 5): string[] {
  return unique([
    ...collectFilePathLines(messages, maxItems),
    ...collectCommandLines(messages, maxItems),
    ...collectApiHints(messages, maxItems),
    ...collectCodeBlocks(messages, maxItems),
  ]).slice(0, maxItems);
}

function collectPotentialTags(
  conversation: Conversation,
  messages: Message[],
  maxItems = 5
): string[] {
  const titleWords = conversation.title
    .split(/[^A-Za-z0-9_.-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
  const platform = conversation.platform;
  const fileHints = collectArtifactLines(messages, 6)
    .map((value) => value.split(/[\\/]/).pop() || value)
    .map((value) => value.replace(/^.*?:\s*/, ""))
    .map((value) => value.replace(/\.[A-Za-z0-9]+$/, ""));

  return unique([platform, ...conversation.tags, ...titleWords, ...fileHints]).slice(
    0,
    maxItems
  );
}

function pickContextLine(
  conversation: Conversation,
  messages: Message[]
): string {
  const firstUser = messages.find((message) => message.role === "user");
  return shorten(
    conversation.snippet ||
      firstUser?.content_text ||
      conversation.title ||
      "No context captured.",
    220
  );
}

function toBulletLines(values: string[], emptyLine: string): string[] {
  if (values.length === 0) {
    return [emptyLine];
  }
  return values.map((value) => `- ${value}`);
}

function buildSummaryTldr(
  item: ConversationExportDatasetItem,
  questions: string[],
  decisions: string[],
  unresolved: string[]
): string {
  const question = questions[0];
  const decision = decisions[0];
  const unresolvedLine = unresolved[0];

  if (question && decision) {
    return shorten(
      `The thread focused on ${question.replace(/[?？]$/, "")} and converged on ${decision.replace(/^[-*]\s*/, "")}${
        unresolvedLine ? ` while leaving ${unresolvedLine.replace(/^[-*]\s*/, "").replace(/[.。]$/, "")} open.` : "."
      }`,
      220
    );
  }

  if (decision) {
    return shorten(decision, 220);
  }

  return shorten(
    item.conversation.snippet ||
      item.conversation.title ||
      "This thread captured a focused discussion without enough signal for a richer TL;DR.",
    220
  );
}

interface FallbackExtractionBudget {
  questions: number;
  constraints: number;
  decisions: number;
  artifacts: number;
  unresolved: number;
  roleMoves: number;
  tags: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function resolveFallbackExtractionBudget(
  mode: ExportCompressionMode,
  plan: CompressionStrategyPlan
): FallbackExtractionBudget {
  const budget: FallbackExtractionBudget =
    mode === "compact"
      ? {
          questions: 3,
          constraints: 2,
          decisions: 4,
          artifacts: 5,
          unresolved: 3,
          roleMoves: 3,
          tags: 5,
        }
      : {
          questions: 2,
          constraints: 2,
          decisions: 3,
          artifacts: 5,
          unresolved: 3,
          roleMoves: 4,
          tags: 5,
        };

  const topWeights = plan.routeWeights.slice(0, 2);
  for (const { shape, weight } of topWeights) {
    const gain = Math.max(0, weight);
    switch (shape) {
      case "debug_troubleshooting":
        budget.artifacts += gain * 2.2;
        budget.unresolved += gain * 1.4;
        budget.decisions += gain * 1.2;
        budget.constraints += gain * 0.8;
        break;
      case "architecture_tradeoff":
        budget.decisions += gain * 2.0;
        budget.constraints += gain * 1.2;
        budget.artifacts += gain * 1.1;
        break;
      case "learning_explanation":
        budget.questions += gain * 1.4;
        budget.roleMoves += gain * 2.0;
        budget.decisions += gain * 1.0;
        break;
      case "process_alignment":
        budget.constraints += gain * 2.0;
        budget.unresolved += gain * 1.8;
        budget.decisions += gain * 0.8;
        break;
      case "decision_support":
        budget.questions += gain * 1.8;
        budget.constraints += gain * 1.8;
        budget.decisions += gain * 1.2;
        budget.unresolved += gain * 1.0;
        break;
      case "general":
        budget.questions += gain * 0.5;
        budget.decisions += gain * 0.5;
        break;
      default:
        break;
    }
  }

  return {
    questions: clampInt(budget.questions, 1, 8),
    constraints: clampInt(budget.constraints, 1, 8),
    decisions: clampInt(budget.decisions, 2, 9),
    artifacts: clampInt(budget.artifacts, 2, 10),
    unresolved: clampInt(budget.unresolved, 1, 8),
    roleMoves: clampInt(budget.roleMoves, 2, 8),
    tags: clampInt(budget.tags, 3, 8),
  };
}

function buildCompactFallback(
  item: ConversationExportDatasetItem,
  reason: string,
  plan: CompressionStrategyPlan
): string {
  const budget = resolveFallbackExtractionBudget("compact", plan);
  const messages = item.messages;
  const questions = collectQuestionCandidates(messages, budget.questions);
  const constraints = collectConstraintLines(messages, budget.constraints);
  const decisions = collectDecisionLines(messages, budget.decisions);
  const artifacts = collectArtifactLines(messages, budget.artifacts);
  const unresolved = collectUnresolvedLines(messages, budget.unresolved);

  const background = [
    `- Title: ${item.conversation.title || "(untitled)"}`,
    `- Platform: ${item.conversation.platform}`,
    `- Context: ${pickContextLine(item.conversation, messages)}`,
    ...constraints.map((constraint) => `- Constraint: ${constraint}`),
    `- Fallback reason: ${reason}`,
  ];

  return [
    "## Background",
    ...background,
    "",
    "## Key Questions",
    ...toBulletLines(questions, "- No explicit user question was captured."),
    "",
    "## Decisions And Answers",
    ...toBulletLines(decisions, "- No grounded decision or answer was captured."),
    "",
    "## Reusable Artifacts",
    ...toBulletLines(artifacts, "- None grounded in this thread."),
    "",
    "## Unresolved",
    ...toBulletLines(unresolved, "- No unresolved follow-up was explicit in this thread."),
  ].join("\n");
}

function buildSummaryFallback(
  item: ConversationExportDatasetItem,
  reason: string,
  plan: CompressionStrategyPlan
): string {
  const budget = resolveFallbackExtractionBudget("summary", plan);
  const messages = item.messages;
  const questions = collectQuestionCandidates(messages, budget.questions);
  const constraints = collectConstraintLines(messages, budget.constraints);
  const decisions = collectDecisionLines(messages, budget.decisions);
  const artifacts = collectArtifactLines(messages, budget.artifacts);
  const unresolved = collectUnresolvedLines(messages, budget.unresolved);
  const roleAwareMoves = collectRoleAwareTurns(messages, budget.roleMoves);
  const tags = collectPotentialTags(item.conversation, messages, budget.tags);

  const problemFrame = [
    item.conversation.title || "Untitled conversation",
    pickContextLine(item.conversation, messages),
    ...questions,
    ...constraints,
  ];
  const importantMoves = decisions.length > 0 ? decisions : roleAwareMoves;

  return [
    "## TL;DR",
    `- ${buildSummaryTldr(item, questions, decisions, unresolved)}`,
    "",
    "## Problem Frame",
    ...toBulletLines(problemFrame, "- No problem framing captured."),
    "",
    "## Important Moves",
    ...toBulletLines(importantMoves, "- No grounded key move was captured."),
    "",
    "## Reusable Snippets",
    ...toBulletLines(artifacts, "- None grounded in this thread."),
    "",
    "## Next Steps",
    ...toBulletLines(unresolved, "- No grounded next step was explicit in this thread."),
    "",
    "## Tags",
    `- ${tags.length > 0 ? tags.join(", ") : `fallback-local, ${reason}`}`,
  ].join("\n");
}

function buildLocalFallback(
  item: ConversationExportDatasetItem,
  mode: ExportCompressionMode,
  reason: string,
  diagnostic?: LlmDiagnostic | null,
  failureContext?: ExportCompressionFailureContext | null,
  strategyPlan?: CompressionStrategyPlan,
  gateAppliedOverride = false,
  classifierSource: CompressionClassifierSource = "rules_only",
  llmReview: CompressionLlmReview = { reviewed: false, agreed: null }
): CompressedConversationExport {
  const plan = strategyPlan || buildStrategyPlan(item.messages);
  const body =
    mode === "compact"
      ? buildCompactFallback(item, reason, plan)
      : buildSummaryFallback(item, reason, plan);
  const quality = evaluateCompressionQuality(body, item, mode, plan);
  const gate = deriveGateRecommendation(quality, plan);
  const segments = buildSegmentObservations(item.messages);

  return {
    conversation: item.conversation,
    messages: item.messages,
    body,
    mode,
    source: "local_fallback",
    route: failureContext?.route,
    usedFallbackPrompt: false,
    fallbackReason: diagnostic?.code || reason,
    diagnostic: diagnostic || undefined,
    modelId: failureContext?.modelId,
    exportPromptProfile: failureContext?.exportPromptProfile,
    primaryInvalidReason: failureContext?.primaryInvalidReason,
    fallbackInvalidReason: failureContext?.fallbackInvalidReason,
    dialogueShape: plan.dialogueShape,
    strategyConfidence: plan.confidence,
    qualityScore: quality.overall,
    mssCoverage: quality.mssCoverage,
    missingMssSignals: quality.missingSignals,
    scoreMode: COMPRESSION_SCORE_MODE,
    routeWeights: plan.routeWeights,
    segmentObservations: segments,
    gateRecommendation: gate.recommendation,
    gateReasons: gate.reasons,
    gateThresholds: gate.thresholds,
    gateApplied: gateAppliedOverride,
    guardedFallbackConfig: GUARDED_FALLBACK_CONFIG,
    classifierSource,
    llmReview,
  };
}

function getExportValidationFeedback(reason: string | undefined):
  | { detail: string; hint: string }
  | null {
  switch (reason) {
    case "export_output_too_short":
      return {
        detail:
          "LLM returned text, but it was too short to satisfy the export compression baseline. Validation: export_output_too_short.",
        hint: "Try the other model path later or use Full export while we tune this profile.",
      };
    case "export_missing_required_headings":
      return {
        detail:
          "LLM returned text, but the required markdown sections were missing. Validation: export_missing_required_headings.",
        hint: "We expect the shipping export headings exactly; this is usually a prompt/profile compliance issue rather than an auth or routing failure.",
      };
    case "export_grounded_sections_insufficient":
      return {
        detail:
          "LLM returned the right shape, but too many sections were generic or not grounded in the thread. Validation: export_grounded_sections_insufficient.",
        hint: "This usually means the model answered loosely instead of preserving the thread's actual moves and constraints.",
      };
    case "export_artifact_signal_missing":
      return {
        detail:
          "LLM returned structured text, but dropped code, command, or file-path evidence that the thread contained. Validation: export_artifact_signal_missing.",
        hint: "Use Full export for now if artifact fidelity is critical, then retry after we tune the compression profile.",
      };
    default:
      return null;
  }
}

function describeCompressionRoute(
  route: ExportCompressionRoute | undefined
): string {
  switch (route) {
    case "current_llm_settings":
      return "Current LLM settings";
    case "moonshot_direct":
      return "Moonshot direct";
    default:
      return "Unknown";
  }
}

function buildCompressionTechnicalSummary(
  result: CompressedConversationExport
): string | undefined {
  const parts: string[] = [];

  if (result.diagnostic?.technicalSummary) {
    parts.push(result.diagnostic.technicalSummary);
  }

  if (result.route) {
    parts.push(`Compression route: ${describeCompressionRoute(result.route)}`);
  }

  if (result.modelId) {
    parts.push(`Model: ${result.modelId}`);
  }

  if (result.exportPromptProfile) {
    parts.push(`Profile: ${result.exportPromptProfile}`);
  }

  if (result.primaryInvalidReason) {
    parts.push(`Primary: ${result.primaryInvalidReason}`);
  }

  if (result.fallbackInvalidReason) {
    parts.push(`Fallback: ${result.fallbackInvalidReason}`);
  }

  if (result.dialogueShape) {
    parts.push(`Shape: ${result.dialogueShape}`);
  }

  if (typeof result.qualityScore === "number") {
    parts.push(`Quality(observe): ${result.qualityScore.toFixed(2)}`);
  }

  if (typeof result.mssCoverage === "number") {
    parts.push(`MSS: ${result.mssCoverage.toFixed(2)}`);
  }

  if (result.missingMssSignals && result.missingMssSignals.length > 0) {
    parts.push(`Missing: ${result.missingMssSignals.join(",")}`);
  }

  if (result.gateRecommendation) {
    parts.push(`Gate(observe): ${result.gateRecommendation}`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function extractSections(
  value: string,
  mode: ExportCompressionMode
): Record<string, string> | null {
  const headings = EXPECTED_HEADINGS[mode];
  const sections: Record<string, string> = {};

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = value.indexOf(heading);
    if (start < 0) {
      return null;
    }

    const bodyStart = start + heading.length;
    const nextHeading = headings
      .slice(index + 1)
      .map((candidate) => ({
        candidate,
        position: value.indexOf(candidate, bodyStart),
      }))
      .filter((entry) => entry.position >= 0)
      .sort((a, b) => a.position - b.position)[0];

    const body = value
      .slice(bodyStart, nextHeading ? nextHeading.position : undefined)
      .trim();
    sections[heading] = body;
  }

  return sections;
}

function countGroundedSections(sections: Record<string, string>): number {
  return Object.values(sections).filter((body) => {
    const lines = body
      .split(/\n+/)
      .map((line) => stripBulletPrefix(line))
      .filter(Boolean);
    return lines.some((line) => hasMeaningfulText(line));
  }).length;
}

function detectArtifactSignals(messages: Message[]): {
  hasCode: boolean;
  hasCommand: boolean;
  hasPath: boolean;
  hasApi: boolean;
} {
  const transcript = messages.map((message) => message.content_text).join("\n");
  return {
    hasCode: hasRegexMatch(transcript, CODE_BLOCK_PATTERN),
    hasCommand: hasRegexMatch(transcript, COMMAND_PATTERN),
    hasPath: hasRegexMatch(transcript, PATH_PATTERN),
    hasApi:
      hasRegexMatch(transcript, API_PATTERN) ||
      hasRegexMatch(transcript, BACKTICK_PATTERN),
  };
}

function preservesArtifactSignal(
  body: string,
  messages: Message[]
): boolean {
  const signals = detectArtifactSignals(messages);
  if (!signals.hasCode && !signals.hasCommand && !signals.hasPath && !signals.hasApi) {
    return true;
  }

  return (
    (signals.hasCode && /```|Code:\s*`/i.test(body)) ||
    (signals.hasCommand && hasRegexMatch(body, COMMAND_PATTERN)) ||
    (signals.hasPath && hasRegexMatch(body, PATH_PATTERN)) ||
    (signals.hasApi &&
      (hasRegexMatch(body, API_PATTERN) || hasRegexMatch(body, BACKTICK_PATTERN)))
  );
}

function validateCompressionOutput(
  value: string,
  item: ConversationExportDatasetItem,
  mode: ExportCompressionMode
): ExportCompressionValidationResult {
  const normalized = sanitizeSummaryText(value);
  if (normalized.length < MIN_VALID_OUTPUT_LENGTH) {
    return {
      valid: false,
      issueCode: "export_output_too_short",
    };
  }

  const sections = extractSections(value, mode);
  if (!sections) {
    return {
      valid: false,
      issueCode: "export_missing_required_headings",
    };
  }

  const groundedSectionCount = countGroundedSections(sections);
  const minimumGroundedSections = mode === "compact" ? 3 : 4;
  if (groundedSectionCount < minimumGroundedSections) {
    return {
      valid: false,
      issueCode: "export_grounded_sections_insufficient",
    };
  }

  if (!preservesArtifactSignal(value, item.messages)) {
    return {
      valid: false,
      issueCode: "export_artifact_signal_missing",
    };
  }

  return { valid: true };
}

async function compressWithCurrentLlmSettings(
  item: ConversationExportDatasetItem,
  mode: ExportCompressionMode
): Promise<CompressedConversationExport> {
  const strategyPlan = buildStrategyPlan(item.messages);
  const segmentObservations = buildSegmentObservations(item.messages);
  const settings = await getLlmSettings();
  if (!settings) {
    throw new Error("LLM_SETTINGS_UNAVAILABLE");
  }

  let llmReview: CompressionLlmReview = {
    reviewed: false,
    agreed: null,
  };
  if (shouldRunLlmStrategyReview(item, strategyPlan)) {
    try {
      const reviewPrompt = buildStrategyReviewPrompt(item, strategyPlan);
      const review = await callInference(settings, reviewPrompt, {
        systemPrompt:
          "You are a strict dialogue classifier. Return JSON only with suggested_shape, suggested_confidence, reason.",
      });
      const parsed = parseStrategyReviewResult(review.content);
      if (parsed) {
        llmReview = {
          reviewed: true,
          agreed: parsed.suggestedShape === strategyPlan.dialogueShape,
          suggestedShape: parsed.suggestedShape,
          suggestedConfidence: parsed.suggestedConfidence,
          reason: parsed.reason,
        };
      } else {
        llmReview = {
          reviewed: true,
          agreed: null,
          errorCode: "review_parse_failed",
        };
      }
    } catch (error) {
      const diagnostic = getLlmDiagnostic(error);
      llmReview = {
        reviewed: true,
        agreed: null,
        errorCode: diagnostic?.code || "review_call_failed",
      };
      logger.warn("llm", "Export strategy LLM review failed", {
        mode,
        conversationId: item.conversation.id,
        errorCode: llmReview.errorCode,
      });
    }
  }
  const classifierSource: CompressionClassifierSource = llmReview.reviewed
    ? "rules_plus_llm_review"
    : "rules_only";

  const modelId = getEffectiveModelId(settings);
  const modelProfile = getLlmModelProfile(modelId);
  const exportProfile = modelProfile.exportPromptProfile;
  const promptBudget = PROMPT_BUDGETS[exportProfile];
  const prompt = getPrompt(mode === "compact" ? "exportCompact" : "exportSummary", {
    variant: "current",
  });
  const payload = buildPromptPayload(item, exportProfile, strategyPlan);
  const primaryPrompt = truncateForContext(
    prompt.userTemplate(payload),
    promptBudget.primary
  );

  const primary = await callInference(settings, primaryPrompt, {
    systemPrompt: prompt.system,
  });
  const primaryBody = normalizeCompressionBody(primary.content);
  const primaryValidation = validateCompressionOutput(primaryBody, item, mode);
  if (primaryValidation.valid) {
    const quality = evaluateCompressionQuality(
      primaryBody,
      item,
      mode,
      strategyPlan
    );
    const gate = deriveGateRecommendation(quality, strategyPlan);
    const applyGuardedFallback = shouldApplyGuardedFallback(
      gate.recommendation,
      item.conversation.id,
      item.messages.length
    );
    logger.info("llm", "Export compression quality observed", {
      route: "current_llm_settings",
      mode,
      conversationId: item.conversation.id,
      dialogueShape: strategyPlan.dialogueShape,
      strategyConfidence: strategyPlan.confidence,
      routeWeights: strategyPlan.routeWeights,
      qualityScore: quality.overall,
      mssCoverage: quality.mssCoverage,
      pseudoStructureRate: quality.pseudoStructureRate,
      artifactPreservation: quality.artifactPreservation,
      missingMssSignals: quality.missingSignals,
      gateRecommendation: gate.recommendation,
      gateReasons: gate.reasons,
      segmentObservationCount: segmentObservations.length,
      scoreMode: COMPRESSION_SCORE_MODE,
      guardedFallbackEnabled: GUARDED_FALLBACK_CONFIG.enabled,
      guardedFallbackRolloutPercent: GUARDED_FALLBACK_CONFIG.rolloutPercent,
      guardedFallbackMinMessages: GUARDED_FALLBACK_CONFIG.minMessages,
      gateApplied: applyGuardedFallback,
    });
    if (applyGuardedFallback) {
      logger.info("llm", "Guarded fallback applied after primary pass", {
        route: "current_llm_settings",
        mode,
        conversationId: item.conversation.id,
        dialogueShape: strategyPlan.dialogueShape,
        gateReasons: gate.reasons,
      });
      return buildLocalFallback(
        item,
        mode,
        "guarded_fallback_gate",
        undefined,
        {
          route: "current_llm_settings",
          modelId,
          exportPromptProfile: exportProfile,
        },
        strategyPlan,
        true,
        classifierSource,
        llmReview
      );
    }
    return {
      conversation: item.conversation,
      messages: item.messages,
      body: primaryBody,
      mode,
      source: "llm",
      route: "current_llm_settings",
      usedFallbackPrompt: false,
      dialogueShape: strategyPlan.dialogueShape,
      strategyConfidence: strategyPlan.confidence,
      qualityScore: quality.overall,
      mssCoverage: quality.mssCoverage,
      missingMssSignals: quality.missingSignals,
      scoreMode: COMPRESSION_SCORE_MODE,
      routeWeights: strategyPlan.routeWeights,
      segmentObservations,
      gateRecommendation: gate.recommendation,
      gateReasons: gate.reasons,
      gateThresholds: gate.thresholds,
      gateApplied: false,
      guardedFallbackConfig: GUARDED_FALLBACK_CONFIG,
      classifierSource,
      llmReview,
    };
  }

  logger.warn("llm", "Export compression primary output failed validation", {
    route: "current_llm_settings",
    mode,
    conversationId: item.conversation.id,
    modelId,
    exportPromptProfile: exportProfile,
    invalidReason: primaryValidation.issueCode,
    dialogueShape: strategyPlan.dialogueShape,
    strategyConfidence: strategyPlan.confidence,
    routeWeights: strategyPlan.routeWeights,
  });

  const fallbackPrompt = truncateForContext(
    prompt.fallbackTemplate(payload),
    promptBudget.fallback
  );
  const fallback = await callInference(settings, fallbackPrompt, {
    systemPrompt: prompt.fallbackSystem || prompt.system,
  });
  const fallbackBody = normalizeCompressionBody(fallback.content);
  const fallbackValidation = validateCompressionOutput(fallbackBody, item, mode);
  if (fallbackValidation.valid) {
    const quality = evaluateCompressionQuality(
      fallbackBody,
      item,
      mode,
      strategyPlan
    );
    const gate = deriveGateRecommendation(quality, strategyPlan);
    const applyGuardedFallback = shouldApplyGuardedFallback(
      gate.recommendation,
      item.conversation.id,
      item.messages.length
    );
    logger.info("llm", "Export compression quality observed", {
      route: "current_llm_settings",
      mode,
      conversationId: item.conversation.id,
      dialogueShape: strategyPlan.dialogueShape,
      strategyConfidence: strategyPlan.confidence,
      routeWeights: strategyPlan.routeWeights,
      qualityScore: quality.overall,
      mssCoverage: quality.mssCoverage,
      pseudoStructureRate: quality.pseudoStructureRate,
      artifactPreservation: quality.artifactPreservation,
      missingMssSignals: quality.missingSignals,
      gateRecommendation: gate.recommendation,
      gateReasons: gate.reasons,
      segmentObservationCount: segmentObservations.length,
      scoreMode: COMPRESSION_SCORE_MODE,
      guardedFallbackEnabled: GUARDED_FALLBACK_CONFIG.enabled,
      guardedFallbackRolloutPercent: GUARDED_FALLBACK_CONFIG.rolloutPercent,
      guardedFallbackMinMessages: GUARDED_FALLBACK_CONFIG.minMessages,
      gateApplied: applyGuardedFallback,
    });
    if (applyGuardedFallback) {
      logger.info("llm", "Guarded fallback applied after fallback pass", {
        route: "current_llm_settings",
        mode,
        conversationId: item.conversation.id,
        dialogueShape: strategyPlan.dialogueShape,
        gateReasons: gate.reasons,
      });
      return buildLocalFallback(
        item,
        mode,
        "guarded_fallback_gate",
        undefined,
        {
          route: "current_llm_settings",
          modelId,
          exportPromptProfile: exportProfile,
          primaryInvalidReason: primaryValidation.issueCode,
        },
        strategyPlan,
        true,
        classifierSource,
        llmReview
      );
    }
    return {
      conversation: item.conversation,
      messages: item.messages,
      body: fallbackBody,
      mode,
      source: "llm",
      route: "current_llm_settings",
      usedFallbackPrompt: true,
      dialogueShape: strategyPlan.dialogueShape,
      strategyConfidence: strategyPlan.confidence,
      qualityScore: quality.overall,
      mssCoverage: quality.mssCoverage,
      missingMssSignals: quality.missingSignals,
      scoreMode: COMPRESSION_SCORE_MODE,
      routeWeights: strategyPlan.routeWeights,
      segmentObservations,
      gateRecommendation: gate.recommendation,
      gateReasons: gate.reasons,
      gateThresholds: gate.thresholds,
      gateApplied: false,
      guardedFallbackConfig: GUARDED_FALLBACK_CONFIG,
      classifierSource,
      llmReview,
    };
  }

  logger.warn("llm", "Export compression fallback prompt failed validation", {
    route: "current_llm_settings",
    mode,
    conversationId: item.conversation.id,
    modelId,
    exportPromptProfile: exportProfile,
    invalidReason: fallbackValidation.issueCode,
    primaryInvalidReason: primaryValidation.issueCode,
    dialogueShape: strategyPlan.dialogueShape,
    strategyConfidence: strategyPlan.confidence,
    routeWeights: strategyPlan.routeWeights,
  });

  throw new ExportCompressionValidationError(
    fallbackValidation.issueCode ||
      primaryValidation.issueCode ||
      "export_output_too_short",
    {
      route: "current_llm_settings",
      modelId,
      exportPromptProfile: exportProfile,
      primaryInvalidReason: primaryValidation.issueCode,
      fallbackInvalidReason: fallbackValidation.issueCode,
      classifierSource,
      llmReview,
    }
  );
}

const ADAPTERS: Record<ExportCompressionRoute, ExportCompressionAdapter> = {
  current_llm_settings: {
    route: "current_llm_settings",
    compress: compressWithCurrentLlmSettings,
  },
  moonshot_direct: {
    route: "moonshot_direct",
    async compress(item, mode) {
      return buildLocalFallback(item, mode, "moonshot_direct_not_enabled");
    },
  },
};

function buildCompressionNotice(
  results: CompressedConversationExport[],
  mode: ExportCompressionMode
): ConversationExportNotice {
  const fallbackCount = results.filter(
    (result) => result.source === "local_fallback"
  ).length;
  const llmCount = results.length - fallbackCount;

  if (fallbackCount === 0) {
    return {
      tone: "default",
      message: `${mode === "compact" ? "Compact" : "Summary"} export used the current LLM path for all selected threads.`,
    };
  }

  const representativeFallback = results.find(
    (result) => result.source === "local_fallback" && result.diagnostic
  );
  const diagnostic = representativeFallback?.diagnostic;
  const validationFallback = results.find(
    (result) => result.source === "local_fallback" && result.fallbackReason
  );
  const validationFeedback = diagnostic
    ? null
    : getExportValidationFeedback(validationFallback?.fallbackReason);
  const technicalSummary = diagnostic
    ? representativeFallback
      ? buildCompressionTechnicalSummary(representativeFallback)
      : diagnostic.technicalSummary
    : validationFallback
      ? buildCompressionTechnicalSummary(validationFallback)
      : undefined;
  const detail = diagnostic
    ? `${diagnostic.userMessage}
${diagnostic.technicalSummary}`
    : validationFeedback?.detail;
  const hint = diagnostic
    ? "Check Settings > Model Access."
    : validationFeedback?.hint;

  if (llmCount === 0) {
    return {
      tone: "warning",
      message: `${mode === "compact" ? "Compact" : "Summary"} export used structured local fallback for all selected threads.`,
      title: "Local fallback used for all selected threads",
      detail,
      technicalSummary,
      hint,
      diagnostic: diagnostic || null,
    };
  }

  return {
    tone: "warning",
    message: `${mode === "compact" ? "Compact" : "Summary"} export used structured local fallback for ${fallbackCount} of ${results.length} selected threads.`,
    title: `Local fallback used for ${fallbackCount} of ${results.length} selected threads`,
    detail,
    technicalSummary,
    hint,
    diagnostic: diagnostic || null,
  };
}

function buildObservationSummary(results: CompressedConversationExport[]) {
  const byShape: Partial<Record<CompressionDialogueShape, number>> = {};
  const byDominantShape: Partial<Record<CompressionDialogueShape, number>> = {};
  const gateSuggestionByShape: Partial<Record<CompressionDialogueShape, number>> = {};
  const scored = results.filter(
    (result) =>
      typeof result.qualityScore === "number" &&
      typeof result.mssCoverage === "number"
  );

  for (const result of results) {
    if (!result.dialogueShape) {
      continue;
    }
    byShape[result.dialogueShape] = (byShape[result.dialogueShape] || 0) + 1;
    const dominant = result.routeWeights?.[0]?.shape || result.dialogueShape;
    byDominantShape[dominant] = (byDominantShape[dominant] || 0) + 1;
    if (result.gateRecommendation === "suggest_fallback") {
      gateSuggestionByShape[dominant] =
        (gateSuggestionByShape[dominant] || 0) + 1;
    }
  }

  const segmentedCount = results.filter(
    (result) => (result.segmentObservations?.length || 0) > 0
  ).length;

  const averageQuality =
    scored.length === 0
      ? null
      : scored.reduce((sum, result) => sum + (result.qualityScore || 0), 0) /
        scored.length;
  const averageMssCoverage =
    scored.length === 0
      ? null
      : scored.reduce((sum, result) => sum + (result.mssCoverage || 0), 0) /
        scored.length;

  return {
    scoredCount: scored.length,
    total: results.length,
    averageQuality,
    averageMssCoverage,
    byShape,
    byDominantShape,
    gateSuggestionByShape,
    gateSuggestionCount: results.filter(
      (result) => result.gateRecommendation === "suggest_fallback"
    ).length,
    gateAppliedCount: results.filter((result) => result.gateApplied).length,
    llmReviewCount: results.filter((result) => result.llmReview?.reviewed).length,
    llmReviewDisagreementCount: results.filter(
      (result) => result.llmReview?.reviewed && result.llmReview.agreed === false
    ).length,
    segmentedCount,
    scoreMode: COMPRESSION_SCORE_MODE,
    guardedFallbackConfig: GUARDED_FALLBACK_CONFIG,
    llmStrategyReviewConfig: LLM_STRATEGY_REVIEW_CONFIG,
  };
}

export function isExportCompressionRouteEnabled(
  route: ExportCompressionRoute
): boolean {
  return ROUTE_STATUS[route].enabled;
}

export function resolveExportCompressionRoute(): ExportCompressionRoute {
  return ACTIVE_EXPORT_COMPRESSION_ROUTE;
}

export function getExportCompressionRouteInfo() {
  return {
    active: ACTIVE_EXPORT_COMPRESSION_ROUTE,
    status: ROUTE_STATUS,
    guardedFallback: GUARDED_FALLBACK_CONFIG,
    futureCandidates: {
      modelscope: [...FUTURE_MODELSCOPE_EXPORT_MODEL_CANDIDATES],
      moonshotDirect: [...FUTURE_MOONSHOT_DIRECT_EXPORT_MODEL_CANDIDATES],
    },
  };
}

export async function compressExportDataset(
  dataset: ConversationExportDatasetItem[],
  mode: ExportCompressionMode
): Promise<{
  items: CompressedConversationExport[];
  notice: ConversationExportNotice;
}> {
  const route = resolveExportCompressionRoute();
  const adapter = ADAPTERS[route];
  const items: CompressedConversationExport[] = [];

  for (const rawItem of dataset) {
    const item: ConversationExportDatasetItem = {
      conversation: rawItem.conversation,
      messages: toOrderedMessages(rawItem.messages),
    };

    if (!isExportCompressionRouteEnabled(route)) {
      items.push(buildLocalFallback(item, mode, `${route}_disabled`));
      continue;
    }

    try {
      items.push(await adapter.compress(item, mode));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "compression_failed";
      const diagnostic = getLlmDiagnostic(error);
      const failureContext =
        error instanceof ExportCompressionValidationError
          ? error.context
          : null;
      logger.warn("llm", "Export compression fell back to local formatter", {
        route,
        mode,
        conversationId: item.conversation.id,
        reason,
        diagnosticCode: diagnostic?.code,
        diagnosticRequestId: diagnostic?.requestId,
        modelId: failureContext?.modelId,
        exportPromptProfile: failureContext?.exportPromptProfile,
        primaryInvalidReason: failureContext?.primaryInvalidReason,
        fallbackInvalidReason: failureContext?.fallbackInvalidReason,
      });
      items.push(
        buildLocalFallback(
          item,
          mode,
          reason,
          diagnostic,
          failureContext,
          undefined,
          false,
          failureContext?.classifierSource || "rules_only",
          failureContext?.llmReview || { reviewed: false, agreed: null }
        )
      );
    }
  }

  logger.info("llm", "Export compression observation summary", {
    mode,
    ...buildObservationSummary(items),
  });

  return {
    items,
    notice: buildCompressionNotice(items, mode),
  };
}

