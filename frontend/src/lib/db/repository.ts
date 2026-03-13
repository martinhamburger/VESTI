import type {
  Conversation,
  ConversationMatchSummary,
  ConversationSummaryV2,
  DataOverviewSnapshot,
  ExploreAgentMeta,
  ExportFormat,
  ExportPayload,
  Message,
  Note,
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
import { SUPPORTED_PLATFORMS, normalizePlatform } from "../platform";
import { db } from "./schema";
import { enforceStorageWriteGuard, getStorageUsageSnapshot } from "./storageLimits";
import type {
  ConversationRecord,
  MessageRecord,
  NoteRecord,
  SummaryRecordRecord,
  TopicRecord,
  WeeklyReportRecordRecord,
} from "./schema";

type ExploreSourceRecord = {
  id: number;
  title: string;
  platform: string;
  similarity: number;
};

function normalizeExploreSources(
  sources: ExploreSourceRecord[] | undefined
): ExploreSourceRecord[] | undefined {
  if (!sources) {
    return undefined;
  }

  return sources.map((source) => {
    const platform = normalizePlatform(source.platform);
    if (!platform) {
      return source;
    }

    return {
      ...source,
      platform,
    };
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

function normalizeExploreAgentMeta(
  meta: ExploreAgentMeta | undefined
): ExploreAgentMeta | undefined {
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
        .map((toolCall) => ({
          ...toolCall,
          description:
            typeof toolCall.description === "string" ? toolCall.description : undefined,
        }))
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

  const requestedTimeScope =
    meta.plan?.requestedTimeScope && typeof meta.plan.requestedTimeScope === "object"
      ? {
          preset:
            meta.plan.requestedTimeScope.preset === "current_week_to_date" ||
            meta.plan.requestedTimeScope.preset === "last_7_days" ||
            meta.plan.requestedTimeScope.preset === "last_full_week" ||
            meta.plan.requestedTimeScope.preset === "custom"
              ? meta.plan.requestedTimeScope.preset
              : ("none" as const),
          label:
            typeof meta.plan.requestedTimeScope.label === "string"
              ? meta.plan.requestedTimeScope.label
              : undefined,
          startDate:
            typeof meta.plan.requestedTimeScope.startDate === "string"
              ? meta.plan.requestedTimeScope.startDate
              : undefined,
          endDate:
            typeof meta.plan.requestedTimeScope.endDate === "string"
              ? meta.plan.requestedTimeScope.endDate
              : undefined,
        }
      : undefined;

  const resolvedTimeScope =
    meta.plan?.resolvedTimeScope && typeof meta.plan.resolvedTimeScope === "object"
      ? {
          preset:
            meta.plan.resolvedTimeScope.preset === "current_week_to_date" ||
            meta.plan.resolvedTimeScope.preset === "last_7_days" ||
            meta.plan.resolvedTimeScope.preset === "last_full_week" ||
            meta.plan.resolvedTimeScope.preset === "custom"
              ? meta.plan.resolvedTimeScope.preset
              : ("last_7_days" as const),
          label:
            typeof meta.plan.resolvedTimeScope.label === "string"
              ? meta.plan.resolvedTimeScope.label
              : "Resolved range",
          rangeStart:
            typeof meta.plan.resolvedTimeScope.rangeStart === "number" &&
            Number.isFinite(meta.plan.resolvedTimeScope.rangeStart)
              ? meta.plan.resolvedTimeScope.rangeStart
              : 0,
          rangeEnd:
            typeof meta.plan.resolvedTimeScope.rangeEnd === "number" &&
            Number.isFinite(meta.plan.resolvedTimeScope.rangeEnd)
              ? meta.plan.resolvedTimeScope.rangeEnd
              : 0,
          startDate:
            typeof meta.plan.resolvedTimeScope.startDate === "string"
              ? meta.plan.resolvedTimeScope.startDate
              : "",
          endDate:
            typeof meta.plan.resolvedTimeScope.endDate === "string"
              ? meta.plan.resolvedTimeScope.endDate
              : "",
        }
      : undefined;

  const plan =
    meta.plan && typeof meta.plan === "object"
      ? {
          intent:
            meta.plan.intent === "cross_conversation_summary" ||
            meta.plan.intent === "weekly_review" ||
            meta.plan.intent === "timeline" ||
            meta.plan.intent === "clarification_needed"
              ? meta.plan.intent
              : ("fact_lookup" as const),
          reason:
            typeof meta.plan.reason === "string" ? meta.plan.reason : "UNSPECIFIED_REASON",
          preferredPath:
            meta.plan.preferredPath === "weekly_summary" ||
            meta.plan.preferredPath === "clarify"
              ? meta.plan.preferredPath
              : ("rag" as const),
          sourceLimit:
            typeof meta.plan.sourceLimit === "number" && Number.isFinite(meta.plan.sourceLimit)
              ? meta.plan.sourceLimit
              : 5,
          summaryTargetCount:
            typeof meta.plan.summaryTargetCount === "number" &&
            Number.isFinite(meta.plan.summaryTargetCount)
              ? meta.plan.summaryTargetCount
              : 0,
          answerGoal:
            typeof meta.plan.answerGoal === "string" ? meta.plan.answerGoal : undefined,
          needsClarification:
            typeof meta.plan.needsClarification === "boolean"
              ? meta.plan.needsClarification
              : undefined,
          clarifyingQuestion:
            typeof meta.plan.clarifyingQuestion === "string"
              ? meta.plan.clarifyingQuestion
              : undefined,
          requestedTimeScope,
          resolvedTimeScope:
            resolvedTimeScope &&
            resolvedTimeScope.rangeStart > 0 &&
            resolvedTimeScope.rangeEnd >= resolvedTimeScope.rangeStart
              ? resolvedTimeScope
              : undefined,
          toolPlan: Array.isArray(meta.plan.toolPlan)
            ? meta.plan.toolPlan.filter(
                (toolName): toolName is NonNullable<typeof meta.plan>["toolPlan"][number] =>
                  typeof toolName === "string"
              )
            : undefined,
        }
      : undefined;

  return {
    ...meta,
    query: typeof meta.query === "string" ? meta.query : undefined,
    searchScope,
    plan,
    toolCalls,
    contextCandidates: normalizedCandidates,
    selectedContextConversationIds,
  };
}

function parseExploreAgentMeta(raw?: string): ExploreAgentMeta | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as ExploreAgentMeta;
    return normalizeExploreAgentMeta(parsed);
  } catch {
    return undefined;
  }
}

function serializeExploreAgentMeta(meta?: ExploreAgentMeta): string | undefined {
  const normalized = normalizeExploreAgentMeta(meta);
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

  return {
    ...(record as Conversation),
    platform: platform ?? record.platform,
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
  };
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
      (c) =>
        c.created_at >= filters.dateRange!.start &&
        c.created_at <= filters.dateRange!.end
    );
  }

  return results
    .sort((a, b) => b.updated_at - a.updated_at)
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
  const records = await db.conversations
    .where("created_at")
    .between(rangeStart, rangeEnd, true, true)
    .toArray();
  return records
    .sort((a, b) => b.updated_at - a.updated_at)
    .map(toConversation);
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
  await db.transaction("rw", db.conversations, db.messages, async () => {
    await db.messages.where("conversation_id").equals(id).delete();
    await db.conversations.delete(id);
  });
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

  await db.conversations.update(id, { title: normalizedTitle });
  return toConversation({ ...existing, title: normalizedTitle, id: existing.id });
}

export async function clearAllData(): Promise<boolean> {
  await db.transaction(
    "rw",
    db.conversations,
    db.messages,
    db.summaries,
    db.weekly_reports,
    async () => {
      await db.messages.clear();
      await db.conversations.clear();
      await db.summaries.clear();
      await db.weekly_reports.clear();
    }
  );
  return true;
}

export async function clearInsightsCache(): Promise<boolean> {
  await db.transaction(
    "rw",
    db.summaries,
    db.weekly_reports,
    async () => {
      await db.summaries.clear();
      await db.weekly_reports.clear();
    }
  );
  return true;
}

async function collectExportDataset() {
  const conversations = (await db.conversations.toArray()).map(toConversation);
  const messages = (await db.messages.toArray()).map(toMessage);
  const summaries = (await db.summaries.toArray()).map(toSummary);
  const weeklyReports = (await db.weekly_reports.toArray()).map(toWeeklyReport);
  return { conversations, messages, summaries, weeklyReports };
}

export async function getStorageUsage(): Promise<StorageUsageSnapshot> {
  return getStorageUsageSnapshot();
}

export async function getDataOverview(): Promise<DataOverviewSnapshot> {
  const [storage, totalConversations, summaryRecordCount, weeklyReportCount] =
    await Promise.all([
      getStorageUsageSnapshot(),
      db.conversations.count(),
      db.summaries.count(),
      db.weekly_reports.count(),
    ]);

  const [uniqueSummaryConversationIds, lastSummary] = await Promise.all([
    db.summaries.orderBy("conversationId").uniqueKeys(),
    db.summaries.orderBy("createdAt").last(),
  ]);

  return {
    storage,
    totalConversations,
    compactedThreads: uniqueSummaryConversationIds.length,
    summaryRecordCount,
    weeklyReportCount,
    lastCompactionAt:
      typeof lastSummary?.createdAt === "number" ? lastSummary.createdAt : null,
    indexedDbName: db.name,
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
  const record = await db.summaries
    .where("conversationId")
    .equals(conversationId)
    .last();
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
  return record ? toWeeklyReport(record) : null;
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const conversations = await db.conversations.toArray();
  const distribution = initPlatformDistribution();

  for (const c of conversations) {
    distribution[c.platform] += 1;
  }

  const today = dayKey(Date.now());
  const todayCount = conversations.filter(
    (c) => dayKey(c.created_at) === today
  ).length;

  const daysWithConversations = new Set(
    conversations.map((c) => dayKey(c.created_at))
  );

  let activeStreak = 0;
  let cursor = new Date();
  while (daysWithConversations.has(dayKey(cursor.getTime()))) {
    activeStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const heatmapData = Array.from(daysWithConversations).map((d) => ({
    date: d,
    count: conversations.filter((c) => dayKey(c.created_at) === d).length,
  }));

  return {
    totalConversations: conversations.length,
    totalTokens: 0,
    activeStreak,
    todayCount,
    platformDistribution: distribution,
    heatmapData,
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

import type { ExploreSessionRecord, ExploreMessageRecord } from "./schema";

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
  sources?: Array<{ id: number; title: string; platform: string; similarity: number }>;
  agentMeta?: ExploreAgentMeta;
  timestamp: number;
}

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
  const serializedAgentMeta = serializeExploreAgentMeta(message.agentMeta);
  
  const record: ExploreMessageRecord = {
    id: generateId("msg"),
    sessionId,
    role: message.role,
    content: message.content,
    sources: normalizedSources ? JSON.stringify(normalizedSources) : undefined,
    agentMeta: serializedAgentMeta,
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
    agentMeta: parseExploreAgentMeta(serializedAgentMeta),
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
    agentMeta: parseExploreAgentMeta(record.agentMeta),
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
      agentMeta: parseExploreAgentMeta(record.agentMeta),
      timestamp: record.timestamp,
    }));
}

export async function updateExploreMessageContext(
  messageId: string,
  contextDraft: string,
  selectedContextConversationIds: number[]
): Promise<void> {
  await enforceStorageWriteGuard();

  const record = await db.explore_messages.get(messageId);
  if (!record) {
    throw new Error("EXPLORE_MESSAGE_NOT_FOUND");
  }

  const existingMeta = parseExploreAgentMeta(record.agentMeta);
  const nextMeta = normalizeExploreAgentMeta({
    mode: existingMeta?.mode ?? "agent",
    toolCalls: existingMeta?.toolCalls ?? [],
    contextCandidates: existingMeta?.contextCandidates ?? [],
    ...existingMeta,
    contextDraft,
    selectedContextConversationIds,
  });

  await db.explore_messages.update(messageId, {
    agentMeta: serializeExploreAgentMeta(nextMeta),
  });
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
    agentMeta: parseExploreAgentMeta(record.agentMeta),
    timestamp: record.timestamp,
  }));
}
