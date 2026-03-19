# Export Non-Disruptive Engineering Architecture

Status: Active canonical engineering blueprint  
Last Updated: 2026-03-18  
Audience: Runtime engineering, prompt engineering, QA, release owner

## Purpose

Define a code-level implementation blueprint for improving export compression quality without changing architecture, stage boundaries, or shipping output protocol.

This blueprint is implementation-oriented and intentionally constrained to non-disruptive changes.

## Routing-First Compression Mechanism

Compression is routing-first, not template-first.

Implementation pattern in this cycle:
- maintain one comprehensive state library that covers likely dialogue states
- route each conversation to one or more dialogue shapes with confidence
- select only relevant state slices for evidence preservation
- compose final output using existing shipping shells (`Compact`/`Summary` headings)

Design intent:
- template shell provides compatibility and readability
- routing and state-slice selection determine information retention quality
- quality gate evaluates retention quality, not heading presence alone

State library examples (non-exhaustive):
- debugging: environment, error signature, attempt sequence, failed reasons, resolution, unresolved
- architecture tradeoff: candidates, dimensions, exclusions, selected option, rationale
- learning/explanation: concept model, derivation steps, misconception fixes, transfer examples
- process alignment: agreements, roles, assumptions, naming rules, acceptance criteria
- decision support: question, constraints, alternatives, recommendation, risk notes

## Hard Constraints

- no chain boundary changes for `E0 -> E1 -> E2 -> E3`
- no new orchestrator module
- no change to `exportConversations -> compressExportDataset` ownership
- no change to shipping `Compact` and `Summary` required heading schemas
- no change to invalid-reason code taxonomy in current cycle
- no change to deterministic `Full` export behavior

## Current Runtime Anchor

Current runtime path (must remain intact):

1. `exportConversations` in `frontend/src/sidepanel/utils/exportConversations.ts`
2. `compressExportDataset` in `frontend/src/sidepanel/utils/exportCompression.ts`
3. `compressWithCurrentLlmSettings` in `frontend/src/sidepanel/utils/exportCompression.ts`
4. `callInference` in `frontend/src/lib/services/llmService.ts`

The implementation below only adds internal quality-control seams inside existing files.

## Non-Disruptive Code Architecture

### Layer A: Strategy Signals (inside E1 semantics)

Add a lightweight signal extractor in `exportCompression.ts` that reads ordered messages and computes strategy hints.

No new stage is introduced. These hints are internal planning metadata for existing compression flow.

```ts
interface CompressionStrategySignals {
  questionDensity: number;
  constraintDensity: number;
  decisionDensity: number;
  unresolvedDensity: number;
  artifactDensity: number;
  bilingualMixScore: number;
}

interface CompressionStrategyPlan {
  dialogueShape:
    | "debug_troubleshooting"
    | "architecture_tradeoff"
    | "learning_explanation"
    | "process_alignment"
    | "decision_support"
    | "general";
  confidence: number;
  priorities: Array<
    | "retain_environment"
    | "retain_attempt_sequence"
    | "retain_tradeoff_matrix"
    | "retain_constraints"
    | "retain_artifacts"
    | "retain_unresolved"
  >;
}
```

Insertion point:
- before current prompt payload creation in `compressWithCurrentLlmSettings`
- default behavior: if confidence is low, fall back to `general` without changing current behavior

### Layer B: Strategy-Conditioned Prompt Guidance (inside E2 semantics)

Keep current heading contracts and prompt registry unchanged.

Inject a compact strategy guidance block into existing prompt payload composition only.

```ts
interface StrategyPromptGuidance {
  guidanceVersion: "v1";
  dialogueShape: CompressionStrategyPlan["dialogueShape"];
  priorities: CompressionStrategyPlan["priorities"];
  constraints: string[];
}
```

Rules:
- guidance must not add mandatory headings
- guidance must not require parser changes
- guidance is advisory and backward-compatible

### Layer C: MSS Scoring (non-blocking first)

Add scoring in validation path after existing checks.

Current validator remains authoritative in this cycle.

```ts
interface CompressionQualityScore {
  mssCoverage: number;          // 0..1
  artifactPreservation: number; // 0..1
  groundedness: number;         // 0..1
  pseudoStructureRate: number;  // 0..1 (lower is better)
  overall: number;              // weighted
}

interface DialogueShapeMssRule {
  dialogueShape: CompressionStrategyPlan["dialogueShape"];
  requiredSignals: string[];
  minCoverage: number;
}
```

Rollout behavior:
- Iteration 2: score-only observation (no hard block)
- Iteration 3: feature-flagged fallback linkage on low score

### Layer D: Fallback Diagnostics Enrichment

Keep current fallback route unchanged (`local_fallback` etc).

Enrich notice/debug fields with strategy and score context.

```ts
interface CompressionDiagnosticExtension {
  dialogueShape?: CompressionStrategyPlan["dialogueShape"];
  mssCoverage?: number;
  missingSignals?: string[];
  scoreMode?: "observe" | "guarded";
}
```

This enables tuning without altering user-facing schema contracts.

## File-Level Change Plan (Code, Non-Disruptive)

### 1) `frontend/src/sidepanel/utils/exportCompression.ts`

Allowed additions:
- strategy signal extractor helpers
- strategy planner helpers
- MSS rule table and score calculator
- optional diagnostic extension fields
- feature flag check for guarded fallback linkage

Not allowed here:
- route ownership rewrites
- adapter model rewrite
- stage splitting into new modules in current cycle

### 2) `frontend/src/lib/prompts/exportCompact.ts`

Allowed additions:
- strategy guidance placeholders inside current payload interpolation
- stricter anti-pseudo-structure instruction text

Not allowed:
- heading schema changes
- contract-breaking section renames

### 3) `frontend/src/lib/prompts/exportSummary.ts`

Allowed additions:
- same as compact path, summary-oriented evidence priorities

Not allowed:
- heading schema changes
- contract-breaking section renames

### 4) `frontend/src/lib/prompts/types.ts`

Allowed additions:
- optional strategy guidance fields in export prompt payload types

Not allowed:
- required-field changes that break current prompt callers

### 5) `frontend/src/sidepanel/utils/exportConversations.ts`

No flow rewrite.

Only optional non-disruptive metadata pass-through if needed for diagnostics.

Current landed rule for this cycle:
- observe-mode diagnostics stay internal to runtime/logging
- shipping download payload shape remains unchanged in this landing

## Feature Flags And Safety

Recommended flags (default off):

- `exportCompressionStrategyHintsEnabled`
- `exportCompressionQualityObserveEnabled`
- `exportCompressionGuardedFallbackEnabled`

Safety requirements:
- off-state must equal current behavior
- each flag can be disabled independently
- release checklist must include off-state regression run

## Bilingual Robustness Baseline

Signal extraction and pseudo-structure detection must cover Chinese and English cues.

Minimum bilingual coverage areas:
- question cues
- constraint cues
- decision cues
- unresolved cues
- placeholder/empty-content cues

No language-specific branching may alter heading contracts.

## Testing And Verification

### Unit/Logic Verification

- signal extraction deterministic tests
- dialogue-shape mapping tests
- MSS scoring tests by bucket
- score-only mode no-block guarantee test
- guarded fallback flag behavior test

### Fixture Evaluation

Use existing export fixtures and add bucket labels:
- debugging/troubleshooting
- architecture tradeoff
- learning/explanation
- process alignment
- decision support

Required outputs per run:
- before/after metric table
- invalid-reason distribution
- fallback frequency report

### Compatibility Verification

Must pass:
- strict prompt eval command in governance doc
- compact/summary heading parser compatibility
- full export deterministic behavior

## Iteration Execution Plan

### Iteration 1 (now)
- docs finalized
- implementation blueprint approved
- no runtime behavior change

### Iteration 2
- implement strategy + scoring in observe mode
- collect diagnostics and metric baselines

### Iteration 3
- gated fallback linkage by threshold
- staged rollout with rollback-first policy

### Iteration 4
- bilingual and long-thread hardening
- threshold retuning with fixture refresh

## Rollback Policy

If regressions appear:

1. disable guarded fallback flag
2. disable observe/strategy flags if needed
3. retain existing prompt profile routing
4. ship previous stable behavior without architecture changes

## Current Landed Scope (2026-03-19)

Landed in code:
- strategy-signal extraction and dialogue-shape routing inside `exportCompression.ts`
- strategy-conditioned prompt guidance inside `exportCompact.ts` and `exportSummary.ts`
- observe-only quality scoring and gate recommendation calculation
- strategy-aware local fallback extraction budgets

Present but still disabled:
- guarded fallback activation
- LLM strategy review activation

Explicitly preserved:
- `Compact` and `Summary` heading contracts
- current invalid-reason taxonomy
- shipping download payload shape for JSON/TXT/MD exports

## Relationship To Canonical Docs

This blueprint should be read together with:
- `export_multi_agent_architecture.md`
- `export_prompt_contract.md`
- `export_eval_and_drift_gate.md`
- `export_compression_current_architecture.md`
