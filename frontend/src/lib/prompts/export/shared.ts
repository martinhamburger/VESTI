import type { Message } from "../../types";

export function formatExportDateTime(value: number): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatExportTime(value: number): string {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toExportTranscript(
  messages: Message[],
  transcriptOverride?: string
): string {
  if (transcriptOverride?.trim()) {
    return transcriptOverride.trim();
  }

  if (!messages.length) {
    return "[No messages available]";
  }

  return messages
    .map((message, index) => {
      const role = message.role === "user" ? "User" : "AI";
      return `${index + 1}. [${formatExportTime(message.created_at)}] [${role}] ${message.content_text}`;
    })
    .join("\n");
}
