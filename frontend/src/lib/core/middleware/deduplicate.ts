import type { ConversationDraft, ParsedMessage } from "../../messaging/protocol";
import { countAiTurns } from "../../capture/turn-metrics";
import { db } from "../../db/schema";
import type { ConversationRecord, MessageRecord } from "../../db/schema";
import { enforceStorageWriteGuard } from "../../db/storageLimits";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildParsedSignatures(messages: ParsedMessage[]): string[] {
  return messages.map((message) => `${message.role}|${normalizeText(message.textContent)}`);
}

function buildStoredSignatures(messages: MessageRecord[]): string[] {
  return [...messages]
    .sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at - b.created_at;
      const aId = a.id ?? 0;
      const bId = b.id ?? 0;
      return aId - bId;
    })
    .map((message) => `${message.role}|${normalizeText(message.content_text)}`);
}

function signaturesMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function sanitizeIncomingMessages(messages: ParsedMessage[]): ParsedMessage[] {
  return messages.filter((message) => normalizeText(message.textContent).length > 0);
}

function normalizeDegradedNodesCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function resolveSourceCreatedAt(
  existingSourceCreatedAt: number | null,
  incomingSourceCreatedAt: number | null
): number | null {
  if (existingSourceCreatedAt !== null) {
    return existingSourceCreatedAt;
  }
  return incomingSourceCreatedAt;
}

export async function deduplicateAndSave(
  conversation: ConversationDraft,
  messages: ParsedMessage[]
): Promise<{ saved: boolean; newMessages: number; conversationId?: number }> {
  const cleanMessages = sanitizeIncomingMessages(messages);
  if (cleanMessages.length === 0) {
    return { saved: false, newMessages: 0 };
  }

  await enforceStorageWriteGuard();
  const turnCount = countAiTurns(cleanMessages);

  return db.transaction("rw", db.conversations, db.messages, async () => {
    const existing = await db.conversations
      .where("[platform+uuid]")
      .equals([conversation.platform, conversation.uuid])
      .first();

    if (existing && existing.id !== undefined) {
      const existingMessages = await db.messages
        .where("conversation_id")
        .equals(existing.id)
        .toArray();

      const incomingSignatures = buildParsedSignatures(cleanMessages);
      const storedSignatures = buildStoredSignatures(existingMessages);

      if (signaturesMatch(incomingSignatures, storedSignatures)) {
        return { saved: false, newMessages: 0, conversationId: existing.id };
      }

      await db.messages.where("conversation_id").equals(existing.id).delete();

      const baseTimestamp = Date.now();
      const inserts: MessageRecord[] = cleanMessages.map((message, index) => ({
        conversation_id: existing.id!,
        role: message.role,
        content_text: message.textContent,
        content_ast: message.contentAst ?? null,
        content_ast_version: message.contentAstVersion ?? null,
        degraded_nodes_count: normalizeDegradedNodesCount(message.degradedNodesCount),
        created_at: message.timestamp ?? baseTimestamp + index,
      }));

      await db.messages.bulkAdd(inserts);

      // Keep user-renamed titles stable across recaptures.
      const mergedSourceCreatedAt = resolveSourceCreatedAt(
        existing.source_created_at ?? null,
        conversation.source_created_at
      );

      await db.conversations.update(existing.id, {
        updated_at: conversation.updated_at,
        message_count: cleanMessages.length,
        turn_count: turnCount,
        snippet: cleanMessages[0]?.textContent.slice(0, 100) ?? conversation.snippet,
        source_created_at: mergedSourceCreatedAt,
      } as Partial<ConversationRecord>);

      return {
        saved: true,
        newMessages: Math.max(0, cleanMessages.length - existingMessages.length),
        conversationId: existing.id,
      };
    }

    const record: ConversationRecord = {
      ...conversation,
      message_count: cleanMessages.length,
      turn_count: turnCount,
      snippet: cleanMessages[0]?.textContent.slice(0, 100) ?? conversation.snippet,
    };

    const conversationId = await db.conversations.add(record);

    const baseTimestamp = Date.now();
    const inserts: MessageRecord[] = cleanMessages.map((message, index) => ({
      conversation_id: conversationId,
      role: message.role,
      content_text: message.textContent,
      content_ast: message.contentAst ?? null,
      content_ast_version: message.contentAstVersion ?? null,
      degraded_nodes_count: normalizeDegradedNodesCount(message.degradedNodesCount),
      created_at: message.timestamp ?? baseTimestamp + index,
    }));

    await db.messages.bulkAdd(inserts);

    return { saved: true, newMessages: cleanMessages.length, conversationId };
  });
}
