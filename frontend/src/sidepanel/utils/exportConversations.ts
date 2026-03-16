import { getMessages } from "~lib/services/storageService";
import type { Conversation, Message } from "~lib/types";
import type {
  ConversationExportConfig,
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
  mode: ConversationExportContentMode
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

function getCompressionLabel(item: CompressedConversationExport): string {
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
  compressionMap: Map<number, CompressedConversationExport>
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
    lines.push(
      `- **Date:** ${toLocalDateTime(
        conversation.source_created_at || conversation.created_at
      )}`
    );
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
      lines.push(mode === "compact" ? "### Compact Handoff" : "### Summary Note");
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
  compressionMap: Map<number, CompressedConversationExport>
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
    lines.push(
      `   Date: ${toLocalDateTime(
        conversation.source_created_at || conversation.created_at
      )}`
    );
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
  compressionMap: Map<number, CompressedConversationExport>
): string {
  const conversations = dataset.map((item) => {
    const { conversation, messages } = item;
    const base = {
      id: conversation.id,
      title: conversation.title,
      platform: conversation.platform,
      url: conversation.url,
      created_at: conversation.source_created_at || conversation.created_at,
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
        source: compression.source,
        route: compression.route || null,
        used_fallback_prompt: compression.usedFallbackPrompt,
        fallback_reason: compression.fallbackReason || null,
      },
    };
  });

  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      count: dataset.length,
      content_mode: mode,
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
      return toMarkdown(dataset, config.contentMode, compressionMap);
    case "txt":
      return toText(dataset, config.contentMode, compressionMap);
    case "json":
      return toJson(dataset, config.contentMode, compressionMap);
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
      config.contentMode as ExportCompressionMode
    );
    compressionMap = toCompressionMap(compressed.items);
    notice = compressed.notice;
  }

  const content = serializeExport(dataset, config, compressionMap);
  return {
    content,
    filename: generateFilename(conversations.length, config.format, config.contentMode),
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
