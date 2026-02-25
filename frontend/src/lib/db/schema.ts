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

export class MemoryHubDB extends Dexie {
  conversations!: Table<ConversationRecord, number>;
  messages!: Table<MessageRecord, number>;
  summaries!: Table<SummaryRecordRecord, number>;
  weekly_reports!: Table<WeeklyReportRecordRecord, number>;
  topics!: Table<TopicRecord, number>;
  vectors!: Table<VectorRecord, number>;

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
  }
}

export const db = new MemoryHubDB();
