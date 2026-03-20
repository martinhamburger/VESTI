# Export Stage Artifact Schemas

Status: Active canonical schema note  
Audience: Prompt engineers, runtime engineers, validator authors

## Purpose

这份文档定义 export bounded chain 中各阶段之间传递的 artifact shape。

它的目标是避免两类问题：
- stage 之间通过散文式文本隐式耦合
- 上游 schema 不清楚，导致下游 prompt 或 validator 被迫二次猜测

## Schema conventions

- 所有 artifact 都应带 `schemaVersion`
- `mode` 只允许：`handoff` 或 `knowledge`
- `source` 只描述标注来源，不描述最终真值
- message-level 与 conversation-level annotation 分开存放

## `P1` structured sidecar annotation layer

### Envelope

```ts
interface AnnotationEnvelope {
  schemaVersion: "v1";
  conversationId: string;
  sourcePlatform: string;
  messageAnnotations: MessageAnnotation[];
  conversationAnnotations: ConversationAnnotation[];
}
```

### Message-level annotation

```ts
interface MessageAnnotation {
  id: string;
  targetType: "message";
  targetId: string;
  label: string;
  confidence: "low" | "medium" | "high";
  source: "rule" | "heuristic" | "manual" | "llm";
  note?: string;
}
```

推荐 label 集合至少覆盖：
- `correction_turn`
- `tentative_decision`
- `confirmed_decision`
- `unresolved_cue`
- `artifact_marker`
- `reusable_snippet_cue`
- `topic_shift`
- `core_question_cue`

### Conversation-level annotation

```ts
interface ConversationAnnotation {
  id: string;
  targetType: "conversation";
  targetId: string;
  label: string;
  confidence: "low" | "medium" | "high";
  source: "rule" | "heuristic" | "manual" | "llm";
  note?: string;
}
```

推荐 conversation-level label 至少覆盖：
- `high_artifact_density`
- `high_decision_density`
- `high_actionability`
- `knowledge_candidate`
- `handoff_candidate`

conversation-level annotations 应被理解为 aggregate signals，而不是开放式语义结论。
它们的目标是帮助 `E0/E1` 稳定消费上游状态，而不是替 downstream stage 完成主题理解。

## `E0` export dataset

```ts
interface ExportDataset {
  schemaVersion: "v1";
  mode: "handoff" | "knowledge";
  locale: string;
  conversationId: string;
  sourcePlatform: string;
  metadata: ExportDatasetMetadata;
  messages: ExportDatasetMessage[];
  annotations: AnnotationEnvelope;
}
```

```ts
interface ExportDatasetMetadata {
  title?: string;
  url?: string;
  startedAt?: string;
  capturedAt?: string;
  selectedMessageCount: number;
}

interface ExportDatasetMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  createdAt?: string;
  content: string;
  artifactRefs?: string[];
}
```

## `E1` planning notes schema family

`E1` 是 shared stage slot，但采用 separate prompt artifacts，因此 output schema 采用 family，而不是一份完全中立的单体对象。

### Base shape

```ts
interface PlanningNotesBase {
  schemaVersion: "v1";
  mode: "handoff" | "knowledge";
  datasetId: string;
  focusSummary: string;
  inclusionRules: string[];
  exclusionRules: string[];
  riskFlags: string[];
}
```

### Handoff planning notes

```ts
interface HandoffPlanningNotes extends PlanningNotesBase {
  mode: "handoff";
  taskFrame: string;
  artifactDensity: "low" | "medium" | "high";
  decisionDensity: "low" | "medium" | "high";
  unresolvedDensity: "low" | "medium" | "high";
  handoffFocus: string[];
}
```

### Knowledge planning notes

```ts
interface KnowledgePlanningNotes extends PlanningNotesBase {
  mode: "knowledge";
  coreQuestion: string;
  progressionDensity: "low" | "medium" | "high";
  artifactDensity: "low" | "medium" | "high";
  actionabilityDensity: "low" | "medium" | "high";
  knowledgeValue: string[];
}
```

## `E2` evidence skeleton schema family

### Handoff evidence skeleton

```ts
interface HandoffEvidenceSkeleton {
  schemaVersion: "v1";
  mode: "handoff";
  background: string[];
  keyQuestions: string[];
  decisionsAndAnswers: Array<{
    decision: string;
    answer: string;
    rationale?: string;
  }>;
  reusableArtifacts: Array<{
    type: "code" | "command" | "path" | "api" | "reference";
    label: string;
    content: string;
    sourceMessageIds: string[];
  }>;
  unresolved: Array<{
    item: string;
    nextStep?: string;
  }>;
}
```

### Knowledge evidence skeleton

```ts
interface KnowledgeEvidenceSkeleton {
  schemaVersion: "v1";
  mode: "knowledge";
  coreQuestion: string;
  importantMoves: Array<{
    move: string;
    whyItMattered?: string;
  }>;
  reusableSnippets: Array<{
    type: "code" | "command" | "pattern" | "reference";
    label: string;
    content: string;
    reuseNote?: string;
    sourceMessageIds: string[];
  }>;
  nextSteps: string[];
  tags: string[];
}
```

## `E3` composer input

### Compact composer input

```ts
interface CompactComposerInput {
  schemaVersion: "v1";
  mode: "handoff";
  profile: string;
  locale: string;
  evidence: HandoffEvidenceSkeleton;
  expectedHeadings: [
    "## Background",
    "## Key Questions",
    "## Decisions And Answers",
    "## Reusable Artifacts",
    "## Unresolved"
  ];
}
```

### Summary composer input

```ts
interface SummaryComposerInput {
  schemaVersion: "v1";
  mode: "knowledge";
  profile: string;
  locale: string;
  evidence: KnowledgeEvidenceSkeleton;
  expectedHeadings: [
    "## TL;DR",
    "## Problem Frame",
    "## Important Moves",
    "## Reusable Snippets",
    "## Next Steps",
    "## Tags"
  ];
}
```

## `repair` input

```ts
interface RepairInput {
  schemaVersion: "v1";
  mode: "handoff" | "knowledge";
  profile: string;
  failedOutput: string;
  invalidReasons: string[];
  expectedHeadings: string[];
  upstreamArtifactId: string;
}
```

## Contract rules

- `P1` 不允许输出散文式注释作为唯一机器可消费格式
- `E1/E2` output 不允许退化成最终 markdown
- `E3` input 必须显式包含 expected headings
- repair 不重新定义 schema，只修补 contract failure

## Known schema pressure

`P1` sidecar schema 是 shared upstream contract，因此需要预期一个中长期压力：
- handoff 路径会推动 decision / unresolved labels 继续细化
- knowledge 路径会推动 reusable / recall labels 继续细化

这不要求现在拆成两套 sidecar schema，但要求后续持续审视：
- label set 是否还保持 bounded
- conversation-level annotations 是否仍然是 aggregate signals
- `P1` 是否开始替 `E1/E2` 做开放式语义判断

## Relationship to other docs

- `export_ai_handoff_architecture.md`
- `export_knowledge_export_architecture.md`
- `cross_platform_conversation_normalization_architecture.md`
- `export_workflow_runner_spec.md`
- `export_prompt_contract.md`

## 2026-03 dataset shape extension

The export-facing dataset contract should now assume the following `E0` message shape, even if the
runtime still stages some fields incrementally:

```ts
interface ExportDatasetMetadata {
  title?: string; // app-shell metadata, never inferred from body heading
  url?: string;
  sessionIdentity?: string;
  startedAt?: string;
  capturedAt?: string;
  selectedMessageCount: number;
}

interface ExportDatasetMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  createdAt?: string;
  canonicalPlainText: string;
  semanticAstVersion?: "ast_v2";
  normalizedHtmlSnapshotRef?: string;
  citations?: DatasetCitation[];
  artifacts?: DatasetArtifact[];
  artifactRefs?: string[];
}

interface DatasetCitation {
  label: string;
  href: string;
  host: string;
  sourceType: "inline_pill" | "search_card" | "reference_list" | "unknown";
  occurrenceRole?: "body_inline" | "sidecar_only" | "unknown";
}

interface DatasetArtifact {
  kind:
    | "canvas"
    | "preview"
    | "code_artifact"
    | "download_card"
    | "standalone_artifact"
    | "unknown";
  label?: string;
  captureMode?: "presence_only" | "embedded_dom_snapshot" | "standalone_artifact";
  renderDimensions?: { width: number; height: number };
  plainTextRef?: string;
  markdownSnapshotRef?: string;
  normalizedHtmlSnapshotRef?: string;
}
```

Rules:
- `canonicalPlainText` is fallback body text, not the only structure source
- `citations[]` and `artifacts[]` are message sidecars
- `normalizedHtmlSnapshotRef` is expected only for rich-structure or artifact-bearing messages

## 2026-03 shipped runtime adapter layer

Before shipped prompt consumers build their final prompt text, they now pass through a bounded
internal adapter layer.

```ts
interface PromptStructureSignals {
  hasTable: boolean;
  hasMath: boolean;
  hasCode: boolean;
  hasCitations: boolean;
  hasArtifacts: boolean;
}

interface PromptReadyMessage {
  id: number;
  role: "user" | "ai";
  created_at: number;
  bodyText: string;
  transcriptText: string;
  structureSignals: PromptStructureSignals;
  sidecarSummaryLines: string[];
  artifactRefs: string[];
}

interface PromptReadyConversationContext {
  messages: PromptReadyMessage[];
  transcript: string;
  bodyChars: number;
}
```

Rules:
- `bodyText` is the canonical prompt-facing body, not raw renderer-polluted transcript text
- `transcriptText` may append bounded sidecar summaries, but must keep body and sidecars distinct
- `artifactRefs` are resolved from sidecars first, regex fallback second
- this adapter is a shipped runtime boundary for:
  - export compression
  - conversation summary
  - insight generation

## 2026-03 artifact-first shipped note

Week 4 does not introduce a new artifact schema version. It tightens the shipped interpretation of
the existing artifact sidecar.

Shipped consumer rules:

- artifact excerpt priority is:
  - `markdownSnapshot`
  - `plainText`
  - `normalizedHtmlSnapshot`
- sidepanel, web, export, and prompt-ready runtime all consume the same sidecar fields
- body text must not be used to reconstruct artifact content when sidecar fields already exist

Still deferred:

- artifact replay
- iframe / executable artifact rendering
- full package-native weekly digest consumption
