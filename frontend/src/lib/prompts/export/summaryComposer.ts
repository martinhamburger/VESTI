import type {
  ExportCompressionPromptPayload,
  PromptVersion,
} from "../types";
import {
  formatExportDateTime,
  toExportTranscript,
} from "./shared";

const EXPORT_SUMMARY_SYSTEM = `You are Vesti's export summary assistant.

Your first priority is future human recall: produce a note-ready markdown summary that helps a later reader who did not join the thread quickly recover what changed, why it mattered, and what can be reused.

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

const SUMMARY_MOVES_EXEMPLAR = `Example section anchor (illustrative shape only, not literal content):
## Important Moves
- Move: Tighten export validation so all required headings must appear.
  Why it mattered: This turned vague fallback behavior into debuggable contract failures.`;

const SUMMARY_SNIPPET_EXEMPLAR = `## Reusable Snippets
- Pattern: Keep fallback stricter on contract compliance than the main composer.
  Reuse: Useful when a model misses headings or produces low-density sections; reduce ambition without changing the schema.`;

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
      ? formatExportDateTime(payload.conversationOriginAt)
      : "unknown"
  }
- Locale: ${payload.locale || "zh"}
- MessageCount: ${payload.messages.length}

Transcript:
${toExportTranscript(payload.messages)}

Output requirements:
1) Use the exact headings listed in the system prompt.
2) Keep this optimized for future recall: crisp TL;DR, problem framing, key moves, reusable snippets, next steps, and tags.
3) Let ## Problem Frame align with the core question and constraints that shaped the thread.
4) In ## Important Moves, keep only the moves that materially changed understanding, decisions, or next actions, and explain why each one mattered for future recall.
5) Let ## Next Steps reflect grounded actionable follow-ups, not generic advice.
6) Let ## Reusable Snippets prefer grounded patterns or insights that can stand on their own for a future reader; include file, command, or API references when they are the most reusable grounded unit.
7) Let ## Tags stay concrete and limited to 3-5 useful tags when evidence exists.
8) ${profileInstruction}
9) Keep bullets concise and grounded.
10) If evidence is sparse, keep the structure and use conservative placeholders.
11) Write the final output in ${payload.locale === "en" ? "natural English" : "natural Chinese"}.
12) Output markdown only.

Section anchors:
- Progression matters here only when it helps a future human reconstruct the thread, not as a mechanical timeline dump.
- Use this shape for important moves:
${SUMMARY_MOVES_EXEMPLAR}
- Use this shape for reusable snippets:
${SUMMARY_SNIPPET_EXEMPLAR}`;
}

function buildSummaryFallbackPrompt(
  payload: ExportCompressionPromptPayload
): string {
  const fallbackGuidance =
    payload.profile === "step_flash_concise"
      ? "Prefer compact, contract-safe bullets that preserve concrete actions and artifacts."
      : "Prefer a conservative, contract-safe note that keeps problem framing and important moves explicit when evidence exists.";

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
5) Favor compliance and stability over elegance or compression.
6) In ## Important Moves, prefer move + why-it-mattered structure when possible.
7) In ## Reusable Snippets, keep only grounded references that a future reader can reuse.
8) ${fallbackGuidance}
9) Use ${payload.locale === "en" ? "English" : "Chinese"}.
10) Output markdown only.

Safe anchors:
## TL;DR
- Core takeaway: <grounded conclusion or conservative placeholder>
- Scope/Boundary: <grounded current applicability or limitation>

## Problem Frame
- Core question: <grounded problem statement>
- Constraint: <grounded key constraint or conservative placeholder>

## Important Moves
- Move: <grounded step>
  Why it mattered: <brief grounded impact>

## Reusable Snippets
- Reference: <grounded file, command, api, or pattern>
  Reuse: <brief reuse note or conservative placeholder>

Transcript:
${toExportTranscript(payload.messages)}`;
}

export const CURRENT_EXPORT_SUMMARY_PROMPT: PromptVersion<ExportCompressionPromptPayload> = {
  version: "v1.2.2-export-summary-recall-pattern-anchored",
  createdAt: "2026-03-18",
  description:
    "Summary export prompt for human-readable notes with stronger recall framing, pattern-oriented snippet anchors, and contract-safe fallback behavior.",
  system: EXPORT_SUMMARY_SYSTEM,
  fallbackSystem: "You are a concise technical export assistant. Output markdown only.",
  userTemplate: buildSummaryPrompt,
  fallbackTemplate: buildSummaryFallbackPrompt,
};

export const EXPERIMENTAL_EXPORT_SUMMARY_PROMPT: PromptVersion<ExportCompressionPromptPayload> = {
  version: "v1.2.2-export-summary-recall-pattern-anchored-exp",
  createdAt: "2026-03-18",
  description: "Experimental summary export variant aligned with the current recall- and pattern-anchored prompt.",
  system: EXPORT_SUMMARY_SYSTEM,
  fallbackSystem: "You are a concise technical export assistant. Output markdown only.",
  userTemplate: buildSummaryPrompt,
  fallbackTemplate: buildSummaryFallbackPrompt,
};
