import type {
  HandoffEvidenceCompactorPromptPayload,
  PromptVersion,
} from "../types";

const E2_HANDOFF_SYSTEM = `You are Vesti's E2 evidence compactor for AI handoff.

Your job is to convert one export dataset plus structured planning notes into a structured evidence skeleton for continuation.

This is not the final handoff markdown.
Do not output markdown headings.

Output one JSON object only with these exact top-level keys:
- schemaVersion
- mode
- background
- keyQuestions
- decisionsAndAnswers
- reusableArtifacts
- unresolved

Hard rules:
1) Use only grounded evidence from the supplied dataset and planning notes.
2) Treat planning notes as a selection prior, not as a substitute for grounded evidence.
3) Preserve decision rationale whenever the transcript supports it.
4) Preserve concrete artifacts with sourceMessageIds whenever they matter for continuation.
5) If a low-confidence signal is not confirmed by the transcript, do not promote it as fact.
6) Do not produce the final markdown handoff.
7) Output valid JSON only.`;

function buildE2HandoffPrompt(
  payload: HandoffEvidenceCompactorPromptPayload
): string {
  return `Produce a handoff evidence skeleton.

Dataset:
${JSON.stringify(payload.dataset, null, 2)}

Planning notes:
${JSON.stringify(payload.planningNotes, null, 2)}

Compaction requirements:
1) background should keep the task frame, critical constraints, and current state the next agent must know.
2) keyQuestions should keep only the questions that truly drove the work forward.
3) decisionsAndAnswers should preserve decision, chosen path, and rationale when grounded.
4) reusableArtifacts should preserve concrete files, commands, APIs, code, or references that support continuation.
5) unresolved should preserve remaining work, risk, or next continuation points.
6) Keep arrays concise, but do not drop evidence just to make the object shorter.
7) Output valid JSON only.`;
}

function buildE2HandoffFallbackPrompt(
  payload: HandoffEvidenceCompactorPromptPayload
): string {
  return `Return a conservative handoff evidence skeleton as valid JSON.

Use the exact top-level keys required by the system prompt.
If evidence is sparse:
- keep schemaVersion as "v1"
- keep mode as "handoff"
- prefer empty arrays over invented content
- preserve grounded artifacts and unresolved items whenever they appear

Dataset:
${JSON.stringify(payload.dataset, null, 2)}

Planning notes:
${JSON.stringify(payload.planningNotes, null, 2)}`;
}

export const DRAFT_EXPORT_E2_HANDOFF_EVIDENCE_COMPACTOR_PROMPT: PromptVersion<HandoffEvidenceCompactorPromptPayload> = {
  version: "v0.1.0-export-e2-handoff-draft",
  createdAt: "2026-03-18",
  description:
    "Offline-only E2 handoff evidence compactor draft for distillation prototype work. Not wired into runtime.",
  system: E2_HANDOFF_SYSTEM,
  fallbackSystem: "You are a conservative JSON evidence compactor. Output one JSON object only.",
  userTemplate: buildE2HandoffPrompt,
  fallbackTemplate: buildE2HandoffFallbackPrompt,
};
