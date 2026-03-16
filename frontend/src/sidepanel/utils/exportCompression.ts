import { getPrompt } from "~lib/prompts";
import type { ExportCompressionPromptPayload } from "~lib/prompts";
import {
  FUTURE_MODELSCOPE_EXPORT_MODEL_CANDIDATES,
  FUTURE_MOONSHOT_DIRECT_EXPORT_MODEL_CANDIDATES,
} from "~lib/services/llmConfig";
import {
  callInference,
  sanitizeSummaryText,
  truncateForContext,
} from "~lib/services/llmService";
import { getLlmSettings } from "~lib/services/llmSettingsService";
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
}

interface ExportCompressionAdapter {
  route: ExportCompressionRoute;
  compress: (
    item: ConversationExportDatasetItem,
    mode: ExportCompressionMode
  ) => Promise<CompressedConversationExport>;
}

const ACTIVE_EXPORT_COMPRESSION_ROUTE: ExportCompressionRoute =
  "current_llm_settings";
const PRIMARY_PROMPT_CHAR_BUDGET = 16000;
const FALLBACK_PROMPT_CHAR_BUDGET = 12000;
const MIN_VALID_OUTPUT_LENGTH = 48;
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
  item: ConversationExportDatasetItem
): ExportCompressionPromptPayload {
  return {
    conversationTitle: item.conversation.title,
    conversationPlatform: item.conversation.platform,
    conversationCreatedAt:
      item.conversation.source_created_at || item.conversation.created_at,
    messages: item.messages,
    locale: detectLocale(),
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

function buildCompactFallback(
  item: ConversationExportDatasetItem,
  reason: string
): string {
  const messages = item.messages;
  const questions = collectQuestionCandidates(messages, 3);
  const constraints = collectConstraintLines(messages, 2);
  const decisions = collectDecisionLines(messages, 4);
  const artifacts = collectArtifactLines(messages, 5);
  const unresolved = collectUnresolvedLines(messages, 3);

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
  reason: string
): string {
  const messages = item.messages;
  const questions = collectQuestionCandidates(messages, 2);
  const constraints = collectConstraintLines(messages, 2);
  const decisions = collectDecisionLines(messages, 3);
  const artifacts = collectArtifactLines(messages, 5);
  const unresolved = collectUnresolvedLines(messages, 3);
  const roleAwareMoves = collectRoleAwareTurns(messages, 4);
  const tags = collectPotentialTags(item.conversation, messages, 5);

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
  reason: string
): CompressedConversationExport {
  const body =
    mode === "compact"
      ? buildCompactFallback(item, reason)
      : buildSummaryFallback(item, reason);

  return {
    conversation: item.conversation,
    messages: item.messages,
    body,
    mode,
    source: "local_fallback",
    usedFallbackPrompt: false,
    fallbackReason: reason,
  };
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

function isValidCompressionOutput(
  value: string,
  item: ConversationExportDatasetItem,
  mode: ExportCompressionMode
): boolean {
  const normalized = sanitizeSummaryText(value);
  if (normalized.length < MIN_VALID_OUTPUT_LENGTH) {
    return false;
  }

  const sections = extractSections(value, mode);
  if (!sections) {
    return false;
  }

  const groundedSectionCount = countGroundedSections(sections);
  const minimumGroundedSections = mode === "compact" ? 3 : 4;
  if (groundedSectionCount < minimumGroundedSections) {
    return false;
  }

  if (!preservesArtifactSignal(value, item.messages)) {
    return false;
  }

  return true;
}

async function compressWithCurrentLlmSettings(
  item: ConversationExportDatasetItem,
  mode: ExportCompressionMode
): Promise<CompressedConversationExport> {
  const settings = await getLlmSettings();
  if (!settings) {
    throw new Error("LLM_SETTINGS_UNAVAILABLE");
  }

  const prompt = getPrompt(mode === "compact" ? "exportCompact" : "exportSummary", {
    variant: "current",
  });
  const payload = buildPromptPayload(item);
  const primaryPrompt = truncateForContext(
    prompt.userTemplate(payload),
    PRIMARY_PROMPT_CHAR_BUDGET
  );

  const primary = await callInference(settings, primaryPrompt, {
    systemPrompt: prompt.system,
  });
  const primaryBody = normalizeCompressionBody(primary.content);
  if (isValidCompressionOutput(primaryBody, item, mode)) {
    return {
      conversation: item.conversation,
      messages: item.messages,
      body: primaryBody,
      mode,
      source: "llm",
      route: "current_llm_settings",
      usedFallbackPrompt: false,
    };
  }

  const fallbackPrompt = truncateForContext(
    prompt.fallbackTemplate(payload),
    FALLBACK_PROMPT_CHAR_BUDGET
  );
  const fallback = await callInference(settings, fallbackPrompt, {
    systemPrompt: prompt.fallbackSystem || prompt.system,
  });
  const fallbackBody = normalizeCompressionBody(fallback.content);
  if (isValidCompressionOutput(fallbackBody, item, mode)) {
    return {
      conversation: item.conversation,
      messages: item.messages,
      body: fallbackBody,
      mode,
      source: "llm",
      route: "current_llm_settings",
      usedFallbackPrompt: true,
    };
  }

  throw new Error("EXPORT_COMPRESSION_OUTPUT_INVALID");
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

  if (llmCount === 0) {
    return {
      tone: "warning",
      message: `${mode === "compact" ? "Compact" : "Summary"} export used structured local fallback for all selected threads.`,
    };
  }

  return {
    tone: "warning",
    message: `${mode === "compact" ? "Compact" : "Summary"} export used structured local fallback for ${fallbackCount} of ${results.length} selected threads.`,
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
      logger.warn("llm", "Export compression fell back to local formatter", {
        route,
        mode,
        conversationId: item.conversation.id,
        reason,
      });
      items.push(buildLocalFallback(item, mode, reason));
    }
  }

  return {
    items,
    notice: buildCompressionNotice(items, mode),
  };
}

