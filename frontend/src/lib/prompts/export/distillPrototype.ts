import type { Message } from "../../types";
import type {
  AnnotationEnvelope,
  CompactComposerInput,
  ConversationAnnotation,
  ExportDataset,
  ExportDatasetMessage,
  ExportDistillMode,
  ExportPlannerSignal,
  HandoffEvidenceArtifact,
  HandoffEvidenceSkeleton,
  HandoffPlanningNotes,
  KnowledgePlanningNotes,
  MessageAnnotation,
} from "../types";

const DENSITIES = new Set(["low", "medium", "high"]);

export const COMPACT_HEADINGS = [
  "## Background",
  "## Key Questions",
  "## Decisions And Answers",
  "## Reusable Artifacts",
  "## Unresolved",
] as const;

export type PrototypeValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

type HandoffDecision = HandoffEvidenceSkeleton["decisionsAndAnswers"][number];
type HandoffUnresolved = HandoffEvidenceSkeleton["unresolved"][number];

function uniqueStrings(values: Array<string | undefined | null>, limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function clipText(value: string, max = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function isoTime(value?: number): string | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString();
}

function toDatasetRole(role: Message["role"]): ExportDatasetMessage["role"] {
  return role === "ai" ? "assistant" : "user";
}

function extractBacktickRefs(text: string): string[] {
  const refs: string[] = [];
  const matches = text.matchAll(/`([^`]+)`/g);
  for (const match of matches) {
    refs.push(match[1]);
  }
  return refs;
}

function extractPathRefs(text: string): string[] {
  const refs: string[] = [];
  const matches = text.matchAll(
    /\b(?:[A-Za-z]:\\[^\s`]+|(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+)\b/g
  );
  for (const match of matches) {
    refs.push(match[0]);
  }
  return refs;
}

function extractCommandRefs(text: string): string[] {
  const refs: string[] = [];
  const matches = text.matchAll(
    /\b(?:pnpm|npm|yarn|git|node)\b[^\n。！？!?]*/g
  );
  for (const match of matches) {
    refs.push(match[0]);
  }
  return refs;
}

function extractSymbolRefs(text: string): string[] {
  const refs: string[] = [];
  const matches = text.matchAll(
    /\b(?:[A-Z][A-Z0-9_]{2,}|[a-z]+(?:_[a-z0-9]+){1,}|[A-Za-z0-9.-]+\/(?:[A-Z][A-Za-z0-9._-]*|[A-Za-z0-9._-]*-[A-Za-z0-9._-]+))\b/g
  );
  for (const match of matches) {
    refs.push(match[0]);
  }
  return refs;
}

export function detectArtifactRefs(text: string): string[] {
  return uniqueStrings([
    ...extractBacktickRefs(text),
    ...extractPathRefs(text),
    ...extractCommandRefs(text),
    ...extractSymbolRefs(text),
  ]);
}

function splitSentences(text: string): string[] {
  return text
    .split(/[\r\n]+|(?<=[。！？!?])\s+|(?<=\.)\s+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function detectConfidence(text: string, strongPatterns: RegExp[], weakPatterns: RegExp[]) {
  if (strongPatterns.some((pattern) => pattern.test(text))) return "high" as const;
  if (weakPatterns.some((pattern) => pattern.test(text))) return "medium" as const;
  return "low" as const;
}

function maybeAnnotateMessage(
  conversationId: string,
  message: Message
): MessageAnnotation[] {
  const text = message.content_text;
  const refs = detectArtifactRefs(text);
  const annotations: MessageAnnotation[] = [];
  const messageId = String(message.id);

  if (refs.length > 0 || /```/.test(text)) {
    annotations.push({
      id: `${conversationId}:message:${messageId}:artifact_marker`,
      targetType: "message",
      targetId: messageId,
      label: "artifact_marker",
      confidence: refs.length > 0 ? "high" : "medium",
      source: "heuristic",
      note: refs.length > 0 ? `refs=${refs.slice(0, 3).join(", ")}` : "code block or command-like content",
    });
  }

  if (
    /\b(decision|decide|agreed|locked|treat|enforce|preserve|keep|route|use|switch to|fallback|must)\b/i.test(
      text
    ) ||
    /(决定|锁定|保留|改成|切到|必须|需要同步)/.test(text)
  ) {
    annotations.push({
      id: `${conversationId}:message:${messageId}:confirmed_decision`,
      targetType: "message",
      targetId: messageId,
      label: "confirmed_decision",
      confidence: detectConfidence(
        text,
        [/\b(agreed|locked|enforce|must|will|treat)\b/i, /(锁定|必须|改成|收到)/],
        [/\b(keep|preserve|use|route|switch)\b/i, /(保留|切到|同步)/]
      ),
      source: "heuristic",
    });
  }

  if (
    /\b(unresolved|follow-up|needs follow-up|still needs|next step|tune|verify|watch|later)\b/i.test(
      text
    ) ||
    /(待办|未解决|后续|继续观察|需要确认|需要继续)/.test(text)
  ) {
    annotations.push({
      id: `${conversationId}:message:${messageId}:unresolved_cue`,
      targetType: "message",
      targetId: messageId,
      label: "unresolved_cue",
      confidence: detectConfidence(
        text,
        [/\b(unresolved|follow-up|still needs|next step)\b/i, /(未解决|后续|需要确认)/],
        [/\b(tune|verify|watch|later)\b/i, /(继续观察|需要继续)/]
      ),
      source: "heuristic",
    });
  }

  if (
    /\?|？/.test(text) ||
    /^(how|why|what|should|can|does|which)\b/i.test(text.trim()) ||
    /^(如何|为什么|是否|怎么|请区分)/.test(text.trim())
  ) {
    annotations.push({
      id: `${conversationId}:message:${messageId}:core_question_cue`,
      targetType: "message",
      targetId: messageId,
      label: "core_question_cue",
      confidence: /\?|？/.test(text) ? "high" : "medium",
      source: "heuristic",
    });
  }

  if (
    /^(also|separately|another|besides|at the same time)\b/i.test(text.trim()) ||
    /^(另外|同时|还有|此外)/.test(text.trim())
  ) {
    annotations.push({
      id: `${conversationId}:message:${messageId}:topic_shift`,
      targetType: "message",
      targetId: messageId,
      label: "topic_shift",
      confidence: "low",
      source: "heuristic",
    });
  }

  return annotations;
}

function toConversationAnnotation(
  conversationId: string,
  label: string,
  confidence: ConversationAnnotation["confidence"],
  note: string
): ConversationAnnotation {
  return {
    id: `${conversationId}:conversation:${label}`,
    targetType: "conversation",
    targetId: conversationId,
    label,
    confidence,
    source: "heuristic",
    note,
  };
}

function aggregateConversationAnnotations(
  conversationId: string,
  messageAnnotations: MessageAnnotation[]
): ConversationAnnotation[] {
  const counts = new Map<string, number>();
  for (const annotation of messageAnnotations) {
    counts.set(annotation.label, (counts.get(annotation.label) ?? 0) + 1);
  }

  const annotations: ConversationAnnotation[] = [];
  const push = (label: string, minCount: number, note: string) => {
    const count = counts.get(label) ?? 0;
    if (count <= 0) return;
    annotations.push(
      toConversationAnnotation(
        conversationId,
        label,
        count >= minCount ? "medium" : "low",
        `${note}; count=${count}`
      )
    );
  };

  push("artifact_marker", 2, "artifact-bearing messages detected");
  push("confirmed_decision", 2, "decision cues detected");
  push("unresolved_cue", 1, "unresolved or follow-up cues detected");
  push("core_question_cue", 1, "question framing cues detected");
  push("topic_shift", 2, "topic-shift cues detected");

  return annotations;
}

export function buildHeuristicAnnotationEnvelope(params: {
  conversationId: string;
  platform?: string;
  messages: Message[];
}): AnnotationEnvelope {
  const messageAnnotations = params.messages.flatMap((message) =>
    maybeAnnotateMessage(params.conversationId, message)
  );
  const conversationAnnotations = aggregateConversationAnnotations(
    params.conversationId,
    messageAnnotations
  );

  return {
    schemaVersion: "v1",
    conversationId: params.conversationId,
    sourcePlatform: params.platform ?? "unknown",
    messageAnnotations,
    conversationAnnotations,
  };
}

export function buildHandoffExportDataset(params: {
  conversationId: string;
  locale: string;
  platform?: string;
  title?: string;
  originAt?: number;
  capturedAt?: number;
  messages: Message[];
  annotations: AnnotationEnvelope;
}): ExportDataset {
  return {
    schemaVersion: "v1",
    mode: "handoff",
    locale: params.locale,
    conversationId: params.conversationId,
    sourcePlatform: params.platform ?? "unknown",
    metadata: {
      title: params.title,
      startedAt: isoTime(params.originAt),
      capturedAt: isoTime(params.capturedAt ?? params.originAt),
      selectedMessageCount: params.messages.length,
    },
    messages: params.messages.map((message) => ({
      id: String(message.id),
      role: toDatasetRole(message.role),
      createdAt: isoTime(message.created_at),
      content: message.content_text,
      artifactRefs: detectArtifactRefs(message.content_text),
    })),
    annotations: params.annotations,
  };
}

export function toPlannerSignals(envelope: AnnotationEnvelope): {
  messageSignals: ExportPlannerSignal[];
  conversationSignals: ExportPlannerSignal[];
} {
  return {
    messageSignals: envelope.messageAnnotations.map((annotation) => ({
      label: annotation.label,
      confidence: annotation.confidence,
      note: annotation.note,
      targetId: annotation.targetId,
    })),
    conversationSignals: envelope.conversationAnnotations.map((annotation) => ({
      label: annotation.label,
      confidence: annotation.confidence,
      note: annotation.note,
    })),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateBasePlanningObject(
  data: Record<string, unknown>,
  mode: ExportDistillMode
): string[] {
  const errors: string[] = [];
  if (data.schemaVersion !== "v1") errors.push("schemaVersion must be 'v1'");
  if (data.mode !== mode) errors.push(`mode must be '${mode}'`);
  if (typeof data.datasetId !== "string" || !data.datasetId.trim()) {
    errors.push("datasetId must be a non-empty string");
  }
  if (typeof data.focusSummary !== "string" || !data.focusSummary.trim()) {
    errors.push("focusSummary must be a non-empty string");
  }
  if (!isStringArray(data.inclusionRules)) errors.push("inclusionRules must be a string array");
  if (!isStringArray(data.exclusionRules)) errors.push("exclusionRules must be a string array");
  if (!isStringArray(data.riskFlags)) errors.push("riskFlags must be a string array");
  return errors;
}

function parseJsonObject(raw: string): PrototypeValidationResult<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, errors: ["output must be one JSON object"] };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      errors: [
        `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

export function validateE1Output(
  raw: string,
  mode: ExportDistillMode
): PrototypeValidationResult<HandoffPlanningNotes | KnowledgePlanningNotes> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) {
    const errorResult = parsed as { ok: false; errors: string[] };
    return { ok: false, errors: errorResult.errors };
  }

  const data = parsed.value;
  const errors = validateBasePlanningObject(data, mode);

  if (mode === "handoff") {
    if (typeof data.taskFrame !== "string" || !data.taskFrame.trim()) {
      errors.push("taskFrame must be a non-empty string");
    }
    if (!DENSITIES.has(String(data.artifactDensity))) {
      errors.push("artifactDensity must be low/medium/high");
    }
    if (!DENSITIES.has(String(data.decisionDensity))) {
      errors.push("decisionDensity must be low/medium/high");
    }
    if (!DENSITIES.has(String(data.unresolvedDensity))) {
      errors.push("unresolvedDensity must be low/medium/high");
    }
    if (!isStringArray(data.handoffFocus)) {
      errors.push("handoffFocus must be a string array");
    }
  } else {
    if (typeof data.coreQuestion !== "string" || !data.coreQuestion.trim()) {
      errors.push("coreQuestion must be a non-empty string");
    }
    if (!DENSITIES.has(String(data.progressionDensity))) {
      errors.push("progressionDensity must be low/medium/high");
    }
    if (!DENSITIES.has(String(data.artifactDensity))) {
      errors.push("artifactDensity must be low/medium/high");
    }
    if (!DENSITIES.has(String(data.actionabilityDensity))) {
      errors.push("actionabilityDensity must be low/medium/high");
    }
    if (!isStringArray(data.knowledgeValue)) {
      errors.push("knowledgeValue must be a string array");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: data as unknown as HandoffPlanningNotes | KnowledgePlanningNotes,
  };
}

export function validateE2Output(
  raw: string,
  mode: ExportDistillMode
): PrototypeValidationResult<HandoffEvidenceSkeleton> {
  if (mode !== "handoff") {
    return {
      ok: false,
      errors: ["knowledge E2 validation is not implemented in the handoff-only prototype"],
    };
  }

  const parsed = parseJsonObject(raw);
  if (!parsed.ok) {
    const errorResult = parsed as { ok: false; errors: string[] };
    return { ok: false, errors: errorResult.errors };
  }
  const data = parsed.value;
  const errors: string[] = [];

  if (data.schemaVersion !== "v1") errors.push("schemaVersion must be 'v1'");
  if (data.mode !== "handoff") errors.push("mode must be 'handoff'");
  if (!isStringArray(data.background)) errors.push("background must be a string array");
  if (!isStringArray(data.keyQuestions)) errors.push("keyQuestions must be a string array");

  if (!Array.isArray(data.decisionsAndAnswers)) {
    errors.push("decisionsAndAnswers must be an array");
  } else {
    for (const [index, item] of data.decisionsAndAnswers.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`decisionsAndAnswers[${index}] must be an object`);
        continue;
      }
      const row = item as Record<string, unknown>;
      if (typeof row.decision !== "string" || !row.decision.trim()) {
        errors.push(`decisionsAndAnswers[${index}].decision must be a non-empty string`);
      }
      if (typeof row.answer !== "string" || !row.answer.trim()) {
        errors.push(`decisionsAndAnswers[${index}].answer must be a non-empty string`);
      }
      if (row.rationale !== undefined && typeof row.rationale !== "string") {
        errors.push(`decisionsAndAnswers[${index}].rationale must be a string when present`);
      }
    }
  }

  if (!Array.isArray(data.reusableArtifacts)) {
    errors.push("reusableArtifacts must be an array");
  } else {
    for (const [index, item] of data.reusableArtifacts.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`reusableArtifacts[${index}] must be an object`);
        continue;
      }
      const row = item as Record<string, unknown>;
      if (!["code", "command", "path", "api", "reference"].includes(String(row.type))) {
        errors.push(`reusableArtifacts[${index}].type invalid`);
      }
      if (typeof row.label !== "string" || !row.label.trim()) {
        errors.push(`reusableArtifacts[${index}].label must be a non-empty string`);
      }
      if (typeof row.content !== "string" || !row.content.trim()) {
        errors.push(`reusableArtifacts[${index}].content must be a non-empty string`);
      }
      if (!Array.isArray(row.sourceMessageIds)) {
        errors.push(`reusableArtifacts[${index}].sourceMessageIds must be an array`);
      }
    }
  }

  if (!Array.isArray(data.unresolved)) {
    errors.push("unresolved must be an array");
  } else {
    for (const [index, item] of data.unresolved.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`unresolved[${index}] must be an object`);
        continue;
      }
      const row = item as Record<string, unknown>;
      if (typeof row.item !== "string" || !row.item.trim()) {
        errors.push(`unresolved[${index}].item must be a non-empty string`);
      }
      if (row.nextStep !== undefined && typeof row.nextStep !== "string") {
        errors.push(`unresolved[${index}].nextStep must be a string when present`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: data as unknown as HandoffEvidenceSkeleton };
}

export function validateCompactMarkdown(
  output: string
): PrototypeValidationResult<{ sections: Record<(typeof COMPACT_HEADINGS)[number], string> }> {
  const errors: string[] = [];
  const sections = {} as Record<(typeof COMPACT_HEADINGS)[number], string>;

  const locations = COMPACT_HEADINGS.map((heading) => ({
    heading,
    index: output.indexOf(heading),
  }));

  for (const location of locations) {
    if (location.index === -1) {
      errors.push(`missing heading: ${location.heading}`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  for (let i = 0; i < locations.length; i += 1) {
    const current = locations[i];
    const next = locations[i + 1];
    const body = output
      .slice(current.index + current.heading.length, next ? next.index : output.length)
      .trim();
    sections[current.heading] = body;
    if (!body) {
      errors.push(`empty section: ${current.heading}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { sections } };
}

function densityFromCount(count: number): "low" | "medium" | "high" {
  if (count >= 4) return "high";
  if (count >= 2) return "medium";
  return "low";
}

export function mockHandoffPlanning(dataset: ExportDataset): HandoffPlanningNotes {
  const questionCount = dataset.annotations.messageAnnotations.filter(
    (annotation) => annotation.label === "core_question_cue"
  ).length;
  const decisionCount = dataset.annotations.messageAnnotations.filter(
    (annotation) => annotation.label === "confirmed_decision"
  ).length;
  const artifactCount = dataset.annotations.messageAnnotations.filter(
    (annotation) => annotation.label === "artifact_marker"
  ).length;
  const unresolvedCount = dataset.annotations.messageAnnotations.filter(
    (annotation) => annotation.label === "unresolved_cue"
  ).length;
  const lowConfidenceCount = dataset.annotations.messageAnnotations.filter(
    (annotation) => annotation.confidence === "low"
  ).length;

  const firstUser = dataset.messages.find((message) => message.role === "user");
  const taskFrame = clipText(
    firstUser?.content ??
      dataset.metadata.title ??
      "Continue the thread while preserving execution-relevant state."
  );

  return {
    schemaVersion: "v1",
    mode: "handoff",
    datasetId: dataset.conversationId,
    focusSummary: clipText(
      `${dataset.metadata.title ?? "This thread"} needs a continuation-ready handoff that preserves decisions, rationale, artifacts, and unresolved follow-up.`
    ),
    inclusionRules: uniqueStrings([
      "Keep decisions with their chosen path and rationale when the transcript supports them.",
      "Keep concrete files, commands, functions, APIs, and references that affect continuation.",
      unresolvedCount > 0 ? "Keep unresolved work and next-step cues explicit." : undefined,
    ]),
    exclusionRules: uniqueStrings([
      "Drop small acknowledgements or repeated confirmations unless they change a later decision.",
      questionCount <= 1 ? "Do not inflate one question into a long chronology." : undefined,
    ]),
    riskFlags: uniqueStrings([
      lowConfidenceCount > 0
        ? "Some annotation signals are low-confidence and must be verified against transcript wording."
        : undefined,
      unresolvedCount === 0
        ? "No strong unresolved cue detected; verify whether follow-up remains open."
        : undefined,
    ]),
    taskFrame,
    artifactDensity: densityFromCount(artifactCount),
    decisionDensity: densityFromCount(decisionCount),
    unresolvedDensity: densityFromCount(unresolvedCount),
    handoffFocus: uniqueStrings([
      decisionCount > 0 ? "Preserve the decisions that fixed the working path." : undefined,
      artifactCount > 0 ? "Preserve concrete artifacts that the next agent can act on directly." : undefined,
      unresolvedCount > 0 ? "Preserve unresolved items that still require action or verification." : undefined,
      "Keep the task boundary compact enough for a next-step continuation.",
    ]),
  };
}

function pickQuestionCandidates(messages: ExportDataset["messages"]): string[] {
  const explicit = messages.flatMap((message) =>
    splitSentences(message.content).filter(
      (sentence) =>
        /\?|？/.test(sentence) ||
        /^(how|why|what|should|can|does|which)\b/i.test(sentence) ||
        /^(如何|为什么|是否|怎么|请区分)/.test(sentence)
    )
  );

  if (explicit.length > 0) return uniqueStrings(explicit.map((item) => clipText(item)), 5);

  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return [];
  return [clipText(firstUser.content)];
}

function findDecisionCandidates(messages: ExportDataset["messages"]): HandoffDecision[] {
  const decisions: HandoffDecision[] = [];
  const rationaleSentences = uniqueStrings(
    messages.flatMap((message) =>
      splitSentences(message.content).filter((sentence) =>
        /\b(rationale|because|reason|so that|to avoid|to keep)\b/i.test(sentence) ||
        /(原因|理由|避免|为了保持)/.test(sentence)
      )
    ),
    8
  );

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      !/\b(decision|agreed|locked|treat|enforce|preserve|keep|route|use|switch|allow|continue)\b/i.test(
        message.content
      ) &&
      !/(决定|锁定|保留|改成|切到|继续保留|允许)/.test(message.content)
    ) {
      continue;
    }

    const sentences = splitSentences(message.content);
    const decision = clipText(sentences[0] ?? message.content, 180);
    const answer = clipText(sentences.slice(1).join(" ") || message.content, 220);
    const rationale = rationaleSentences.find((sentence) =>
      sentence.toLowerCase().includes("rationale") ||
      sentence.toLowerCase().includes("because") ||
      sentence.includes("理由") ||
      sentence.includes("原因") ||
      sentence.toLowerCase().includes("avoid")
    );

    decisions.push({
      decision,
      answer,
      rationale,
    });
  }

  return uniqueDecisionItems(decisions).slice(0, 5);
}

function uniqueDecisionItems(items: HandoffDecision[]): HandoffDecision[] {
  const seen = new Set<string>();
  const result: HandoffDecision[] = [];
  for (const item of items) {
    const key = `${item.decision}||${item.answer}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function detectArtifactType(value: string): HandoffEvidenceArtifact["type"] {
  if (/^(pnpm|npm|yarn|git|node)\b/i.test(value)) return "command";
  if (/[A-Za-z0-9_]+\([^)]*\)/.test(value) || /Ref$/.test(value)) return "api";
  if (/[\\/].+\.[A-Za-z0-9]+$/.test(value) || /\.[A-Za-z0-9]+$/.test(value)) return "path";
  if (/^https?:\/\//i.test(value)) return "reference";
  if (/```/.test(value)) return "code";
  return "reference";
}

function collectArtifacts(messages: ExportDataset["messages"]): HandoffEvidenceArtifact[] {
  const rows: HandoffEvidenceArtifact[] = [];
  const seen = new Set<string>();
  const score = (value: string) => {
    const type = detectArtifactType(value);
    if (type === "command") return 0;
    if (type === "path") return 1;
    if (type === "api") return 2;
    return 3;
  };

  for (const message of messages) {
    const refs = uniqueStrings([...(message.artifactRefs ?? []), ...detectArtifactRefs(message.content)])
      .filter(
        (ref) =>
          ref.length > 3 &&
          !["frontend/src", "sidepanel/utils", "lib/services", "api/chat"].includes(ref)
      )
      .sort((left, right) => score(left) - score(right));
    for (const ref of refs) {
      const key = ref.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        type: detectArtifactType(ref),
        label: ref,
        content: ref,
        sourceMessageIds: [message.id],
      });
    }
  }

  return rows.slice(0, 20);
}

function collectUnresolved(messages: ExportDataset["messages"]): HandoffUnresolved[] {
  const items: HandoffUnresolved[] = [];
  for (const message of messages) {
    const sentences = splitSentences(message.content);
    for (const sentence of sentences) {
      if (
        /\b(unresolved|follow-up|still needs|next step|tune|verify|watch)\b/i.test(sentence) ||
        /(未解决|后续|继续观察|需要确认|需要继续)/.test(sentence)
      ) {
        items.push({
          item: clipText(sentence, 180),
          nextStep:
            /\b(next step|follow-up|verify|watch)\b/i.test(sentence) ||
            /(后续|继续观察|需要确认)/.test(sentence)
              ? clipText(sentence, 220)
              : undefined,
        });
      }
    }
  }

  if (items.length === 0) {
    return [
      {
        item: "No explicit unresolved cue was strongly grounded; verify whether follow-up remains before closing the handoff.",
      },
    ];
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

export function mockHandoffEvidence(
  dataset: ExportDataset,
  planningNotes: HandoffPlanningNotes
): HandoffEvidenceSkeleton {
  const decisions = findDecisionCandidates(dataset.messages);
  const artifacts = collectArtifacts(dataset.messages);
  const unresolved = collectUnresolved(dataset.messages);
  const questions = pickQuestionCandidates(dataset.messages);

  return {
    schemaVersion: "v1",
    mode: "handoff",
    background: uniqueStrings([
      dataset.metadata.title
        ? `Title: ${dataset.metadata.title}`
        : "Task title was not captured.",
      `Platform: ${dataset.sourcePlatform}`,
      `Task frame: ${planningNotes.taskFrame}`,
      planningNotes.focusSummary,
    ], 4),
    keyQuestions:
      questions.length > 0
        ? questions
        : ["No explicit question cue was grounded; preserve the current task boundary conservatively."],
    decisionsAndAnswers:
      decisions.length > 0
        ? decisions
        : [
            {
              decision: "No strong decision cue was extracted.",
              answer: "Keep the handoff conservative and avoid inventing a path beyond the transcript.",
            },
          ],
    reusableArtifacts: artifacts,
    unresolved,
  };
}

export function composeCompactFromEvidence(input: CompactComposerInput): string {
  const { evidence } = input;

  const background =
    evidence.background.length > 0
      ? evidence.background.map((item) => `- ${item}`).join("\n")
      : "- No grounded background captured.";
  const keyQuestions =
    evidence.keyQuestions.length > 0
      ? evidence.keyQuestions.map((item) => `- ${item}`).join("\n")
      : "- No grounded key question captured.";
  const decisions =
    evidence.decisionsAndAnswers.length > 0
      ? evidence.decisionsAndAnswers
          .map((item) =>
            [
              `- Decision: ${item.decision}`,
              `  Answer: ${item.answer}`,
              item.rationale ? `  Rationale: ${item.rationale}` : null,
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n")
      : "- No grounded decision captured.";
  const artifacts =
    evidence.reusableArtifacts.length > 0
      ? evidence.reusableArtifacts
          .map((item) => `- ${item.type === "reference" ? "Reference" : item.type === "command" ? "Command" : item.type === "api" ? "API/Function" : "Path"}: ${item.content}`)
          .join("\n")
      : "- No grounded artifact captured.";
  const unresolved =
    evidence.unresolved.length > 0
      ? evidence.unresolved
          .map((item) =>
            item.nextStep
              ? `- ${item.item}\n  Next step: ${item.nextStep}`
              : `- ${item.item}`
          )
          .join("\n")
      : "- No grounded unresolved item captured.";

  return `${COMPACT_HEADINGS[0]}\n${background}\n\n${COMPACT_HEADINGS[1]}\n${keyQuestions}\n\n${COMPACT_HEADINGS[2]}\n${decisions}\n\n${COMPACT_HEADINGS[3]}\n${artifacts}\n\n${COMPACT_HEADINGS[4]}\n${unresolved}`.trim();
}
