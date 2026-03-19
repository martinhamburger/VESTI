import type {
  CompactComposerInput,
  PromptVersion,
} from "../types";

const E3_HANDOFF_FROM_EVIDENCE_SYSTEM = `You are Vesti's E3 handoff composer.

Your job is to compose the final compact markdown handoff from a structured evidence skeleton.

Output must contain these exact headings:
## Background
## Key Questions
## Decisions And Answers
## Reusable Artifacts
## Unresolved

Hard rules:
1) Compose only from the provided evidence object.
2) Do not recover new facts from memory or invent missing transcript context.
3) If a section has little or no evidence, keep the heading and use a conservative placeholder.
4) Preserve decision rationale and grounded artifacts when present in the evidence.
5) Output markdown only.`;

function buildE3HandoffFromEvidencePrompt(
  payload: CompactComposerInput
): string {
  return `Compose the final compact handoff markdown from this evidence object.

Locale:
${payload.locale}

Profile:
${payload.profile}

Evidence:
${JSON.stringify(payload.evidence, null, 2)}

Composition requirements:
1) Use the exact headings from the system prompt.
2) Treat chronology only as a way to preserve decision causality and execution state.
3) Let ## Decisions And Answers keep decision, answer, and rationale together when evidence exists.
4) Let ## Reusable Artifacts preserve concrete files, commands, APIs, code, or references in a continuation-friendly format.
5) Let ## Unresolved preserve what still needs action, follow-up, or verification.
6) Output markdown only.`;
}

function buildE3HandoffFromEvidenceFallbackPrompt(
  payload: CompactComposerInput
): string {
  return `Write a conservative compact handoff from the provided evidence object.

You must use these exact headings:
## Background
## Key Questions
## Decisions And Answers
## Reusable Artifacts
## Unresolved

If evidence is sparse, keep the headings and use conservative placeholders.

Evidence:
${JSON.stringify(payload.evidence, null, 2)}`;
}

export const DRAFT_EXPORT_E3_HANDOFF_COMPOSER_FROM_EVIDENCE_PROMPT: PromptVersion<CompactComposerInput> = {
  version: "v0.1.0-export-e3-handoff-from-evidence-draft",
  createdAt: "2026-03-18",
  description:
    "Offline-only E3 handoff composer that consumes evidence skeletons instead of raw transcripts. Not wired into runtime.",
  system: E3_HANDOFF_FROM_EVIDENCE_SYSTEM,
  fallbackSystem: "You are a conservative markdown handoff composer. Output markdown only.",
  userTemplate: buildE3HandoffFromEvidencePrompt,
  fallbackTemplate: buildE3HandoffFromEvidenceFallbackPrompt,
};
