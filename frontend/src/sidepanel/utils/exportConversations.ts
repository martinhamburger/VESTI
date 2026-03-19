import { getMessages } from "~lib/services/storageService";
import type { Conversation, Message } from "~lib/types";
import {
  getConversationCaptureFreshnessAt,
  getConversationFirstCapturedAt,
  getConversationOriginAt,
  getConversationSourceCreatedAt,
} from "~lib/conversations/timestamps";
import type {
  ConversationExportConfig,
  ConversationExportCompactVariant,
  ConversationExportContentMode,
  ConversationExportResult,
} from "../types/export";
import {
  compressExportDataset,
  type CompressedConversationExport,
  type ConversationExportDatasetItem,
  type ExportCompressionMode,
} from "./exportCompression";

function toLocalDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toOrderedMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.created_at - b.created_at);
}

async function buildExportDataset(
  conversations: Conversation[]
): Promise<ConversationExportDatasetItem[]> {
  const pairs = await Promise.all(
    conversations.map(async (conversation) => {
      const messages = await getMessages(conversation.id);
      return {
        conversation,
        messages: toOrderedMessages(messages),
      } satisfies ConversationExportDatasetItem;
    })
  );

  return pairs;
}

function toCompressionMap(
  items: CompressedConversationExport[]
): Map<number, CompressedConversationExport> {
  return new Map(items.map((item) => [item.conversation.id, item]));
}

function resolveExportMime(format: string): string {
  return format === "json"
    ? "application/json"
    : "text/plain;charset=utf-8";
}

function generateFilename(
  count: number,
  format: string,
  mode: ConversationExportContentMode,
  compactVariant: ConversationExportCompactVariant = "experimental"
): string {
  const date = new Date().toISOString().slice(0, 10);
  const modeSuffix = mode === "full" ? "" : `-${mode}`;
  return `vesti-${count}threads${modeSuffix}-${date}.${format}`;
}

function markdownToPlainText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/^###\s+/gm, "")
    .replace(/^##\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getCompactLineLabel(
  compactVariant: ConversationExportCompactVariant | undefined
): string {
  return compactVariant === "experimental"
    ? "Distilled handoff"
    : "Compact handoff";
}

function getCompressionLabel(item: CompressedConversationExport): string {
  if (item.mode === "compact") {
    const lineLabel = getCompactLineLabel(item.compactVariant);
    return item.source === "llm"
      ? item.usedFallbackPrompt
        ? `${lineLabel} (fallback prompt)`
        : lineLabel
      : `Deterministic ${lineLabel.toLowerCase()} fallback${
          item.mode === "compact" && item.compactVariant === "experimental"
            ? " [diagnostic]"
            : ""
        }${item.fallbackReason ? ` (${item.fallbackReason})` : ""}`;
  }

  return item.source === "llm"
    ? item.usedFallbackPrompt
      ? "Current LLM settings (fallback prompt)"
      : "Current LLM settings"
    : `Deterministic local fallback${
        item.fallbackReason ? ` (${item.fallbackReason})` : ""
      }`;
}

function toMarkdown(
  dataset: ConversationExportDatasetItem[],
  mode: ConversationExportContentMode,
  compressionMap: Map<number, CompressedConversationExport>,
  compactVariant: ConversationExportCompactVariant = "experimental"
): string {
  const lines: string[] = [];

  lines.push("# VESTI Conversation Export");
  lines.push("");
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**Threads:** ${dataset.length}`);
  lines.push(`**Mode:** ${mode}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  dataset.forEach((item, index) => {
    const { conversation, messages } = item;
    lines.push(`## ${index + 1}. ${conversation.title || "Untitled"}`);
    lines.push("");
    lines.push(`- **Platform:** ${conversation.platform}`);
    lines.push(`- **URL:** ${conversation.url || "N/A"}`);
    lines.push(`- **Started At:** ${toLocalDateTime(getConversationOriginAt(conversation))}`);
    const sourceCreatedAt = getConversationSourceCreatedAt(conversation);
    if (sourceCreatedAt !== null) {
      lines.push(`- **Source Time:** ${toLocalDateTime(sourceCreatedAt)}`);
    }
    lines.push(
      `- **First Captured At:** ${toLocalDateTime(
        getConversationFirstCapturedAt(conversation)
      )}`
    );
    lines.push(
      `- **Last Captured At:** ${toLocalDateTime(
        getConversationCaptureFreshnessAt(conversation)
      )}`
    );
    lines.push(`- **Last Modified:** ${toLocalDateTime(conversation.updated_at)}`);
    lines.push(`- **Messages:** ${messages.length}`);

    if (mode !== "full") {
      const compression = compressionMap.get(conversation.id);
      if (compression) {
        lines.push(`- **Compression:** ${getCompressionLabel(compression)}`);
      }
    }

    lines.push("");

    if (mode === "full") {
      lines.push("### Conversation");
      lines.push("");
      messages.forEach((message) => {
        const role = message.role === "user" ? "User" : "Assistant";
        lines.push(`**${role}** (${toLocalDateTime(message.created_at)})`);
        lines.push("");
        lines.push(message.content_text);
        lines.push("");
      });
    } else {
      const compression = compressionMap.get(conversation.id);
      if (!compression) {
        throw new Error(`Missing compression payload for conversation ${conversation.id}`);
      }
      lines.push(
        mode === "compact"
          ? "### Distilled Handoff"
          : "### Summary Note"
      );
      lines.push("");
      lines.push(compression.body);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

function toText(
  dataset: ConversationExportDatasetItem[],
  mode: ConversationExportContentMode,
  compressionMap: Map<number, CompressedConversationExport>,
  compactVariant: ConversationExportCompactVariant = "experimental"
): string {
  const lines: string[] = [];

  lines.push("VESTI CONVERSATION EXPORT");
  lines.push("=".repeat(50));
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push(`Threads: ${dataset.length}`);
  lines.push(`Mode: ${mode}`);
  lines.push("");

  dataset.forEach((item, index) => {
    const { conversation, messages } = item;
    lines.push(`${index + 1}. ${conversation.title || "Untitled"}`);
    lines.push(`   Platform: ${conversation.platform}`);
    lines.push(`   Started At: ${toLocalDateTime(getConversationOriginAt(conversation))}`);
    const sourceCreatedAt = getConversationSourceCreatedAt(conversation);
    if (sourceCreatedAt !== null) {
      lines.push(`   Source Time: ${toLocalDateTime(sourceCreatedAt)}`);
    }
    lines.push(
      `   First Captured At: ${toLocalDateTime(
        getConversationFirstCapturedAt(conversation)
      )}`
    );
    lines.push(
      `   Last Captured At: ${toLocalDateTime(
        getConversationCaptureFreshnessAt(conversation)
      )}`
    );
    lines.push(`   Last Modified: ${toLocalDateTime(conversation.updated_at)}`);
    lines.push(`   URL: ${conversation.url || "N/A"}`);
    lines.push(`   Messages: ${messages.length}`);

    if (mode === "full") {
      lines.push("");
      messages.forEach((message) => {
        const role = message.role === "user" ? "USER" : "AI";
        lines.push(`${role} (${toLocalDateTime(message.created_at)}): ${message.content_text}`);
        lines.push("");
      });
    } else {
      const compression = compressionMap.get(conversation.id);
      if (!compression) {
        throw new Error(`Missing compression payload for conversation ${conversation.id}`);
      }
      lines.push(`   Compression: ${getCompressionLabel(compression)}`);
      lines.push("");
      lines.push(markdownToPlainText(compression.body));
      lines.push("");
    }

    lines.push("-".repeat(40));
    lines.push("");
  });

  return lines.join("\n");
}

function toJson(
  dataset: ConversationExportDatasetItem[],
  mode: ConversationExportContentMode,
  compressionMap: Map<number, CompressedConversationExport>,
  compactVariant: ConversationExportCompactVariant = "experimental"
): string {
  const conversations = dataset.map((item) => {
    const { conversation, messages } = item;
    const base = {
      id: conversation.id,
      title: conversation.title,
      platform: conversation.platform,
      url: conversation.url,
      source_created_at: getConversationSourceCreatedAt(conversation),
      origin_at: getConversationOriginAt(conversation),
      first_captured_at: getConversationFirstCapturedAt(conversation),
      last_captured_at: getConversationCaptureFreshnessAt(conversation),
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      snippet: conversation.snippet,
      message_count: messages.length,
    };

    if (mode === "full") {
      return {
        ...base,
        messages,
      };
    }

    const compression = compressionMap.get(conversation.id);
    if (!compression) {
      throw new Error(`Missing compression payload for conversation ${conversation.id}`);
    }

    return {
      ...base,
      compressed_content: compression.body,
      compression: {
        mode: compression.mode,
        compact_variant:
          compression.mode === "compact" ? compression.compactVariant || "current" : null,
        line_label:
          compression.mode === "compact"
            ? getCompactLineLabel(compression.compactVariant)
            : null,
        source: compression.source,
        route: compression.route || null,
        used_fallback_prompt: compression.usedFallbackPrompt,
        fallback_reason: compression.fallbackReason || null,
        review_ready: compression.reviewReady ?? null,
        diagnostics: {
          llm_attempt: {
            primary: compression.llmAttemptMetrics?.primary
              ? {
                  prompt_chars:
                    compression.llmAttemptMetrics.primary.promptChars,
                  truncated_prompt_chars:
                    compression.llmAttemptMetrics.primary.truncatedPromptChars,
                  raw_output_chars:
                    compression.llmAttemptMetrics.primary.rawOutputChars,
	                  normalized_output_chars:
	                    compression.llmAttemptMetrics.primary.normalizedOutputChars,
	                  finish_reason:
	                    compression.llmAttemptMetrics.primary.finishReason || null,
	                  usage: {
	                    prompt_tokens:
	                      compression.llmAttemptMetrics.primary.promptTokens ?? null,
	                    completion_tokens:
	                      compression.llmAttemptMetrics.primary.completionTokens ?? null,
	                    total_tokens:
	                      compression.llmAttemptMetrics.primary.totalTokens ?? null,
	                  },
	                  proxy_max_tokens: {
	                    requested:
	                      compression.llmAttemptMetrics.primary
	                        .requestedMaxTokens ?? null,
	                    effective:
	                      compression.llmAttemptMetrics.primary
	                        .effectiveMaxTokens ?? null,
	                    limit:
	                      compression.llmAttemptMetrics.primary
	                        .proxyMaxTokensLimit ?? null,
	                  },
	                  incomplete_output_risk:
	                    compression.llmAttemptMetrics.primary.incompleteOutputRisk ??
	                    false,
                  invalid_reason:
                    compression.llmAttemptMetrics.primary.invalidReason || null,
                  continuation: compression.llmAttemptMetrics.primary.continuation
                    ? {
                        raw_output_chars:
                          compression.llmAttemptMetrics.primary.continuation
                            .rawOutputChars,
	                        normalized_output_chars:
	                          compression.llmAttemptMetrics.primary.continuation
	                            .normalizedOutputChars,
	                        finish_reason:
	                          compression.llmAttemptMetrics.primary.continuation
	                            .finishReason || null,
	                        usage: {
	                          prompt_tokens:
	                            compression.llmAttemptMetrics.primary.continuation
	                              .promptTokens ?? null,
	                          completion_tokens:
	                            compression.llmAttemptMetrics.primary.continuation
	                              .completionTokens ?? null,
	                          total_tokens:
	                            compression.llmAttemptMetrics.primary.continuation
	                              .totalTokens ?? null,
	                        },
	                        proxy_max_tokens: {
	                          requested:
	                            compression.llmAttemptMetrics.primary.continuation
	                              .requestedMaxTokens ?? null,
	                          effective:
	                            compression.llmAttemptMetrics.primary.continuation
	                              .effectiveMaxTokens ?? null,
	                          limit:
	                            compression.llmAttemptMetrics.primary.continuation
	                              .proxyMaxTokensLimit ?? null,
	                        },
	                      }
	                    : null,
	                }
              : null,
            fallback_prompt: compression.llmAttemptMetrics?.fallbackPrompt
              ? {
                  prompt_chars:
                    compression.llmAttemptMetrics.fallbackPrompt.promptChars,
                  truncated_prompt_chars:
                    compression.llmAttemptMetrics.fallbackPrompt
                      .truncatedPromptChars,
                  raw_output_chars:
                    compression.llmAttemptMetrics.fallbackPrompt.rawOutputChars,
	                  normalized_output_chars:
	                    compression.llmAttemptMetrics.fallbackPrompt
	                      .normalizedOutputChars,
	                  finish_reason:
	                    compression.llmAttemptMetrics.fallbackPrompt.finishReason ||
	                    null,
	                  usage: {
	                    prompt_tokens:
	                      compression.llmAttemptMetrics.fallbackPrompt.promptTokens ??
	                      null,
	                    completion_tokens:
	                      compression.llmAttemptMetrics.fallbackPrompt
	                        .completionTokens ?? null,
	                    total_tokens:
	                      compression.llmAttemptMetrics.fallbackPrompt.totalTokens ??
	                      null,
	                  },
	                  proxy_max_tokens: {
	                    requested:
	                      compression.llmAttemptMetrics.fallbackPrompt
	                        .requestedMaxTokens ?? null,
	                    effective:
	                      compression.llmAttemptMetrics.fallbackPrompt
	                        .effectiveMaxTokens ?? null,
	                    limit:
	                      compression.llmAttemptMetrics.fallbackPrompt
	                        .proxyMaxTokensLimit ?? null,
	                  },
	                  incomplete_output_risk:
	                    compression.llmAttemptMetrics.fallbackPrompt
	                      .incompleteOutputRisk ?? false,
                  invalid_reason:
                    compression.llmAttemptMetrics.fallbackPrompt.invalidReason ||
                    null,
                  continuation: compression.llmAttemptMetrics.fallbackPrompt
                    .continuation
                    ? {
                        raw_output_chars:
                          compression.llmAttemptMetrics.fallbackPrompt
                            .continuation.rawOutputChars,
	                        normalized_output_chars:
	                          compression.llmAttemptMetrics.fallbackPrompt
	                            .continuation.normalizedOutputChars,
	                        finish_reason:
	                          compression.llmAttemptMetrics.fallbackPrompt
	                            .continuation.finishReason || null,
	                        usage: {
	                          prompt_tokens:
	                            compression.llmAttemptMetrics.fallbackPrompt
	                              .continuation.promptTokens ?? null,
	                          completion_tokens:
	                            compression.llmAttemptMetrics.fallbackPrompt
	                              .continuation.completionTokens ?? null,
	                          total_tokens:
	                            compression.llmAttemptMetrics.fallbackPrompt
	                              .continuation.totalTokens ?? null,
	                        },
	                        proxy_max_tokens: {
	                          requested:
	                            compression.llmAttemptMetrics.fallbackPrompt
	                              .continuation.requestedMaxTokens ?? null,
	                          effective:
	                            compression.llmAttemptMetrics.fallbackPrompt
	                              .continuation.effectiveMaxTokens ?? null,
	                          limit:
	                            compression.llmAttemptMetrics.fallbackPrompt
	                              .continuation.proxyMaxTokensLimit ?? null,
	                        },
	                      }
	                    : null,
	                }
              : null,
          },
          delivered_artifact: {
            raw_output_chars:
              compression.deliveredArtifactMetrics?.rawOutputChars ?? null,
            normalized_output_chars:
              compression.deliveredArtifactMetrics?.normalizedOutputChars ?? null,
            serialized_output_chars:
              compression.deliveredArtifactMetrics?.serializedOutputChars ?? null,
            transcript_chars:
              compression.deliveredArtifactMetrics?.transcriptChars ?? null,
            absolute_min_chars:
              compression.deliveredArtifactMetrics?.absoluteMinChars ?? null,
            soft_min_chars:
              compression.deliveredArtifactMetrics?.softMinChars ?? null,
          },
          integrity_warnings: compression.integrityWarnings || [],
          soft_compression_warning: compression.softCompressionWarning || null,
        },
      },
    };
  });

  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      count: dataset.length,
      content_mode: mode,
      compact_variant: mode === "compact" ? compactVariant : null,
      conversations,
    },
    null,
    2
  );
}

function serializeExport(
  dataset: ConversationExportDatasetItem[],
  config: ConversationExportConfig,
  compressionMap: Map<number, CompressedConversationExport>
): string {
  switch (config.format) {
    case "md":
      return toMarkdown(
        dataset,
        config.contentMode,
        compressionMap,
        config.compactVariant
      );
    case "txt":
      return toText(dataset, config.contentMode, compressionMap, config.compactVariant);
    case "json":
      return toJson(dataset, config.contentMode, compressionMap, config.compactVariant);
    default:
      throw new Error(`Unsupported format: ${config.format}`);
  }
}

export async function exportConversations(
  conversations: Conversation[],
  config: ConversationExportConfig
): Promise<ConversationExportResult> {
  const dataset = await buildExportDataset(conversations);
  let compressionMap = new Map<number, CompressedConversationExport>();
  let notice: ConversationExportResult["notice"];

  if (config.contentMode !== "full") {
    const compressed = await compressExportDataset(
      dataset,
      config.contentMode as ExportCompressionMode,
      {
        compactVariant: config.compactVariant,
      }
    );
    compressionMap = toCompressionMap(compressed.items);
    notice = compressed.notice;
  }

  const content = serializeExport(dataset, config, compressionMap);
  return {
    content,
    filename: generateFilename(
      conversations.length,
      config.format,
      config.contentMode,
      config.compactVariant
    ),
    mime: resolveExportMime(config.format),
    notice,
  };
}

export function downloadConversationExport(
  result: ConversationExportResult
): void {
  const blob = new Blob([result.content], { type: result.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyConversationExport(
  result: ConversationExportResult
): Promise<void> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.clipboard?.writeText !== "function"
  ) {
    throw new Error("Clipboard copy is unavailable in this context.");
  }

  await navigator.clipboard.writeText(result.content);
}
