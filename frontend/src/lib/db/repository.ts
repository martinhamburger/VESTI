import type {
  Annotation,
  Conversation,
  ConversationCapsuleV1,
  ConversationMatchSummary,
  ConversationSummaryV2,
  DataOverviewSnapshot,
  ExploreInspectMeta,
  ExploreMessage,
  ExploreMode,
  ExploreRouteDecision,
  ExploreRouteSummary,
  ExploreSession,
  ExploreToolName,
  EvidenceWindowV1,
  ExportFormat,
  ExportPayload,
  Message,
  Note,
  RelatedConversation,
  RetrievalMetaV1,
  RetrievalAssetStatusV1,
  RetrievalDiagnosticsSnapshot,
  Topic,
  DashboardStats,
  Platform,
  InsightFormat,
  InsightStatus,
  StorageUsageSnapshot,
  SummaryRecord,
  WeeklyLiteReportV1,
  WeeklyReportRecord,
  SearchConversationMatchesQuery,
} from "../types";
import type { ConversationFilters } from "../messaging/protocol";
import {
  buildExportJsonV1,
  buildExportMdV1,
  buildExportTxtV1,
} from "../services/exportSerializers";
import {
  getConversationCaptureFreshnessAt,
  getConversationFirstCapturedAt,
  getConversationOriginAt,
} from "../conversations/timestamps";
import { SUPPORTED_PLATFORMS, normalizePlatform } from "../platform";
import { normalizeMessageArtifacts } from "../utils/messageArtifacts";
import { normalizeMessageCitations } from "../utils/messageCitations";
import { db } from "./schema";
import { enforceStorageWriteGuard, getStorageUsageSnapshot } from "./storageLimits";
import type {
  AnnotationRecord,
  ConversationCapsuleRecord,
  ConversationRecord,
  EvidenceWindowRecord,
  ExploreMessageRecord,
  ExploreSessionRecord,
  MessageRecord,
  NoteRecord,
  RetrievalAssetStatusRecord,
  SummaryRecordRecord,
  TopicRecord,
  WeeklyReportRecordRecord,
  WindowVectorRecord,
} from "./schema";

type ExploreSourceRecord = RelatedConversation;

const retrievalRuntimeMetrics = {
  lastRoute: undefined as string | undefined,
  totalBundleWindows: 0,
  bundleCount: 0,
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeExploreSources(
  sources: ExploreSourceRecord[] | undefined
): ExploreSourceRecord[] | undefined {
  if (!sources) {
    return undefined;
  }

  return sources.flatMap((source) => {
    const platform = normalizePlatform(source.platform);
    if (!platform) {
      return [];
    }

    return [{ ...source, platform }];
  });
}

function parseExploreSources(raw?: string): ExploreSourceRecord[] | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as ExploreSourceRecord[];
    return normalizeExploreSources(parsed);
  } catch {
    return undefined;
  }
}

function normalizeExploreMode(value: unknown): ExploreMode {
  if (value === "ask" || value === "agent") {
    return "ask";
  }
  return "search";
}

function normalizeExploreToolName(value: unknown): ExploreToolName | undefined {
  if (value === "intent_planner" || value === "intent_router") {
    return "intent_router";
  }
  if (
    value === "time_scope_resolver" ||
    value === "weekly_summary_tool" ||
    value === "query_planner" ||
    value === "search_rag" ||
    value === "summary_tool" ||
    value === "context_compiler" ||
    value === "answer_synthesizer"
  ) {
    return value;
  }
  return undefined;
}

function normalizeRouteDecision(raw: unknown): ExploreRouteDecision | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const candidate = raw as Record<string, unknown>;
  const requestedTimeScopeRaw =
    candidate.requestedTimeScope && typeof candidate.requestedTimeScope === "object"
      ? (candidate.requestedTimeScope as Record<string, unknown>)
      : undefined;
  const requestedTimeScopePreset: ExploreRouteDecision["requestedTimeScope"] extends infer T
    ? T extends { preset: infer P }
      ? P
      : never
    : never =
    requestedTimeScopeRaw?.preset === "current_week_to_date" ||
    requestedTimeScopeRaw?.preset === "last_7_days" ||
    requestedTimeScopeRaw?.preset === "last_full_week" ||
    requestedTimeScopeRaw?.preset === "custom"
      ? requestedTimeScopeRaw.preset
      : "none";
  const requestedTimeScope =
    requestedTimeScopeRaw
      ? {
          preset: requestedTimeScopePreset,
          label:
            typeof requestedTimeScopeRaw.label === "string"
              ? requestedTimeScopeRaw.label
              : undefined,
          startDate:
            typeof requestedTimeScopeRaw.startDate === "string"
              ? requestedTimeScopeRaw.startDate
              : undefined,
          endDate:
            typeof requestedTimeScopeRaw.endDate === "string"
              ? requestedTimeScopeRaw.endDate
              : undefined,
        }
      : undefined;

  const resolvedTimeScopeRaw =
    candidate.resolvedTimeScope && typeof candidate.resolvedTimeScope === "object"
      ? (candidate.resolvedTimeScope as Record<string, unknown>)
      : undefined;
  const resolvedTimeScopePreset: ExploreRouteDecision["resolvedTimeScope"] extends infer T
    ? T extends { preset: infer P }
      ? P
      : never
    : never =
    resolvedTimeScopeRaw?.preset === "current_week_to_date" ||
    resolvedTimeScopeRaw?.preset === "last_7_days" ||
    resolvedTimeScopeRaw?.preset === "last_full_week" ||
    resolvedTimeScopeRaw?.preset === "custom"
      ? resolvedTimeScopeRaw.preset
      : "last_7_days";
  const resolvedTimeScope =
    resolvedTimeScopeRaw
      ? {
          preset: resolvedTimeScopePreset,
          label:
            typeof resolvedTimeScopeRaw.label === "string"
              ? resolvedTimeScopeRaw.label
              : "Resolved range",
          rangeStart:
            typeof resolvedTimeScopeRaw.rangeStart === "number" &&
            Number.isFinite(resolvedTimeScopeRaw.rangeStart)
              ? resolvedTimeScopeRaw.rangeStart
              : 0,
          rangeEnd:
            typeof resolvedTimeScopeRaw.rangeEnd === "number" &&
            Number.isFinite(resolvedTimeScopeRaw.rangeEnd)
              ? resolvedTimeScopeRaw.rangeEnd
              : 0,
          startDate:
            typeof resolvedTimeScopeRaw.startDate === "string"
              ? resolvedTimeScopeRaw.startDate
              : "",
          endDate:
            typeof resolvedTimeScopeRaw.endDate === "string"
              ? resolvedTimeScopeRaw.endDate
              : "",
        }
      : undefined;

  return {
    intent:
      candidate.intent === "cross_conversation_summary" ||
      candidate.intent === "weekly_review" ||
      candidate.intent === "timeline" ||
      candidate.intent === "clarification_needed"
        ? candidate.intent
        : ("fact_lookup" as const),
    reason:
      typeof candidate.reason === "string" && candidate.reason.trim()
        ? candidate.reason
        : "UNSPECIFIED_REASON",
    preferredPath:
      candidate.preferredPath === "weekly_summary" || candidate.preferredPath === "clarify"
        ? candidate.preferredPath
        : ("rag" as const),
    sourceLimit:
      typeof candidate.sourceLimit === "number" && Number.isFinite(candidate.sourceLimit)
        ? candidate.sourceLimit
        : 5,
    needsClarification:
      typeof candidate.needsClarification === "boolean"
        ? candidate.needsClarification
        : undefined,
    clarifyingQuestion:
      typeof candidate.clarifyingQuestion === "string"
        ? candidate.clarifyingQuestion
        : undefined,
    requestedTimeScope,
    resolvedTimeScope:
      resolvedTimeScope &&
      resolvedTimeScope.rangeStart > 0 &&
      resolvedTimeScope.rangeEnd >= resolvedTimeScope.rangeStart
        ? resolvedTimeScope
        : undefined,
    toolPlan: Array.isArray(candidate.toolPlan)
      ? candidate.toolPlan
          .map((toolName) => normalizeExploreToolName(toolName))
          .filter((toolName): toolName is ExploreToolName => Boolean(toolName))
      : undefined,
  };
}

function normalizeRetrievalMeta(raw: unknown): RetrievalMetaV1 | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const candidate = raw as Record<string, unknown>;
  if (candidate.retrievalVersion !== "retrieval_assets_v1") {
    return undefined;
  }

  const assetStatusRaw =
    candidate.assetStatus && typeof candidate.assetStatus === "object"
      ? (candidate.assetStatus as Record<string, unknown>)
      : undefined;

  return {
    retrievalVersion: "retrieval_assets_v1",
    queryClass:
      candidate.queryClass === "engineering_exact" ||
      candidate.queryClass === "time_or_summary" ||
      candidate.queryClass === "general_semantic"
        ? candidate.queryClass
        : "general_semantic",
    route:
      candidate.route === "weekly_summary" || candidate.route === "local_fallback"
        ? candidate.route
        : "deterministic_rag",
    bundleId: typeof candidate.bundleId === "string" ? candidate.bundleId : "",
    queryHash: typeof candidate.queryHash === "string" ? candidate.queryHash : "",
    candidateConversationIds: Array.isArray(candidate.candidateConversationIds)
      ? candidate.candidateConversationIds.filter(
          (id): id is number => typeof id === "number" && Number.isFinite(id)
        )
      : [],
    selectedWindowIds: Array.isArray(candidate.selectedWindowIds)
      ? candidate.selectedWindowIds.filter((id): id is string => typeof id === "string")
      : [],
    assetStatus:
      assetStatusRaw
        ? {
            scopedConversationCount:
              typeof assetStatusRaw.scopedConversationCount === "number"
                ? assetStatusRaw.scopedConversationCount
                : 0,
            readyConversationCount:
              typeof assetStatusRaw.readyConversationCount === "number"
                ? assetStatusRaw.readyConversationCount
                : 0,
            staleConversationIds: Array.isArray(assetStatusRaw.staleConversationIds)
              ? assetStatusRaw.staleConversationIds.filter(
                  (id): id is number => typeof id === "number" && Number.isFinite(id)
                )
              : [],
            missingConversationIds: Array.isArray(assetStatusRaw.missingConversationIds)
              ? assetStatusRaw.missingConversationIds.filter(
                  (id): id is number => typeof id === "number" && Number.isFinite(id)
                )
              : [],
          }
        : {
            scopedConversationCount: 0,
            readyConversationCount: 0,
            staleConversationIds: [],
            missingConversationIds: [],
          },
    llmCalls:
      typeof candidate.llmCalls === "number" && Number.isFinite(candidate.llmCalls)
        ? candidate.llmCalls
        : 0,
  };
}

function normalizeRouteSummary(raw: unknown): ExploreRouteSummary | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const candidate = raw as Record<string, unknown>;
  return {
    mode: normalizeExploreMode(candidate.mode),
    routeLabel:
      typeof candidate.routeLabel === "string" && candidate.routeLabel.trim()
        ? candidate.routeLabel
        : "Unknown",
    evidenceCount:
      typeof candidate.evidenceCount === "number" && Number.isFinite(candidate.evidenceCount)
        ? candidate.evidenceCount
        : 0,
    scopeLabel:
      typeof candidate.scopeLabel === "string" && candidate.scopeLabel.trim()
        ? candidate.scopeLabel
        : "All conversations",
    llmCalls:
      typeof candidate.llmCalls === "number" && Number.isFinite(candidate.llmCalls)
        ? candidate.llmCalls
        : 0,
    timeScopeLabel:
      typeof candidate.timeScopeLabel === "string" ? candidate.timeScopeLabel : undefined,
  };
}

function normalizeExploreInspectMeta(
  meta: ExploreInspectMeta | undefined
): ExploreInspectMeta | undefined {
  if (!meta) {
    return undefined;
  }

  const normalizedCandidates = Array.isArray(meta.contextCandidates)
    ? meta.contextCandidates
        .filter((candidate) => candidate && typeof candidate === "object")
        .map((candidate) => {
          const platform = normalizePlatform(candidate.platform);
          return {
            ...candidate,
            platform: platform ?? candidate.platform,
          };
        })
    : undefined;

  const selectedContextConversationIds = Array.isArray(
    meta.selectedContextConversationIds
  )
    ? meta.selectedContextConversationIds.filter(
        (id): id is number => typeof id === "number" && Number.isFinite(id)
      )
    : undefined;

  const toolCalls = Array.isArray(meta.toolCalls)
    ? meta.toolCalls
        .filter((toolCall) => toolCall && typeof toolCall === "object")
        .map((toolCall) => {
          const normalizedName = normalizeExploreToolName(toolCall.name);
          if (!normalizedName) {
            return null;
          }
          return {
            ...toolCall,
            name: normalizedName,
            description:
              typeof toolCall.description === "string" ? toolCall.description : undefined,
          };
        })
        .filter(Boolean)
    : [];

  const searchScope =
    meta.searchScope && typeof meta.searchScope === "object"
      ? {
          mode:
            meta.searchScope.mode === "selected"
              ? ("selected" as const)
              : ("all" as const),
          conversationIds: Array.isArray(meta.searchScope.conversationIds)
            ? meta.searchScope.conversationIds.filter(
                (id): id is number => typeof id === "number" && Number.isFinite(id)
              )
            : undefined,
        }
      : undefined;

  const routeDecision = normalizeRouteDecision(
    (meta as unknown as Record<string, unknown>).routeDecision ?? meta.plan
  );
  const evidenceBrief =
    typeof meta.evidenceBrief === "string"
      ? meta.evidenceBrief
      : typeof meta.contextDraft === "string"
        ? meta.contextDraft
        : undefined;
  const retrievalMeta = normalizeRetrievalMeta(meta.retrievalMeta);
  const routeSummary = normalizeRouteSummary(meta.routeSummary);

  return {
    ...meta,
    mode: normalizeExploreMode(meta.mode),
    query: typeof meta.query === "string" ? meta.query : undefined,
    searchScope,
    routeDecision,
    plan: routeDecision,
    toolCalls,
    retrievalMeta,
    evidenceBrief,
    contextDraft: evidenceBrief,
    contextCandidates: normalizedCandidates,
    selectedContextConversationIds,
    totalDurationMs:
      typeof meta.totalDurationMs === "number" && Number.isFinite(meta.totalDurationMs)
        ? meta.totalDurationMs
        : undefined,
    routeSummary,
  };
}

function parseExploreInspectMeta(raw?: string): ExploreInspectMeta | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as ExploreInspectMeta;
    return normalizeExploreInspectMeta(parsed);
  } catch {
    return undefined;
  }
}

function serializeExploreInspectMeta(meta?: ExploreInspectMeta): string | undefined {
  const normalized = normalizeExploreInspectMeta(meta);
  if (!normalized) {
    return undefined;
  }

  try {
    return JSON.stringify(normalized);
  } catch {
    return undefined;
  }
}

function toConversation(record: ConversationRecord): Conversation {
  if (record.id === undefined) {
    throw new Error("Conversation record missing id");
  }
  const messageCount =
    typeof record.message_count === "number" && Number.isFinite(record.message_count)
      ? Math.max(0, Math.floor(record.message_count))
      : 0;
  const turnCount =
    typeof record.turn_count === "number" && Number.isFinite(record.turn_count)
      ? Math.max(0, Math.floor(record.turn_count))
      : Math.floor(messageCount / 2);
  const platform = normalizePlatform((record as { platform?: unknown }).platform);
  const createdAt =
    typeof record.created_at === "number" && Number.isFinite(record.created_at)
      ? record.created_at
      : 0;
  const updatedAt =
    typeof record.updated_at === "number" && Number.isFinite(record.updated_at)
      ? record.updated_at
      : createdAt;
  const firstCapturedAt =
    typeof record.first_captured_at === "number" &&
    Number.isFinite(record.first_captured_at)
      ? record.first_captured_at
      : createdAt;
  const lastCapturedAt =
    typeof record.last_captured_at === "number" &&
    Number.isFinite(record.last_captured_at)
      ? record.last_captured_at
      : updatedAt;

  return {
    ...(record as Conversation),
    platform: platform ?? record.platform,
    source_created_at:
      typeof record.source_created_at === "number" &&
      Number.isFinite(record.source_created_at)
        ? record.source_created_at
        : null,
    created_at: createdAt,
    updated_at: updatedAt,
    first_captured_at: firstCapturedAt,
    last_captured_at: lastCapturedAt,
    turn_count: turnCount,
  };
}

function toTopic(record: TopicRecord): Topic {
  if (record.id === undefined) {
    throw new Error("Topic record missing id");
  }
  return {
    ...record,
    id: record.id,
  };
}

function toMessage(record: MessageRecord): Message {
  if (record.id === undefined) {
    throw new Error("Message record missing id");
  }
  const degradedNodesCount =
    typeof record.degraded_nodes_count === "number" &&
    Number.isFinite(record.degraded_nodes_count)
      ? Math.max(0, Math.floor(record.degraded_nodes_count))
      : 0;

  return {
    ...(record as Message),
    content_ast: (record.content_ast ?? null) as Message["content_ast"],
    content_ast_version: record.content_ast_version ?? null,
    degraded_nodes_count: degradedNodesCount,
    citations: normalizeMessageCitations(record.citations),
    artifacts: normalizeMessageArtifacts(record.artifacts),
    normalized_html_snapshot:
      typeof record.normalized_html_snapshot === "string"
        ? record.normalized_html_snapshot
        : null,
  };
}

function toAnnotation(record: AnnotationRecord & { id: number }): Annotation {
  return {
    id: record.id,
    conversation_id: record.conversation_id,
    message_id: record.message_id,
    content_text: record.content_text,
    created_at: record.created_at,
    days_after: record.days_after,
  };
}

export interface AnnotationExportContext {
  annotation: Annotation;
  conversation: Conversation;
  message: Message;
  messages: Message[];
}

function toSummary(record: SummaryRecordRecord): SummaryRecord {
  if (record.id === undefined) {
    throw new Error("Summary record missing id");
  }

  const summary = record as SummaryRecord;
  const format: InsightFormat =
    summary.format ?? (summary.structured ? "structured_v1" : "plain_text");
  const status: InsightStatus =
    summary.status ?? (summary.structured ? "ok" : "fallback");

  const isV2Structured = (value: unknown): value is ConversationSummaryV2 => {
    if (!value || typeof value !== "object") return false;
    return "core_question" in value && "thinking_journey" in value;
  };

  return {
    ...summary,
    structured: summary.structured ?? null,
    format,
    status,
    sourceHash:
      typeof summary.sourceHash === "string" && summary.sourceHash.trim().length > 0
        ? summary.sourceHash
        : undefined,
    schemaVersion:
      summary.schemaVersion ??
      (isV2Structured(summary.structured)
        ? "conversation_summary.v2"
        : summary.structured
          ? "conversation_summary.v1"
          : undefined),
  };
}

function toWeeklyReport(record: WeeklyReportRecordRecord): WeeklyReportRecord {
  if (record.id === undefined) {
    throw new Error("Weekly report record missing id");
  }

  const weekly = record as WeeklyReportRecord;
  const format: InsightFormat =
    weekly.format ?? (weekly.structured ? "structured_v1" : "plain_text");
  const status: InsightStatus =
    weekly.status ?? (weekly.structured ? "ok" : "fallback");

  const isWeeklyLiteStructured = (value: unknown): value is WeeklyLiteReportV1 => {
    if (!value || typeof value !== "object") return false;
    return "time_range" in value && "highlights" in value;
  };

  return {
    ...weekly,
    structured: weekly.structured ?? null,
    format,
    status,
    schemaVersion:
      weekly.schemaVersion ??
      (isWeeklyLiteStructured(weekly.structured)
        ? "weekly_lite.v1"
        : weekly.structured
          ? "weekly_report.v1"
          : undefined),
  };
}

function toConversationCapsule(record: ConversationCapsuleRecord): ConversationCapsuleV1 {
  return {
    ...record,
    keywords: normalizeStringArray(record.keywords),
    entities: normalizeStringArray(record.entities),
    tags: normalizeStringArray(record.tags),
    decisions: Array.isArray(record.decisions) ? record.decisions : [],
    openQuestions: Array.isArray(record.openQuestions) ? record.openQuestions : [],
    actionItems: Array.isArray(record.actionItems) ? record.actionItems : [],
    refs: {
      filePaths: normalizeStringArray(record.refs?.filePaths),
      commands: normalizeStringArray(record.refs?.commands),
      apis: normalizeStringArray(record.refs?.apis),
      hosts: normalizeStringArray(record.refs?.hosts),
      urls: normalizeStringArray(record.refs?.urls),
    },
    artifacts: Array.isArray(record.artifacts) ? record.artifacts : [],
    stats: {
      messageCount:
        typeof record.stats?.messageCount === "number" && Number.isFinite(record.stats.messageCount)
          ? Math.max(0, Math.floor(record.stats.messageCount))
          : 0,
      windowCount:
        typeof record.stats?.windowCount === "number" && Number.isFinite(record.stats.windowCount)
          ? Math.max(0, Math.floor(record.stats.windowCount))
          : 0,
      hasCode: Boolean(record.stats?.hasCode),
      hasArtifacts: Boolean(record.stats?.hasArtifacts),
      lastMessageAt:
        typeof record.stats?.lastMessageAt === "number" &&
        Number.isFinite(record.stats.lastMessageAt)
          ? record.stats.lastMessageAt
          : undefined,
    },
  };
}

function toEvidenceWindow(record: EvidenceWindowRecord): EvidenceWindowV1 {
  return {
    ...record,
    labels: Array.isArray(record.labels) ? record.labels : [],
    lexicalTerms: normalizeStringArray(record.lexicalTerms),
    artifactRefs: normalizeStringArray(record.artifactRefs),
  };
}

function toRetrievalAssetStatus(
  record: RetrievalAssetStatusRecord
): RetrievalAssetStatusV1 {
  return {
    ...record,
    windowCount:
      typeof record.windowCount === "number" && Number.isFinite(record.windowCount)
        ? Math.max(0, Math.floor(record.windowCount))
        : 0,
    windowVectorCount:
      typeof record.windowVectorCount === "number" && Number.isFinite(record.windowVectorCount)
        ? Math.max(0, Math.floor(record.windowVectorCount))
        : 0,
  };
}

function markStatusStaleIfNeeded(
  status: RetrievalAssetStatusV1,
  conversation?: ConversationRecord
): RetrievalAssetStatusV1 {
  if (!conversation || status.state !== "ready") {
    return status;
  }

  const conversationUpdatedAt =
    typeof conversation.updated_at === "number" && Number.isFinite(conversation.updated_at)
      ? conversation.updated_at
      : 0;

  if (conversationUpdatedAt > status.sourceUpdatedAt) {
    return {
      ...status,
      state: "stale",
    };
  }

  return status;
}

function normalizeTag(tag: string): string {
  return tag.replace(/\s+/g, " ").trim();
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function initPlatformDistribution(): Record<Platform, number> {
  return Object.fromEntries(
    SUPPORTED_PLATFORMS.map((platform) => [platform, 0])
  ) as Record<Platform, number>;
}

const MAX_CONVERSATION_TITLE_LENGTH = 120;

export async function listConversations(
  filters?: ConversationFilters
): Promise<Conversation[]> {
  let results: ConversationRecord[];

  if (filters?.platform) {
    results = await db.conversations
      .where("platform")
      .equals(filters.platform)
      .toArray();
  } else {
    results = await db.conversations.toArray();
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    results = results.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.snippet.toLowerCase().includes(q)
    );
  }

  if (filters?.dateRange) {
    results = results.filter(
      (c) => {
        const originAt = getConversationOriginAt(toConversation(c));
        return originAt >= filters.dateRange!.start && originAt <= filters.dateRange!.end;
      }
    );
  }

  return results
    .sort(
      (a, b) =>
        getConversationOriginAt(toConversation(b)) -
        getConversationOriginAt(toConversation(a))
    )
    .map(toConversation);
}

export async function getConversationById(id: number): Promise<Conversation | null> {
  const record = await db.conversations.get(id);
  return record ? toConversation(record) : null;
}

export async function getTopics(): Promise<Topic[]> {
  const [topicRecords, conversations] = await Promise.all([
    db.topics.toArray(),
    db.conversations.toArray(),
  ]);

  const directCounts = new Map<number, number>();
  for (const convo of conversations) {
    if (convo.is_archived || convo.is_trash) continue;
    const topicId = convo.topic_id ?? null;
    if (topicId === null) continue;
    directCounts.set(topicId, (directCounts.get(topicId) ?? 0) + 1);
  }

  const nodeById = new Map<number, Topic>();
  for (const record of topicRecords) {
    if (record.id === undefined) {
      continue;
    }
    nodeById.set(record.id, {
      ...toTopic(record),
      count: directCounts.get(record.id) ?? 0,
      children: [],
    });
  }

  const roots: Topic[] = [];
  for (const node of nodeById.values()) {
    const parentId = node.parent_id;
    if (parentId !== null && nodeById.has(parentId)) {
      nodeById.get(parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortByName = (items: Topic[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
  };

  const aggregateCounts = (node: Topic): number => {
    if (!node.children || node.children.length === 0) {
      return node.count ?? 0;
    }
    sortByName(node.children);
    const childTotal = node.children.reduce(
      (sum, child) => sum + aggregateCounts(child),
      0
    );
    node.count = (node.count ?? 0) + childTotal;
    return node.count ?? 0;
  };

  sortByName(roots);
  roots.forEach((root) => aggregateCounts(root));

  return roots;
}

export async function createTopic(payload: {
  name: string;
  parent_id?: number | null;
}): Promise<Topic> {
  const normalizedName = payload.name.trim();
  if (!normalizedName) {
    throw new Error("TOPIC_NAME_EMPTY");
  }

  const parentId = payload.parent_id ?? null;
  if (parentId !== null) {
    const parent = await db.topics.get(parentId);
    if (!parent) {
      throw new Error("PARENT_TOPIC_NOT_FOUND");
    }
  }

  const existing =
    parentId === null
      ? await db.topics
          .where("name")
          .equals(normalizedName)
          .and((record) => record.parent_id === null)
          .first()
      : await db.topics
          .where("[parent_id+name]")
          .equals([parentId, normalizedName])
          .first();
  if (existing) {
    throw new Error("TOPIC_ALREADY_EXISTS");
  }

  await enforceStorageWriteGuard();
  const now = Date.now();
  const id = await db.topics.add({
    name: normalizedName,
    parent_id: parentId,
    created_at: now,
    updated_at: now,
  });

  return {
    id,
    name: normalizedName,
    parent_id: parentId,
    created_at: now,
    updated_at: now,
    count: 0,
    children: [],
  };
}

export async function updateConversationTopic(
  id: number,
  topic_id: number | null
): Promise<Conversation> {
  const existing = await db.conversations.get(id);
  if (!existing) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }
  if (existing.id === undefined) {
    throw new Error("Conversation record missing id");
  }

  if (topic_id !== null) {
    const topic = await db.topics.get(topic_id);
    if (!topic) {
      throw new Error("TOPIC_NOT_FOUND");
    }
  }

  const updatedAt = Date.now();
  await db.conversations.update(id, {
    topic_id,
    updated_at: updatedAt,
  });

  return toConversation({
    ...existing,
    topic_id,
    updated_at: updatedAt,
    id: existing.id,
  });
}

export async function updateConversation(
  id: number,
  changes: { topic_id?: number | null; is_starred?: boolean; tags?: string[] }
): Promise<{ updated: boolean; conversation: Conversation }> {
  const existing = await db.conversations.get(id);
  if (!existing) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }
  if (existing.id === undefined) {
    throw new Error("Conversation record missing id");
  }

  const updates: Partial<ConversationRecord> = {};
  let updated = false;

  if (changes.topic_id !== undefined && changes.topic_id !== existing.topic_id) {
    if (changes.topic_id !== null) {
      const topic = await db.topics.get(changes.topic_id);
      if (!topic) {
        throw new Error("TOPIC_NOT_FOUND");
      }
    }
    updates.topic_id = changes.topic_id ?? null;
    updated = true;
  }

  if (
    changes.is_starred !== undefined &&
    changes.is_starred !== existing.is_starred
  ) {
    updates.is_starred = changes.is_starred;
    updated = true;
  }

  if (changes.tags !== undefined) {
    const nextTags = dedupeTags(changes.tags).slice(0, 6);
    const current = existing.tags ?? [];
    const same =
      nextTags.length === current.length &&
      nextTags.every((tag, index) => tag === current[index]);
    if (!same) {
      updates.tags = nextTags;
      updated = true;
    }
  }

  if (!updated) {
    return { updated: false, conversation: toConversation(existing) };
  }

  updates.updated_at = Date.now();
  await db.conversations.update(existing.id, updates);

  return {
    updated: true,
    conversation: toConversation({ ...existing, ...updates, id: existing.id }),
  };
}

export async function applyGardenerResult(
  id: number,
  changes: { topic_id?: number | null; tags?: string[] }
): Promise<{ updated: boolean; conversation: Conversation }> {
  return updateConversation(id, changes);
}

export async function replaceTagAcrossConversations(
  from: string,
  to?: string | null
): Promise<number> {
  const normalizedFrom = from.trim();
  if (!normalizedFrom) {
    throw new Error("TAG_EMPTY");
  }

  const normalizedTo =
    typeof to === "string" ? to.trim() : to === null ? null : undefined;
  if (to !== undefined && to !== null && !normalizedTo) {
    throw new Error("TAG_EMPTY");
  }

  if (normalizedTo && normalizedTo.toLowerCase() === normalizedFrom.toLowerCase()) {
    return 0;
  }

  await enforceStorageWriteGuard();
  const now = Date.now();
  let updated = 0;

  await db.conversations.toCollection().modify((record: Partial<ConversationRecord>) => {
    const tags = Array.isArray(record.tags) ? record.tags : [];
    if (!tags.includes(normalizedFrom)) {
      return;
    }

    let nextTags = tags.filter((tag) => tag !== normalizedFrom);
    if (normalizedTo) {
      nextTags = dedupeTags([...nextTags, normalizedTo]).slice(0, 6);
    }

    const same =
      nextTags.length === tags.length &&
      nextTags.every((tag, index) => tag === tags[index]);
    if (same) {
      return;
    }

    record.tags = nextTags;
    record.updated_at = now;
    updated += 1;
  });

  return updated;
}

export async function renameTagAcrossConversations(
  from: string,
  to: string
): Promise<number> {
  return replaceTagAcrossConversations(from, to);
}

export async function moveTagAcrossConversations(
  from: string,
  to: string
): Promise<number> {
  return replaceTagAcrossConversations(from, to);
}

export async function removeTagFromConversations(tag: string): Promise<number> {
  return replaceTagAcrossConversations(tag, null);
}

export async function listConversationsByRange(
  rangeStart: number,
  rangeEnd: number
): Promise<Conversation[]> {
  const records = await db.conversations.toArray();
  return records
    .map(toConversation)
    .filter((conversation) => {
      const originAt = getConversationOriginAt(conversation);
      return originAt >= rangeStart && originAt <= rangeEnd;
    })
    .sort((a, b) => getConversationOriginAt(b) - getConversationOriginAt(a));
}

export async function listMessages(
  conversationId: number
): Promise<Message[]> {
  const records = await db.messages
    .where("conversation_id")
    .equals(conversationId)
    .sortBy("created_at");

  return records.map(toMessage);
}

export async function listAnnotations(conversationId: number): Promise<Annotation[]> {
  const records = await db.annotations
    .where("conversation_id")
    .equals(conversationId)
    .sortBy("created_at");

  return records
    .filter((record): record is AnnotationRecord & { id: number } =>
      typeof record.id === "number"
    )
    .map(toAnnotation);
}

export async function saveAnnotation(payload: {
  conversationId: number;
  messageId: number;
  contentText: string;
}): Promise<Annotation> {
  const trimmed = payload.contentText.trim();
  if (!trimmed) {
    throw new Error("ANNOTATION_EMPTY");
  }

  const conversation = await db.conversations.get(payload.conversationId);
  if (!conversation) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  const message = await db.messages.get(payload.messageId);
  if (!message || message.conversation_id !== payload.conversationId) {
    throw new Error("MESSAGE_NOT_FOUND");
  }

  await enforceStorageWriteGuard();
  const now = Date.now();
  const daysAfter = Math.max(
    0,
    Math.floor((now - conversation.created_at) / (24 * 60 * 60 * 1000))
  );

  const id = await db.annotations.add({
    conversation_id: payload.conversationId,
    message_id: payload.messageId,
    content_text: trimmed,
    created_at: now,
    days_after: daysAfter,
  });
  const record = await db.annotations.get(id);
  if (!record || record.id === undefined) {
    throw new Error("ANNOTATION_NOT_FOUND");
  }
  return toAnnotation(record as AnnotationRecord & { id: number });
}

export async function deleteAnnotation(annotationId: number): Promise<boolean> {
  const existing = await db.annotations.get(annotationId);
  if (!existing || existing.id === undefined) {
    return false;
  }
  await db.annotations.delete(annotationId);
  return true;
}

export async function getAnnotationExportContext(
  annotationId: number
): Promise<AnnotationExportContext> {
  const annotationRecord = await db.annotations.get(annotationId);
  if (!annotationRecord || annotationRecord.id === undefined) {
    throw new Error("ANNOTATION_NOT_FOUND");
  }

  const conversation = await db.conversations.get(annotationRecord.conversation_id);
  if (!conversation || conversation.id === undefined) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  const message = await db.messages.get(annotationRecord.message_id);
  if (!message || message.id === undefined) {
    throw new Error("MESSAGE_NOT_FOUND");
  }

  const messages = await db.messages
    .where("conversation_id")
    .equals(annotationRecord.conversation_id)
    .sortBy("created_at");

  return {
    annotation: toAnnotation(annotationRecord as AnnotationRecord & { id: number }),
    conversation: toConversation(conversation),
    message: toMessage(message),
    messages: messages.map(toMessage),
  };
}

export async function searchConversationIdsByText(query: string): Promise<number[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const conversationIds = new Set<number>();
  await db.messages.toCollection().each((record) => {
    const conversationId = record.conversation_id;
    if (typeof conversationId !== "number" || conversationIds.has(conversationId)) {
      return;
    }

    const content = record.content_text;
    if (typeof content !== "string") {
      return;
    }

    if (content.toLowerCase().includes(normalizedQuery)) {
      conversationIds.add(conversationId);
    }
  });

  await db.annotations.toCollection().each((record) => {
    const conversationId = (record as AnnotationRecord).conversation_id;
    if (typeof conversationId !== "number" || conversationIds.has(conversationId)) {
      return;
    }

    const content = (record as AnnotationRecord).content_text;
    if (typeof content !== "string") {
      return;
    }

    if (content.toLowerCase().includes(normalizedQuery)) {
      conversationIds.add(conversationId);
    }
  });

  return Array.from(conversationIds);
}

function buildExcerpt(text: string, normalizedQuery: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(normalizedQuery);
  if (idx < 0) {
    return "";
  }
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + normalizedQuery.length + 60);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

export async function searchConversationMatchesByText(
  params: SearchConversationMatchesQuery
): Promise<ConversationMatchSummary[]> {
  const normalizedQuery = params.query.trim().toLowerCase();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const candidateIds = params.conversationIds
    ? Array.from(
        new Set(params.conversationIds.filter((value) => Number.isFinite(value)))
      )
    : null;
  if (candidateIds && candidateIds.length === 0) {
    return [];
  }

  const matchMap = new Map<
    number,
    { messageId: number; createdAt: number; excerpt: string }
  >();

  const collection = candidateIds
    ? db.messages.where("conversation_id").anyOf(candidateIds)
    : db.messages.toCollection();

  await collection.each((record) => {
    const conversationId = record.conversation_id;
    if (typeof conversationId !== "number") {
      return;
    }

    const content = record.content_text;
    if (typeof content !== "string") {
      return;
    }

    if (!content.toLowerCase().includes(normalizedQuery)) {
      return;
    }

    const messageId = record.id;
    if (typeof messageId !== "number") {
      return;
    }

    const createdAt = record.created_at ?? 0;
    const existing = matchMap.get(conversationId);
    const shouldReplace =
      !existing ||
      createdAt < existing.createdAt ||
      (createdAt === existing.createdAt && messageId < existing.messageId);

    if (shouldReplace) {
      matchMap.set(conversationId, {
        messageId,
        createdAt,
        excerpt: buildExcerpt(content, normalizedQuery),
      });
    }
  });

  return Array.from(matchMap.entries()).map(([conversationId, match]) => ({
    conversationId,
    firstMatchedMessageId: match.messageId,
    bestExcerpt: match.excerpt,
  }));
}

export async function deleteConversation(id: number): Promise<boolean> {
  await db.transaction(
    "rw",
    [
      db.conversations,
      db.messages,
      db.annotations,
      db.summaries,
      db.vectors,
      db.conversation_capsules,
      db.evidence_windows,
      db.window_vectors,
      db.retrieval_asset_status,
    ],
    async () => {
      const windowIds = await db.evidence_windows
        .where("conversationId")
        .equals(id)
        .primaryKeys();

      if (windowIds.length > 0) {
        await db.window_vectors.bulkDelete(windowIds as string[]);
      }

      await db.summaries.where("conversationId").equals(id).delete();
      await db.vectors.where("conversation_id").equals(id).delete();
      await db.conversation_capsules.delete(id);
      await db.evidence_windows.where("conversationId").equals(id).delete();
      await db.retrieval_asset_status.delete(id);
      await db.messages.where("conversation_id").equals(id).delete();
      await db.annotations.where("conversation_id").equals(id).delete();
      await db.conversations.delete(id);
    }
  );
  return true;
}

export async function updateConversationTitle(
  id: number,
  title: string
): Promise<Conversation> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("TITLE_EMPTY");
  }
  if (normalizedTitle.length > MAX_CONVERSATION_TITLE_LENGTH) {
    throw new Error("TITLE_TOO_LONG");
  }

  const existing = await db.conversations.get(id);
  if (!existing) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }
  if (existing.id === undefined) {
    throw new Error("Conversation record missing id");
  }
  if (existing.title === normalizedTitle) {
    return toConversation(existing);
  }

  const updated_at = Date.now();
  await db.conversations.update(id, { title: normalizedTitle, updated_at });
  return toConversation({
    ...existing,
    title: normalizedTitle,
    updated_at,
    id: existing.id,
  });
}

export async function clearAllData(): Promise<boolean> {
  await db.transaction(
    "rw",
    [
      db.conversations,
      db.messages,
      db.summaries,
      db.weekly_reports,
      db.vectors,
      db.conversation_capsules,
      db.evidence_windows,
      db.window_vectors,
      db.retrieval_asset_status,
      db.annotations,
    ],
    async () => {
      await db.messages.clear();
      await db.conversations.clear();
      await db.summaries.clear();
      await db.weekly_reports.clear();
      await db.vectors.clear();
      await db.conversation_capsules.clear();
      await db.evidence_windows.clear();
      await db.window_vectors.clear();
      await db.retrieval_asset_status.clear();
      await db.annotations.clear();
    }
  );
  retrievalRuntimeMetrics.lastRoute = undefined;
  retrievalRuntimeMetrics.totalBundleWindows = 0;
  retrievalRuntimeMetrics.bundleCount = 0;
  return true;
}

export async function clearInsightsCache(): Promise<boolean> {
  await db.transaction(
    "rw",
    [
      db.summaries,
      db.weekly_reports,
      db.conversation_capsules,
      db.evidence_windows,
      db.window_vectors,
      db.retrieval_asset_status,
    ],
    async () => {
      await db.summaries.clear();
      await db.weekly_reports.clear();
      await db.conversation_capsules.clear();
      await db.evidence_windows.clear();
      await db.window_vectors.clear();
      await db.retrieval_asset_status.clear();
    }
  );
  retrievalRuntimeMetrics.lastRoute = undefined;
  retrievalRuntimeMetrics.totalBundleWindows = 0;
  retrievalRuntimeMetrics.bundleCount = 0;
  return true;
}

async function collectExportDataset() {
  const conversations = (await db.conversations.toArray()).map(toConversation);
  const messages = (await db.messages.toArray()).map(toMessage);
  const summaries = (await db.summaries.toArray()).map(toSummary);
  const weeklyReports = (await db.weekly_reports.toArray()).map(toWeeklyReport);
  const annotations = (await db.annotations.toArray())
    .filter((record): record is AnnotationRecord & { id: number } =>
      typeof record.id === "number"
    )
    .map(toAnnotation);
  return { conversations, messages, summaries, weeklyReports, annotations };
}

export async function getStorageUsage(): Promise<StorageUsageSnapshot> {
  return getStorageUsageSnapshot();
}

export async function getDataOverview(): Promise<DataOverviewSnapshot> {
  const [storage, totalConversations, summaryRecordCount, weeklyReportCount, capsules, windows, windowVectors, assetStatuses] =
    await Promise.all([
      getStorageUsageSnapshot(),
      db.conversations.count(),
      db.summaries.count(),
      db.weekly_reports.count(),
      db.conversation_capsules.count(),
      db.evidence_windows.count(),
      db.window_vectors.count(),
      listRetrievalAssetStatus(),
    ]);

  const [uniqueSummaryConversationIds, lastSummary] = await Promise.all([
    db.summaries.orderBy("conversationId").uniqueKeys(),
    db.summaries.orderBy("createdAt").last(),
  ]);

  const readyStatuses = assetStatuses.filter((status) => status.state === "ready");
  const staleCount = assetStatuses.filter((status) => status.state === "stale").length;
  const failedCount = assetStatuses.filter((status) => status.state === "failed").length;
  const lastBuildAt = assetStatuses.reduce<number | null>((max, status) => {
    const candidate =
      typeof status.lastBuiltAt === "number" && Number.isFinite(status.lastBuiltAt)
        ? status.lastBuiltAt
        : null;
    if (candidate === null) {
      return max;
    }
    return max === null ? candidate : Math.max(max, candidate);
  }, null);

  const retrievalDiagnostics: RetrievalDiagnosticsSnapshot = {
    capsuleReadyCount: readyStatuses.length,
    windowReadyCount: windowVectors,
    staleCount,
    failedCount,
    totalCapsules: capsules,
    totalWindows: windows,
    capsuleReadyRatio: totalConversations > 0 ? readyStatuses.length / totalConversations : 0,
    windowReadyRatio: windows > 0 ? windowVectors / windows : 0,
    lastBuildAt,
    lastRetrievalRoute: retrievalRuntimeMetrics.lastRoute,
    averageBundleWindows:
      retrievalRuntimeMetrics.bundleCount > 0
        ? Number(
            (
              retrievalRuntimeMetrics.totalBundleWindows / retrievalRuntimeMetrics.bundleCount
            ).toFixed(1)
          )
        : 0,
  };

  return {
    storage,
    totalConversations,
    compactedThreads: uniqueSummaryConversationIds.length,
    summaryRecordCount,
    weeklyReportCount,
    lastCompactionAt:
      typeof lastSummary?.createdAt === "number" ? lastSummary.createdAt : null,
    indexedDbName: db.name,
    retrievalDiagnostics,
  };
}

export async function exportAllData(format: ExportFormat): Promise<ExportPayload> {
  const dataset = await collectExportDataset();
  if (format === "txt") {
    return buildExportTxtV1(dataset);
  }
  if (format === "md") {
    return buildExportMdV1(dataset);
  }
  return buildExportJsonV1(dataset);
}

export async function exportAllDataAsJson(): Promise<string> {
  const payload = await exportAllData("json");
  return payload.content;
}

export async function getSummary(
  conversationId: number
): Promise<SummaryRecord | null> {
  const [record, conversation, assetStatus] = await Promise.all([
    db.summaries.where("conversationId").equals(conversationId).last(),
    db.conversations.get(conversationId),
    db.retrieval_asset_status.get(conversationId),
  ]);

  if (!record || !conversation) {
    return null;
  }

  if (
    typeof record.sourceUpdatedAt === "number" &&
    Number.isFinite(record.sourceUpdatedAt) &&
    typeof conversation.updated_at === "number" &&
    Number.isFinite(conversation.updated_at) &&
    conversation.updated_at > record.sourceUpdatedAt
  ) {
    return null;
  }

  if (
    typeof record.sourceHash === "string" &&
    record.sourceHash.trim().length > 0 &&
    typeof assetStatus?.sourceHash === "string" &&
    assetStatus.sourceHash.trim().length > 0 &&
    record.sourceHash !== assetStatus.sourceHash
  ) {
    return null;
  }

  return record ? toSummary(record) : null;
}

export async function saveSummary(
  record: Omit<SummaryRecord, "id">
): Promise<SummaryRecord> {
  await enforceStorageWriteGuard();

  const existing = await db.summaries
    .where("conversationId")
    .equals(record.conversationId)
    .first();

  if (existing?.id !== undefined) {
    await db.summaries.update(existing.id, record);
    return toSummary({ ...existing, ...record, id: existing.id });
  }

  const id = await db.summaries.add(record);
  return toSummary({ ...record, id });
}

export async function getWeeklyReport(
  rangeStart: number,
  rangeEnd: number
): Promise<WeeklyReportRecord | null> {
  const record = await db.weekly_reports
    .where("rangeStart")
    .equals(rangeStart)
    .and((item) => item.rangeEnd === rangeEnd)
    .first();
  if (!record) {
    return null;
  }

  if (!record.sourceHash?.trim()) {
    return null;
  }

  const currentSourceHash = await buildWeeklyReportSourceHash(rangeStart, rangeEnd);
  if (currentSourceHash !== record.sourceHash) {
    return null;
  }

  return toWeeklyReport(record);
}

export async function saveWeeklyReport(
  record: Omit<WeeklyReportRecord, "id">
): Promise<WeeklyReportRecord> {
  await enforceStorageWriteGuard();

  const existing = await db.weekly_reports
    .where("rangeStart")
    .equals(record.rangeStart)
    .and((item) => item.rangeEnd === record.rangeEnd)
    .first();

  if (existing?.id !== undefined) {
    await db.weekly_reports.update(existing.id, record);
    return toWeeklyReport({ ...existing, ...record, id: existing.id });
  }

  const id = await db.weekly_reports.add(record);
  return toWeeklyReport({ ...record, id });
}

async function computeConversationFreshnessKey(conversationId: number): Promise<string> {
  const [conversation, assetStatus] = await Promise.all([
    db.conversations.get(conversationId),
    db.retrieval_asset_status.get(conversationId),
  ]);

  if (!conversation?.id) {
    return "";
  }

  if (assetStatus?.sourceHash?.trim()) {
    return assetStatus.sourceHash.trim();
  }

  return [
    conversation.id,
    conversation.updated_at,
    conversation.message_count,
    conversation.turn_count,
    conversation.title,
  ].join(":");
}

export async function buildWeeklyReportSourceHash(
  rangeStart: number,
  rangeEnd: number,
  conversations?: Conversation[]
): Promise<string> {
  const scopedConversations = conversations ?? (await listConversationsByRange(rangeStart, rangeEnd));
  if (scopedConversations.length === 0) {
    return hashText(`weekly:${rangeStart}:${rangeEnd}:empty`);
  }

  const parts = await Promise.all(
    scopedConversations.map(async (conversation) => {
      const freshnessKey = await computeConversationFreshnessKey(conversation.id);
      return `${conversation.id}:${freshnessKey}`;
    })
  );

  return hashText(parts.sort().join("|"));
}

export function recordRetrievalObservation(route: string, bundleWindowCount: number): void {
  retrievalRuntimeMetrics.lastRoute = route;
  retrievalRuntimeMetrics.bundleCount += 1;
  retrievalRuntimeMetrics.totalBundleWindows += Math.max(0, bundleWindowCount);
}

export async function getConversationCapsule(
  conversationId: number
): Promise<ConversationCapsuleV1 | null> {
  const record = await db.conversation_capsules.get(conversationId);
  return record ? toConversationCapsule(record) : null;
}

export async function listConversationCapsules(
  conversationIds?: number[]
): Promise<ConversationCapsuleV1[]> {
  const records =
    Array.isArray(conversationIds) && conversationIds.length > 0
      ? await db.conversation_capsules.bulkGet(conversationIds)
      : await db.conversation_capsules.toArray();

  return records
    .filter((record): record is ConversationCapsuleRecord => Boolean(record))
    .map(toConversationCapsule);
}

export async function saveConversationCapsule(
  capsule: ConversationCapsuleV1
): Promise<ConversationCapsuleV1> {
  await enforceStorageWriteGuard();
  await db.conversation_capsules.put(capsule);
  return toConversationCapsule(capsule);
}

export async function getEvidenceWindowsByConversationIds(
  conversationIds: number[]
): Promise<EvidenceWindowV1[]> {
  if (!conversationIds.length) {
    return [];
  }

  const records = await db.evidence_windows.where("conversationId").anyOf(conversationIds).toArray();
  return records.map(toEvidenceWindow);
}

export async function replaceEvidenceWindows(
  conversationId: number,
  windows: EvidenceWindowV1[]
): Promise<EvidenceWindowV1[]> {
  await enforceStorageWriteGuard();

  await db.transaction("rw", db.evidence_windows, db.window_vectors, async () => {
    const existingWindowIds = await db.evidence_windows
      .where("conversationId")
      .equals(conversationId)
      .primaryKeys();

    if (existingWindowIds.length > 0) {
      await db.window_vectors.bulkDelete(existingWindowIds as string[]);
    }

    await db.evidence_windows.where("conversationId").equals(conversationId).delete();
    if (windows.length > 0) {
      await db.evidence_windows.bulkPut(windows);
    }
  });

  return windows.map(toEvidenceWindow);
}

export async function getWindowVectorRecordsByConversationIds(
  conversationIds: number[]
): Promise<WindowVectorRecord[]> {
  if (!conversationIds.length) {
    return [];
  }

  return db.window_vectors.where("conversationId").anyOf(conversationIds).toArray();
}

export async function saveWindowVectors(records: WindowVectorRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  await enforceStorageWriteGuard();
  await db.window_vectors.bulkPut(records);
}

export async function getRetrievalAssetStatus(
  conversationId: number
): Promise<RetrievalAssetStatusV1 | null> {
  const [record, conversation] = await Promise.all([
    db.retrieval_asset_status.get(conversationId),
    db.conversations.get(conversationId),
  ]);
  return record ? markStatusStaleIfNeeded(toRetrievalAssetStatus(record), conversation) : null;
}

export async function listRetrievalAssetStatus(
  conversationIds?: number[]
): Promise<RetrievalAssetStatusV1[]> {
  const records =
    Array.isArray(conversationIds) && conversationIds.length > 0
      ? await db.retrieval_asset_status.bulkGet(conversationIds)
      : await db.retrieval_asset_status.toArray();
  const targetIds = Array.isArray(conversationIds) && conversationIds.length > 0
    ? conversationIds
    : records
        .filter((record): record is RetrievalAssetStatusRecord => Boolean(record))
        .map((record) => record.conversationId);
  const conversations = await db.conversations.bulkGet(targetIds);
  const conversationById = new Map(
    conversations
      .filter((conversation): conversation is ConversationRecord => Boolean(conversation?.id))
      .map((conversation) => [conversation.id as number, conversation] as const)
  );

  return records
    .filter((record): record is RetrievalAssetStatusRecord => Boolean(record))
    .map((record) =>
      markStatusStaleIfNeeded(
        toRetrievalAssetStatus(record),
        conversationById.get(record.conversationId)
      )
    );
}

export async function saveRetrievalAssetStatus(
  status: RetrievalAssetStatusV1
): Promise<RetrievalAssetStatusV1> {
  await enforceStorageWriteGuard();
  await db.retrieval_asset_status.put(status);
  return toRetrievalAssetStatus(status);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const conversations = (await db.conversations.toArray()).map(toConversation);
  const distribution = initPlatformDistribution();

  for (const c of conversations) {
    distribution[c.platform] += 1;
  }

  const today = dayKey(Date.now());
  const firstCapturedTodayCount = conversations.filter(
    (c) => dayKey(getConversationFirstCapturedAt(c)) === today
  ).length;

  const daysWithConversations = new Set(
    conversations.map((c) => dayKey(getConversationFirstCapturedAt(c)))
  );

  let firstCaptureStreak = 0;
  let cursor = new Date();
  while (daysWithConversations.has(dayKey(cursor.getTime()))) {
    firstCaptureStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const firstCaptureHeatmapData = Array.from(daysWithConversations).map((d) => ({
    date: d,
    count: conversations.filter((c) => dayKey(getConversationFirstCapturedAt(c)) === d).length,
  }));

  return {
    totalConversations: conversations.length,
    totalTokens: 0,
    firstCaptureStreak,
    firstCapturedTodayCount,
    platformDistribution: distribution,
    firstCaptureHeatmapData,
  };
}

function toNote(record: NoteRecord & { id: number }): Note {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    created_at: record.created_at,
    updated_at: record.updated_at,
    linked_conversation_ids: record.linked_conversation_ids ?? [],
  };
}

export async function listNotes(): Promise<Note[]> {
  const records = await db.notes.orderBy("updated_at").reverse().toArray();
  return records
    .filter((record): record is NoteRecord & { id: number } => record.id !== undefined)
    .map(toNote);
}

export async function createNote(
  data: Omit<Note, "id" | "created_at" | "updated_at">
): Promise<Note> {
  const now = Date.now();
  const id = await db.notes.add({
    title: data.title,
    content: data.content,
    linked_conversation_ids: data.linked_conversation_ids,
    created_at: now,
    updated_at: now,
  });
  const record = await db.notes.get(id);
  if (!record || record.id === undefined) {
    throw new Error("Failed to create note");
  }
  return toNote(record as NoteRecord & { id: number });
}

export async function updateNote(
  id: number,
  changes: Partial<Pick<Note, "title" | "content">>
): Promise<Note> {
  await db.notes.update(id, { ...changes, updated_at: Date.now() });
  const record = await db.notes.get(id);
  if (!record || record.id === undefined) {
    throw new Error("Note not found");
  }
  return toNote(record as NoteRecord & { id: number });
}

export async function deleteNote(id: number): Promise<void> {
  await db.notes.delete(id);
}

// ===== Explore (RAG Chat) Operations =====

const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 100;
const MAX_TOTAL_MESSAGES = 1000;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Session CRUD

export async function createExploreSession(title: string): Promise<string> {
  await enforceStorageWriteGuard();
  
  const now = Date.now();
  const session: ExploreSessionRecord = {
    id: generateId("sess"),
    title: title.slice(0, 100), // Limit title length
    preview: "",
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  
  await db.explore_sessions.add(session);
  
  // Cleanup old sessions if needed
  await cleanupExploreSessionsIfNeeded();
  
  return session.id;
}

export async function getExploreSession(id: string): Promise<ExploreSession | null> {
  const record = await db.explore_sessions.get(id);
  if (!record) return null;
  return record as ExploreSession;
}

export async function listExploreSessions(limit = 50): Promise<ExploreSession[]> {
  const records = await db.explore_sessions
    .orderBy("updatedAt")
    .reverse()
    .limit(limit)
    .toArray();
  return records as ExploreSession[];
}

export async function updateExploreSession(
  id: string,
  changes: Partial<Pick<ExploreSessionRecord, "title" | "preview" | "messageCount">>
): Promise<void> {
  await db.explore_sessions.update(id, {
    ...changes,
    updatedAt: Date.now(),
  });
}

export async function deleteExploreSession(id: string): Promise<void> {
  // Delete all messages first
  await db.explore_messages.where("sessionId").equals(id).delete();
  // Delete session
  await db.explore_sessions.delete(id);
}

// Message CRUD

export async function addExploreMessage(
  sessionId: string,
  message: Omit<ExploreMessage, "id" | "sessionId">
): Promise<ExploreMessage> {
  await enforceStorageWriteGuard();
  const normalizedSources = normalizeExploreSources(message.sources as ExploreSourceRecord[] | undefined);
  const serializedInspectMeta = serializeExploreInspectMeta(
    message.inspectMeta ?? message.agentMeta
  );
  
  const record: ExploreMessageRecord = {
    id: generateId("msg"),
    sessionId,
    role: message.role,
    content: message.content,
    sources: normalizedSources ? JSON.stringify(normalizedSources) : undefined,
    agentMeta: serializedInspectMeta,
    timestamp: message.timestamp,
  };
  
  await db.explore_messages.add(record);
  
  // Update session message count
  const session = await db.explore_sessions.get(sessionId);
  if (session) {
    const newCount = session.messageCount + 1;
    const preview = message.role === "assistant" 
      ? message.content.slice(0, 100)
      : session.preview;
    
    await db.explore_sessions.update(sessionId, {
      messageCount: newCount,
      preview,
      updatedAt: Date.now(),
    });
    
    // Cleanup old messages if needed
    if (newCount > MAX_MESSAGES_PER_SESSION) {
      await cleanupSessionMessages(sessionId);
    }
  }
  
  await cleanupExploreMessagesIfNeeded();
  
  return {
    id: record.id,
    sessionId,
    role: message.role,
    content: message.content,
    sources: normalizedSources,
    inspectMeta: parseExploreInspectMeta(serializedInspectMeta),
    timestamp: message.timestamp,
  };
}

export async function getExploreMessages(sessionId: string): Promise<ExploreMessage[]> {
  const records = await db.explore_messages
    .where("sessionId")
    .equals(sessionId)
    .sortBy("timestamp");
  
  return records.map((record) => ({
    id: record.id,
    sessionId: record.sessionId,
    role: record.role,
    content: record.content,
    sources: parseExploreSources(record.sources),
    inspectMeta: parseExploreInspectMeta(record.agentMeta),
    timestamp: record.timestamp,
  }));
}

export async function getRecentExploreMessages(
  sessionId: string,
  limit = 6
): Promise<ExploreMessage[]> {
  const records = await db.explore_messages
    .where("sessionId")
    .equals(sessionId)
    .reverse()
    .limit(limit)
    .sortBy("timestamp");
  
  // Return in chronological order
  return records
    .reverse()
    .map((record) => ({
      id: record.id,
      sessionId: record.sessionId,
      role: record.role,
      content: record.content,
      sources: parseExploreSources(record.sources),
      inspectMeta: parseExploreInspectMeta(record.agentMeta),
      timestamp: record.timestamp,
    }));
}

export async function updateExploreMessageEvidence(
  messageId: string,
  selectedContextConversationIds: number[],
  evidenceBriefSnapshot?: string
): Promise<void> {
  await enforceStorageWriteGuard();

  const record = await db.explore_messages.get(messageId);
  if (!record) {
    throw new Error("EXPLORE_MESSAGE_NOT_FOUND");
  }

  const existingMeta = parseExploreInspectMeta(record.agentMeta);
  const nextMeta = normalizeExploreInspectMeta({
    mode: existingMeta?.mode ?? "search",
    toolCalls: existingMeta?.toolCalls ?? [],
    contextCandidates: existingMeta?.contextCandidates ?? [],
    ...existingMeta,
    evidenceBrief:
      typeof evidenceBriefSnapshot === "string"
        ? evidenceBriefSnapshot
        : existingMeta?.evidenceBrief ?? existingMeta?.contextDraft,
    selectedContextConversationIds,
  });

  await db.explore_messages.update(messageId, {
    agentMeta: serializeExploreInspectMeta(nextMeta),
  });
}

export async function updateExploreMessageContext(
  messageId: string,
  contextDraft: string,
  selectedContextConversationIds: number[]
): Promise<void> {
  await updateExploreMessageEvidence(
    messageId,
    selectedContextConversationIds,
    contextDraft
  );
}

// Cleanup functions

async function cleanupExploreSessionsIfNeeded(): Promise<void> {
  const count = await db.explore_sessions.count();
  if (count <= MAX_SESSIONS) return;
  
  const toDelete = await db.explore_sessions
    .orderBy("updatedAt")
    .limit(count - MAX_SESSIONS)
    .toArray();
  
  for (const session of toDelete) {
    await deleteExploreSession(session.id);
  }
}

async function cleanupSessionMessages(sessionId: string): Promise<void> {
  const messages = await db.explore_messages
    .where("sessionId")
    .equals(sessionId)
    .sortBy("timestamp");
  
  if (messages.length <= MAX_MESSAGES_PER_SESSION) return;
  
  const toDelete = messages.slice(0, messages.length - MAX_MESSAGES_PER_SESSION);
  for (const msg of toDelete) {
    await db.explore_messages.delete(msg.id);
  }
  
  // Update count
  await db.explore_sessions.update(sessionId, {
    messageCount: MAX_MESSAGES_PER_SESSION,
  });
}

async function cleanupExploreMessagesIfNeeded(): Promise<void> {
  const count = await db.explore_messages.count();
  if (count <= MAX_TOTAL_MESSAGES) return;
  
  // Get oldest messages across all sessions
  const toDelete = await db.explore_messages
    .orderBy("timestamp")
    .limit(count - MAX_TOTAL_MESSAGES)
    .toArray();
  
  const sessionCounts = new Map<string, number>();
  
  for (const msg of toDelete) {
    await db.explore_messages.delete(msg.id);
    sessionCounts.set(msg.sessionId, (sessionCounts.get(msg.sessionId) || 0) + 1);
  }
  
  // Update session counts
  for (const [sessionId, deletedCount] of sessionCounts) {
    const session = await db.explore_sessions.get(sessionId);
    if (session) {
      await db.explore_sessions.update(sessionId, {
        messageCount: Math.max(0, session.messageCount - deletedCount),
      });
    }
  }
}

// For export functionality
export async function getAllExploreSessions(): Promise<ExploreSession[]> {
  return db.explore_sessions.toArray() as Promise<ExploreSession[]>;
}

export async function getAllExploreMessages(): Promise<ExploreMessage[]> {
  const records = await db.explore_messages.toArray();
  return records.map((record) => ({
    id: record.id,
    sessionId: record.sessionId,
    role: record.role,
    content: record.content,
    sources: parseExploreSources(record.sources),
    inspectMeta: parseExploreInspectMeta(record.agentMeta),
    timestamp: record.timestamp,
  }));
}
