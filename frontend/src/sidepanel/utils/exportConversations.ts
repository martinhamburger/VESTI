import type { Conversation, Message } from "~lib/types";
import type { ExportConfig, ExportResult } from "../components/ExportDialog";
import { getMessages } from "~lib/services/storageService";

function toLocalDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function exportConversations(
  conversations: Conversation[],
  config: ExportConfig
): Promise<ExportResult> {
  const { contentMode, format } = config;

  // Fetch messages for all conversations
  const messagesMap = new Map<number, Message[]>();
  await Promise.all(
    conversations.map(async (conv) => {
      const messages = await getMessages(conv.id);
      messagesMap.set(conv.id, messages);
    })
  );

  let content: string;

  switch (format) {
    case "md":
      content = toMarkdown(conversations, messagesMap, contentMode);
      break;
    case "txt":
      content = toText(conversations, messagesMap, contentMode);
      break;
    case "json":
      content = toJSON(conversations, messagesMap, contentMode);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  return {
    content,
    filename: generateFilename(conversations.length, format, contentMode),
  };
}

function toMarkdown(
  conversations: Conversation[],
  messagesMap: Map<number, Message[]>,
  mode: string
): string {
  const lines: string[] = [];

  lines.push("# VESTI Conversation Export");
  lines.push("");
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**Threads:** ${conversations.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  conversations.forEach((conv, idx) => {
    const messages = messagesMap.get(conv.id) || [];

    lines.push(`## ${idx + 1}. ${conv.title || "Untitled"}`);
    lines.push("");
    lines.push(`- **Platform:** ${conv.platform}`);
    lines.push(`- **URL:** ${conv.url || "N/A"}`);
    lines.push(`- **Date:** ${toLocalDateTime(conv.source_created_at || conv.created_at)}`);
    lines.push(`- **Messages:** ${messages.length}`);
    lines.push("");

    if (mode === "summary") {
      lines.push(conv.snippet || "*No summary available*");
      lines.push("");
    } else if (mode === "compact") {
      // Compact: show key questions and final answer
      const userMsgs = messages.filter((m) => m.role === "user").slice(0, 3);
      const assistantMsgs = messages.filter((m) => m.role === "assistant");

      if (userMsgs.length > 0) {
        lines.push("### Key Questions");
        userMsgs.forEach((m) => {
          const preview = m.content_text.slice(0, 150);
          lines.push(`- ${preview}${m.content_text.length > 150 ? "..." : ""}`);
        });
        lines.push("");
      }

      if (assistantMsgs.length > 0) {
        lines.push("### Summary Response");
        const lastResponse = assistantMsgs[assistantMsgs.length - 1];
        lines.push(lastResponse.content_text.slice(0, 800));
        lines.push("");
      }
    } else {
      // Full mode
      lines.push("### Conversation");
      lines.push("");
      messages.forEach((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        lines.push(`**${role}** (${toLocalDateTime(msg.created_at)})`);
        lines.push("");
        lines.push(msg.content_text);
        lines.push("");
      });
    }

    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

function toText(
  conversations: Conversation[],
  messagesMap: Map<number, Message[]>,
  mode: string
): string {
  const lines: string[] = [];

  lines.push("VESTI CONVERSATION EXPORT");
  lines.push("=".repeat(50));
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push(`Threads: ${conversations.length}`);
  lines.push("");

  conversations.forEach((conv, idx) => {
    const messages = messagesMap.get(conv.id) || [];

    lines.push(`${idx + 1}. ${conv.title || "Untitled"}`);
    lines.push(`   Platform: ${conv.platform}`);
    lines.push(`   URL: ${conv.url || "N/A"}`);
    lines.push("");

    if (mode === "full") {
      messages.forEach((msg) => {
        const role = msg.role === "user" ? "USER" : "AI";
        lines.push(`${role}: ${msg.content_text}`);
        lines.push("");
      });
    } else {
      lines.push(conv.snippet || "No content");
      lines.push("");
    }

    lines.push("-".repeat(40));
    lines.push("");
  });

  return lines.join("\n");
}

function toJSON(
  conversations: Conversation[],
  messagesMap: Map<number, Message[]>,
  mode: string
): string {
  const data = conversations.map((conv) => {
    const messages = messagesMap.get(conv.id) || [];
    return {
      id: conv.id,
      title: conv.title,
      platform: conv.platform,
      url: conv.url,
      created_at: conv.source_created_at || conv.created_at,
      updated_at: conv.updated_at,
      snippet: conv.snippet,
      messages:
        mode === "full"
          ? messages
          : mode === "compact"
            ? messages.slice(-2) // Last 2 messages
            : [], // Summary: no messages
    };
  });

  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      count: conversations.length,
      content_mode: mode,
      conversations: data,
    },
    null,
    2
  );
}

function generateFilename(count: number, format: string, mode: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const modeSuffix = mode === "full" ? "" : `-${mode}`;
  return `vesti-${count}threads${modeSuffix}-${date}.${format}`;
}
