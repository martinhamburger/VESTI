# Export Prompt Contract

Status: Active canonical contract  
Audience: Prompt engineers, runtime engineers

First-read note:
- For expert-facing bridge docs and the pre-`E0` boundary, start with:
  - `export_ai_handoff_architecture.md`
  - `export_knowledge_export_architecture.md`
  - `cross_platform_conversation_normalization_architecture.md`
  - `export_stage_artifact_schemas.md`
  - `export_workflow_runner_spec.md`

## Purpose

Define the long-term runtime ownership and artifact boundaries for export prompts.

## Current seal status

For the current review cycle, the `compact` distilled-handoff line is considered **sealed for review and observation**:
- the working goal is now `distilled execution state handoff`
- current quality is considered usable even when a soft density warning is still present
- soft density warnings are treated as human-review signals, not as a reason to reopen scope immediately
- expert review should focus on downloaded handoff artifacts, not on prompt modules in isolation
- `summary` remains frozen on the shipping note-schema path for this round
- proxy-side token-cap behavior now depends on the separately deployed `vesti-proxy`; online validation requires the latest proxy redeploy

## Runtime source of truth

The only long-term runtime prompt source is:
- `frontend/src/lib/prompts/**`

Documentation in `documents/prompt_engineering/**` defines contracts and governance, but it is not the runtime prompt text authority.

## Target prompt layout

Export prompts should converge to this structure:

- `frontend/src/lib/prompts/export/e1HandoffStructurePlanner.ts`
- `frontend/src/lib/prompts/export/e1KnowledgeStructurePlanner.ts`
- `frontend/src/lib/prompts/export/e2HandoffEvidenceCompactor.ts`
- `frontend/src/lib/prompts/export/e2KnowledgeEvidenceCompactor.ts`
- `frontend/src/lib/prompts/export/compactComposer.ts`
- `frontend/src/lib/prompts/export/summaryComposer.ts`
- `frontend/src/lib/prompts/export/repairCompact.ts`
- `frontend/src/lib/prompts/export/repairSummary.ts`
- `frontend/src/lib/prompts/export/shared.ts`

Current shipped `E3` ownership is already partially aligned:
- `frontend/src/lib/prompts/export/compactComposer.ts`
- `frontend/src/lib/prompts/export/summaryComposer.ts`

Dormant `E1` draft artifacts now exist for review and decomposition prep, but they are not yet wired into runtime:
- `frontend/src/lib/prompts/export/e1HandoffStructurePlanner.ts`
- `frontend/src/lib/prompts/export/e1KnowledgeStructurePlanner.ts`

Handoff-only offline prototype artifacts now also exist for distillation work, but they are not runtime-active:
- `frontend/src/lib/prompts/export/e2HandoffEvidenceCompactor.ts`
- `frontend/src/lib/prompts/export/e3HandoffComposerFromEvidence.ts`
- `frontend/src/lib/prompts/export/distillPrototype.ts`
- `scripts/export-distill-prototype.ts`

Legacy compatibility re-export files remain temporarily:
- `frontend/src/lib/prompts/exportCompact.ts`
- `frontend/src/lib/prompts/exportSummary.ts`

Supporting domain folders:
- `frontend/src/lib/prompts/explore/`
- `frontend/src/lib/prompts/legacy/insights/`

The prompt registry entrypoint remains:
- `frontend/src/lib/prompts/index.ts`

## Export artifact contract

The long-term export contract now distinguishes between:
- shared stage slots
- separate prompt artifacts
- mode-specific schema families

`Compact` and `Summary` may share orchestration position and artifact boundaries for `E1/E2`, but they should not be treated as requiring one neutral prompt body.

### `export_e1_handoff_structure_planner`
- stage: `E1`
- mode: `handoff`
- input: export dataset metadata + ordered messages + locale + profile
- output: `HandoffPlanningNotes`
- status: draft prompt artifact only, not runtime-active yet

### `export_e1_knowledge_structure_planner`
- stage: `E1`
- mode: `knowledge`
- input: export dataset metadata + ordered messages + locale + profile
- output: `KnowledgePlanningNotes`
- status: draft prompt artifact only, not runtime-active yet

### `export_e2_handoff_evidence_compactor`
- stage: `E2`
- mode: `handoff`
- input: dataset + `HandoffPlanningNotes`
- output: `HandoffEvidenceSkeleton`
- status: draft prompt artifact, currently used only by the offline handoff distillation prototype

### `export_e2_knowledge_evidence_compactor`
- stage: `E2`
- mode: `knowledge`
- input: dataset + `KnowledgePlanningNotes`
- output: `KnowledgeEvidenceSkeleton`

### `export_e3_compact_composer`
- stage: `E3`
- mode: `handoff`
- input: `CompactComposerInput`
- output: compact markdown under the shipping headings
- current shipping runtime still starts here from raw transcript payloads
- note: the same prompt file now carries the distilled-handoff compact line that now backs the user-facing `Compact` export path by default
- note: the distilled line carries explicit completeness guards, type-driven routing for doc paths versus reusable technical evidence, and runtime weak-density diagnostics (`absolute floor + soft warning`) so downloaded handoffs can be reviewed as artifacts instead of as prompt modules
- note: the distilled line is framed as distilled execution state, not brevity-oriented compression
- note: the distilled runtime taxonomy now accepts six labels: `decision`, `debugging`, `architecture_tradeoff`, `explanation_teaching`, `process_agreement`, `generation`
- note: distilled runtime now uses dedicated transcript packing (`first 4 turns + Middle Evidence Windows + last 12 turns`) instead of blind full-transcript truncation
- note: distilled runtime also applies export-scoped `maxTokens` overrides so long-thread handoffs are not limited by the global default token ceiling
- note: distilled runtime now requires a prose `## State Overview` section immediately after `StartedAt` and `Conversation Type`; this section must explain what the thread is about, what problem it is resolving, what state now holds, and what the next agent inherits
- note: distilled transcript packing now upgrades the middle block from short signal lines to grounded evidence windows so dense rationale survives omission
- note: deterministic handoff fallback is diagnostic-only; expert-facing sample readiness currently requires the LLM-generated handoff line, not the deterministic fallback body

### `export_e3_summary_composer`
- stage: `E3`
- mode: `knowledge`
- input: `SummaryComposerInput`
- output: summary markdown under the shipping headings
- note: `summary` remains on the shipping note-schema path for now and is not part of the conditional-handoff experiment

### `export_e3_handoff_composer_from_evidence`
- stage: `E3`
- mode: `handoff`
- input: `CompactComposerInput` backed by `HandoffEvidenceSkeleton`
- output: compact markdown under the shipping headings
- status: offline-only prototype composer used to validate that `E3` can consume evidence instead of raw transcript

### `export_compact_repair`
- stage: repair path after invalid structured compact output
- mode: `handoff`
- input: `RepairInput`
- output: repaired compact markdown candidate

### `export_summary_repair`
- stage: repair path after invalid structured summary output
- mode: `knowledge`
- input: `RepairInput`
- output: repaired summary markdown candidate

## Upstream dependency before `E0`

For cross-platform conversation ingestion, export depends on an upstream boundary before `E0`:
- `P0 platform_normalizer`
- `P1 semantic_annotator`

`P1` outputs a structured sidecar annotation layer. Those stages are documented in:
- `cross_platform_conversation_normalization_architecture.md`
- `export_stage_artifact_schemas.md`

They are not part of the export composer contract itself, but they materially affect the quality ceiling of `E0` onward.

## Profile decomposition direction

Current shipped profile names are bridge-state identifiers:
- `kimi_handoff_rich`
- `step_flash_concise`

They are sufficient for the current shipped path, but they do not represent the long-term contract cleanly because they mix:
- model identity
- task/output intent

The target direction is a two-axis decomposition:
- model axis: `kimi`, `step`, future compatible models
- task axis: `handoff`, `knowledge`

Phase 1 activation is intentionally narrower:
- `kimi + handoff`
- `kimi + knowledge`

## Contract rules

- `frontend/src/lib/services/**` must not become the long-term home for new prompt text
- service-local prompts already present in runtime services are migration debt
- `frontend/src/lib/prompts/index.ts` should remain a registry, not a mixed domain implementation dump
- export prompt payload types belong in `frontend/src/lib/prompts/types.ts`
- `E1/E2` output contracts must remain structured artifacts, not final markdown
- the current shipping runtime still begins at `E3`; dormant and prototype artifacts must be labeled clearly until they are actually wired into runtime
- `summary` remains frozen on the shipping note-schema path for this round; conditional-structure work is limited to `compact/handoff`
- downloaded distilled handoffs must preserve section completeness: no dangling cue lines, no half-open code blocks, and no empty conditional sections after a heading is opened
- downloaded distilled handoffs must include a prose-like `## State Overview`; bullet-only overviews or empty shell paragraphs are invalid
- distilled diagnostics must distinguish failed LLM attempt lengths from the final delivered artifact length so notice text does not conflate invalid LLM output with the locally delivered fallback body
- user-facing export feedback should stay product-oriented; technical summaries remain available in JSON exports, diagnostics, and logs, but are no longer part of the default export-panel callout

## Offline distillation prototype

The current handoff-only distillation prototype exists to answer one question: can `P1 -> E1 -> E2 -> E3` run once as a bounded offline chain and still satisfy the live compact headings contract?

Prototype scope:
- handoff only
- TypeScript / Node runner under `scripts/export-distill-prototype.ts`
- heuristic `P1`, not LLM-assisted annotation
- one-shot repair only, never recursive

Prototype non-goals:
- it does not replace the shipping `exportCompression.ts` path
- it does not activate `Knowledge Export` runtime decomposition yet
- it does not reopen the live payload contract or exact headings

## Current migration debt

The following locations still contain long-lived prompt text or repair text that should eventually migrate out:
- `frontend/src/lib/services/insightGenerationService.ts`
- `frontend/src/lib/services/searchService.ts`

This debt is tracked, not blessed.
