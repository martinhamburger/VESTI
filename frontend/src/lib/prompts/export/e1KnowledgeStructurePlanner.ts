import type {
  ExportPlannerPromptPayload,
  PromptVersion,
} from "../types";
import {
  formatExportDateTime,
  toExportTranscript,
} from "./shared";

const E1_KNOWLEDGE_SYSTEM = `You are Vesti's E1 structure planner for knowledge export.

Your job is to read one export dataset and produce structured planning notes that tell E2 what is most valuable for future human recall.

This is not the final summary markdown.
Do not write prose sections such as ## TL;DR or ## Important Moves.

Output one JSON object only with these exact top-level keys:
- schemaVersion
- mode
- datasetId
- focusSummary
- inclusionRules
- exclusionRules
- riskFlags
- coreQuestion
- progressionDensity
- artifactDensity
- actionabilityDensity
- knowledgeValue

Allowed density values are only:
- "low"
- "medium"
- "high"

Hard rules:
1) Use only grounded evidence from the supplied dataset.
2) Optimize for future recall by a reader who was not part of the thread.
3) Prefer moves, insights, reusable patterns, and next actions that can stand on their own later.
4) Treat medium/high signals as stronger inclusion hints. Treat low-confidence signals only as prompts to verify against the transcript, not as facts by themselves.
5) Do not turn this into final markdown headings or a narrative summary.
6) If evidence is sparse, keep the JSON shape and use conservative values instead of inventing details.
7) Output valid JSON only.`;

function formatSignalLines(
  payload: ExportPlannerPromptPayload
): string {
  const conversationLines = (payload.conversationSignals ?? []).map(
    (signal) =>
      `- ${signal.label}${signal.confidence ? ` [${signal.confidence}]` : ""}${
        signal.note ? `: ${signal.note}` : ""
      }`
  );
  const messageLines = (payload.messageSignals ?? []).map(
    (signal) =>
      `- ${signal.label}${signal.targetId ? ` @${signal.targetId}` : ""}${
        signal.confidence ? ` [${signal.confidence}]` : ""
      }${signal.note ? `: ${signal.note}` : ""}`
  );

  const conversationBlock =
    conversationLines.length > 0
      ? conversationLines.join("\n")
      : "- (none)";
  const messageBlock =
    messageLines.length > 0
      ? messageLines.join("\n")
      : "- (none)";

  return `Conversation-level signals:
${conversationBlock}

Message-level signals:
${messageBlock}`;
}

function buildE1KnowledgePrompt(
  payload: ExportPlannerPromptPayload
): string {
  return `Produce planning notes for knowledge extraction.

Dataset metadata:
- datasetId: ${payload.datasetId}
- Title: ${payload.conversationTitle || "(untitled)"}
- Platform: ${payload.conversationPlatform || "unknown"}
- StartedAt: ${
    payload.conversationOriginAt
      ? formatExportDateTime(payload.conversationOriginAt)
      : "unknown"
  }
- Locale: ${payload.locale || "zh"}
- MessageCount: ${payload.messages.length}

Upstream signals:
${formatSignalLines(payload)}

Transcript:
${toExportTranscript(payload.messages)}

Planning requirements:
1) focusSummary should explain, in 1-2 sentences, what a future reader most needs to recover later.
2) coreQuestion should identify the single question or problem that best frames the thread.
3) inclusionRules should favor moves, reusable patterns, grounded insights, and next-step cues that retain value outside the original transcript.
4) exclusionRules should name chatter or detail that can be dropped unless it changes later understanding.
5) riskFlags should call out missing context, weak grounding, or places where recall value is still uncertain.
6) knowledgeValue should be 3-5 compact bullets naming the patterns, insights, or reusable anchors E2 should preserve.
7) Use medium/high signals to prioritize inclusion; use low-confidence signals only when the transcript itself supports them.
8) Set progressionDensity and actionabilityDensity based on the actual thread, not on desired output size.
9) Output valid JSON only.`;
}

function buildE1KnowledgeFallbackPrompt(
  payload: ExportPlannerPromptPayload
): string {
  return `Return a conservative JSON planning object for knowledge extraction.

Use the exact keys required by the system prompt.
If evidence is sparse:
- keep schemaVersion as "v1"
- keep mode as "knowledge"
- keep datasetId as "${payload.datasetId}"
- use conservative density values
- keep arrays non-empty only when grounded evidence exists

Transcript:
${toExportTranscript(payload.messages)}`;
}

export const DRAFT_EXPORT_E1_KNOWLEDGE_STRUCTURE_PLANNER_PROMPT: PromptVersion<ExportPlannerPromptPayload> = {
  version: "v0.1.0-export-e1-knowledge-draft",
  createdAt: "2026-03-18",
  description:
    "Dormant E1 knowledge planner prompt draft for extraction-first decomposition review. Not wired into runtime.",
  system: E1_KNOWLEDGE_SYSTEM,
  fallbackSystem: "You are a conservative JSON planner. Output one JSON object only.",
  userTemplate: buildE1KnowledgePrompt,
  fallbackTemplate: buildE1KnowledgeFallbackPrompt,
};
