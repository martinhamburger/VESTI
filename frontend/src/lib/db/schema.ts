import Dexie from "dexie";
import type { Table } from "dexie";
import type {
  Conversation,
  Message,
  SummaryRecord,
  WeeklyReportRecord,
} from "../types";

export type ConversationRecord = Omit<Conversation, "id"> & { id?: number };
export type MessageRecord = Omit<Message, "id" | "content_ast"> & {
  id?: number;
  content_ast?: unknown | null;
};
export type SummaryRecordRecord = Omit<SummaryRecord, "id"> & { id?: number };
export type WeeklyReportRecordRecord = Omit<WeeklyReportRecord, "id"> & { id?: number };
export interface TopicRecord {
  id?: number;
  parent_id: number | null;
  name: string;
  created_at: number;
  updated_at: number;
}
export interface VectorRecord {
  id?: number;
  conversation_id: number;
  text_hash: string;
  embedding: Float32Array;
}
export interface NoteRecord {
  id?: number;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  linked_conversation_ids: number[];
}

// Explore (RAG Chat) Records
export interface ExploreSessionRecord {
  id: string; // UUID format: "sess_xxx"
  title: string;
  preview: string; // Last message preview for list display
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExploreMessageRecord {
  id: string; // UUID format: "msg_xxx"
  sessionId: string; // Foreign key to explore_sessions
  role: "user" | "assistant";
  content: string;
  sources?: string; // JSON serialized RelatedConversation[]
  agentMeta?: string; // JSON serialized ExploreAgentMeta
  timestamp: number;
}

function normalizePersistedPlatform(value: unknown): ConversationRecord["platform"] | undefined {
  if (value === "Yuanbao" || value === "YUANBAO") {
    return "Yuanbao";
  }

  switch (value) {
    case "ChatGPT":
    case "Claude":
    case "Gemini":
    case "DeepSeek":
    case "Qwen":
    case "Doubao":
    case "Kimi":
      return value;
    default:
      return undefined;
  }
}

function normalizeSerializedSources(raw?: string): string | undefined {
  if (!raw) {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return raw;
    }

    let changed = false;
    const normalized = parsed.map((item) => {
      if (!item || typeof item !== "object") {
        return item;
      }

      const platform = normalizePersistedPlatform((item as { platform?: unknown }).platform);
      if (!platform || platform === (item as { platform?: unknown }).platform) {
        return item;
      }

      changed = true;
      return {
        ...(item as Record<string, unknown>),
        platform,
      };
    });

    return changed ? JSON.stringify(normalized) : raw;
  } catch {
    return raw;
  }
}

export class MemoryHubDB extends Dexie {
  conversations!: Table<ConversationRecord, number>;
  messages!: Table<MessageRecord, number>;
  summaries!: Table<SummaryRecordRecord, number>;
  weekly_reports!: Table<WeeklyReportRecordRecord, number>;
  topics!: Table<TopicRecord, number>;
  vectors!: Table<VectorRecord, number>;
  notes!: Table<NoteRecord, number>;
  explore_sessions!: Table<ExploreSessionRecord, string>;
  explore_messages!: Table<ExploreMessageRecord, string>;

  constructor() {
    super("MemoryHubDB");
    this.version(1).stores({
      conversations:
        "++id, platform, title, created_at, updated_at, uuid, [platform+created_at]",
      messages:
        "++id, conversation_id, role, created_at, [conversation_id+created_at]",
    });
    this.version(2).stores({
      conversations:
        "++id, platform, title, created_at, updated_at, uuid, [platform+created_at]",
      messages:
        "++id, conversation_id, role, created_at, [conversation_id+created_at]",
      summaries: "++id, conversationId, createdAt",
      weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
    });
    this.version(3)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, [platform+created_at], [platform+uuid]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
      })
      .upgrade((tx) => {
        return tx
          .table("conversations")
          .toCollection()
          .modify((record: Partial<ConversationRecord>) => {
            if (record.source_created_at === undefined) {
              record.source_created_at = null;
            }
          });
      });
    this.version(4)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, turn_count, [platform+created_at], [platform+uuid]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
      })
      .upgrade(async (tx) => {
        const aiTurnsByConversation = new Map<number, number>();

        await tx
          .table("messages")
          .toCollection()
          .each((record: Partial<MessageRecord>) => {
            if (record.role !== "ai") {
              return;
            }

            const conversationId = record.conversation_id;
            if (typeof conversationId !== "number") {
              return;
            }

            aiTurnsByConversation.set(
              conversationId,
              (aiTurnsByConversation.get(conversationId) ?? 0) + 1
            );
          });

        await tx
          .table("conversations")
          .toCollection()
          .modify((record: Partial<ConversationRecord>) => {
            const messageCount =
              typeof record.message_count === "number" && Number.isFinite(record.message_count)
                ? Math.max(0, Math.floor(record.message_count))
                : 0;
            const fallbackTurnCount = Math.floor(messageCount / 2);

            const conversationId = typeof record.id === "number" ? record.id : undefined;
            if (conversationId === undefined) {
              if (
                typeof record.turn_count !== "number" ||
                !Number.isFinite(record.turn_count)
              ) {
                record.turn_count = fallbackTurnCount;
              }
              return;
            }

            const aiTurns = aiTurnsByConversation.get(conversationId);
            record.turn_count =
              typeof aiTurns === "number" ? aiTurns : fallbackTurnCount;
          });
      });
    this.version(5)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, turn_count, [platform+created_at], [platform+uuid]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
      })
      .upgrade((tx) => {
        return tx
          .table("messages")
          .toCollection()
          .modify((record: Partial<MessageRecord>) => {
            if (record.content_ast === undefined) {
              record.content_ast = null;
            }
            if (record.content_ast_version === undefined) {
              record.content_ast_version = null;
            }
            if (
              typeof record.degraded_nodes_count !== "number" ||
              !Number.isFinite(record.degraded_nodes_count)
            ) {
              record.degraded_nodes_count = 0;
            }
          });
      });
    this.version(6)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, turn_count, topic_id, is_starred, [platform+created_at], [platform+uuid], [topic_id+updated_at]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
        topics:
          "++id, parent_id, name, created_at, updated_at, [parent_id+name]",
        vectors:
          "++id, conversation_id, text_hash, [conversation_id+text_hash]",
      })
      .upgrade(() => undefined);
    this.version(7)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, turn_count, topic_id, is_starred, [platform+created_at], [platform+uuid], [topic_id+updated_at]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
        topics:
          "++id, parent_id, name, created_at, updated_at, [parent_id+name]",
        vectors: "++id, conversation_id, text_hash",
      })
      .upgrade(() => undefined);
    this.version(8)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, turn_count, topic_id, is_starred, [platform+created_at], [platform+uuid], [topic_id+updated_at]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
        topics:
          "++id, parent_id, name, created_at, updated_at, [parent_id+name]",
        vectors: "++id, conversation_id, text_hash",
        notes: "++id, created_at, updated_at",
      })
      .upgrade(() => undefined);
    this.version(9)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, turn_count, topic_id, is_starred, [platform+created_at], [platform+uuid], [topic_id+updated_at]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
        topics:
          "++id, parent_id, name, created_at, updated_at, [parent_id+name]",
        vectors: "++id, conversation_id, text_hash",
        notes: "++id, created_at, updated_at",
        explore_sessions: "id, updatedAt, createdAt",
        explore_messages: "id, sessionId, timestamp, [sessionId+timestamp]",
      })
      .upgrade(() => undefined);
    this.version(10)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, turn_count, topic_id, is_starred, [platform+created_at], [platform+uuid], [topic_id+updated_at]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
        topics:
          "++id, parent_id, name, created_at, updated_at, [parent_id+name]",
        vectors: "++id, conversation_id, text_hash",
        notes: "++id, created_at, updated_at",
        explore_sessions: "id, updatedAt, createdAt",
        explore_messages: "id, sessionId, timestamp, [sessionId+timestamp]",
      })
      .upgrade(async (tx) => {
        await tx
          .table("conversations")
          .toCollection()
          .modify((record: Partial<ConversationRecord>) => {
            const platform = normalizePersistedPlatform(record.platform);
            if (platform && platform !== record.platform) {
              record.platform = platform;
            }
          });

        await tx
          .table("explore_messages")
          .toCollection()
          .modify((record: Partial<ExploreMessageRecord>) => {
            const normalized = normalizeSerializedSources(record.sources);
            if (normalized !== record.sources) {
              record.sources = normalized;
            }
          });
      });
    this.version(11)
      .stores({
        conversations:
          "++id, platform, title, created_at, updated_at, uuid, source_created_at, turn_count, topic_id, is_starred, [platform+created_at], [platform+uuid], [topic_id+updated_at]",
        messages:
          "++id, conversation_id, role, created_at, [conversation_id+created_at]",
        summaries: "++id, conversationId, createdAt",
        weekly_reports: "++id, rangeStart, rangeEnd, createdAt",
        topics:
          "++id, parent_id, name, created_at, updated_at, [parent_id+name]",
        vectors: "++id, conversation_id, text_hash",
        notes: "++id, created_at, updated_at",
        explore_sessions: "id, updatedAt, createdAt",
        explore_messages: "id, sessionId, timestamp, [sessionId+timestamp]",
      })
      .upgrade(() => undefined);
  }
}

export const db = new MemoryHubDB();
