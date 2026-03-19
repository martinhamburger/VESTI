import type { Message } from "../types";
import type {
  ExportCompressionPromptPayload,
  PromptVersion,
} from "./types";

const EXPORT_SUMMARY_SYSTEM = `You are Vesti's export summary assistant.

Your job is to compress one conversation into a note-ready markdown summary for future human recall.

Output must contain these exact headings:
## TL;DR
## Problem Frame
## Important Moves
## Reusable Snippets
## Next Steps
## Tags

Hard rules:
1) Use only evidence present in the provided transcript.
2) Prefer concrete phrasing over vague praise or filler.
3) Keep the summary readable by a human returning later with limited context.
4) Align the content structure with Vesti's conversation_summary.v2 mindset: core question, key moves, reusable insights, unresolved work, and next actions.
5) If evidence is missing, state that conservatively instead of inventing details.
6) Respect the requested locale.
7) Output markdown only. Do not wrap the whole answer in code fences.
8) Reusable snippets may include commands, files, APIs, or code only when grounded in the transcript.`;

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

function buildStrategyGuidanceBlock(
  payload: ExportCompressionPromptPayload
): string {
  const strategy = payload.strategyGuidance;
  if (!strategy) {
    return "- Strategy: general\n- RequiredSignals: questions, decisions, artifacts";
  }

  const weights = strategy.routeWeights
    .slice(0, 3)
    .map((entry) => `${entry.shape}:${entry.weight.toFixed(2)}`)
    .join(", ");

  return [
    `- Strategy: ${strategy.dialogueShape}`,
    `- StrategyConfidence: ${strategy.confidence.toFixed(2)}`,
    `- RouteWeights(top): ${weights || "general:1.00"}`,
    `- Priorities: ${strategy.priorities.join(", ") || "retain_questions, retain_decisions, retain_artifacts"}`,
    `- RequiredSignals: ${strategy.requiredSignals.join(", ") || "questions, decisions, artifacts"}`,
  ].join("\n");
}

function buildSummaryPrompt(payload: ExportCompressionPromptPayload): string {
  const isStepProfile = payload.profile === "step_flash_concise";
  const profileInstruction = isStepProfile
    ? "Favor structural coverage and concise grounded bullets over essay-like phrasing."
    : "Favor richer problem framing and clearer reconstruction of the thread's actual progression.";

  return `Create a note-ready export summary for this conversation.

Metadata:
- Title: ${payload.conversationTitle || "(untitled)"}
- Platform: ${payload.conversationPlatform || "unknown"}
- StartedAt: ${
    payload.conversationOriginAt
      ? formatDateTime(payload.conversationOriginAt)
      : "unknown"
  }
- Locale: ${payload.locale || "zh"}
- MessageCount: ${payload.messages.length}

Transcript:
${toTranscript(payload.messages)}

Routing-first strategy guidance:
${buildStrategyGuidanceBlock(payload)}

Output requirements:
1) Use the exact headings listed in the system prompt.
2) Keep this optimized for future recall: crisp TL;DR, problem framing, key moves, reusable snippets, next steps, and tags.
3) Let ## Problem Frame align with the core question and constraints that shaped the thread.
4) Let ## Important Moves reflect the actual progression of the discussion, similar to a lightweight thinking_journey.
5) Let ## Next Steps reflect grounded actionable follow-ups, not generic advice.
6) Let ## Tags stay concrete and limited to 3-5 useful tags when evidence exists.
7) ${profileInstruction}
8) Keep bullets concise and grounded.
9) If evidence is sparse, keep the structure and use conservative placeholders.
10) Write the final output in ${payload.locale === "en" ? "natural English" : "natural Chinese"}.
11) Route evidence selection by strategy guidance first, then render into the fixed heading shell.
12) Output markdown only.`;
}

function buildSummaryFallbackPrompt(
  payload: ExportCompressionPromptPayload
): string {
  const fallbackGuidance =
    payload.profile === "step_flash_concise"
      ? "Prefer compact bullets that preserve the thread's concrete actions and artifacts."
      : "Prefer stronger problem framing and more explicit important moves when evidence exists.";

  return `Write a markdown export summary for this conversation.

You must use these exact headings:
## TL;DR
## Problem Frame
## Important Moves
## Reusable Snippets
## Next Steps
## Tags

Requirements:
1) Keep the structure aligned with a v2-style thinking summary, but do not output JSON.
2) Use grounded evidence only.
3) Preserve commands, files, APIs, and code references when they exist.
4) Even if the transcript is sparse, keep all headings and fill them conservatively.
5) ${fallbackGuidance}
6) Use ${payload.locale === "en" ? "English" : "Chinese"}.
7) Output markdown only.

Transcript:
${toTranscript(payload.messages)}

Routing-first strategy guidance:
${buildStrategyGuidanceBlock(payload)}`;
}

export const CURRENT_EXPORT_SUMMARY_PROMPT: PromptVersion<ExportCompressionPromptPayload> = {
  version: "v1.2.1-export-summary-kimi-step-profiled",
  createdAt: "2026-03-19",
  description:
    "Summary export prompt for human-readable notes with Kimi-rich and Step-concise profiles.",
  system: EXPORT_SUMMARY_SYSTEM,
  fallbackSystem: "You are a concise technical export assistant. Output markdown only.",
  userTemplate: buildSummaryPrompt,
  fallbackTemplate: buildSummaryFallbackPrompt,
};

export const EXPERIMENTAL_EXPORT_SUMMARY_PROMPT: PromptVersion<ExportCompressionPromptPayload> = {
  version: "v1.2.1-export-summary-kimi-step-profiled-exp",
  createdAt: "2026-03-19",
  description: "Experimental profiled summary export variant.",
  system: EXPORT_SUMMARY_SYSTEM,
  fallbackSystem: "You are a concise technical export assistant. Output markdown only.",
  userTemplate: buildSummaryPrompt,
  fallbackTemplate: buildSummaryFallbackPrompt,
};
