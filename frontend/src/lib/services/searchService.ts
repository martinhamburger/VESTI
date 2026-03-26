import type {
  Annotation,
  Conversation,
  ExploreAskOptions,
  ExploreInspectMeta,
  ExploreContextCandidate,
  ExploreIntentType,
  ExploreMode,
  ExploreRouteDecision,
  ExploreRouteSummary,
  ExploreResolvedTimeScope,
  ExploreRequestedTimeScope,
  ExploreSearchScope,
  ExploreToolCall,
  ExploreToolName,
  LlmConfig,
  QueryRewriteHintsV1,
  RagResponse,
  RelatedConversation,
  RetrievalMetaV1,
} from "../types";
import {
  getConversationCaptureFreshnessAt,
  getConversationOriginAt,
} from "../conversations/timestamps";
import { db } from "../db/schema";
import {
  addExploreMessage,
  createExploreSession,
  getExploreMessages,
  getSummary,
  getWeeklyReport,
  listConversationsByRange,
  recordRetrievalObservation,
  updateExploreSession,
} from "../db/repository";
import { embedText } from "./embeddingService";
import {
  generateWeeklyReport,
} from "./insightGenerationService";
import {
  buildContextCandidatesFromBundle,
  buildEvidencePrompt,
  buildLocalAnswerFromBundle,
  buildRetrievalAssets,
  buildSourcesFromBundle,
  getEvidenceBundle,
  getQueryRewriteHints,
} from "./retrievalAssetsService";
import type {
  CallModelScopeOptions,
  InferenceCallResult,
} from "./llmService";
import { callInference } from "./llmService";
import { getEffectiveModelId, getLlmAccessMode } from "./llmConfig";
import { getLlmSettings } from "./llmSettingsService";
import { logger } from "../utils/logger";

const MAX_MESSAGE_COUNT = 12;
const MAX_TEXT_LENGTH = 4000;
const MAX_RAG_SOURCES = 5;
const MAX_EMBEDDING_CHARS = 2048;
const MAX_WEEKLY_CANDIDATES = 12;
const MAX_WEEKLY_SOURCE_CHIPS = 8;
const EXPLORE_CONTINUATION_MAX_ROUNDS = 2;
const EXPLORE_CONTINUATION_TAIL_CHARS = 1200;
const EXPLORE_CONTINUATION_MIN_EXTENSION = 24;

type SummaryToolResult = {
  snippets: Map<number, string>;
  cacheHits: number;
  generated: number;
  failed: number;
};

type WeeklySummaryToolResult = {
  summaryText: string;
  sourceOrigin: "cached_report" | "generated_report" | "custom_summary" | "local_only";
  conversations: Conversation[];
  sources: RelatedConversation[];
};

type RagRetrievalItem = {
  source: RelatedConversation;
  contextBlock: string;
  excerpt: string;
};

type RagRetrievalResult = {
  sources: RelatedConversation[];
  context: string;
  items: RagRetrievalItem[];
};

type ExploreCompletionResult = {
  content: string;
  continuationCount: number;
};

type SharedRetrievalCoreResult = {
  rewriteHints: QueryRewriteHintsV1;
  bundle: Awaited<ReturnType<typeof getEvidenceBundle>>;
  sources: RelatedConversation[];
  contextCandidates: ExploreContextCandidate[];
  selectedContextConversationIds: number[];
};

const TOOL_DESCRIPTIONS: Record<ExploreToolName, string> = {
  intent_router:
    "Uses the language model to infer the user's intent, choose the answer route, and decide whether a time scope is needed.",
  time_scope_resolver:
    "Converts relative phrases like 'this week' into a concrete local date range before retrieval or summarization.",
  weekly_summary_tool:
    "Finds conversations inside the chosen time window, then reuses or generates a weekly digest so the answer can be grounded in that period.",
  query_planner:
    "Rewrites the query into a standalone retrieval form so follow-up questions stay grounded before evidence ranking.",
  search_rag:
    "Retrieves semantically similar conversations from the knowledge base using vector search.",
  summary_tool:
    "Reuses cached conversation summaries or generates missing ones to improve multi-source synthesis.",
  context_compiler:
    "Builds a user-readable evidence brief and source list so the reasoning chain stays inspectable.",
  answer_synthesizer:
    "Writes the final answer from the collected evidence and points the user to concrete sources when evidence is partial.",
};

function getToolDescription(name: ExploreToolName): string {
  return TOOL_DESCRIPTIONS[name];
}

function hasUsableLlmSettings(settings: LlmConfig | null | undefined): settings is LlmConfig {
  if (!settings) return false;

  const mode = getLlmAccessMode(settings);
  const modelId = getEffectiveModelId(settings);

  if (mode === "demo_proxy") {
    return Boolean((settings.proxyBaseUrl || settings.proxyUrl || "").trim() && modelId);
  }

  return Boolean((settings.baseUrl || "").trim() && (settings.apiKey || "").trim() && modelId);
}

function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStartOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
}

function getEndOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

function buildResolvedTimeScope(
  preset: ExploreResolvedTimeScope["preset"],
  label: string,
  start: Date,
  end: Date
): ExploreResolvedTimeScope {
  return {
    preset,
    label,
    rangeStart: getStartOfDay(start),
    rangeEnd: getEndOfDay(end),
    startDate: formatLocalIsoDate(start),
    endDate: formatLocalIsoDate(end),
  };
}

function getCurrentWeekToDateRange(reference = new Date()): ExploreResolvedTimeScope {
  const now = new Date(reference);
  const weekDay = now.getDay();
  const daysSinceMonday = (weekDay + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceMonday);
  return buildResolvedTimeScope("current_week_to_date", "Current week to date", start, now);
}

function getLastSevenDaysRange(reference = new Date()): ExploreResolvedTimeScope {
  const end = new Date(reference);
  const start = new Date(reference);
  start.setDate(end.getDate() - 6);
  return buildResolvedTimeScope("last_7_days", "Last 7 days", start, end);
}

function getLastFullWeekRange(reference = new Date()): ExploreResolvedTimeScope {
  const now = new Date(reference);
  const weekDay = now.getDay();
  const daysSinceMonday = (weekDay + 6) % 7;
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - daysSinceMonday);

  const end = new Date(startOfThisWeek);
  end.setDate(startOfThisWeek.getDate() - 1);

  const start = new Date(end);
  start.setDate(end.getDate() - 6);

  return buildResolvedTimeScope("last_full_week", "Last full week", start, end);
}

function parseDateInput(value?: string): Date | null {
  if (!value?.trim()) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function resolveRequestedTimeScope(
  requested?: ExploreRequestedTimeScope
): ExploreResolvedTimeScope | undefined {
  if (!requested || requested.preset === "none") {
    return undefined;
  }

  switch (requested.preset) {
    case "current_week_to_date":
      return getCurrentWeekToDateRange();
    case "last_7_days":
      return getLastSevenDaysRange();
    case "last_full_week":
      return getLastFullWeekRange();
    case "custom": {
      const start = parseDateInput(requested.startDate);
      const end = parseDateInput(requested.endDate);
      if (!start || !end || start.getTime() > end.getTime()) {
        return undefined;
      }
      return buildResolvedTimeScope(
        "custom",
        requested.label?.trim() || `${requested.startDate} to ${requested.endDate}`,
        start,
        end
      );
    }
  }
}

function buildToolPlan(
  preferredPath: ExploreRouteDecision["preferredPath"],
  mode: ExploreMode = "ask"
): ExploreToolName[] {
  if (mode === "search") {
    return ["query_planner", "search_rag", "context_compiler", "answer_synthesizer"];
  }

  if (preferredPath === "clarify") {
    return ["intent_router"];
  }

  if (preferredPath === "weekly_summary") {
    return [
      "intent_router",
      "time_scope_resolver",
      "weekly_summary_tool",
      "context_compiler",
      "answer_synthesizer",
    ];
  }

  return ["intent_router", "search_rag", "context_compiler", "answer_synthesizer"];
}

function normalizeRequestedTimeScope(
  value: unknown
): ExploreRequestedTimeScope | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const preset =
    candidate.preset === "current_week_to_date" ||
    candidate.preset === "last_7_days" ||
    candidate.preset === "last_full_week" ||
    candidate.preset === "custom"
      ? candidate.preset
      : candidate.preset === "none"
        ? "none"
        : undefined;

  if (!preset) {
    return undefined;
  }

  return {
    preset,
    label: typeof candidate.label === "string" ? candidate.label.trim() : undefined,
    startDate:
      typeof candidate.startDate === "string" ? candidate.startDate.trim() : undefined,
    endDate: typeof candidate.endDate === "string" ? candidate.endDate.trim() : undefined,
  };
}

function hasExplicitWeeklySignal(query: string): boolean {
  const lowered = query.toLowerCase();
  return (
    /this week|current week|last week|previous week|last 7 days|past 7 days|recent week/.test(
      lowered
    ) ||
    /\u672c\u5468|\u8fd9\u5468|\u8fd9\u4e00\u5468|\u4e0a\u5468|\u6700\u8fd1\u4e03\u5929|\u8fc7\u53bb\u4e03\u5929/.test(
      query
    )
  );
}

function hasSummaryStyleSignal(query: string): boolean {
  const lowered = query.toLowerCase();
  return (
    /summary|summarize|overview|recap|review|what did i do|what have i done|timeline|chronological/.test(
      lowered
    ) ||
    /\u603b\u7ed3|\u6982\u89c8|\u56de\u987e|\u6c47\u603b|\u65f6\u95f4\u7ebf|\u505a\u4e86\u4ec0\u4e48/.test(
      query
    )
  );
}

function applyPlannerGuardrails(
  query: string,
  routeDecision: ExploreRouteDecision
): ExploreRouteDecision {
  if (routeDecision.preferredPath !== "weekly_summary") {
    return routeDecision;
  }

  if (hasExplicitWeeklySignal(query)) {
    return routeDecision;
  }

  const downgradedIntent: ExploreIntentType = hasSummaryStyleSignal(query)
    ? "cross_conversation_summary"
    : "fact_lookup";

  return {
    ...routeDecision,
    intent: downgradedIntent,
    preferredPath: "rag",
    requestedTimeScope: undefined,
    resolvedTimeScope: undefined,
    toolPlan: buildToolPlan("rag"),
    reason: `${routeDecision.reason} | guardrail: weekly_summary requires an explicit weekly time signal in the query`,
  };
}

function buildFallbackPlan(
  query: string,
  requestedLimit: number,
  fallbackReason: string
): ExploreRouteDecision {
  const lowered = query.toLowerCase();
  const currentWeekIntent =
    /this week|current week/.test(lowered) ||
    /\u672c\u5468|\u8fd9\u5468|\u8fd9\u4e00\u5468/.test(query);
  const lastWeekIntent =
    /last week|previous week/.test(lowered) || /\u4e0a\u5468/.test(query);
  const trailingWeekIntent =
    /last 7 days|past 7 days|recent week/.test(lowered) ||
    /\u8fc7\u53bb\u4e03\u5929|\u6700\u8fd1\u4e03\u5929/.test(query);
  const weeklyIntent = currentWeekIntent || lastWeekIntent || trailingWeekIntent;
  const summaryIntent =
    weeklyIntent ||
    /summary|summarize|overview|recap|review/.test(lowered) ||
    /\u603b\u7ed3|\u6982\u89c8|\u56de\u987e|\u6c47\u603b/.test(query);
  const timelineIntent =
    /timeline|chronological/.test(lowered) ||
    /\u65f6\u95f4\u7ebf|\u6309\u65f6\u95f4/.test(query);

  const requestedTimeScope = weeklyIntent
    ? {
        preset: currentWeekIntent
          ? ("current_week_to_date" as const)
          : lastWeekIntent
            ? ("last_full_week" as const)
            : ("last_7_days" as const),
        label: currentWeekIntent
          ? "Current week to date"
          : lastWeekIntent
            ? "Last full week"
            : "Last 7 days",
      }
    : undefined;

  const preferredPath = weeklyIntent ? "weekly_summary" : "rag";
  const sourceLimit = clamp(requestedLimit || MAX_RAG_SOURCES, 1, 8);
  const intent: ExploreIntentType = weeklyIntent
    ? "weekly_review"
    : timelineIntent
      ? "timeline"
      : summaryIntent
        ? "cross_conversation_summary"
        : "fact_lookup";

  return applyPlannerGuardrails(query, {
    intent,
    reason: fallbackReason,
    preferredPath,
    sourceLimit,
    requestedTimeScope,
    resolvedTimeScope: resolveRequestedTimeScope(requestedTimeScope),
    toolPlan: buildToolPlan(preferredPath),
  });
}

function normalizeAgentPlan(
  raw: unknown,
  requestedLimit: number,
  query: string
): ExploreRouteDecision {
  if (!raw || typeof raw !== "object") {
    return buildFallbackPlan(query, requestedLimit, "PLANNER_OUTPUT_INVALID");
  }

  const candidate = raw as Record<string, unknown>;
  const intent: ExploreIntentType =
    candidate.intent === "cross_conversation_summary" ||
    candidate.intent === "weekly_review" ||
    candidate.intent === "timeline" ||
    candidate.intent === "clarification_needed"
      ? candidate.intent
      : "fact_lookup";
  const preferredPath: ExploreRouteDecision["preferredPath"] =
    candidate.preferredPath === "weekly_summary" ||
    candidate.preferredPath === "clarify"
      ? candidate.preferredPath
      : "rag";
  const sourceLimit = clamp(
    typeof candidate.sourceLimit === "number" ? candidate.sourceLimit : requestedLimit || 5,
    1,
    8
  );
  const normalizedRequestedTimeScope = normalizeRequestedTimeScope(
    candidate.requestedTimeScope
  );

  const plan: ExploreRouteDecision = {
    intent,
    reason:
      typeof candidate.reason === "string" && candidate.reason.trim()
        ? candidate.reason.trim()
        : "PLANNER_REASON_UNSPECIFIED",
    preferredPath,
    sourceLimit,
    needsClarification:
      typeof candidate.needsClarification === "boolean"
        ? candidate.needsClarification
        : preferredPath === "clarify" || intent === "clarification_needed",
    clarifyingQuestion:
      typeof candidate.clarifyingQuestion === "string"
        ? candidate.clarifyingQuestion.trim()
        : undefined,
    requestedTimeScope:
      preferredPath === "weekly_summary"
        ? normalizedRequestedTimeScope ?? {
            preset: "current_week_to_date",
            label: "Current week to date",
          }
        : normalizedRequestedTimeScope,
  };

  plan.resolvedTimeScope = resolveRequestedTimeScope(plan.requestedTimeScope);
  plan.toolPlan = buildToolPlan(plan.preferredPath);

  if ((plan.needsClarification || plan.preferredPath === "clarify") && !plan.clarifyingQuestion) {
    plan.clarifyingQuestion =
      "I can answer this, but I need one more constraint first. Which conversations or time window should I use?";
  }

  return applyPlannerGuardrails(query, plan);
}

function buildPlannerPrompt(params: {
  query: string;
  historyContext: string;
  requestedLimit: number;
  searchScope?: ExploreSearchScope;
}): string {
  const today = formatLocalIsoDate(new Date());
  const history = params.historyContext ? truncateInline(params.historyContext, 700) : "(none)";

  return [
    `Today: ${today}`,
    `User query: ${params.query}`,
    `Search scope: ${describeSearchScope(params.searchScope)}`,
    `Requested source limit: ${params.requestedLimit}`,
    `Recent conversation context: ${history}`,
    "",
    "Choose a high-level route for Vesti Ask mode.",
    "Available tools and their jobs:",
    "- intent_router: interpret the user's intent and choose the route.",
    "- time_scope_resolver: turn relative phrases like 'this week' into concrete dates.",
    "- weekly_summary_tool: gather conversations inside a time window and summarize what happened in that period.",
    "- search_rag: retrieve semantically similar conversations.",
    "- context_compiler: build a user-readable evidence brief and source list.",
    "- answer_synthesizer: write the final answer and tell the user where to look if evidence is partial.",
    "",
    "Rules:",
    "- Queries like '我这一周做了什么' or 'what did I do this week' should normally use weekly_review + weekly_summary + current_week_to_date.",
    "- If the user asks for a summary over a recent week, prefer a weekly_summary path over semantic search.",
    "- Never choose weekly_summary for a topic-only query with no explicit time phrase. For example, '数学建模比赛' must stay on the rag path.",
    "- Use clarification_needed only when the request is too ambiguous to answer responsibly.",
    "- Use rag for factual lookup and cross-conversation synthesis that are not primarily time-window based.",
    "",
    "Return JSON only with this schema:",
    "{",
    '  "intent": "fact_lookup | cross_conversation_summary | weekly_review | timeline | clarification_needed",',
    '  "reason": "short explanation",',
    '  "preferredPath": "rag | weekly_summary | clarify",',
    '  "sourceLimit": 1-8,',
    '  "needsClarification": true | false,',
    '  "clarifyingQuestion": "optional question",',
    '  "requestedTimeScope": {',
    '    "preset": "none | current_week_to_date | last_7_days | last_full_week | custom",',
    '    "label": "optional label",',
    '    "startDate": "YYYY-MM-DD when preset=custom",',
    '    "endDate": "YYYY-MM-DD when preset=custom"',
    "  }",
    "}",
  ].join("\n");
}

function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

async function planAgentIntent(params: {
  query: string;
  historyContext: string;
  requestedLimit: number;
  searchScope?: ExploreSearchScope;
  settings: LlmConfig | null;
}): Promise<ExploreRouteDecision> {
  if (!hasUsableLlmSettings(params.settings)) {
    return buildFallbackPlan(params.query, params.requestedLimit, "DETERMINISTIC_ROUTER");
  }

  try {
    const result = await callInference(
      params.settings,
      buildPlannerPrompt({
        query: params.query,
        historyContext: params.historyContext,
        requestedLimit: params.requestedLimit,
        searchScope: params.searchScope,
      }),
      {
        responseFormat: "json_object",
        systemPrompt:
          "You are Vesti's intent router. Return one compact JSON object only. Do not add markdown or commentary.",
      }
    );

    const parsedText = extractFirstJsonObject(result.content || result.rawContent || "");
    if (!parsedText) {
      return buildFallbackPlan(params.query, params.requestedLimit, "LLM_ROUTER_EMPTY");
    }

    return normalizeAgentPlan(
      JSON.parse(parsedText),
      params.requestedLimit,
      params.query
    );
  } catch {
    return buildFallbackPlan(params.query, params.requestedLimit, "LLM_ROUTER_FALLBACK");
  }
}

function getScopedConversationIds(searchScope?: ExploreSearchScope): number[] | undefined {
  if (searchScope?.mode !== "selected") {
    return undefined;
  }

  const ids = Array.isArray(searchScope.conversationIds)
    ? searchScope.conversationIds.filter(
        (id): id is number => typeof id === "number" && Number.isFinite(id)
      )
    : [];

  return ids.length > 0 ? ids : undefined;
}

function describeSearchScope(searchScope?: ExploreSearchScope): string {
  const scopedIds = getScopedConversationIds(searchScope);
  if (!scopedIds) {
    return "all conversations";
  }
  return `${scopedIds.length} selected conversation${scopedIds.length === 1 ? "" : "s"}`;
}

function normalizeEmbeddingInput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MAX_EMBEDDING_CHARS) return trimmed;
  return trimmed.slice(0, MAX_EMBEDDING_CHARS);
}

function toFloat32Array(value: Float32Array | number[]): Float32Array {
  return value instanceof Float32Array ? value : new Float32Array(value);
}

function buildConversationText(
  conversation: Conversation,
  messageTexts: string[],
  annotations: Annotation[]
): string {
  const annotationText = annotations.map((item) => `【批注】${item.content_text}`);
  const chunks = [conversation.title, conversation.snippet, ...messageTexts, ...annotationText];
  const combined = chunks.filter(Boolean).join("\n");
  if (combined.length <= MAX_TEXT_LENGTH) return combined;
  return combined.slice(0, MAX_TEXT_LENGTH);
}

function buildConversationContext(
  conversation: Conversation,
  messages: Array<{ role: "user" | "ai"; content_text: string }>,
  annotations: Annotation[]
): string {
  const lines = messages
    .slice(0, MAX_MESSAGE_COUNT)
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "AI";
      return `[${role}] ${msg.content_text}`;
    });

  const annotationLines = annotations.map((item) => `[Note] ${item.content_text}`);

  return [
    `[Title] ${conversation.title}`,
    `[Platform] ${conversation.platform}`,
    "[Content]",
    ...lines,
    ...(annotationLines.length > 0 ? ["【批注】", ...annotationLines] : []),
  ].join("\n");
}

function truncateInline(text: string, max = 200): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildHistoryContext(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return "";

  return `\n\nPrevious conversation context:\n${messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 200)}`)
    .join("\n")}\n\nConsider the above context when answering the new question.`;
}

function buildContextualRagPrompt(
  retrievedContext: string,
  historyContext: string,
  summaryHints?: string
): string {
  const basePrompt =
    "You are Vesti's knowledge base assistant. Answer based primarily on the retrieved conversations below.";
  const summarySection = summaryHints?.trim()
    ? `\nSummary Hints:\n${summaryHints.trim()}\n`
    : "";

  return `${basePrompt}${historyContext}${summarySection}

Retrieved Conversations:
${retrievedContext}

Instructions:
1. If this is a follow-up question, consider the previous conversation context.
2. Answer based primarily on the retrieved conversations.
3. If information is insufficient, say so clearly.
4. Cite specific conversations when possible.
5. Prefer a complete answer over an ultra-short answer.
6. Use short sections or bullets when they improve clarity.`;
}

function normalizeFinishReason(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function isLengthFinishReason(result: InferenceCallResult): boolean {
  const finishReason = normalizeFinishReason(result.finishReason);
  return finishReason.includes("length") || finishReason.includes("max");
}

function isNearTokenLimit(
  result: InferenceCallResult,
  settings: LlmConfig
): boolean {
  const completionTokens = result.usage?.completionTokens;
  const effectiveMaxTokens =
    result.proxyTokenMetrics?.effectiveMaxTokens ??
    result.proxyTokenMetrics?.requestedMaxTokens ??
    settings.maxTokens;

  if (
    typeof completionTokens !== "number" ||
    !Number.isFinite(completionTokens) ||
    typeof effectiveMaxTokens !== "number" ||
    !Number.isFinite(effectiveMaxTokens)
  ) {
    return false;
  }

  return completionTokens >= Math.max(64, effectiveMaxTokens - 32);
}

function buildContinuationPrompt(originalPrompt: string, partialAnswer: string): string {
  const answerTail =
    partialAnswer.length <= EXPLORE_CONTINUATION_TAIL_CHARS
      ? partialAnswer
      : partialAnswer.slice(-EXPLORE_CONTINUATION_TAIL_CHARS);

  return [
    "The previous answer was cut off by the output limit.",
    "Continue the same answer from exactly where it stopped.",
    "Rules:",
    "- Do not restart the answer.",
    "- Do not repeat earlier text unless a few bridge words are unavoidable.",
    "- Preserve the same language, tone, and formatting style.",
    "- Return only the continuation.",
    "",
    "Original request:",
    originalPrompt,
    "",
    "Already returned (tail):",
    answerTail,
  ].join("\n");
}

function findOverlapSize(previous: string, next: string): number {
  const maxOverlap = Math.min(previous.length, next.length, 220);
  for (let size = maxOverlap; size >= 24; size -= 1) {
    if (previous.slice(-size) === next.slice(0, size)) {
      return size;
    }
  }
  return 0;
}

function mergeContinuationText(previous: string, next: string): string {
  const trimmedNext = next.trimStart();
  if (!trimmedNext) {
    return previous;
  }

  const overlapSize = findOverlapSize(previous, trimmedNext);
  if (overlapSize > 0) {
    return `${previous}${trimmedNext.slice(overlapSize)}`;
  }

  if (!previous) {
    return trimmedNext;
  }

  if (previous.endsWith("\n") || trimmedNext.startsWith("\n")) {
    return `${previous}${trimmedNext}`;
  }

  if (
    /[A-Za-z0-9\u3400-\u9FFF]$/.test(previous) &&
    /^[A-Za-z0-9\u3400-\u9FFF]/.test(trimmedNext)
  ) {
    return `${previous}\n${trimmedNext}`;
  }

  return `${previous}${trimmedNext}`;
}

async function callExploreInference(
  settings: LlmConfig,
  prompt: string,
  options: CallModelScopeOptions
): Promise<ExploreCompletionResult> {
  let combined = "";
  let continuationCount = 0;
  let currentPrompt = prompt;
  let result = await callInference(settings, currentPrompt, options);
  let currentContent = result.content?.trim() || "";

  if (!currentContent) {
    return {
      content: "",
      continuationCount: 0,
    };
  }

  combined = currentContent;

  while (
    (isLengthFinishReason(result) || isNearTokenLimit(result, settings)) &&
    continuationCount < EXPLORE_CONTINUATION_MAX_ROUNDS
  ) {
    continuationCount += 1;
    currentPrompt = buildContinuationPrompt(prompt, combined);
    result = await callInference(settings, currentPrompt, options);
    currentContent = result.content?.trim() || "";

    if (!currentContent) {
      break;
    }

    const previousLength = combined.length;
    combined = mergeContinuationText(combined, currentContent);
    if (combined.length - previousLength < EXPLORE_CONTINUATION_MIN_EXTENSION) {
      break;
    }
  }

  if (continuationCount > 0) {
    logger.info("service", "Explore answer extended with continuation", {
      continuationCount,
      finishReason: result.finishReason ?? null,
      modelId: getEffectiveModelId(settings),
    });
  }

  return {
    content: combined,
    continuationCount,
  };
}

function extractExcerpt(messages: Array<{ content_text: string }>): string {
  const text = messages
    .slice(0, 4)
    .map((message) => message.content_text)
    .filter(Boolean)
    .join("\n");

  return truncateInline(text, 260);
}

function buildLocalFallbackAnswer(query: string, sources: RelatedConversation[]): string {
  if (sources.length === 0) {
    return [
      `I could not find highly similar conversations for: "${truncateInline(query, 120)}".`,
      "Try rephrasing the query or selecting a broader topic.",
      "Tip: configure an LLM in Settings for richer synthesis.",
    ].join("\n");
  }

  const lines = sources
    .slice(0, 5)
    .map(
      (source, index) =>
        `${index + 1}. ${source.title} [${source.platform}] (${source.similarity}% match)`
    );

  return [
    "Model synthesis is unavailable, but these local conversations are most relevant:",
    ...lines,
    "Open a source to inspect details, then ask a narrower follow-up.",
  ].join("\n");
}

function createToolCall(name: ExploreToolName, inputSummary: string): ExploreToolCall {
  const now = Date.now();
  return {
    id: `tool_${now}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    status: "completed",
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    description: getToolDescription(name),
    inputSummary,
  };
}

function completeToolCall(call: ExploreToolCall, outputSummary: string): void {
  const endedAt = Date.now();
  call.status = "completed";
  call.endedAt = endedAt;
  call.durationMs = Math.max(0, endedAt - call.startedAt);
  call.outputSummary = outputSummary;
}

function failToolCall(call: ExploreToolCall, error: unknown): void {
  const endedAt = Date.now();
  call.status = "failed";
  call.endedAt = endedAt;
  call.durationMs = Math.max(0, endedAt - call.startedAt);
  call.error = (error as Error)?.message ?? "UNKNOWN_ERROR";
}

async function runToolStep<T>(
  toolCalls: ExploreToolCall[],
  name: ExploreToolName,
  inputSummary: string,
  executor: () => Promise<T>,
  outputSummaryBuilder: (value: T) => string
): Promise<T> {
  const call = createToolCall(name, inputSummary);
  try {
    const value = await executor();
    completeToolCall(call, outputSummaryBuilder(value));
    toolCalls.push(call);
    return value;
  } catch (error) {
    failToolCall(call, error);
    toolCalls.push(call);
    throw error;
  }
}

function buildSummaryHintsText(
  sources: RelatedConversation[],
  snippets: Map<number, string>
): string {
  const lines: string[] = [];
  for (const source of sources) {
    const snippet = snippets.get(source.id);
    if (!snippet) continue;
    lines.push(`- ${source.title}: ${truncateInline(snippet, 240)}`);
  }
  return lines.join("\n");
}

function buildEvidenceBrief(params: {
  query: string;
  sources: RelatedConversation[];
  candidates: ExploreContextCandidate[];
  searchScope?: ExploreSearchScope;
  plan?: ExploreRouteDecision;
  weeklySummaryText?: string;
  mode: ExploreMode;
  retrievalMeta?: RetrievalMetaV1;
}): string {
  const { query, sources, candidates, searchScope, plan, weeklySummaryText, mode, retrievalMeta } =
    params;
  const lines: string[] = [
    "# Evidence Brief",
    "",
    `Question: ${query}`,
    `Mode: ${mode === "ask" ? "Ask" : "Search"}`,
    `Route: ${plan?.preferredPath ?? (mode === "search" ? "rag" : "unknown")}`,
    `Scope: ${describeSearchScope(searchScope)}`,
    "",
  ];

  if (plan?.resolvedTimeScope) {
    lines.push(
      "## Time Scope",
      `${plan.resolvedTimeScope.label} (${plan.resolvedTimeScope.startDate} to ${plan.resolvedTimeScope.endDate})`,
      ""
    );
  }

  lines.push("## What This Answer Is Based On");
  if (mode === "search") {
    lines.push(
      `- Retrieved ${sources.length} source conversation${sources.length === 1 ? "" : "s"}.`,
      `- Used ${retrievalMeta?.selectedWindowIds.length ?? candidates.length} evidence window${
        (retrievalMeta?.selectedWindowIds.length ?? candidates.length) === 1 ? "" : "s"
      }.`,
      `- LLM synthesis calls: ${retrievalMeta?.llmCalls ?? 0}.`,
      ""
    );
  } else if (plan?.preferredPath === "weekly_summary") {
    lines.push(
      `- Reviewed ${sources.length} conversation${sources.length === 1 ? "" : "s"} inside the requested time range.`,
      `- Weekly digest available: ${weeklySummaryText?.trim() ? "yes" : "no"}.`,
      ""
    );
  } else {
    lines.push(
      `- Routed through Ask for intent classification and evidence gathering.`,
      `- Retrieved ${sources.length} source conversation${sources.length === 1 ? "" : "s"}.`,
      `- LLM synthesis calls: ${retrievalMeta?.llmCalls ?? 0}.`,
      ""
    );
  }

  if (weeklySummaryText?.trim()) {
    lines.push("## Weekly Summary", weeklySummaryText.trim(), "");
  }

  lines.push("## Evidence");

  if (!sources.length) {
    lines.push("- No relevant conversations were retrieved.");
  } else {
    for (const source of sources) {
      const candidate = candidates.find((item) => item.conversationId === source.id);
      const matchLabel =
        candidate?.matchType === "time_scope" ? "in range" : `${source.similarity}% match`;
      lines.push(
        `- ${source.title} [${source.platform}] (${matchLabel})`,
        `  Why it was included: ${candidate?.selectionReason || "Relevant to the query."}`,
        `  Summary: ${candidate?.summarySnippet || "(not available)"}`,
        `  Excerpt: ${candidate?.excerpt || "(not available)"}`
      );
    }
  }

  lines.push(
    "",
    "## Gaps And Caveats"
  );

  if (!sources.length) {
    lines.push("- Evidence coverage is thin. Broaden the scope or rephrase the query.");
  } else if (plan?.preferredPath === "weekly_summary" && !weeklySummaryText?.trim()) {
    lines.push("- A reusable weekly digest was not available, so the answer may rely more on raw conversation selection.");
  } else if ((retrievalMeta?.llmCalls ?? 0) === 0) {
    lines.push("- No synthesis model was used for the final answer.");
  } else {
    lines.push("- Verify high-stakes claims against the source conversations listed above.");
  }

  return lines.join("\n");
}

function buildRetrievalMetaFromBundle(
  bundle: Awaited<ReturnType<typeof getEvidenceBundle>>,
  route: RetrievalMetaV1["route"],
  llmCalls: number
): RetrievalMetaV1 {
  return {
    retrievalVersion: "retrieval_assets_v1",
    queryClass: bundle.queryClass,
    route,
    bundleId: bundle.queryHash,
    queryHash: bundle.queryHash,
    candidateConversationIds: bundle.conversations.map((item) => item.conversationId),
    selectedWindowIds: bundle.windows.map((item) => item.id),
    assetStatus: bundle.assetStatus,
    llmCalls,
  };
}

function buildRouteSummary(params: {
  mode: ExploreMode;
  searchScope?: ExploreSearchScope;
  routeDecision?: ExploreRouteDecision;
  retrievalMeta?: RetrievalMetaV1;
  evidenceCount: number;
  llmCalls?: number;
}): ExploreRouteSummary {
  const { mode, searchScope, routeDecision, retrievalMeta, evidenceCount, llmCalls } = params;
  const routeLabel =
    mode === "search"
      ? retrievalMeta?.route === "local_fallback"
        ? "Search fallback"
        : "Search RAG"
      : routeDecision?.preferredPath === "weekly_summary"
        ? "Ask weekly summary"
        : routeDecision?.preferredPath === "clarify"
          ? "Ask clarify"
          : retrievalMeta?.route === "local_fallback"
            ? "Ask RAG fallback"
            : "Ask RAG";

  return {
    mode,
    routeLabel,
    evidenceCount,
    scopeLabel: describeSearchScope(searchScope),
    llmCalls: llmCalls ?? retrievalMeta?.llmCalls ?? 0,
    timeScopeLabel: routeDecision?.resolvedTimeScope?.label,
  };
}

function buildInspectMeta(params: {
  mode: ExploreMode;
  query: string;
  searchScope?: ExploreSearchScope;
  routeDecision?: ExploreRouteDecision;
  toolCalls: ExploreToolCall[];
  retrievalMeta?: RetrievalMetaV1;
  evidenceBrief?: string;
  contextCandidates?: ExploreContextCandidate[];
  selectedContextConversationIds?: number[];
  totalDurationMs?: number;
  llmCalls?: number;
}): ExploreInspectMeta {
  const {
    mode,
    query,
    searchScope,
    routeDecision,
    toolCalls,
    retrievalMeta,
    evidenceBrief,
    contextCandidates,
    selectedContextConversationIds,
    totalDurationMs,
    llmCalls,
  } = params;

  const routeSummary = buildRouteSummary({
    mode,
    searchScope,
    routeDecision,
    retrievalMeta,
    evidenceCount:
      retrievalMeta?.selectedWindowIds.length ??
      contextCandidates?.length ??
      selectedContextConversationIds?.length ??
      0,
    llmCalls,
  });

  return {
    mode,
    query,
    searchScope,
    routeDecision,
    plan: routeDecision,
    toolCalls,
    retrievalMeta,
    evidenceBrief,
    contextDraft: evidenceBrief,
    contextCandidates,
    selectedContextConversationIds,
    totalDurationMs,
    routeSummary,
  };
}

async function runRetrievalCore(params: {
  query: string;
  limit: number;
  sessionId?: string;
  searchScope?: ExploreSearchScope;
  toolCalls: ExploreToolCall[];
  traceRewriteStep?: boolean;
}): Promise<SharedRetrievalCoreResult> {
  const {
    query,
    limit,
    sessionId,
    searchScope,
    toolCalls,
    traceRewriteStep = false,
  } = params;

  const rewriteHints = traceRewriteStep
    ? await runToolStep(
        toolCalls,
        "query_planner",
        `query="${truncateInline(query, 100)}", scope=${describeSearchScope(searchScope)}`,
        async () => getQueryRewriteHints({ query, sessionId }),
        (value) =>
          `standalone="${truncateInline(value.standaloneQuery, 120)}", preservedTerms=${value.preservedTerms.length}`
      )
    : await getQueryRewriteHints({ query, sessionId });

  const bundle = await runToolStep(
    toolCalls,
    "search_rag",
    `sourceLimit=${limit}, scope=${describeSearchScope(searchScope)}`,
    async () =>
      getEvidenceBundle({
        query,
        sessionId,
        limit,
        searchScope,
        rewriteHints,
      }),
    (value) => `conversations=${value.conversations.length}, windows=${value.windows.length}`
  );

  const contextCandidates = await runToolStep(
    toolCalls,
    "context_compiler",
    `conversations=${bundle.conversations.length}, windows=${bundle.windows.length}`,
    async () => buildContextCandidatesFromBundle(bundle),
    (value) => `candidates=${value.length}`
  );

  return {
    rewriteHints,
    bundle,
    sources: buildSourcesFromBundle(bundle),
    contextCandidates,
    selectedContextConversationIds: contextCandidates.map(
      (candidate) => candidate.conversationId
    ),
  };
}

function filterConversationsBySearchScope(
  conversations: Conversation[],
  searchScope?: ExploreSearchScope
): Conversation[] {
  const scopedIds = getScopedConversationIds(searchScope);
  if (!scopedIds) {
    return conversations;
  }

  const scopedIdSet = new Set(scopedIds);
  return conversations.filter((conversation) => scopedIdSet.has(conversation.id));
}

function buildWeeklySources(conversations: Conversation[]): RelatedConversation[] {
  return conversations.slice(0, MAX_WEEKLY_SOURCE_CHIPS).map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    platform: conversation.platform,
    similarity: 100,
  }));
}

async function buildWeeklyContextCandidates(
  conversations: Conversation[],
  timeScope: ExploreResolvedTimeScope
): Promise<ExploreContextCandidate[]> {
  const candidates: ExploreContextCandidate[] = [];

  for (const conversation of conversations.slice(0, MAX_WEEKLY_CANDIDATES)) {
    const summary = await getSummary(conversation.id);
    candidates.push({
      conversationId: conversation.id,
      title: conversation.title,
      platform: conversation.platform,
      similarity: 100,
      matchType: "time_scope",
      selectionReason: `Included because it falls within ${timeScope.label} (${timeScope.startDate} to ${timeScope.endDate}).`,
      summarySnippet: summary?.content?.trim()
        ? truncateInline(summary.content, 260)
        : undefined,
      excerpt: conversation.snippet ? truncateInline(conversation.snippet, 260) : undefined,
    });
  }

  return candidates;
}

async function buildWeeklyEvidenceText(conversations: Conversation[]): Promise<string> {
  if (!conversations.length) {
    return "(no conversations in the selected time range)";
  }

  const lines: string[] = [];
  for (const conversation of conversations.slice(0, 8)) {
    const summary = await getSummary(conversation.id);
    lines.push(
      `- ${conversation.title} [${conversation.platform}]`,
      `  Started: ${formatLocalIsoDate(
        new Date(getConversationOriginAt(conversation))
      )}`,
      `  Captured: ${formatLocalIsoDate(
        new Date(getConversationCaptureFreshnessAt(conversation))
      )}`,
      `  Snippet: ${truncateInline(conversation.snippet || "No snippet available", 220)}`,
      `  Summary: ${
        summary?.content?.trim()
          ? truncateInline(summary.content, 240)
          : "(no cached summary)"
      }`
    );
  }

  return lines.join("\n");
}

async function buildCustomWeeklySummary(params: {
  settings: LlmConfig;
  query: string;
  timeScope: ExploreResolvedTimeScope;
  conversations: Conversation[];
}): Promise<string> {
  const evidence = await buildWeeklyEvidenceText(params.conversations);
  const systemPrompt = [
    "You are Vesti's weekly exploration summarizer.",
    "Summarize what the user worked on, discussed, decided, or explored during the requested time window.",
    "If evidence is thin, state that clearly and point to the listed conversations for manual inspection.",
    "Keep the answer concise but concrete.",
  ].join(" ");

  const userPrompt = [
    `User query: ${params.query}`,
    `Time scope: ${params.timeScope.label} (${params.timeScope.startDate} to ${params.timeScope.endDate})`,
    "",
    "Evidence:",
    evidence,
  ].join("\n");

  const result = await callExploreInference(params.settings, userPrompt, { systemPrompt });
  return result.content.trim();
}

function buildWeeklyLocalFallbackAnswer(params: {
  query: string;
  timeScope: ExploreResolvedTimeScope;
  sources: RelatedConversation[];
  summaryText?: string;
  scoped: boolean;
}): string {
  const lines: string[] = [];
  if (params.summaryText?.trim()) {
    lines.push(params.summaryText.trim(), "");
  } else {
    lines.push(
      `I could not synthesize a full answer for "${truncateInline(params.query, 120)}" without model assistance.`,
      `The relevant window is ${params.timeScope.label} (${params.timeScope.startDate} to ${params.timeScope.endDate}).`,
      ""
    );
  }

  if (params.sources.length === 0) {
    lines.push(
      params.scoped
        ? "No conversations were found in that time window within the selected scope."
        : "No conversations were found in that time window.",
      "Try broadening the scope or asking for a different period."
    );
    return lines.join("\n");
  }

  lines.push("You can inspect these conversations to verify the answer:");
  params.sources.forEach((source, index) => {
    lines.push(`${index + 1}. ${source.title} [${source.platform}]`);
  });
  lines.push("Open the source chips or switch to Library to inspect them directly.");

  return lines.join("\n");
}

async function resolveWeeklySummary(params: {
  query: string;
  timeScope: ExploreResolvedTimeScope;
  searchScope?: ExploreSearchScope;
  settings: LlmConfig | null;
}): Promise<WeeklySummaryToolResult> {
  const allConversations = await listConversationsByRange(
    params.timeScope.rangeStart,
    params.timeScope.rangeEnd
  );
  const conversations = filterConversationsBySearchScope(allConversations, params.searchScope);
  const sources = buildWeeklySources(conversations);
  const scoped = Boolean(getScopedConversationIds(params.searchScope));

  if (!conversations.length) {
    return {
      summaryText: "",
      sourceOrigin: "local_only",
      conversations,
      sources,
    };
  }

  if (!scoped) {
    const cached = await getWeeklyReport(params.timeScope.rangeStart, params.timeScope.rangeEnd);
    if (cached?.content?.trim()) {
      return {
        summaryText: cached.content.trim(),
        sourceOrigin: "cached_report",
        conversations,
        sources,
      };
    }
  }

  if (!hasUsableLlmSettings(params.settings)) {
    return {
      summaryText: "",
      sourceOrigin: "local_only",
      conversations,
      sources,
    };
  }

  if (!scoped) {
    try {
      const generated = await generateWeeklyReport(
        params.settings,
        params.timeScope.rangeStart,
        params.timeScope.rangeEnd
      );
      if (generated.content?.trim()) {
        return {
          summaryText: generated.content.trim(),
          sourceOrigin: "generated_report",
          conversations,
          sources,
        };
      }
    } catch {
      // Fall through to custom weekly synthesis.
    }
  }

  const summaryText = await buildCustomWeeklySummary({
    settings: params.settings,
    query: params.query,
    timeScope: params.timeScope,
    conversations,
  });

  return {
    summaryText,
    sourceOrigin: summaryText ? "custom_summary" : "local_only",
    conversations,
    sources,
  };
}

async function retrieveRagContext(
  query: string,
  limit: number,
  searchScope?: ExploreSearchScope
): Promise<RagRetrievalResult> {
  const preparedQuery = normalizeEmbeddingInput(query);
  if (!preparedQuery) {
    throw new Error("QUERY_EMPTY");
  }

  const queryVector = toFloat32Array(await embedText(preparedQuery));
  const vectors = await db.vectors.toArray();
  const scored: Array<{ id: number; similarity: number }> = [];
  const scopedConversationIds = getScopedConversationIds(searchScope);
  const scopedConversationIdSet = scopedConversationIds
    ? new Set(scopedConversationIds)
    : undefined;

  for (const vector of vectors) {
    if (
      scopedConversationIdSet &&
      !scopedConversationIdSet.has(vector.conversation_id)
    ) {
      continue;
    }
    const embedding = toFloat32Array(vector.embedding as Float32Array | number[]);
    if (embedding.length !== queryVector.length || embedding.length === 0) continue;
    const similarity = cosineSimilarity(queryVector, embedding);
    if (similarity < 0.15) continue;
    scored.push({ id: vector.conversation_id, similarity });
  }

  const safeLimit = Math.max(1, limit);
  const top = scored.sort((a, b) => b.similarity - a.similarity).slice(0, safeLimit);
  if (scopedConversationIds?.length) {
    const topIds = new Set(top.map((item) => item.id));
    for (const conversationId of scopedConversationIds) {
      if (top.length >= safeLimit) break;
      if (topIds.has(conversationId)) continue;
      top.push({ id: conversationId, similarity: 0 });
      topIds.add(conversationId);
    }
  }
  const conversations = top.length
    ? await db.conversations.bulkGet(top.map((item) => item.id))
    : [];
  const byId = new Map<number, Conversation>();

  for (const conversation of conversations) {
    if (conversation?.id !== undefined) {
      byId.set(conversation.id, conversation as Conversation);
    }
  }

  const sources: RelatedConversation[] = [];
  const contextBlocks: string[] = [];
  const items: RagRetrievalItem[] = [];

  for (const topItem of top) {
    const conversation = byId.get(topItem.id);
    if (!conversation) continue;

    const messages = await db.messages
      .where("conversation_id")
      .equals(conversation.id)
      .sortBy("created_at");

    const source: RelatedConversation = {
      id: conversation.id,
      title: conversation.title,
      platform: conversation.platform,
      similarity: Math.round(topItem.similarity * 100),
    };
    const annotationRecords = await db.annotations
      .where("conversation_id")
      .equals(conversation.id)
      .toArray();
    const annotations = annotationRecords
      .filter((record): record is Annotation => typeof record?.content_text === "string")
      .map((record) => ({
        id: record.id as number,
        conversation_id: record.conversation_id,
        message_id: record.message_id,
        content_text: record.content_text,
        created_at: record.created_at,
        days_after: record.days_after,
      }));

    const contextBlock = buildConversationContext(conversation, messages, annotations);
    const excerpt = extractExcerpt(messages);

    sources.push(source);
    contextBlocks.push(contextBlock);
    items.push({ source, contextBlock, excerpt });
  }

  return {
    sources,
    context: contextBlocks.join("\n\n---\n\n"),
    items,
  };
}

async function resolveSummarySnippets(
  _settings: Awaited<ReturnType<typeof getLlmSettings>>,
  sources: RelatedConversation[],
  targetCount: number
): Promise<SummaryToolResult> {
  const snippets = new Map<number, string>();
  let cacheHits = 0;
  let generated = 0;
  let failed = 0;

  for (const source of sources.slice(0, targetCount)) {
    try {
      const existing = await getSummary(source.id);
      if (existing?.content?.trim()) {
        snippets.set(source.id, truncateInline(existing.content, 320));
        cacheHits += 1;
        continue;
      }
      failed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    snippets,
    cacheHits,
    generated,
    failed,
  };
}

function buildContextCandidates(
  retrieval: RagRetrievalResult,
  summarySnippets: Map<number, string>
): ExploreContextCandidate[] {
  return retrieval.items.map((item) => ({
    conversationId: item.source.id,
    title: item.source.title,
    platform: item.source.platform,
    similarity: item.source.similarity,
    matchType: "semantic",
    selectionReason: "Retrieved by semantic similarity against the user's query.",
    summarySnippet: summarySnippets.get(item.source.id),
    excerpt: item.excerpt,
  }));
}

async function runSearchKnowledgeBase(
  query: string,
  historyContext: string,
  limit: number,
  searchScope?: ExploreSearchScope,
  existingRetrieval?: RagRetrievalResult,
  sessionId?: string
): Promise<RagResponse> {
  void existingRetrieval;
  const toolCalls: ExploreToolCall[] = [];
  const startedAt = Date.now();
  let bundle: Awaited<ReturnType<typeof getEvidenceBundle>> | undefined;
  let contextCandidates: ExploreContextCandidate[] = [];
  let sources: RelatedConversation[] = [];
  let selectedContextConversationIds: number[] = [];
  try {
    const retrievalCore = await runRetrievalCore({
      query,
      limit,
      sessionId,
      searchScope,
      toolCalls,
      traceRewriteStep: true,
    });
    bundle = retrievalCore.bundle;
    contextCandidates = retrievalCore.contextCandidates;
    sources = retrievalCore.sources;
    selectedContextConversationIds = retrievalCore.selectedContextConversationIds;
  } catch {
    const evidenceBrief = buildEvidenceBrief({
      query,
      sources: [],
      candidates: [],
      searchScope,
      mode: "search",
    });
    const inspect = buildInspectMeta({
      mode: "search",
      query,
      searchScope,
      toolCalls,
      evidenceBrief,
      totalDurationMs: Date.now() - startedAt,
    });
    return {
      answer: buildLocalFallbackAnswer(query, []),
      sources: [],
      inspect,
      agent: inspect,
    };
  }
  const settings = await getLlmSettings();

  if (!hasUsableLlmSettings(settings)) {
    const answer = await runToolStep(
      toolCalls,
      "answer_synthesizer",
      `windows=${bundle.windows.length}, llmCalls=0`,
      async () => Promise.resolve(buildLocalAnswerFromBundle(query, bundle!)),
      (value) => `answerChars=${value.length}`
    );
    const retrievalMeta = buildRetrievalMetaFromBundle(bundle, "local_fallback", 0);
    const evidenceBrief = buildEvidenceBrief({
      query,
      sources,
      candidates: contextCandidates,
      searchScope,
      mode: "search",
      retrievalMeta,
    });
    const inspect = buildInspectMeta({
      mode: "search",
      query,
      searchScope,
      toolCalls,
      retrievalMeta,
      evidenceBrief,
      contextCandidates,
      selectedContextConversationIds,
      totalDurationMs: Date.now() - startedAt,
    });
    recordRetrievalObservation("search > local_fallback", bundle.windows.length);
    return {
      answer,
      sources,
      inspect,
      agent: inspect,
      retrievalMeta,
      assetStatus: bundle.assetStatus,
      bundleId: bundle.queryHash,
      queryHash: bundle.queryHash,
    };
  }

  try {
    const answer = await runToolStep(
      toolCalls,
      "answer_synthesizer",
      `windows=${bundle.windows.length}, llmCalls=1`,
      async () => {
        const systemPrompt = buildEvidencePrompt(bundle!, historyContext);
        const result = await callExploreInference(settings, query, { systemPrompt });
        return result.content.trim() || buildLocalAnswerFromBundle(query, bundle!);
      },
      (value) => `answerChars=${value.length}`
    );
    const retrievalMeta = buildRetrievalMetaFromBundle(bundle, "deterministic_rag", 1);
    const evidenceBrief = buildEvidenceBrief({
      query,
      sources,
      candidates: contextCandidates,
      searchScope,
      mode: "search",
      retrievalMeta,
    });
    const inspect = buildInspectMeta({
      mode: "search",
      query,
      searchScope,
      toolCalls,
      retrievalMeta,
      evidenceBrief,
      contextCandidates,
      selectedContextConversationIds,
      totalDurationMs: Date.now() - startedAt,
    });
    recordRetrievalObservation("search > deterministic_rag", bundle.windows.length);
    return {
      answer,
      sources,
      inspect,
      agent: inspect,
      retrievalMeta,
      assetStatus: bundle.assetStatus,
      bundleId: bundle.queryHash,
      queryHash: bundle.queryHash,
    };
  } catch {
    const retrievalMeta = buildRetrievalMetaFromBundle(bundle, "local_fallback", 0);
    const evidenceBrief = buildEvidenceBrief({
      query,
      sources,
      candidates: contextCandidates,
      searchScope,
      mode: "search",
      retrievalMeta,
    });
    const inspect = buildInspectMeta({
      mode: "search",
      query,
      searchScope,
      toolCalls,
      retrievalMeta,
      evidenceBrief,
      contextCandidates,
      selectedContextConversationIds,
      totalDurationMs: Date.now() - startedAt,
    });
    recordRetrievalObservation("search > local_fallback", bundle.windows.length);
    return {
      answer: buildLocalAnswerFromBundle(query, bundle),
      sources,
      inspect,
      agent: inspect,
      retrievalMeta,
      assetStatus: bundle.assetStatus,
      bundleId: bundle.queryHash,
      queryHash: bundle.queryHash,
    };
  }
}

async function synthesizeAgentAnswer(params: {
  query: string;
  historyContext: string;
  retrieval: RagRetrievalResult;
  summaryHints: string;
  settings: Awaited<ReturnType<typeof getLlmSettings>>;
}): Promise<string> {
  const { query, historyContext, retrieval, summaryHints, settings } = params;
  if (!hasUsableLlmSettings(settings)) {
    return buildLocalFallbackAnswer(query, retrieval.sources);
  }

  const systemPrompt = buildContextualRagPrompt(
    retrieval.context,
    historyContext,
    summaryHints
  );

  try {
    const result = await callExploreInference(settings, query, { systemPrompt });
    const answer = result.content.trim();
    if (!answer) {
      return buildLocalFallbackAnswer(query, retrieval.sources);
    }
    return answer;
  } catch {
    return buildLocalFallbackAnswer(query, retrieval.sources);
  }
}

async function synthesizeWeeklyAnswer(params: {
  query: string;
  historyContext: string;
  timeScope: ExploreResolvedTimeScope;
  weeklySummaryText: string;
  sources: RelatedConversation[];
  settings: Awaited<ReturnType<typeof getLlmSettings>>;
  scoped: boolean;
}): Promise<string> {
  const { query, historyContext, timeScope, weeklySummaryText, sources, settings, scoped } =
    params;

  if (!hasUsableLlmSettings(settings)) {
    return buildWeeklyLocalFallbackAnswer({
      query,
      timeScope,
      sources,
      summaryText: weeklySummaryText,
      scoped,
    });
  }

  const sourceLines =
    sources.length > 0
      ? sources.map((source) => `- ${source.title} [${source.platform}]`).join("\n")
      : "- No conversations were found in this time scope.";

  const systemPrompt = [
    "You are Vesti's transparent Explore answer synthesizer.",
    historyContext,
    `Time scope: ${timeScope.label} (${timeScope.startDate} to ${timeScope.endDate}).`,
    "Weekly digest evidence:",
    weeklySummaryText || "(no weekly digest available)",
    "",
    "Source conversations:",
    sourceLines,
    "",
    "Instructions:",
    "1. Answer the user's specific question using the weekly digest and source list.",
    "2. If evidence is partial, say that clearly.",
    "3. Tell the user which source conversations to open when deeper verification is needed.",
    "4. Keep the answer grounded in the selected time window.",
    "5. Prefer a complete answer over an ultra-short one.",
  ].join("\n");

  try {
    const result = await callExploreInference(settings, query, { systemPrompt });
    const answer = result.content.trim();
    if (!answer) {
      return buildWeeklyLocalFallbackAnswer({
        query,
        timeScope,
        sources,
        summaryText: weeklySummaryText,
        scoped,
      });
    }
    return answer;
  } catch {
    return buildWeeklyLocalFallbackAnswer({
      query,
      timeScope,
      sources,
      summaryText: weeklySummaryText,
      scoped,
    });
  }
}

async function runAskKnowledgeBase(
  query: string,
  historyContext: string,
  limit: number,
  options?: ExploreAskOptions,
  sessionId?: string
): Promise<RagResponse> {
  const toolCalls: ExploreToolCall[] = [];
  const startedAt = Date.now();
  let bundle: Awaited<ReturnType<typeof getEvidenceBundle>> | undefined;
  let routeDecision: ExploreRouteDecision | undefined;
  let weeklyResult: WeeklySummaryToolResult | undefined;
  let evidenceBrief = "";
  let contextCandidates: ExploreContextCandidate[] = [];
  let selectedContextConversationIds: number[] = [];
  const searchScope = options?.searchScope;
  const settings = await getLlmSettings();
  const routerLlmCalls = hasUsableLlmSettings(settings) ? 1 : 0;

  try {
    routeDecision = await runToolStep(
      toolCalls,
      "intent_router",
      `query="${truncateInline(query, 100)}", scope=${describeSearchScope(searchScope)}`,
      async () =>
        planAgentIntent({
          query,
          historyContext,
          requestedLimit: limit,
          searchScope,
          settings,
        }),
      (value) =>
        `intent=${value.intent}, route=${value.preferredPath}, sourceLimit=${value.sourceLimit}, reason=${truncateInline(value.reason, 100)}`
    );

    routeDecision = {
      ...routeDecision,
      toolPlan: buildToolPlan(routeDecision.preferredPath, "ask"),
    };

    if (routeDecision.needsClarification || routeDecision.preferredPath === "clarify") {
      evidenceBrief = buildEvidenceBrief({
        query,
        sources: [],
        candidates: [],
        searchScope,
        plan: routeDecision,
        mode: "ask",
      });

      const inspect = buildInspectMeta({
        mode: "ask",
        query,
        searchScope,
        routeDecision,
        toolCalls,
        evidenceBrief,
        contextCandidates,
        selectedContextConversationIds,
        totalDurationMs: Date.now() - startedAt,
        llmCalls: routerLlmCalls,
      });
      recordRetrievalObservation("ask > clarify", 0);

      return {
        answer:
          routeDecision.clarifyingQuestion ||
          "I need one more constraint before I can answer this reliably.",
        sources: [],
        inspect,
        agent: inspect,
      };
    }

    if (routeDecision.preferredPath === "weekly_summary") {
      const resolvedTimeScope = await runToolStep(
        toolCalls,
        "time_scope_resolver",
        `requested=${routeDecision.requestedTimeScope?.preset ?? "none"}`,
        async () => {
          const resolved =
            routeDecision?.resolvedTimeScope ??
            resolveRequestedTimeScope(routeDecision?.requestedTimeScope);
          if (!resolved) {
            throw new Error("TIME_SCOPE_UNRESOLVED");
          }
          return resolved;
        },
        (value) => `${value.label} (${value.startDate} to ${value.endDate})`
      );

      routeDecision = {
        ...routeDecision,
        resolvedTimeScope,
        toolPlan: buildToolPlan("weekly_summary", "ask"),
      };

      weeklyResult = await runToolStep(
        toolCalls,
        "weekly_summary_tool",
        `scope=${resolvedTimeScope.label}, searchScope=${describeSearchScope(searchScope)}`,
        async () =>
          resolveWeeklySummary({
            query,
            timeScope: resolvedTimeScope,
            searchScope,
            settings,
          }),
        (value) =>
          `sourceOrigin=${value.sourceOrigin}, conversations=${value.conversations.length}, sources=${value.sources.length}`
      );

      contextCandidates = await runToolStep(
        toolCalls,
        "context_compiler",
        `sources=${weeklyResult.sources.length}, route=weekly_summary`,
        async () =>
          buildWeeklyContextCandidates(weeklyResult!.conversations, resolvedTimeScope),
        (value) => `candidates=${value.length}`
      );

      selectedContextConversationIds = contextCandidates.map(
        (candidate) => candidate.conversationId
      );

      const answer = await runToolStep(
        toolCalls,
        "answer_synthesizer",
        `route=weekly_summary, sources=${weeklyResult.sources.length}`,
        async () =>
          synthesizeWeeklyAnswer({
            query,
            historyContext,
            timeScope: resolvedTimeScope,
            weeklySummaryText: weeklyResult!.summaryText,
            sources: weeklyResult!.sources,
            settings,
            scoped: Boolean(getScopedConversationIds(searchScope)),
          }),
        (value) => `answerChars=${value.length}`
      );

      evidenceBrief = buildEvidenceBrief({
        query,
        sources: weeklyResult.sources,
        candidates: contextCandidates,
        searchScope,
        plan: routeDecision,
        weeklySummaryText: weeklyResult.summaryText,
        mode: "ask",
      });
      const inspect = buildInspectMeta({
        mode: "ask",
        query,
        searchScope,
        routeDecision,
        toolCalls,
        evidenceBrief,
        contextCandidates,
        selectedContextConversationIds,
        totalDurationMs: Date.now() - startedAt,
        llmCalls: routerLlmCalls + (hasUsableLlmSettings(settings) ? 1 : 0),
      });
      recordRetrievalObservation("ask > weekly_summary", 0);

      return {
        answer,
        sources: weeklyResult.sources,
        inspect,
        agent: inspect,
      };
    }

    const retrievalCore = await runRetrievalCore({
      query,
      limit: routeDecision.sourceLimit,
      sessionId,
      searchScope,
      toolCalls,
    });
    bundle = retrievalCore.bundle;
    contextCandidates = retrievalCore.contextCandidates;
    selectedContextConversationIds = retrievalCore.selectedContextConversationIds;

    const answer = await runToolStep(
      toolCalls,
      "answer_synthesizer",
      `windows=${bundle.windows.length}`,
      async () =>
        hasUsableLlmSettings(settings)
          ? (async () => {
              const result = await callExploreInference(settings, query, {
                systemPrompt: buildEvidencePrompt(bundle!, historyContext),
              });
              return result.content.trim() || buildLocalAnswerFromBundle(query, bundle!);
            })()
          : Promise.resolve(buildLocalAnswerFromBundle(query, bundle!)),
      (value) => `answerChars=${value.length}`
    );

    const sources = retrievalCore.sources;
    const retrievalMeta = buildRetrievalMetaFromBundle(
      bundle,
      hasUsableLlmSettings(settings) ? "deterministic_rag" : "local_fallback",
      hasUsableLlmSettings(settings) ? 1 : 0
    );
    evidenceBrief = buildEvidenceBrief({
      query,
      sources,
      candidates: contextCandidates,
      searchScope,
      plan: routeDecision,
      mode: "ask",
      retrievalMeta,
    });
    const inspect = buildInspectMeta({
      mode: "ask",
      query,
      searchScope,
      routeDecision,
      toolCalls,
      retrievalMeta,
      evidenceBrief,
      contextCandidates,
      selectedContextConversationIds,
      totalDurationMs: Date.now() - startedAt,
      llmCalls: routerLlmCalls + retrievalMeta.llmCalls,
    });
    recordRetrievalObservation(
      hasUsableLlmSettings(settings) ? "ask > deterministic_rag" : "ask > local_fallback",
      bundle.windows.length
    );

    return {
      answer,
      sources,
      inspect,
      agent: inspect,
      retrievalMeta,
      assetStatus: bundle.assetStatus,
      bundleId: bundle.queryHash,
      queryHash: bundle.queryHash,
    };
  } catch {
    if (routeDecision?.preferredPath === "weekly_summary" && routeDecision.resolvedTimeScope) {
      if (!evidenceBrief) {
        contextCandidates = weeklyResult
          ? await buildWeeklyContextCandidates(
              weeklyResult.conversations,
              routeDecision.resolvedTimeScope
            )
          : [];
        evidenceBrief = buildEvidenceBrief({
          query,
          sources: weeklyResult?.sources ?? [],
          candidates: contextCandidates,
          searchScope,
          plan: routeDecision,
          weeklySummaryText: weeklyResult?.summaryText,
          mode: "ask",
        });
        selectedContextConversationIds = contextCandidates.map(
          (candidate) => candidate.conversationId
        );
      }

      const inspect = buildInspectMeta({
        mode: "ask",
        query,
        searchScope,
        routeDecision,
        toolCalls,
        evidenceBrief,
        contextCandidates,
        selectedContextConversationIds,
        totalDurationMs: Date.now() - startedAt,
        llmCalls: routerLlmCalls + (hasUsableLlmSettings(settings) ? 1 : 0),
      });
      recordRetrievalObservation("ask > weekly_summary", 0);

      return {
        answer: buildWeeklyLocalFallbackAnswer({
          query,
          timeScope: routeDecision.resolvedTimeScope,
          sources: weeklyResult?.sources ?? [],
          summaryText: weeklyResult?.summaryText,
          scoped: Boolean(getScopedConversationIds(searchScope)),
        }),
        sources: weeklyResult?.sources ?? [],
        inspect,
        agent: inspect,
      };
    }

    const fallback = await runSearchKnowledgeBase(
      query,
      historyContext,
      limit,
      searchScope,
      undefined,
      sessionId
    );

    if (!evidenceBrief && bundle) {
      contextCandidates = await buildContextCandidatesFromBundle(bundle);
      evidenceBrief = buildEvidenceBrief({
        query,
        sources: buildSourcesFromBundle(bundle),
        candidates: contextCandidates,
        searchScope,
        plan: routeDecision,
        mode: "ask",
        retrievalMeta: fallback.retrievalMeta,
      });
      selectedContextConversationIds = contextCandidates.map(
        (candidate) => candidate.conversationId
      );
    }

    const inspect = buildInspectMeta({
      mode: "ask",
      query,
      searchScope,
      routeDecision,
      toolCalls: [...toolCalls, ...(fallback.inspect?.toolCalls ?? [])],
      retrievalMeta: fallback.retrievalMeta,
      evidenceBrief:
        evidenceBrief ??
        fallback.inspect?.evidenceBrief ??
        fallback.inspect?.contextDraft,
      contextCandidates,
      selectedContextConversationIds,
      totalDurationMs: Date.now() - startedAt,
      llmCalls: routerLlmCalls + (fallback.retrievalMeta?.llmCalls ?? 0),
    });
    recordRetrievalObservation(
      fallback.retrievalMeta?.route === "local_fallback"
        ? "ask > local_fallback"
        : fallback.retrievalMeta?.route === "weekly_summary"
          ? "ask > weekly_summary"
          : "ask > deterministic_rag",
      fallback.retrievalMeta?.selectedWindowIds.length ?? 0
    );

    return {
      answer: fallback.answer,
      sources: fallback.sources,
      inspect,
      agent: inspect,
      retrievalMeta: fallback.retrievalMeta,
      assetStatus: fallback.assetStatus,
      bundleId: fallback.bundleId,
      queryHash: fallback.queryHash,
    };
  }
}

export async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getConversationText(
  conversationId: number
): Promise<{ conversation: Conversation; text: string }> {
  const conversation = await db.conversations.get(conversationId);
  if (!conversation || conversation.id === undefined) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  const messages = await db.messages
    .where("conversation_id")
    .equals(conversationId)
    .sortBy("created_at");

  const messageTexts = messages
    .slice(0, MAX_MESSAGE_COUNT)
    .map((message) => message.content_text)
    .filter(Boolean);

  const annotationRecords = await db.annotations
    .where("conversation_id")
    .equals(conversationId)
    .toArray();
  const annotations = annotationRecords
    .filter((record): record is Annotation => typeof record?.content_text === "string")
    .map((record) => ({
      id: record.id as number,
      conversation_id: record.conversation_id,
      message_id: record.message_id,
      content_text: record.content_text,
      created_at: record.created_at,
      days_after: record.days_after,
    }));

  const text = buildConversationText(
    conversation as Conversation,
    messageTexts,
    annotations
  );
  return { conversation: conversation as Conversation, text };
}

type EdgeQueryOptions = {
  threshold?: number;
  conversationIds?: number[];
};

function normalizeConversationIds(conversationIds?: number[]): number[] {
  if (!Array.isArray(conversationIds)) {
    return [];
  }

  const seen = new Set<number>();
  const normalizedIds: number[] = [];

  conversationIds.forEach((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const normalized = Math.floor(value);
    if (normalized <= 0 || seen.has(normalized)) return;
    seen.add(normalized);
    normalizedIds.push(normalized);
  });

  return normalizedIds;
}

async function ensureVectorsForConversations(conversationIds: number[]): Promise<void> {
  await buildRetrievalAssets({ conversationIds });
}

export async function ensureVectorForConversation(
  conversationId: number,
  text: string
): Promise<void> {
  const preparedText = normalizeEmbeddingInput(text);
  if (!preparedText) return;

  const textHash = await hashText(preparedText);

  const existing = await db.vectors
    .where("conversation_id")
    .equals(conversationId)
    .and((record) => record.text_hash === textHash)
    .first();
  if (existing && existing.id !== undefined) return;

  const embedding = await embedText(preparedText);

  await db.transaction("rw", db.vectors, async () => {
    await db.vectors
      .where("conversation_id")
      .equals(conversationId)
      .and((record) => record.text_hash !== textHash)
      .delete();

    await db.vectors.add({
      conversation_id: conversationId,
      text_hash: textHash,
      embedding,
    });
  });
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
  }
  return dot;
}

export async function findRelatedConversations(
  conversationId: number,
  limit = 3
): Promise<RelatedConversation[]> {
  await buildRetrievalAssets({ conversationIds: [conversationId] });

  const targetVector = await db.vectors
    .where("conversation_id")
    .equals(conversationId)
    .first();
  if (!targetVector) return [];

  const vectors = await db.vectors.toArray();
  const targetEmbedding = toFloat32Array(targetVector.embedding);

  const scores: Array<{ id: number; similarity: number }> = [];
  for (const vector of vectors) {
    if (vector.conversation_id === conversationId) continue;
    const embedding = toFloat32Array(vector.embedding as Float32Array | number[]);
    const similarity = cosineSimilarity(targetEmbedding, embedding);
    scores.push({ id: vector.conversation_id, similarity });
  }

  const top = scores.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  const conversations = await db.conversations.bulkGet(top.map((item) => item.id));
  const byId = new Map<number, Conversation>();
  conversations.forEach((item) => {
    if (item && item.id !== undefined) {
      byId.set(item.id, item as Conversation);
    }
  });

  return top
    .map((item) => {
      const conversation = byId.get(item.id);
      if (!conversation) return null;
      return {
        id: conversation.id,
        title: conversation.title,
        platform: conversation.platform,
        similarity: Math.round(item.similarity * 100),
      } as RelatedConversation;
    })
    .filter(Boolean) as RelatedConversation[];
}

export async function findAllEdges(
  options: EdgeQueryOptions = {}
): Promise<Array<{ source: number; target: number; weight: number }>> {
  const threshold = options.threshold ?? 0.3;
  const targetConversationIds = normalizeConversationIds(options.conversationIds);

  const vectors = Array.isArray(options.conversationIds)
    ? targetConversationIds.length === 0
      ? []
      : await (async () => {
          await ensureVectorsForConversations(targetConversationIds);
          return db.vectors.where("conversation_id").anyOf(targetConversationIds).toArray();
        })()
    : await db.vectors.toArray();

  const edges: Array<{ source: number; target: number; weight: number }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const left = vectors[i];
      const right = vectors[j];
      if (
        typeof left.conversation_id !== "number" ||
        typeof right.conversation_id !== "number"
      ) {
        continue;
      }

      const a = toFloat32Array(left.embedding as Float32Array | number[]);
      const b = toFloat32Array(right.embedding as Float32Array | number[]);
      if (a.length !== b.length || a.length === 0) continue;

      const similarity = cosineSimilarity(a, b);
      if (similarity < threshold) continue;

      const key = `${left.conversation_id}-${right.conversation_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      edges.push({
        source: left.conversation_id,
        target: right.conversation_id,
        weight: Math.round(similarity * 100) / 100,
      });
    }
  }

  return edges;
}

export async function askKnowledgeBase(
  userQuery: string,
  existingSessionId?: string,
  limit = MAX_RAG_SOURCES,
  mode: ExploreMode = "search",
  options?: ExploreAskOptions
): Promise<RagResponse & { sessionId: string }> {
  const query = userQuery.trim();
  if (!query) {
    throw new Error("QUERY_EMPTY");
  }

  let sessionId = existingSessionId;
  if (!sessionId) {
    sessionId = await createExploreSession(query.slice(0, 100));
  }

  await addExploreMessage(sessionId, {
    role: "user",
    content: query,
    timestamp: Date.now(),
  });

  const recentMessages = await getExploreMessages(sessionId);
  const historyContext = buildHistoryContext(recentMessages.slice(-6));

  const result =
    mode === "search"
      ? await runSearchKnowledgeBase(
          query,
          historyContext,
          limit,
          options?.searchScope,
          undefined,
          sessionId
        )
      : await runAskKnowledgeBase(query, historyContext, limit, options, sessionId);

  await addExploreMessage(sessionId, {
    role: "assistant",
    content: result.answer,
    sources: result.sources,
    inspectMeta: result.inspect ?? result.agent,
    timestamp: Date.now(),
  });

  await updateExploreSession(sessionId, {
    preview: result.answer.slice(0, 100),
  });

  return {
    ...result,
    sessionId,
  };
}

export async function hybridSearch(query: string): Promise<RagResponse> {
  return askKnowledgeBase(query, undefined, MAX_RAG_SOURCES, "search");
}

export async function getVectorStats(): Promise<{
  totalVectors: number;
  totalConversations: number;
  vectorizedConversations: number;
  unvectorizedConversations: number;
}> {
  const totalVectors = await db.vectors.count();
  const allConversations = await db.conversations.toArray();
  const totalConversations = allConversations.length;

  const vectorizedIds = new Set<number>();
  const vectors = await db.vectors.toArray();
  vectors.forEach((v) => vectorizedIds.add(v.conversation_id));

  return {
    totalVectors,
    totalConversations,
    vectorizedConversations: vectorizedIds.size,
    unvectorizedConversations: totalConversations - vectorizedIds.size,
  };
}

export async function vectorizeAllConversations(): Promise<number> {
  const result = await buildRetrievalAssets();
  return result.built;
}
