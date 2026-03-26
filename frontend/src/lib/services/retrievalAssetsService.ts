import type {
  Conversation,
  ConversationCapsuleV1,
  EvidenceBundleConversationV1,
  EvidenceBundleGroupV1,
  EvidenceBundleV1,
  EvidenceBundleWindowV1,
  EvidenceRefV1,
  EvidenceWindowLabel,
  EvidenceWindowV1,
  ExploreSearchScope,
  QueryRewriteHintsV1,
  RetrievalAssetStatusV1,
  RetrievalFollowupType,
  RetrievalQueryClass,
} from "../types";
import { db } from "../db/schema";
import {
  getExploreMessages,
  getRetrievalAssetStatus,
  getEvidenceWindowsByConversationIds,
  listConversationCapsules,
  listMessages,
  listAnnotations,
  listRetrievalAssetStatus,
  recordRetrievalObservation,
  replaceEvidenceWindows,
  saveConversationCapsule,
  saveRetrievalAssetStatus,
  saveWindowVectors,
} from "../db/repository";
import type { WindowVectorRecord } from "../db/schema";
import { createPromptReadyConversationContext } from "../prompts/promptIngestionAdapter";
import { embedText } from "./embeddingService";

export const RETRIEVAL_ASSET_VERSION = "retrieval_assets_v1" as const;

const MAX_EMBEDDING_CHARS = 2048;
const CAPSULE_CANDIDATE_LIMIT = 30;
const RRF_K = 60;
const DEFAULT_WINDOW_LIMIT = 16;
const MIN_WINDOW_LIMIT = 12;
const PATH_PATTERN =
  /(?:[A-Za-z]:\\[^\s`"')]+|(?:\.?\.?(?:\/|\\))?(?:[\w.-]+(?:\/|\\))+[\w./\\-]*[\w-]+(?:\.[A-Za-z0-9]+)?)/g;
const COMMAND_PATTERN =
  /(?:^|\s)(?:pnpm|npm|npx|yarn|git|node|python|pytest|rg|gh|curl|tsx|ts-node|bun)\b[^\n]*/gim;
const API_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\([^()\n]{0,80}\)/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s`"')]+/gi;
const VERSION_PATTERN = /\bv?\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.]+)?\b/g;
const ERROR_PATTERN =
  /\b(error|exception|traceback|failed|failure|fatal|stack trace|not found|ENOENT|ECONN|timeout|undefined)\b|报错|错误|异常|失败|未找到/i;
const DECISION_PATTERN =
  /\b(decision|decide|decided|final|finalized|adopt|ship|implement|chosen)\b|决定|结论|采用|方案|改成|最终/i;
const ACTION_PATTERN =
  /\b(next step|todo|follow up|action item|need to|we should|we will|ship next)\b|下一步|待办|后续|需要|行动项/i;
const EXACT_QUERY_PATTERN =
  /(?:[A-Za-z]:\\|\/|\\|\b(?:pnpm|npm|git|node|python|pytest|rg|curl|tsx|ts-node|bun)\b|\b[A-Za-z_][A-Za-z0-9_]*\([^()\n]{0,80}\)|https?:\/\/|\b(?:ENOENT|ECONN|EADDR|ERR_|HTTP\s?\d{3})\b|\bv?\d+\.\d+(?:\.\d+)?\b)/i;
const SUMMARY_QUERY_PATTERN =
  /summary|summarize|recap|review|timeline|this week|last week|recent|overview|回顾|总结|时间线|本周|最近/i;

type PromptReadyMessage = ReturnType<typeof createPromptReadyConversationContext>["messages"][number];

type RankedConversation = {
  conversation: Conversation;
  capsule: ConversationCapsuleV1;
  score: number;
  denseScore: number;
  lexicalScore: number;
  exactScore: number;
  matchType: EvidenceBundleConversationV1["matchType"];
};

type RankedWindow = {
  window: EvidenceWindowV1;
  conversation: Conversation;
  score: number;
  lexicalScore: number;
  denseScore: number;
  structurePrior: number;
  freshnessPrior: number;
  embedding?: Float32Array;
};

type RetrievalBuildResult = {
  conversationId: number;
  sourceHash: string;
  state: RetrievalAssetStatusV1["state"];
  built: boolean;
  windowCount: number;
  windowVectorCount: number;
};

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function normalizeEmbeddingInput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.length <= MAX_EMBEDDING_CHARS ? trimmed : trimmed.slice(0, MAX_EMBEDDING_CHARS);
}

function toFloat32Array(value: Float32Array | number[] | undefined): Float32Array | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Float32Array ? value : new Float32Array(value);
}

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function truncate(text: string, max = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}...`;
}

function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  const latinTokens = text.trim().split(/\s+/).length;
  const cjkChars = (text.match(/[\u3400-\u9FFF]/g) ?? []).length;
  return Math.max(latinTokens, Math.ceil(text.length / 4), Math.ceil(cjkChars * 0.75));
}

function extractRegexMatches(text: string, pattern: RegExp): string[] {
  return unique(text.match(pattern) ?? []);
}

function normalizeTerm(term: string): string {
  return term.replace(/^`|`$/g, "").replace(/\s+/g, " ").trim();
}

function extractUrls(text: string): string[] {
  return extractRegexMatches(text, URL_PATTERN).map(normalizeTerm);
}

function extractHosts(urls: string[]): string[] {
  const hosts: string[] = [];
  for (const url of urls) {
    try {
      hosts.push(new URL(url).hostname.toLowerCase());
    } catch {
      // Ignore malformed URLs.
    }
  }
  return unique(hosts);
}

function extractPreservedTerms(query: string): string[] {
  return unique([
    ...extractRegexMatches(query, PATH_PATTERN),
    ...extractRegexMatches(query, COMMAND_PATTERN).map(normalizeTerm),
    ...extractRegexMatches(query, API_PATTERN),
    ...extractRegexMatches(query, URL_PATTERN),
    ...extractRegexMatches(query, VERSION_PATTERN),
    ...(query.match(/\b[A-Z]{2,}(?:[_-][A-Z0-9]+)*\b/g) ?? []),
  ]);
}

function extractLexicalTerms(text: string): string[] {
  const normalized = text
    .replace(/[`*_#>[\](){}:;,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }

  const words = normalized
    .split(" ")
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3 && !/^\d+$/.test(term));

  return unique([
    ...words.slice(0, 40),
    ...extractRegexMatches(text, PATH_PATTERN).map((value) => value.toLowerCase()),
    ...extractRegexMatches(text, API_PATTERN).map((value) => value.toLowerCase()),
    ...extractRegexMatches(text, VERSION_PATTERN).map((value) => value.toLowerCase()),
    ...extractUrls(text).map((value) => value.toLowerCase()),
  ]).slice(0, 48);
}

function formatWindowMessage(message: PromptReadyMessage): string {
  const role = message.role === "user" ? "User" : "AI";
  return `[${role}] ${message.transcriptText}`;
}

function getScopedConversationIds(searchScope?: ExploreSearchScope): number[] | undefined {
  if (searchScope?.mode !== "selected" || !Array.isArray(searchScope.conversationIds)) {
    return undefined;
  }

  const normalized = unique(
    searchScope.conversationIds
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => String(Math.floor(value)))
  ).map((value) => Number(value));

  return normalized.length > 0 ? normalized : undefined;
}

function classifyQuery(query: string): RetrievalQueryClass {
  if (EXACT_QUERY_PATTERN.test(query)) {
    return "engineering_exact";
  }
  if (SUMMARY_QUERY_PATTERN.test(query)) {
    return "time_or_summary";
  }
  return "general_semantic";
}

function inferFollowupType(query: string): RetrievalFollowupType | undefined {
  const lowered = query.toLowerCase();
  if (/compare|difference|区别|对比/.test(lowered)) return "compare";
  if (/continue|继续|接着/.test(lowered)) return "continue";
  if (/deeper|details|展开|细说|drill/.test(lowered)) return "drill_down";
  if (/refine|narrow|限定|缩小/.test(lowered)) return "refine";
  return undefined;
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function scoreLexicalMatch(queryTerms: string[], searchableTerms: string[]): number {
  if (!queryTerms.length || !searchableTerms.length) {
    return 0;
  }

  const haystack = new Set(searchableTerms.map((term) => term.toLowerCase()));
  let matched = 0;
  for (const queryTerm of queryTerms) {
    const normalized = queryTerm.toLowerCase();
    if (haystack.has(normalized)) {
      matched += 1;
      continue;
    }

    const partial = searchableTerms.some((candidate) =>
      candidate.toLowerCase().includes(normalized) || normalized.includes(candidate.toLowerCase())
    );
    if (partial) {
      matched += 0.6;
    }
  }

  return Math.min(1, matched / queryTerms.length);
}

function cosineSimilarity(a?: Float32Array, b?: Float32Array): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildConversationSearchText(capsule: ConversationCapsuleV1): string {
  return [
    capsule.title ?? "",
    capsule.shortSummary,
    capsule.coreQuestion ?? "",
    capsule.keywords.join(" "),
    capsule.entities?.join(" ") ?? "",
    capsule.refs.filePaths.join(" "),
    capsule.refs.commands.join(" "),
    capsule.refs.apis.join(" "),
    capsule.refs.hosts.join(" "),
    capsule.refs.urls.join(" "),
    ...capsule.decisions.map((item) => item.text),
    ...capsule.openQuestions.map((item) => item.text),
    ...capsule.actionItems.map((item) => item.text),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCapsuleVectorText(capsule: ConversationCapsuleV1): string {
  return normalizeEmbeddingInput(buildConversationSearchText(capsule));
}

async function upsertConversationVector(
  conversationId: number,
  sourceHash: string,
  capsuleText: string
): Promise<boolean> {
  const prepared = normalizeEmbeddingInput(capsuleText);
  if (!prepared) {
    return false;
  }

  try {
    const embedding = await embedText(prepared);
    const textHash = await hashText(`${sourceHash}:${prepared}`);

    await db.transaction("rw", db.vectors, async () => {
      await db.vectors.where("conversation_id").equals(conversationId).delete();
      await db.vectors.add({
        conversation_id: conversationId,
        text_hash: textHash,
        embedding,
      });
    });

    return true;
  } catch {
    return false;
  }
}

function detectRefs(messages: PromptReadyMessage[]) {
  const text = messages.map((message) => message.transcriptText).join("\n");
  const urls = unique([
    ...extractUrls(text),
    ...messages.flatMap((message) =>
      (message.citations ?? []).map((citation) => citation.href).filter(Boolean)
    ),
  ]);

  const filePaths = unique([
    ...extractRegexMatches(text, PATH_PATTERN),
    ...messages.flatMap((message) =>
      message.artifactRefs.filter((ref) => ref.includes("/") || ref.includes("\\"))
    ),
  ]);
  const commands = unique(extractRegexMatches(text, COMMAND_PATTERN).map(normalizeTerm));
  const apis = unique(extractRegexMatches(text, API_PATTERN));
  const hosts = unique([
    ...extractHosts(urls),
    ...messages.flatMap((message) =>
      (message.citations ?? []).map((citation) => citation.host).filter(Boolean)
    ),
  ]);

  return {
    filePaths: filePaths.slice(0, 24),
    commands: commands.slice(0, 24),
    apis: apis.slice(0, 24),
    urls: urls.slice(0, 24),
    hosts: hosts.slice(0, 24),
  };
}

function buildCoreQuestion(messages: PromptReadyMessage[]): string | undefined {
  const firstQuestion = messages.find(
    (message) => message.role === "user" && /[?？]|为什么|如何|能否|怎么|what|why|how/i.test(message.bodyText)
  );

  if (firstQuestion?.bodyText.trim()) {
    return truncate(firstQuestion.bodyText, 180);
  }

  const firstUser = messages.find((message) => message.role === "user" && message.bodyText.trim());
  return firstUser ? truncate(firstUser.bodyText, 180) : undefined;
}

function buildShortSummary(
  conversation: Conversation,
  messages: PromptReadyMessage[],
  refs: ConversationCapsuleV1["refs"]
): string {
  const firstUser = messages.find((message) => message.role === "user");
  const lastAi = [...messages].reverse().find((message) => message.role === "ai");

  return truncate(
    [
      conversation.title,
      firstUser?.bodyText ? `Question: ${truncate(firstUser.bodyText, 120)}` : "",
      lastAi?.bodyText ? `Latest answer: ${truncate(lastAi.bodyText, 120)}` : "",
      refs.commands[0] ? `Command: ${refs.commands[0]}` : "",
      refs.apis[0] ? `API: ${refs.apis[0]}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    320
  );
}

function resolveEvidenceRefs(
  messageId: number | undefined,
  windows: EvidenceWindowV1[],
  conversationId: number
): EvidenceRefV1[] {
  if (typeof messageId !== "number") {
    return [];
  }

  const matched = windows.find((window) => {
    if (typeof window.messageStartId !== "number" || typeof window.messageEndId !== "number") {
      return false;
    }
    return messageId >= window.messageStartId && messageId <= window.messageEndId;
  });

  if (!matched) {
    return [];
  }

  return [
    {
      conversationId,
      windowId: matched.id,
      messageStartId: matched.messageStartId,
      messageEndId: matched.messageEndId,
    },
  ];
}

function collectEvidenceItems(
  messages: PromptReadyMessage[],
  windows: EvidenceWindowV1[],
  conversationId: number,
  pattern: RegExp
): ConversationCapsuleV1["decisions"] {
  const items: ConversationCapsuleV1["decisions"] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    const body = message.bodyText.trim();
    if (!body || !pattern.test(body)) {
      continue;
    }

    const text = truncate(body, 180);
    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push({
      text,
      evidenceRefs: resolveEvidenceRefs(message.id, windows, conversationId),
    });

    if (items.length >= 6) {
      break;
    }
  }

  return items;
}

function buildWindowLabels(messages: PromptReadyMessage[]): EvidenceWindowLabel[] {
  const joined = messages.map((message) => message.bodyText).join("\n");
  const labels: EvidenceWindowLabel[] = [];

  if (messages.some((message) => message.structureSignals.hasCode)) labels.push("code");
  if (messages.some((message) => message.artifactRefs.length > 0 || message.structureSignals.hasArtifacts)) {
    labels.push("artifact-heavy");
  }
  if (messages.some((message) => message.citations?.length)) labels.push("citation-heavy");
  if (messages.some((message) => new RegExp(COMMAND_PATTERN.source, "im").test(message.bodyText))) {
    labels.push("command-heavy");
  }
  if (ERROR_PATTERN.test(joined)) labels.push("error-heavy");
  if (DECISION_PATTERN.test(joined)) labels.push("decision-labeled");
  if (
    messages.some((message) => message.role === "user") &&
    messages.some((message) => message.role === "ai")
  ) {
    labels.push("question-answer-adjacent");
  }

  return unique(labels) as EvidenceWindowLabel[];
}

function detectTopicShift(previous: PromptReadyMessage, next: PromptReadyMessage): boolean {
  const leftTerms = new Set(extractLexicalTerms(previous.bodyText).slice(0, 12));
  const rightTerms = extractLexicalTerms(next.bodyText).slice(0, 12);
  if (leftTerms.size === 0 || rightTerms.length === 0) {
    return false;
  }

  const overlap = rightTerms.filter((term) => leftTerms.has(term)).length;
  return overlap / Math.max(1, Math.min(leftTerms.size, rightTerms.length)) < 0.12;
}

function shouldBreakAfter(
  currentMessages: PromptReadyMessage[],
  currentTokens: number,
  nextMessage?: PromptReadyMessage
): boolean {
  if (currentMessages.length >= 8 || currentTokens >= 800) {
    return true;
  }
  if (currentMessages.length < 3) {
    return false;
  }

  const last = currentMessages[currentMessages.length - 1];
  if (currentTokens >= 500) {
    return true;
  }
  if (last.structureSignals.hasCode || last.structureSignals.hasArtifacts) {
    return true;
  }
  if (nextMessage && detectTopicShift(last, nextMessage)) {
    return true;
  }
  if (ERROR_PATTERN.test(last.bodyText) && currentTokens >= 260) {
    return true;
  }
  return false;
}

function createEvidenceWindows(
  conversation: Conversation,
  messages: PromptReadyMessage[],
  sourceHash: string
): EvidenceWindowV1[] {
  const windows: EvidenceWindowV1[] = [];
  if (!messages.length) {
    return windows;
  }

  let start = 0;
  while (start < messages.length) {
    let end = start;
    let tokens = 0;

    while (end < messages.length) {
      const current = messages[end];
      const candidateTokens = estimateTokens(current.transcriptText);
      if (end > start && (tokens + candidateTokens > 800 || end - start >= 8)) {
        break;
      }

      tokens += candidateTokens;
      end += 1;

      if (shouldBreakAfter(messages.slice(start, end), tokens, messages[end])) {
        break;
      }
    }

    const slice = messages.slice(start, end);
    const labels = buildWindowLabels(slice);
    const artifactRefs = unique(slice.flatMap((message) => message.artifactRefs)).slice(0, 24);
    const lexicalTerms = unique(
      slice.flatMap((message) => extractLexicalTerms(message.transcriptText))
    ).slice(0, 48);
    const text = [
      `[Title] ${conversation.title}`,
      ...slice.map((message) => formatWindowMessage(message)),
    ].join("\n");
    const windowIndex = windows.length;
    const messageStartId = slice[0]?.id;
    const messageEndId = slice[slice.length - 1]?.id;

    windows.push({
      id: `${conversation.id}:${sourceHash.slice(0, 12)}:${windowIndex}`,
      conversationId: conversation.id,
      sourceHash,
      windowIndex,
      messageStartId,
      messageEndId,
      text,
      tokenEstimate: Math.max(tokens, estimateTokens(text)),
      labels,
      lexicalTerms,
      artifactRefs,
      hasCode: labels.includes("code"),
      hasCommand: labels.includes("command-heavy"),
      hasErrorLikeText: labels.includes("error-heavy"),
      createdAt: Date.now(),
    });

    if (end >= messages.length) {
      break;
    }

    const windowSize = end - start;
    const overlap = windowSize >= 6 ? 2 : 1;
    start = Math.max(start + 1, end - Math.min(overlap, Math.max(1, windowSize - 1)));
  }

  return windows;
}

async function collectConversationData(conversationId: number): Promise<{
  conversation: Conversation;
  promptReadyMessages: PromptReadyMessage[];
  sourceHash: string;
}> {
  const conversation = await db.conversations.get(conversationId);
  if (!conversation?.id) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  const [messages, annotations] = await Promise.all([
    listMessages(conversationId),
    listAnnotations(conversationId),
  ]);
  const promptContext = createPromptReadyConversationContext({
    conversation: conversation as Conversation,
    messages,
  });

  const sourceHash = await hashText(
    JSON.stringify({
      id: conversation.id,
      title: conversation.title,
      snippet: conversation.snippet,
      updatedAt: conversation.updated_at,
      promptReadyMessages: promptContext.messages.map((message) => ({
        id: message.id,
        role: message.role,
        created_at: message.created_at,
        bodyText: message.bodyText,
        transcriptText: message.transcriptText,
        artifactRefs: message.artifactRefs,
        citations: message.citations ?? [],
        artifacts: message.artifacts ?? [],
      })),
      annotations: annotations.map((annotation) => ({
        id: annotation.id,
        message_id: annotation.message_id,
        content_text: annotation.content_text,
        created_at: annotation.created_at,
      })),
    })
  );

  return {
    conversation: conversation as Conversation,
    promptReadyMessages: promptContext.messages,
    sourceHash,
  };
}

function buildCapsule(
  conversation: Conversation,
  messages: PromptReadyMessage[],
  windows: EvidenceWindowV1[],
  sourceHash: string
): ConversationCapsuleV1 {
  const refs = detectRefs(messages);
  const shortSummary = buildShortSummary(conversation, messages, refs);
  const coreQuestion = buildCoreQuestion(messages);
  const keywords = unique(
    [
      ...extractLexicalTerms(conversation.title),
      ...extractLexicalTerms(conversation.snippet),
      ...messages.slice(0, 6).flatMap((message) => extractLexicalTerms(message.bodyText)),
      ...refs.filePaths,
      ...refs.commands,
      ...refs.apis,
      ...refs.hosts,
    ].map((term) => term.toLowerCase())
  ).slice(0, 16);

  const entities = unique([...refs.apis, ...refs.hosts, ...refs.filePaths]).slice(0, 12);
  const decisions = collectEvidenceItems(messages, windows, conversation.id, DECISION_PATTERN);
  const openQuestions = collectEvidenceItems(
    messages,
    windows,
    conversation.id,
    /[?？]|待确认|待调查|unknown|unclear|为什么|如何|what|why|how/i
  );
  const actionItems = collectEvidenceItems(messages, windows, conversation.id, ACTION_PATTERN);

  return {
    conversationId: conversation.id,
    sourceUpdatedAt: conversation.updated_at,
    sourceHash,
    title: conversation.title,
    shortSummary,
    coreQuestion,
    keywords,
    entities,
    tags: conversation.tags ?? [],
    decisions,
    openQuestions,
    actionItems,
    refs,
    artifacts: unique(
      messages.flatMap((message) =>
        (message.artifacts ?? []).map((artifact) => artifact.label ?? artifact.kind)
      )
    )
      .slice(0, 12)
      .map((label) => ({
        kind: "message_artifact",
        label,
      })),
    stats: {
      messageCount: messages.length,
      windowCount: windows.length,
      hasCode: messages.some((message) => message.structureSignals.hasCode),
      hasArtifacts: messages.some((message) => message.structureSignals.hasArtifacts),
      lastMessageAt: messages[messages.length - 1]?.created_at,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function buildWindowVectors(
  windows: EvidenceWindowV1[]
): Promise<{ records: WindowVectorRecord[]; vectorCount: number }> {
  const records: WindowVectorRecord[] = [];

  for (const window of windows) {
    const prepared = normalizeEmbeddingInput(window.text);
    if (!prepared) {
      continue;
    }

    try {
      const embedding = await embedText(prepared);
      records.push({
        windowId: window.id,
        conversationId: window.conversationId,
        sourceHash: window.sourceHash,
        text_hash: await hashText(`${window.sourceHash}:${prepared}`),
        embedding,
      });
    } catch {
      // Lexical retrieval can still work without vectors.
    }
  }

  return { records, vectorCount: records.length };
}

async function buildRetrievalAssetsForConversation(
  conversationId: number,
  options: { force?: boolean } = {}
): Promise<RetrievalBuildResult> {
  const startedAt = Date.now();
  const previousStatus = await getRetrievalAssetStatus(conversationId);

  await saveRetrievalAssetStatus({
    conversationId,
    sourceHash: previousStatus?.sourceHash ?? "",
    sourceUpdatedAt: previousStatus?.sourceUpdatedAt ?? startedAt,
    state: "building",
    capsuleUpdatedAt: previousStatus?.capsuleUpdatedAt,
    lastBuiltAt: startedAt,
    windowCount: previousStatus?.windowCount ?? 0,
    windowVectorCount: previousStatus?.windowVectorCount ?? 0,
  });

  try {
    const { conversation, promptReadyMessages, sourceHash } = await collectConversationData(
      conversationId
    );

    if (
      !options.force &&
      previousStatus?.state === "ready" &&
      previousStatus.sourceHash === sourceHash
    ) {
      await saveRetrievalAssetStatus({
        ...previousStatus,
        sourceHash,
        state: "ready",
        lastBuiltAt: previousStatus.lastBuiltAt ?? startedAt,
      });
      return {
        conversationId,
        sourceHash,
        state: "ready",
        built: false,
        windowCount: previousStatus.windowCount,
        windowVectorCount: previousStatus.windowVectorCount,
      };
    }

    const windows = createEvidenceWindows(conversation, promptReadyMessages, sourceHash);
    const capsule = buildCapsule(conversation, promptReadyMessages, windows, sourceHash);
    const { records: windowVectorRecords, vectorCount } = await buildWindowVectors(windows);
    await upsertConversationVector(
      conversationId,
      sourceHash,
      buildCapsuleVectorText(capsule)
    );

    await saveConversationCapsule(capsule);
    await replaceEvidenceWindows(conversationId, windows);
    await saveWindowVectors(windowVectorRecords);

    await saveRetrievalAssetStatus({
      conversationId,
      sourceHash,
      sourceUpdatedAt: conversation.updated_at,
      state: "ready",
      capsuleUpdatedAt: capsule.updatedAt,
      lastBuiltAt: Date.now(),
      windowCount: windows.length,
      windowVectorCount: vectorCount,
    });

    return {
      conversationId,
      sourceHash,
      state: "ready",
      built: true,
      windowCount: windows.length,
      windowVectorCount: vectorCount,
    };
  } catch (error) {
    await saveRetrievalAssetStatus({
      conversationId,
      sourceHash: previousStatus?.sourceHash ?? "",
      sourceUpdatedAt: previousStatus?.sourceUpdatedAt ?? Date.now(),
      state: "failed",
      capsuleUpdatedAt: previousStatus?.capsuleUpdatedAt,
      lastBuiltAt: Date.now(),
      windowCount: previousStatus?.windowCount ?? 0,
      windowVectorCount: previousStatus?.windowVectorCount ?? 0,
      error: (error as Error)?.message ?? String(error),
    });
    throw error;
  }
}

export async function buildRetrievalAssets(params: {
  conversationIds?: number[];
  force?: boolean;
} = {}): Promise<{ queued: boolean; built: number; conversationIds: number[] }> {
  const conversations =
    Array.isArray(params.conversationIds) && params.conversationIds.length > 0
      ? (await db.conversations.bulkGet(params.conversationIds))
          .filter((conversation): conversation is Conversation & { id: number } =>
            Boolean(conversation?.id)
          )
          .map((conversation) => conversation as Conversation)
      : (await db.conversations.toArray())
          .filter((conversation): conversation is Conversation & { id: number } =>
            Boolean(conversation?.id)
          )
          .map((conversation) => conversation as Conversation);

  let built = 0;
  for (const conversation of conversations) {
    if (!conversation.id) {
      continue;
    }

    try {
      const result = await buildRetrievalAssetsForConversation(conversation.id, {
        force: params.force,
      });
      if (result.built) {
        built += 1;
      }
    } catch {
      // Continue building the remaining assets.
    }
  }

  return {
    queued: true,
    built,
    conversationIds: conversations.map((conversation) => conversation.id),
  };
}

async function buildDeterministicRewriteHints(params: {
  query: string;
  sessionId?: string;
}): Promise<QueryRewriteHintsV1> {
  const normalizedQuery = normalizeQuery(params.query);
  const preservedTerms = extractPreservedTerms(normalizedQuery);
  const sessionMessages =
    params.sessionId?.trim() ? await getExploreMessages(params.sessionId.trim()) : [];
  const previousUserMessage = [...sessionMessages]
    .reverse()
    .find((message) => message.role === "user" && normalizeQuery(message.content) !== normalizedQuery);

  const followupSignal =
    /^(it|that|this|those|them|\u7ee7\u7eed|\u8fd9\u4e2a|\u90a3\u4e2a|\u4e0a\u9762|\u521a\u624d|\u518d|\u7136\u540e)/i.test(
      normalizedQuery
    ) || normalizedQuery.split(/\s+/).length <= 4;

  const standaloneQuery =
    followupSignal && previousUserMessage?.content
      ? `${normalizeQuery(previousUserMessage.content)} -> ${normalizedQuery}`
      : normalizedQuery;

  return {
    standaloneQuery,
    preservedTerms,
    expandedTerms:
      preservedTerms.length === 0 && classifyQuery(normalizedQuery) === "time_or_summary"
        ? ["summary", "timeline", "weekly"]
        : undefined,
    inferredEntities: preservedTerms.slice(0, 8),
    inferredTimeScope:
      classifyQuery(normalizedQuery) === "time_or_summary" ? "summary_or_recent" : undefined,
    followupType: inferFollowupType(normalizedQuery),
  };
}

export async function getQueryRewriteHints(params: {
  query: string;
  sessionId?: string;
}): Promise<QueryRewriteHintsV1> {
  return buildDeterministicRewriteHints(params);
}

const queryEmbeddingCache = new Map<string, Float32Array>();

async function getQueryEmbedding(normalizedQuery: string): Promise<Float32Array | undefined> {
  const cached = queryEmbeddingCache.get(normalizedQuery);
  if (cached) {
    return cached;
  }

  try {
    const embedding = toFloat32Array(await embedText(normalizeEmbeddingInput(normalizedQuery)));
    if (embedding) {
      queryEmbeddingCache.set(normalizedQuery, embedding);
      if (queryEmbeddingCache.size > 64) {
        const firstKey = queryEmbeddingCache.keys().next().value;
        if (firstKey) {
          queryEmbeddingCache.delete(firstKey);
        }
      }
    }
    return embedding;
  } catch {
    return undefined;
  }
}

async function rankConversations(params: {
  query: string;
  searchScope?: ExploreSearchScope;
  rewriteHints: QueryRewriteHintsV1;
}): Promise<RankedConversation[]> {
  const scopeIds = getScopedConversationIds(params.searchScope);
  const [capsules, statuses, conversations, vectors, queryEmbedding] = await Promise.all([
    listConversationCapsules(scopeIds),
    listRetrievalAssetStatus(scopeIds),
    scopeIds?.length ? db.conversations.bulkGet(scopeIds) : db.conversations.toArray(),
    scopeIds?.length
      ? db.vectors.where("conversation_id").anyOf(scopeIds).toArray()
      : db.vectors.toArray(),
    getQueryEmbedding(params.query),
  ]);

  if (capsules.length === 0) {
    return [];
  }

  const readyStatusById = new Map(
    statuses
      .filter((status) => status.state === "ready")
      .map((status) => [status.conversationId, status] as const)
  );
  const conversationById = new Map(
    conversations
      .filter((conversation): conversation is Conversation => Boolean(conversation?.id))
      .map((conversation) => [conversation.id, conversation] as const)
  );
  const vectorByConversationId = new Map(
    vectors.map((vector) => [vector.conversation_id, toFloat32Array(vector.embedding)] as const)
  );

  const searchableTerms = unique([
    ...extractLexicalTerms(params.query),
    ...params.rewriteHints.preservedTerms.map((term) => term.toLowerCase()),
  ]);

  const lexicalRank = capsules
    .map((capsule) => ({
      conversationId: capsule.conversationId,
      score: scoreLexicalMatch(searchableTerms, extractLexicalTerms(buildConversationSearchText(capsule))),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const denseRank =
    queryEmbedding !== undefined
      ? capsules
          .map((capsule) => ({
            conversationId: capsule.conversationId,
            score: cosineSimilarity(queryEmbedding, vectorByConversationId.get(capsule.conversationId)),
          }))
          .filter((item) => item.score > 0)
          .sort((left, right) => right.score - left.score)
      : [];

  const exactRank = capsules
    .map((capsule) => ({
      conversationId: capsule.conversationId,
      score: scoreLexicalMatch(
        params.rewriteHints.preservedTerms.map((term) => term.toLowerCase()),
        unique([
          ...capsule.refs.filePaths,
          ...capsule.refs.commands,
          ...capsule.refs.apis,
          ...capsule.refs.hosts,
          ...capsule.refs.urls,
        ]).map((term) => term.toLowerCase())
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const fusedScores = new Map<number, number>();
  const denseScores = new Map(denseRank.map((item) => [item.conversationId, item.score]));
  const lexicalScores = new Map(lexicalRank.map((item) => [item.conversationId, item.score]));
  const exactScores = new Map(exactRank.map((item) => [item.conversationId, item.score]));

  [denseRank, lexicalRank, exactRank].forEach((rankedList) => {
    rankedList.forEach((item, index) => {
      fusedScores.set(
        item.conversationId,
        (fusedScores.get(item.conversationId) ?? 0) + 1 / (RRF_K + index + 1)
      );
    });
  });

  const ranked: RankedConversation[] = [];
  for (const capsule of capsules) {
    const conversation = conversationById.get(capsule.conversationId);
    if (!conversation || !readyStatusById.has(capsule.conversationId)) {
      continue;
    }

    const denseScore = denseScores.get(capsule.conversationId) ?? 0;
    const lexicalScore = lexicalScores.get(capsule.conversationId) ?? 0;
    const exactScore = exactScores.get(capsule.conversationId) ?? 0;
    const score = fusedScores.get(capsule.conversationId) ?? 0;
    let matchType: EvidenceBundleConversationV1["matchType"] = "capsule";
    if (exactScore >= lexicalScore && exactScore >= denseScore && exactScore > 0) {
      matchType = "exact_ref";
    } else if (lexicalScore >= denseScore && lexicalScore > 0) {
      matchType = "lexical";
    } else if (denseScore > 0) {
      matchType = "dense";
    }

    ranked.push({
      conversation,
      capsule,
      score,
      denseScore,
      lexicalScore,
      exactScore,
      matchType,
    });
  }

  return ranked
    .sort((left, right) => right.score - left.score)
    .slice(0, CAPSULE_CANDIDATE_LIMIT);
}

function computeFreshnessPrior(conversation: Conversation): number {
  const ageDays = Math.max(0, (Date.now() - conversation.last_captured_at) / (24 * 60 * 60 * 1000));
  return Math.max(0, 0.1 * (1 - Math.min(ageDays, 30) / 30));
}

function computeStructurePrior(window: EvidenceWindowV1): number {
  let score = 0;
  if (window.labels.includes("command-heavy")) score += 0.05;
  if (window.labels.includes("error-heavy")) score += 0.05;
  if (window.labels.includes("decision-labeled")) score += 0.03;
  if (window.labels.includes("artifact-heavy")) score += 0.02;
  if (window.labels.includes("question-answer-adjacent")) score += 0.02;
  return Math.min(0.15, score);
}

function buildWindowLexicalSearchTerms(window: EvidenceWindowV1): string[] {
  return unique([...window.lexicalTerms, ...window.artifactRefs]).map((term) => term.toLowerCase());
}

function windowWeightForQueryClass(queryClass: RetrievalQueryClass): {
  lexical: number;
  dense: number;
} {
  if (queryClass === "engineering_exact") {
    return { lexical: 0.7, dense: 0.3 };
  }
  if (queryClass === "time_or_summary") {
    return { lexical: 0.5, dense: 0.5 };
  }
  return { lexical: 0.45, dense: 0.55 };
}

function mmrSimilarity(left: RankedWindow, right: RankedWindow): number {
  if (left.embedding && right.embedding) {
    return cosineSimilarity(left.embedding, right.embedding);
  }

  const leftTerms = new Set(buildWindowLexicalSearchTerms(left.window));
  const rightTerms = buildWindowLexicalSearchTerms(right.window);
  if (leftTerms.size === 0 || rightTerms.length === 0) {
    return 0;
  }

  const overlap = rightTerms.filter((term) => leftTerms.has(term)).length;
  return overlap / Math.max(leftTerms.size, rightTerms.length);
}

function applyMmr(rankedWindows: RankedWindow[], targetCount: number): RankedWindow[] {
  const selected: RankedWindow[] = [];
  const remaining = [...rankedWindows];
  const lambda = 0.7;

  while (remaining.length > 0 && selected.length < targetCount) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const diversityPenalty = selected.reduce((maxPenalty, existing) => {
        return Math.max(maxPenalty, mmrSimilarity(existing, candidate));
      }, 0);

      const mmrScore = lambda * candidate.score - (1 - lambda) * diversityPenalty;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIndex = index;
      }
    });

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

async function rankWindows(
  rankedConversations: RankedConversation[],
  params: {
    query: string;
    queryClass: RetrievalQueryClass;
    rewriteHints: QueryRewriteHintsV1;
    limit: number;
  }
): Promise<RankedWindow[]> {
  const conversationIds = rankedConversations.map((item) => item.conversation.id);
  if (conversationIds.length === 0) {
    return [];
  }
  const [windows, vectorRecords, queryEmbedding] = await Promise.all([
    getEvidenceWindowsByConversationIds(conversationIds),
    db.window_vectors.where("conversationId").anyOf(conversationIds).toArray(),
    getQueryEmbedding(params.query),
  ]);

  const vectorByWindowId = new Map(
    vectorRecords.map((record) => [record.windowId, toFloat32Array(record.embedding)] as const)
  );
  const conversationById = new Map(
    rankedConversations.map((item) => [item.conversation.id, item.conversation] as const)
  );
  const queryTerms = unique([
    ...extractLexicalTerms(params.query),
    ...params.rewriteHints.preservedTerms.map((term) => term.toLowerCase()),
  ]);
  const weights = windowWeightForQueryClass(params.queryClass);

  const rankedWindows = windows
    .map((window) => {
      const conversation = conversationById.get(window.conversationId);
      if (!conversation) {
        return null;
      }

      const lexicalScore = scoreLexicalMatch(queryTerms, buildWindowLexicalSearchTerms(window));
      const denseScore = cosineSimilarity(queryEmbedding, vectorByWindowId.get(window.id));
      const structurePrior = computeStructurePrior(window);
      const freshnessPrior = computeFreshnessPrior(conversation);
      const score =
        weights.lexical * lexicalScore +
        weights.dense * denseScore +
        structurePrior +
        freshnessPrior;

      return {
        window,
        conversation,
        score,
        lexicalScore,
        denseScore,
        structurePrior,
        freshnessPrior,
        embedding: vectorByWindowId.get(window.id),
      } as RankedWindow;
    })
    .filter((item): item is RankedWindow => Boolean(item))
    .sort((left, right) => right.score - left.score);

  const targetCount = Math.max(MIN_WINDOW_LIMIT, Math.min(DEFAULT_WINDOW_LIMIT, params.limit * 3));
  return applyMmr(rankedWindows, targetCount);
}

function buildAssetStatusSummary(params: {
  scopeIds?: number[];
  statuses: RetrievalAssetStatusV1[];
  totalConversationIds: number[];
}): EvidenceBundleV1["assetStatus"] {
  const scopeIds = params.scopeIds ?? params.totalConversationIds;
  const readyIds = new Set(
    params.statuses.filter((status) => status.state === "ready").map((status) => status.conversationId)
  );
  const staleConversationIds = params.statuses
    .filter((status) => status.state === "stale")
    .map((status) => status.conversationId);
  const missingConversationIds = scopeIds.filter((conversationId) => !readyIds.has(conversationId));

  return {
    scopedConversationCount: scopeIds.length,
    readyConversationCount: readyIds.size,
    staleConversationIds,
    missingConversationIds,
  };
}

export async function getEvidenceBundle(params: {
  query: string;
  sessionId?: string;
  limit?: number;
  searchScope?: ExploreSearchScope;
  rewriteHints?: QueryRewriteHintsV1;
}): Promise<EvidenceBundleV1> {
  const normalizedQuery = normalizeQuery(params.query);
  if (!normalizedQuery) {
    throw new Error("QUERY_EMPTY");
  }

  const queryClass = classifyQuery(normalizedQuery);
  const rewriteHints =
    params.rewriteHints ??
    (await buildDeterministicRewriteHints({
      query: normalizedQuery,
      sessionId: params.sessionId,
    }));
  const rankedConversations = await rankConversations({
    query: rewriteHints.standaloneQuery,
    searchScope: params.searchScope,
    rewriteHints,
  });
  const statuses = await listRetrievalAssetStatus(getScopedConversationIds(params.searchScope));
  const allConversationIds = (
    await (getScopedConversationIds(params.searchScope)
      ? db.conversations.bulkGet(getScopedConversationIds(params.searchScope)!)
      : db.conversations.toArray())
  )
    .filter((conversation): conversation is Conversation => Boolean(conversation?.id))
    .map((conversation) => conversation.id);

  const rankedWindows = await rankWindows(rankedConversations, {
    query: rewriteHints.standaloneQuery,
    queryClass,
    rewriteHints,
    limit: params.limit ?? 5,
  });

  const conversations: EvidenceBundleConversationV1[] = rankedConversations.map((item) => ({
    conversationId: item.conversation.id,
    title: item.conversation.title,
    platform: item.conversation.platform,
    score: Number(item.score.toFixed(4)),
    matchType: item.matchType,
    shortSummary: item.capsule.shortSummary,
    keywords: item.capsule.keywords,
    sourceHash: item.capsule.sourceHash,
  }));

  const windows: EvidenceBundleWindowV1[] = rankedWindows.map((item) => ({
    ...item.window,
    score: Number(item.score.toFixed(4)),
    lexicalScore: Number(item.lexicalScore.toFixed(4)),
    denseScore: Number(item.denseScore.toFixed(4)),
    structurePrior: Number(item.structurePrior.toFixed(4)),
    freshnessPrior: Number(item.freshnessPrior.toFixed(4)),
    conversationTitle: item.conversation.title,
    platform: item.conversation.platform,
  }));

  const groupedEvidence = rankedWindows.reduce<EvidenceBundleGroupV1[]>((groups, item) => {
    const existing = groups.find((group) => group.conversationId === item.conversation.id);
    if (existing) {
      existing.windowIds.push(item.window.id);
      existing.score = Math.max(existing.score, Number(item.score.toFixed(4)));
      return groups;
    }

    groups.push({
      conversationId: item.conversation.id,
      title: item.conversation.title,
      platform: item.conversation.platform,
      score: Number(item.score.toFixed(4)),
      windowIds: [item.window.id],
    });
    return groups;
  }, []);

  const searchScope = params.searchScope ?? { mode: "all" as const };
  const assetStatus = buildAssetStatusSummary({
    scopeIds: getScopedConversationIds(searchScope),
    statuses,
    totalConversationIds: allConversationIds,
  });
  const queryHash = await hashText(
    `${normalizedQuery}:${searchScope.mode}:${(searchScope.conversationIds ?? []).join(",")}:${RETRIEVAL_ASSET_VERSION}`
  );

  recordRetrievalObservation("deterministic_rag", windows.length);

  return {
    query: normalizedQuery,
    queryHash,
    queryClass,
    searchScope,
    rewriteHints,
    generatedAt: Date.now(),
    assetVersion: RETRIEVAL_ASSET_VERSION,
    conversations,
    windows,
    groupedEvidence,
    synthesisHints: {
      stablePrefix:
        "You are Vesti's evidence-grounded retrieval assistant. Use the evidence windows first, keep claims anchored, and say when evidence is partial.",
      evidenceOrdering: "score_desc",
      recommendedWindowCount: windows.length,
    },
    assetStatus,
  };
}

export function buildEvidencePrompt(bundle: EvidenceBundleV1, historyContext: string): string {
  const evidenceLines =
    bundle.windows.length > 0
      ? bundle.windows
          .map(
            (window, index) =>
              `Window ${index + 1} | ${window.conversationTitle} [${window.platform}] | score=${window.score}\n${window.text}`
          )
          .join("\n\n---\n\n")
      : "(no evidence windows available)";

  return [
    bundle.synthesisHints.stablePrefix,
    historyContext,
    `Query class: ${bundle.queryClass}`,
    `Search scope: ${bundle.searchScope.mode}`,
    "",
    "Evidence windows:",
    evidenceLines,
    "",
    "Instructions:",
    "1. Answer using the evidence windows before using any generalized summary language.",
    "2. If evidence is partial or conflicting, say that clearly.",
    "3. Prefer citing the conversation title or window ordering when grounding a claim.",
    "4. Keep the final answer concise but concrete.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSourcesFromBundle(bundle: EvidenceBundleV1): Array<{
  id: number;
  title: string;
  platform: Conversation["platform"];
  similarity: number;
}> {
  return bundle.conversations.slice(0, 8).map((conversation) => ({
    id: conversation.conversationId,
    title: conversation.title,
    platform: conversation.platform,
    similarity: Math.round(conversation.score * 100),
  }));
}

export function buildContextCandidatesFromBundle(bundle: EvidenceBundleV1): Array<{
  conversationId: number;
  title: string;
  platform: Conversation["platform"];
  similarity: number;
  matchType: "capsule" | "lexical" | "window";
  selectionReason: string;
  summarySnippet?: string;
  excerpt?: string;
}> {
  const firstWindowByConversationId = new Map<number, EvidenceBundleWindowV1>();
  for (const window of bundle.windows) {
    if (!firstWindowByConversationId.has(window.conversationId)) {
      firstWindowByConversationId.set(window.conversationId, window);
    }
  }

  return bundle.conversations.map((conversation) => {
    const firstWindow = firstWindowByConversationId.get(conversation.conversationId);
    return {
      conversationId: conversation.conversationId,
      title: conversation.title,
      platform: conversation.platform,
      similarity: Math.round(conversation.score * 100),
      matchType:
        conversation.matchType === "dense"
          ? "capsule"
          : conversation.matchType === "exact_ref"
            ? "lexical"
            : conversation.matchType,
      selectionReason:
        conversation.matchType === "exact_ref"
          ? "Matched preserved engineering terms from the query."
          : conversation.matchType === "dense"
            ? "Retrieved through capsule-level semantic similarity."
            : "Retrieved through deterministic capsule/window scoring.",
      summarySnippet: conversation.shortSummary,
      excerpt: firstWindow ? truncate(firstWindow.text, 240) : undefined,
    };
  });
}

export function buildLocalAnswerFromBundle(query: string, bundle: EvidenceBundleV1): string {
  if (bundle.windows.length === 0) {
    return [
      `I could not find enough prepared evidence for: "${truncate(query, 120)}".`,
      "Try broadening the scope, warming retrieval assets, or using a more exact term.",
    ].join("\n");
  }

  const lines = bundle.groupedEvidence.slice(0, 5).map((group, index) => {
    const windowCount = group.windowIds.length;
    return `${index + 1}. ${group.title} [${group.platform}] (${windowCount} evidence window${windowCount === 1 ? "" : "s"})`;
  });

  return [
    "Prepared evidence is available from these conversations:",
    ...lines,
    "Open one of the source conversations for details, or enable model synthesis for a fuller answer.",
  ].join("\n");
}
