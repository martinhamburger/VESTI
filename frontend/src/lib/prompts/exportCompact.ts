import type { Message } from "../types";
import type {
  ExportCompressionPromptPayload,
  PromptVersion,
} from "./types";

const EXPORT_COMPACT_SYSTEM = `You are Vesti's export compaction assistant.

Your job is to compress one conversation into a high-fidelity markdown handoff for another AI or engineer who must continue the work with minimal context loss.

Output must contain these exact headings:
## Background
## Key Questions
## Decisions And Answers
## Reusable Artifacts
## Unresolved

Hard rules:
1) Use only evidence present in the provided transcript.
2) Prioritize transfer fidelity over aggressive shortening. Do not drop grounded decisions, commands, files, APIs, or next-step context just to be shorter.
3) Preserve concrete details such as filenames, function names, shell commands, URLs, APIs, and code blocks when grounded.
4) Keep chronological logic intact: if a later decision depends on earlier context, make that dependency explicit.
5) If a section has no grounded evidence, write a conservative placeholder instead of inventing details.
6) Respect the requested locale.
7) Output markdown only. Do not wrap the whole answer in code fences.
8) If the transcript contains reusable code or command snippets, preserve them in markdown-friendly form rather than paraphrasing them away.`;

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toTranscript(messages: Message[]): string {
  if (!messages.length) {
    return "[No messages available]";
  }

  return messages
    .map((message, index) => {
      const role = message.role === "user" ? "User" : "AI";
      return `${index + 1}. [${formatTime(message.created_at)}] [${role}] ${message.content_text}`;
    })
    .join("\n");
}

function buildCompactPrompt(payload: ExportCompressionPromptPayload): string {
  return `Create a high-fidelity export handoff for this conversation.

Metadata:
- Title: ${payload.conversationTitle || "(untitled)"}
- Platform: ${payload.conversationPlatform || "unknown"}
- CreatedAt: ${
    payload.conversationCreatedAt
      ? formatDateTime(payload.conversationCreatedAt)
      : "unknown"
  }
- Locale: ${payload.locale || "zh"}
- MessageCount: ${payload.messages.length}

Transcript:
${toTranscript(payload.messages)}

Output requirements:
1) Use the exact headings listed in the system prompt.
2) Optimize for AI handoff, not for skimming: preserve background, key asks, decisions, constraints, artifacts, and unresolved work.
3) In ## Background, include the task frame, constraints, and any context another assistant would need before acting.
4) In ## Key Questions, keep only the questions that actually drove the work forward.
5) In ## Decisions And Answers, capture grounded resolutions, tradeoffs, and chosen implementation paths.
6) In ## Reusable Artifacts, preserve filenames, commands, APIs, functions, and code blocks when grounded.
7) In ## Unresolved, call out what remains open, risky, or needs continuation.
8) If evidence is sparse, keep the structure and use conservative placeholders.
9) Write the final output in ${payload.locale === "en" ? "natural English" : "natural Chinese"}.
10) Output markdown only.`;
}

function buildCompactFallbackPrompt(
  payload: ExportCompressionPromptPayload
): string {
  return `Write a shorter fallback markdown handoff for this conversation.
You must keep these exact headings:
## Background
## Key Questions
## Decisions And Answers
## Reusable Artifacts
## Unresolved

Keep it shorter and more conservative than the main prompt, but still preserve grounded files, commands, APIs, code, and unresolved work when present.
Use ${payload.locale === "en" ? "English" : "Chinese"}.
Output markdown only.

Transcript:
${toTranscript(payload.messages)}`;
}

export const CURRENT_EXPORT_COMPACT_PROMPT: PromptVersion<ExportCompressionPromptPayload> = {
  version: "v1.1.0-export-compact-handoff",
  createdAt: "2026-03-16",
  description:
    "High-fidelity compact export handoff prompt for AI-to-AI or engineer-to-engineer transfer.",
  system: EXPORT_COMPACT_SYSTEM,
  fallbackSystem: "You are a cautious technical export assistant. Output markdown only.",
  userTemplate: buildCompactPrompt,
  fallbackTemplate: buildCompactFallbackPrompt,
};

export const EXPERIMENTAL_EXPORT_COMPACT_PROMPT: PromptVersion<ExportCompressionPromptPayload> = {
  version: "v1.1.0-export-compact-handoff-exp",
  createdAt: "2026-03-16",
  description: "Experimental high-fidelity compact export handoff variant.",
  system: EXPORT_COMPACT_SYSTEM,
  fallbackSystem: "You are a cautious technical export assistant. Output markdown only.",
  userTemplate: buildCompactPrompt,
  fallbackTemplate: buildCompactFallbackPrompt,
};
