import type { Conversation, Message } from "../types";
import { formatArtifactDescriptor, getArtifactExcerptText } from "@vesti/ui";
import { extractAstPlainText, inspectAstStructure, isAstRoot, shouldPreferAstCanonicalText } from "../utils/astText";

const PATH_PATTERN =
  /(?:[A-Za-z]:\\[^\s`"')]+|(?:\.?\.?(?:\/|\\))?(?:[\w.-]+(?:\/|\\))+[\w./\\-]*[\w-]+(?:\.[A-Za-z0-9]+)?)/g;
const COMMAND_PATTERN =
  /(?:^|\s)(?:pnpm|npm|git|node|python|pytest|rg|gh|curl|yarn|tsx|ts-node)\b[^\n]*/gim;
const API_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\([^()\n]{0,80}\)/g;
const BACKTICK_PATTERN = /`[^`\n]{2,120}`/g;
const INLINE_MATH_PATTERN =
  /(?:\\(?:boxed|lambda|frac|sum|int|alpha|beta|gamma|theta|cdot|times|left|right|begin|end)|\$\$|\\\(|\\\)|\\\[|\\\]|[_^][{(A-Za-z0-9])/i;

export interface PromptStructureSignals {
  hasList: boolean;
  hasTable: boolean;
  hasCode: boolean;
  hasMath: boolean;
  hasBlockquote: boolean;
  hasHeading: boolean;
  hasAttachment: boolean;
  hasCitations: boolean;
  hasArtifacts: boolean;
}

export interface PromptReadyMessage extends Message {
  bodyText: string;
  transcriptText: string;
  structureSignals: PromptStructureSignals;
  sidecarSummaryLines: string[];
  artifactRefs: string[];
}

export interface PromptReadyConversationContext {
  conversation?: Conversation;
  messages: PromptReadyMessage[];
  transcript: string;
  bodyChars: number;
}

function normalizeBodyText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function detectArtifactRefs(value: string): string[] {
  const refs: string[] = [];

  for (const match of value.match(PATH_PATTERN) ?? []) {
    refs.push(match);
  }
  for (const match of value.match(COMMAND_PATTERN) ?? []) {
    refs.push(match.trim());
  }
  for (const match of value.match(API_PATTERN) ?? []) {
    refs.push(match);
  }
  for (const match of value.match(BACKTICK_PATTERN) ?? []) {
    refs.push(match.slice(1, -1));
  }

  return unique(refs).slice(0, 8);
}

function buildStructureSignals(message: Message, bodyText: string): PromptStructureSignals {
  const astRoot = isAstRoot(message.content_ast) ? message.content_ast : null;
  const astStats = astRoot ? inspectAstStructure(astRoot) : null;
  const hasCommandLikeText = new RegExp(COMMAND_PATTERN.source, "im").test(bodyText);

  return {
    hasList: astStats?.hasList ?? false,
    hasTable: astStats?.hasTable ?? /\|.+\|/.test(bodyText),
    hasCode:
      astStats?.hasCodeBlock ??
      /```/.test(bodyText) ||
      hasCommandLikeText,
    hasMath: astStats?.hasMath ?? INLINE_MATH_PATTERN.test(bodyText),
    hasBlockquote: astStats?.hasBlockquote ?? false,
    hasHeading: astStats?.hasHeading ?? false,
    hasAttachment: astStats?.hasAttachment ?? false,
    hasCitations: (message.citations ?? []).length > 0,
    hasArtifacts: (message.artifacts ?? []).length > 0,
  };
}

function resolveCanonicalBodyText(message: Message): string {
  const fallbackText = normalizeBodyText(message.content_text);
  const astRoot = isAstRoot(message.content_ast) ? message.content_ast : null;

  if (
    astRoot &&
    shouldPreferAstCanonicalText({
      root: astRoot,
      fallbackText,
    })
  ) {
    const canonical = normalizeBodyText(extractAstPlainText(astRoot));
    if (canonical) {
      return canonical;
    }
  }

  return fallbackText;
}

function buildSignalSummaryLine(signals: PromptStructureSignals): string | null {
  const labels: string[] = [];

  if (signals.hasTable) labels.push("table");
  if (signals.hasMath) labels.push("math");
  if (signals.hasCode) labels.push("code");
  if (signals.hasList) labels.push("list");
  if (signals.hasHeading) labels.push("heading");
  if (signals.hasBlockquote) labels.push("blockquote");
  if (signals.hasAttachment) labels.push("attachment");
  if (signals.hasCitations) labels.push("citations");
  if (signals.hasArtifacts) labels.push("artifacts");

  if (labels.length === 0) {
    return null;
  }

  return `Signals: ${labels.join(", ")}`;
}

function buildCitationSummaryLines(message: Message): string[] {
  const citations = message.citations ?? [];
  if (citations.length === 0) {
    return [];
  }

  const lines = citations
    .slice(0, 3)
    .map((citation) => `Source: ${citation.label} (${citation.host})`);

  if (citations.length > 3) {
    lines.push(`Source: ... and ${citations.length - 3} more`);
  }

  return lines;
}

function buildArtifactSummaryLines(message: Message): string[] {
  const artifacts = message.artifacts ?? [];
  if (artifacts.length === 0) {
    return [];
  }

  const lines = artifacts.slice(0, 3).flatMap((artifact) => {
    const label = artifact.label ?? artifact.kind;
    const excerpt = getArtifactExcerptText(artifact, {
      maxLines: 2,
      maxCharsPerLine: 110,
    });
    return [
      `Artifact: ${label} (${formatArtifactDescriptor(artifact)})`,
      excerpt ? `Artifact Excerpt: ${excerpt}` : null,
    ].filter((line): line is string => Boolean(line));
  });

  if (artifacts.length > 3) {
    lines.push(`Artifact: ... and ${artifacts.length - 3} more`);
  }

  return lines;
}

function buildArtifactRefs(message: Message, bodyText: string): string[] {
  const artifacts = message.artifacts ?? [];
  const sidecarRefs = unique(
    artifacts.flatMap((artifact) => [
      artifact.label ?? "",
      artifact.plainText ?? "",
      artifact.markdownSnapshot ?? "",
    ])
  ).flatMap((value) => detectArtifactRefs(value));

  if (sidecarRefs.length > 0) {
    return sidecarRefs.slice(0, 8);
  }

  const labelFallback = unique(
    artifacts
      .map((artifact) => artifact.label?.trim())
      .filter((value): value is string => Boolean(value))
  );
  if (labelFallback.length > 0) {
    return labelFallback.slice(0, 8);
  }

  return detectArtifactRefs(bodyText).slice(0, 8);
}

function buildTranscriptText(bodyText: string, signals: PromptStructureSignals, sidecarSummaryLines: string[]): string {
  const sections = [bodyText];
  const signalLine = buildSignalSummaryLine(signals);
  if (signalLine) {
    sections.push(signalLine);
  }
  if (sidecarSummaryLines.length > 0) {
    sections.push(...sidecarSummaryLines);
  }
  return sections.filter(Boolean).join("\n");
}

function formatTranscriptLine(message: PromptReadyMessage, index: number): string {
  const role = message.role === "user" ? "User" : "AI";
  const time = new Date(message.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const lines = message.transcriptText.split("\n").filter(Boolean);
  if (lines.length === 0) {
    return `${index + 1}. [${time}] [${role}]`;
  }

  const [firstLine, ...restLines] = lines;
  return [
    `${index + 1}. [${time}] [${role}] ${firstLine}`,
    ...restLines.map((line) => `    ${line}`),
  ].join("\n");
}

export function createPromptReadyMessages(messages: Message[]): PromptReadyMessage[] {
  return [...messages]
    .sort((a, b) => a.created_at - b.created_at)
    .map((message) => {
      const bodyText = resolveCanonicalBodyText(message);
      const structureSignals = buildStructureSignals(message, bodyText);
      const sidecarSummaryLines = [
        ...buildCitationSummaryLines(message),
        ...buildArtifactSummaryLines(message),
      ];
      const transcriptText = buildTranscriptText(
        bodyText,
        structureSignals,
        sidecarSummaryLines,
      );
      const artifactRefs = buildArtifactRefs(message, bodyText);

      return {
        ...message,
        content_text: bodyText,
        bodyText,
        transcriptText,
        structureSignals,
        sidecarSummaryLines,
        artifactRefs,
      };
    });
}

export function createPromptReadyConversationContext(params: {
  conversation?: Conversation;
  messages: Message[];
}): PromptReadyConversationContext {
  const messages = createPromptReadyMessages(params.messages);
  return {
    conversation: params.conversation,
    messages,
    transcript:
      messages.length > 0
        ? messages.map((message, index) => formatTranscriptLine(message, index)).join("\n")
        : "[No messages available]",
    bodyChars: messages.reduce((sum, message) => sum + message.bodyText.length, 0),
  };
}
