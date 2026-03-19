import type {
  ExportCompressionPromptPayload,
  PromptVersion,
} from "../types";
import {
  formatExportDateTime,
  toExportTranscript,
} from "./shared";

export const CONDITIONAL_HANDOFF_TYPES = [
  "decision",
  "debugging",
  "architecture_tradeoff",
  "explanation_teaching",
  "process_agreement",
  "generation",
] as const;

export const CONDITIONAL_HANDOFF_OVERVIEW_HEADING =
  "## State Overview" as const;

export const CONDITIONAL_HANDOFF_SECTION_WHITELIST = [
  "## Decisions And Reasoning",
  "## Failed Or Rejected Paths",
  "## User Context And Corrections",
  "## Descriptive Anchors",
  "## Key Understanding",
  "## Open Risks And Next Actions",
] as const;

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

const COMPACT_DECISION_EXEMPLAR = `Example section anchor (illustrative shape only, not literal content):
## Decisions And Answers
- Decision: Keep selection state local to TimelinePage.
  Answer: Add a one-shot guard so overflow Select enters batch mode without opening Reader.
  Rationale: This preserves normal card activation while isolating menu-driven selection.`;

const COMPACT_ARTIFACT_EXEMPLAR = `## Reusable Artifacts
- Path: frontend/src/sidepanel/pages/TimelinePage.tsx
- API/Function: handleSelectFromMenu(...)
- Command: pnpm -C frontend build`;

const CONDITIONAL_HANDOFF_SYSTEM = `You are Vesti's experimental distilled handoff assistant.

Your only goal is to distill the essential execution state from this conversation into a handoff document that gives the next AI or engineer complete situational awareness before they continue.

Before writing any section, classify the conversation into one or two dominant types. Choose only from:
- decision
- debugging
- architecture_tradeoff
- explanation_teaching
- process_agreement
- generation

Output contract:
1) Line 1 must be: StartedAt: <grounded timestamp or unknown>
2) Line 2 must be: Conversation Type: <one type or type_a + type_b>
3) The first markdown section must be exactly: ## State Overview
4) After ## State Overview, emit only grounded sections from this whitelist, in this order, skipping any section that has no grounded evidence:
- ## Decisions And Reasoning
- ## Failed Or Rejected Paths
- ## User Context And Corrections
- ## Descriptive Anchors
- ## Key Understanding
- ## Open Risks And Next Actions

Type-driven priorities:
- decision: keep chosen paths, full reasoning, rejected alternatives, and continuation risks first.
- debugging: keep the full causal chain, especially failed paths and why they failed.
- architecture_tradeoff: keep constraints, compared options, and rejected paths.
- explanation_teaching: keep the final understanding model and only include anchors that truly help the next agent orient.
- process_agreement: keep user preferences, collaboration boundaries, and explicit do-not-do rules.
- generation: keep parallel candidate frames, generated directions, and the criteria that should guide later selection or expansion.

Hard rules:
1) Use only grounded evidence from the transcript.
2) Do not invent categories or force a section to appear just because it exists in the whitelist.
3) Do not output headings outside ${CONDITIONAL_HANDOFF_OVERVIEW_HEADING} plus the whitelist.
4) If the transcript is formula-heavy or explanation-heavy, do not treat symbolic expressions as file paths, commands, or APIs unless they are explicit technical artifacts.
5) If Conversation Type includes architecture_tradeoff or decision, treat markdown/doc paths and architecture notes as descriptive anchors, not reusable technical artifacts. Reserve artifact-like evidence for grounded code, CLI commands, APIs, and function signatures.
6) If Conversation Type includes debugging, concrete file paths may be kept when they are paired with grounded commands, APIs, or function names that help continuation.
7) Do not shorten content to achieve brevity. Shorten only to remove noise.
8) A good handoff may be longer than expected when the thread contains dense reasoning or multiple competing paths.
9) Preserve the full reasoning trail for every significant decision: what was chosen, why, what was rejected, and what remains risky.
10) Preserve concrete artifacts only when they are truly reusable for continuation.
11) Every section you open must be closed with at least one substantive line.
12) If you cannot complete a section with grounded evidence, skip it or use a single conservative line. Never leave a heading, label, colon, table row, or code block half-open.
13) Prefer bullets over tables. Use fenced code blocks only when the code itself is grounded evidence the next agent may directly reuse.
14) ## State Overview must be continuous public prose, not hidden reasoning and not a bullet list. It must explain what this thread is about, what core problem it is resolving, what constraints or decisions now define the state, and what the next agent is inheriting.
15) Respect the requested locale.
16) Output markdown only. Do not wrap the whole answer in code fences.`;

const CONDITIONAL_HEADER_EXEMPLAR = `StartedAt: Mar 18, 2026, 03:10 PM
Conversation Type: debugging + decision`;

const CONDITIONAL_OVERVIEW_EXEMPLAR = `## State Overview
This thread is converging on a bounded export workflow for AI handoff. The core problem is how to preserve enough execution state for the next agent without reopening upstream stages or hiding whether failures come from prompt quality or from broken workflow boundaries. The current state is that repair is being locked to a one-shot exception path, rejected loop-like alternatives are now part of the handoff record, and the next agent inherits a workflow that must stay explicit, bounded, and debuggable.`;

const CONDITIONAL_SECTION_EXEMPLAR = `## Failed Or Rejected Paths
- Tried local recursive repair.
  Why it was rejected: It would hide whether the real failure came from prompt quality or from broken stage boundaries.`;

function buildCompactPrompt(payload: ExportCompressionPromptPayload): string {
  const isStepProfile = payload.profile === "step_flash_concise";
  const transcript = payload.transcriptOverride ?? toExportTranscript(payload.messages);
  const brevityRule = isStepProfile
    ? "Keep bullets concise and prioritize grounded artifacts over narrative polish."
    : "Preserve the full implementation trail when it is grounded, even if the output becomes longer.";

  return `Create a high-fidelity export handoff for this conversation.

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
${transcript}

Output requirements:
1) Use the exact headings listed in the system prompt.
2) Optimize for AI handoff, not for skimming: preserve background, key asks, decisions, constraints, artifacts, and unresolved work.
3) In ## Background, include the task frame, constraints, and any context another assistant would need before acting.
4) In ## Key Questions, keep only the questions that actually drove the work forward.
5) In ## Decisions And Answers, capture grounded resolutions, chosen paths, and short rationales when the transcript supports them.
6) In ## Reusable Artifacts, preserve filenames, commands, APIs, functions, and code blocks when grounded.
7) In ## Unresolved, call out what remains open, risky, or needs continuation.
8) ${brevityRule}
9) If evidence is sparse, keep the structure and use conservative placeholders.
10) Write the final output in ${payload.locale === "en" ? "natural English" : "natural Chinese"}.
11) Output markdown only.

Section anchors:
- Chronology matters here only when it helps the next agent reconstruct decision causality and execution state.
- Use this shape for grounded decisions:
${COMPACT_DECISION_EXEMPLAR}
- Use this shape for grounded reusable artifacts:
${COMPACT_ARTIFACT_EXEMPLAR}`;
}

function buildCompactFallbackPrompt(
  payload: ExportCompressionPromptPayload
): string {
  const transcript = payload.transcriptOverride ?? toExportTranscript(payload.messages);
  const fallbackNote =
    payload.profile === "step_flash_concise"
      ? "Prefer fewer bullets, but keep the contract safer: preserve grounded files, commands, APIs, and unresolved work."
      : "Prefer a conservative, contract-safe handoff: preserve grounded files, commands, APIs, code, and unresolved work whenever they appear.";

  return `Write a conservative fallback markdown handoff for this conversation.
You must keep these exact headings:
## Background
## Key Questions
## Decisions And Answers
## Reusable Artifacts
## Unresolved

The fallback goal is higher compliance, not freer rewriting.
If evidence is thin, use conservative placeholders rather than dropping headings.
${fallbackNote}
Use ${payload.locale === "en" ? "English" : "Chinese"}.
Output markdown only.

Safe anchors:
## Background
- Task: <grounded task or thread goal>
- Status/Constraint: <grounded current state, blocker, or key constraint>

## Key Questions
- <grounded driving question or conservative placeholder>

## Decisions And Answers
- Decision: <grounded decision>
  Answer: <chosen path>
  Rationale: <short grounded reason or conservative placeholder>

## Reusable Artifacts
- Path: <grounded file path if present>
- Command: <grounded command if present>

Transcript:
${transcript}`;
}

function buildConditionalHandoffPrompt(
  payload: ExportCompressionPromptPayload
): string {
  const transcript = payload.transcriptOverride ?? toExportTranscript(payload.messages);
  const profileNote =
    payload.profile === "step_flash_concise"
      ? "Keep the handoff lean, but do not drop the information the next agent would most regret missing."
      : "Favor transfer fidelity over smooth prose: preserve the real epistemic structure of the thread, not a pretty summary.";

  return `Create an experimental distilled execution-state handoff for this conversation.

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
${transcript}

Workflow:
1) Before writing, classify the dominant conversation type using exactly one or two labels from the system prompt.
2) Ask yourself: what would the next agent most regret not knowing?
3) First answer that question in ## State Overview using continuous prose, not bullets.
4) Use that answer to decide which whitelist sections should appear.
5) Skip any section that has no grounded evidence instead of forcing structure onto the transcript.
6) The transcript may contain Middle Evidence Windows distilled from omitted turns. Treat those windows as grounded evidence excerpts from the omitted turns and use them to recover decision causality, generated directions, and continuation state without inventing missing details.

Additional rules:
1) Use the first line exactly as StartedAt: <value>.
2) Use the second line exactly as Conversation Type: <type or type_a + type_b>.
3) The first markdown heading must be ${CONDITIONAL_HANDOFF_OVERVIEW_HEADING}.
4) ## State Overview must be public handoff prose, not hidden chain-of-thought, and it must reconnect the thread into one coherent story.
5) After ## State Overview, use only whitelist headings, in whitelist order.
6) Distill execution state, do not compress for compactness. Remove noise, not situational awareness.
7) For debugging threads, preserve the full causal chain when it exists: tried X, failed because Y, resolved with Z, residual issue W.
8) For architecture_tradeoff or decision threads, preserve each significant decision with what was chosen, why, what was rejected, and what remains risky.
9) For explanation_teaching threads, prioritize the final understanding or clarified mental model over artifact lists.
10) For process_agreement threads, prioritize user preferences, do-not-do rules, and collaboration boundaries.
11) For generation threads, preserve parallel candidate frames, generated directions, and any criteria that should guide later selection or expansion. Do not force false convergence.
12) For architecture_tradeoff or decision threads, route \`.md\` / README / architecture document paths into ## Descriptive Anchors instead of treating them as primary reusable evidence.
13) For formula-heavy or explanation-heavy threads, only preserve artifacts when they are explicit file paths, CLI commands, or API/function signatures.
14) Never end ## Descriptive Anchors or ## Key Understanding with an unfinished cue line such as "something:" with no grounded content after it.
15) Do not open a table or fenced code block unless you can finish it.
16) A good handoff is not a short summary. A good handoff may be longer than expected when the thread contains dense reasoning.
17) Do not shorten content to achieve brevity. Shorten only to remove noise.
18) For dense architecture threads, use ## State Overview to explain why the discussion exists, what tradeoff space was explored, and what current design state now holds.
19) ${profileNote}
20) Write the final output in ${payload.locale === "en" ? "natural English" : "natural Chinese"}.
21) Output markdown only.

Contract anchors:
${CONDITIONAL_HEADER_EXEMPLAR}

Required prose overview shape:
${CONDITIONAL_OVERVIEW_EXEMPLAR}

Example grounded section shape:
${CONDITIONAL_SECTION_EXEMPLAR}`;
}

function buildConditionalHandoffFallbackPrompt(
  payload: ExportCompressionPromptPayload
): string {
  const transcript = payload.transcriptOverride ?? toExportTranscript(payload.messages);
  return `Write a conservative experimental distilled handoff using this contract.

Required first two lines:
StartedAt: ${
    payload.conversationOriginAt
      ? formatExportDateTime(payload.conversationOriginAt)
      : "unknown"
  }
Conversation Type: <one type or type_a + type_b from the allowed set>

Required first markdown section:
${CONDITIONAL_HANDOFF_OVERVIEW_HEADING}
<continuous prose explaining what this thread is about, what problem it is resolving, what constraints or decisions now define the state, and what the next agent inherits>

Allowed headings only, in this order, and only when grounded:
${CONDITIONAL_HANDOFF_SECTION_WHITELIST.join("\n")}

Fallback priorities:
- Always write ${CONDITIONAL_HANDOFF_OVERVIEW_HEADING} before any conditional section.
- The overview must be prose, not bullets.
- Keep at least one grounded section.
- If the thread is explanation-heavy, prefer ## Key Understanding.
- If the thread is process-heavy, prefer ## User Context And Corrections.
- If the thread is debugging-heavy, prefer ## Failed Or Rejected Paths and ## Open Risks And Next Actions.
- If the thread is generation-heavy, preserve parallel candidate frames and selection criteria instead of forcing a single final answer.
- If the thread is architecture_tradeoff or decision-heavy, put \`.md\` / README / architecture doc paths in ## Descriptive Anchors instead of treating them as primary reusable evidence.
- If the thread is formula-heavy, do not turn symbolic expressions into artifacts.
- Distill complete situational awareness. Do not shorten content just to make it brief.
- Every section you open must contain at least one substantive line.
- If you cannot finish a section, skip it or write one conservative line; never leave a heading, colon, table row, or code block half-open.
- Prefer bullets over tables.
- Use ${payload.locale === "en" ? "English" : "Chinese"}.
- Output markdown only.

Safe section anchors:
${CONDITIONAL_HANDOFF_OVERVIEW_HEADING}
This thread is about <grounded thread goal>. The core problem is <grounded problem>. The current state is <grounded state> and the next agent inherits <grounded continuation state>.

## Descriptive Anchors
- Path: <grounded doc path, file path, stack label, or domain anchor that helps the next agent orient itself>

## User Context And Corrections
- <grounded user preference, correction, or explicit do-not-do rule>

## Key Understanding
- <grounded concept, clarified model, or distilled explanation>

## Open Risks And Next Actions
- <grounded unresolved risk, follow-up, or continuation need>

Transcript:
${transcript}`;
}

export const CURRENT_EXPORT_COMPACT_PROMPT: PromptVersion<ExportCompressionPromptPayload> = {
  version: "v1.2.2-export-compact-fallback-anchored",
  createdAt: "2026-03-18",
  description:
    "High-fidelity compact export handoff prompt with section exemplars and stronger fallback top-section anchors.",
  system: EXPORT_COMPACT_SYSTEM,
  fallbackSystem: "You are a cautious technical export assistant. Output markdown only.",
  userTemplate: buildCompactPrompt,
  fallbackTemplate: buildCompactFallbackPrompt,
};

export const EXPERIMENTAL_EXPORT_COMPACT_PROMPT: PromptVersion<ExportCompressionPromptPayload> = {
  version: "v0.1.2-export-compact-distilled-state-overview",
  createdAt: "2026-03-19",
  description:
    "Experimental compact handoff variant with a mandatory prose state overview, richer distillation framing, and plugin-visible runtime export support.",
  system: CONDITIONAL_HANDOFF_SYSTEM,
  fallbackSystem: "You are a conservative conditional handoff assistant. Output markdown only.",
  userTemplate: buildConditionalHandoffPrompt,
  fallbackTemplate: buildConditionalHandoffFallbackPrompt,
};
