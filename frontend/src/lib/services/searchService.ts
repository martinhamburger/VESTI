import type { Conversation, RagResponse, RelatedConversation } from "../types";
import { db } from "../db/schema";
import {
  createExploreSession,
  addExploreMessage,
  getExploreMessages,
  updateExploreSession,
} from "../db/repository";
import { embedText } from "./embeddingService";
import { callInference } from "./llmService";
import { getLlmSettings } from "./llmSettingsService";

const MAX_MESSAGE_COUNT = 12;
const MAX_TEXT_LENGTH = 4000;
const MAX_RAG_SOURCES = 5;
const MAX_EMBEDDING_CHARS = 2048;

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
  messageTexts: string[]
): string {
  const chunks = [conversation.title, conversation.snippet, ...messageTexts];
  const combined = chunks.filter(Boolean).join("\n");
  if (combined.length <= MAX_TEXT_LENGTH) return combined;
  return combined.slice(0, MAX_TEXT_LENGTH);
}

function buildConversationContext(
  conversation: Conversation,
  messages: Array<{ role: "user" | "ai"; content_text: string }>
): string {
  const lines = messages.map((msg) => {
    const role = msg.role === "user" ? "User" : "AI";
    return `[${role}] ${msg.content_text}`;
  });

  return [
    `【标题】${conversation.title}`,
    `【平台】${conversation.platform}`,
    "【内容】",
    ...lines,
  ].join("\n");
}

function buildRagSystemPrompt(context: string): string {
  if (!context.trim()) {
    return [
      "你是一个专属的 AI 知识助手。",
      "用户的本地知识库中暂未找到与该问题相关的历史笔记。",
      "请直接使用你的通用知识库（世界模型）来回答用户的问题。",
      "【强制约束】：请务必在回答的最开头，用粗体明确标注：“**此回答基于通用知识，未在您的本地笔记中找到相关记录。**”",
    ].join("\n");
  }

  return [
    "你是一个专属的 AI 知识助手。",
    "请优先严格基于下面 <context> 标签内提供的参考资料来回答用户的问题，并在回答中引用参考资料的标题。",
    "【兜底策略】：如果 <context> 提供的资料完全无法解答用户的问题，你可以使用通用知识进行补充解答。但如果你使用了通用知识，【强制约束】请务必在回答的开头明确说明：“本地笔记中信息不足，以下补充基于通用知识：”",
    "",
    "<context>",
    context,
    "</context>",
  ].join("\n");
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

  const text = buildConversationText(conversation as Conversation, messageTexts);
  return { conversation: conversation as Conversation, text };
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
  const { text } = await getConversationText(conversationId);
  await ensureVectorForConversation(conversationId, text);

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

  const top = scores
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

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
  threshold = 0.3
): Promise<Array<{ source: number; target: number; weight: number }>> {
  const vectors = await db.vectors.toArray();
  const edges: Array<{ source: number; target: number; weight: number }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const left = vectors[i];
      const right = vectors[j];
      if (typeof left.conversation_id !== "number" || typeof right.conversation_id !== "number") {
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
  limit = MAX_RAG_SOURCES
): Promise<RagResponse & { sessionId: string }> {
  const query = userQuery.trim();
  if (!query) {
    throw new Error("QUERY_EMPTY");
  }

  // Get or create session
  let sessionId = existingSessionId;
  if (!sessionId) {
    sessionId = await createExploreSession(query.slice(0, 100));
  }

  // Save user message
  await addExploreMessage(sessionId, {
    role: "user",
    content: query,
    timestamp: Date.now(),
  });

  const preparedQuery = normalizeEmbeddingInput(query);
  if (!preparedQuery) {
    throw new Error("QUERY_EMPTY");
  }

  // Get recent conversation history for context
  const recentMessages = await getExploreMessages(sessionId);
  const historyContext = buildHistoryContext(recentMessages.slice(-6));

  const queryVector = toFloat32Array(await embedText(preparedQuery));
  
  const vectors = await db.vectors.toArray();
  
  const scored: Array<{ id: number; similarity: number }> = [];
  
  for (const vector of vectors) {
    const embedding = toFloat32Array(vector.embedding as Float32Array | number[]);
    if (embedding.length !== queryVector.length || embedding.length === 0) continue;
    const similarity = cosineSimilarity(queryVector, embedding);
    if (similarity < 0.15) continue;
    scored.push({ id: vector.conversation_id, similarity });
  }

  const safeLimit = Math.max(1, limit);
  const top = scored.sort((a, b) => b.similarity - a.similarity).slice(0, safeLimit);

  const conversations = top.length
    ? await db.conversations.bulkGet(top.map((item) => item.id))
    : [];
  
  const sources: RelatedConversation[] = [];
  const contextBlocks: string[] = [];

  for (const item of top) {
    const conversation = conversations.find(
      (record) => record?.id === item.id
    ) as Conversation | undefined;
    if (!conversation) continue;

    const messages = await db.messages
      .where("conversation_id")
      .equals(conversation.id)
      .sortBy("created_at");

    contextBlocks.push(buildConversationContext(conversation, messages));
    sources.push({
      id: conversation.id,
      title: conversation.title,
      platform: conversation.platform,
      similarity: Math.round(item.similarity * 100),
    });
  }

  const context = contextBlocks.join("\n\n---\n\n");
  const systemPrompt = buildContextualRagPrompt(context, historyContext);
  
  const settings = await getLlmSettings();
  if (!settings) {
    throw new Error("LLM_CONFIG_MISSING");
  }

  const result = await callInference(settings, query, { systemPrompt });
  
  // Save AI response
  await addExploreMessage(sessionId, {
    role: "assistant",
    content: result.content,
    sources,
    timestamp: Date.now(),
  });

  // Update session preview
  await updateExploreSession(sessionId, {
    preview: result.content.slice(0, 100),
  });

  return {
    answer: result.content,
    sources,
    sessionId,
  };
}

function buildHistoryContext(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return "";
  
  return `\n\nPrevious conversation context:\n${messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 200)}`)
    .join("\n")}\n\nConsider the above context when answering the new question.`;
}

function buildContextualRagPrompt(retrievedContext: string, historyContext: string): string {
  const basePrompt = `You are Vesti's knowledge base assistant. Answer based primarily on the retrieved conversations below.`;
  
  return `${basePrompt}${historyContext}

Retrieved Conversations:
${retrievedContext}

Instructions:
1. If this is a follow-up question, consider the previous conversation context.
2. Answer based primarily on the retrieved conversations.
3. If information is insufficient, say so clearly.
4. Cite specific conversations when possible.
5. Be concise but comprehensive.`;
}

export async function hybridSearch(query: string): Promise<RagResponse> {
  return askKnowledgeBase(query);
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
  vectors.forEach(v => vectorizedIds.add(v.conversation_id));
  
  return {
    totalVectors,
    totalConversations,
    vectorizedConversations: vectorizedIds.size,
    unvectorizedConversations: totalConversations - vectorizedIds.size,
  };
}

export async function vectorizeAllConversations(): Promise<number> {
  const conversations = await db.conversations.toArray();
  
  let created = 0;
  let failed = 0;
  
  for (const conversation of conversations) {
    if (!conversation?.id) continue;
    try {
      const { text } = await getConversationText(conversation.id);
      await ensureVectorForConversation(conversation.id, text);
      created += 1;
    } catch (err) {
      console.error("[Vectorize] Failed to vectorize conv", conversation.id, ":", (err as Error).message);
      failed += 1;
    }
  }
  
  return created;
}
