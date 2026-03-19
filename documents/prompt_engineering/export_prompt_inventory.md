# Export Prompt Inventory

Status: Active canonical inventory  
Audience: Prompt engineering, runtime engineering, maintainers

First-read note:
- For expert-facing bridge docs and the phase 1 workflow shape, start with:
  - `export_ai_handoff_architecture.md`
  - `export_knowledge_export_architecture.md`
  - `cross_platform_conversation_normalization_architecture.md`
  - `export_stage_artifact_schemas.md`
  - `export_workflow_runner_spec.md`

## Purpose

Keep a single 1:1 inventory of export runtime entries, prompt artifacts, profiles, and migration debt.

## Current seal status

`compact` distilled handoff is now in a **sealed review/observation** phase:
- it is good enough to evaluate as a downloaded handoff artifact
- soft density warnings may still appear and should be read as review prompts, not as automatic blockers
- proxy token-cap observability is now part of the runtime picture, and online validation depends on the latest `vesti-proxy` deployment
- ordinary users should see minimal export feedback; detailed diagnostics stay in JSON exports and internal logs
- `summary` remains intentionally frozen outside this experiment

## Active shipping inventory

Note:
- Current shipping inventory begins at `E0` because that is the live export runtime boundary.
- In cross-platform scenarios, `E0` depends on upstream normalization and semantic annotation documented in `cross_platform_conversation_normalization_architecture.md`.

| Stage | Runtime entry | Prompt source | Profiles | Output |
| --- | --- | --- | --- | --- |
| `E0 dataset_builder` | `frontend/src/sidepanel/utils/exportConversations.ts` + export dataset helpers | none (deterministic) | n/a | normalized export dataset |
| `E3 compact composer` | `frontend/src/sidepanel/utils/exportCompression.ts` | `frontend/src/lib/prompts/export/compactComposer.ts` | `kimi_handoff_rich`, `step_flash_concise` | compact markdown |
| `E3 summary composer` | `frontend/src/sidepanel/utils/exportCompression.ts` | `frontend/src/lib/prompts/export/summaryComposer.ts` | `kimi_handoff_rich`, `step_flash_concise` | summary markdown |

The current shipped profiles are also a bridge-state compromise:
- `summary` still reuses handoff-oriented profile names
- task intent and model identity are not yet decomposed into separate routing axes
- compatibility re-export stubs still exist at `frontend/src/lib/prompts/exportCompact.ts` and `frontend/src/lib/prompts/exportSummary.ts` to avoid breaking existing imports while ownership is being cleaned up
- dormant `E1` planner prompts now exist as review artifacts, but current runtime still starts at `E3`
- the handoff distillation prototype now exists offline, but it does not alter shipping runtime ownership
- `compactComposer.ts` now carries the distilled-handoff compact line that backs the user-facing `Compact` export path
- the compact distilled-handoff line now adds:
  - completeness guards against dangling cue lines / half-open code blocks
  - type-driven routing that moves `.md` / architecture-document paths toward `Descriptive Anchors`
  - weak-density diagnostics (`absolute floor + soft warning`) to catch obviously over-thin handoffs without forcing a fixed compression ratio
  - dedicated transcript packing (`first 4 turns + Middle Evidence Windows + last 12 turns`) so the LLM sees opening context, latest state, and middle causal evidence instead of a blind hard cut of the full transcript
  - distilled-execution-state framing instead of brevity-oriented compression language
  - six runtime conversation types, adding `generation` for framework / concept / draft creation threads
  - export-scoped `maxTokens` overrides for the distilled handoff line only, without changing global settings
  - a required prose `## State Overview` section that gives the next agent situational awareness before any conditional headings appear
  - middle evidence windows instead of one-line middle signals, so omitted turns still contribute fuller rationale evidence
  - a diagnostic-only deterministic fallback; expert-ready review samples should come from the LLM handoff line, not from deterministic fallback output
  - a sealed-for-review status: current work is focused on artifact quality, minimal user-facing export UX, and expert evaluation rather than on reopening scope
- `summary` is intentionally frozen on the shipping note-schema path for this round; it is not part of the conditional-handoff experiment

## Target phase 1 inventory after decomposition

| Stage | Prompt artifact / implementation | Target runtime location | Phase 1 activation |
| --- | --- | --- | --- |
| `P0` | source normalization rules | upstream ingestion / normalization layer | active |
| `P1` | structured sidecar annotation rules | upstream ingestion / annotation layer | active, heuristic-first |
| `E1 handoff` | `export_e1_handoff_structure_planner` | `frontend/src/lib/prompts/export/e1HandoffStructurePlanner.ts` | `kimi + handoff` (draft only, dormant) |
| `E1 knowledge` | `export_e1_knowledge_structure_planner` | `frontend/src/lib/prompts/export/e1KnowledgeStructurePlanner.ts` | `kimi + knowledge` (draft only, dormant) |
| `E2 handoff` | `export_e2_handoff_evidence_compactor` | `frontend/src/lib/prompts/export/e2HandoffEvidenceCompactor.ts` | `kimi + handoff` (draft only, offline prototype) |
| `E2 knowledge` | `export_e2_knowledge_evidence_compactor` | `frontend/src/lib/prompts/export/e2KnowledgeEvidenceCompactor.ts` | `kimi + knowledge` |
| `E3 compact` | `export_e3_compact_composer` | `frontend/src/lib/prompts/export/compactComposer.ts` | `kimi + handoff` |
| `E3 summary` | `export_e3_summary_composer` | `frontend/src/lib/prompts/export/summaryComposer.ts` | `kimi + knowledge` |
| `repair compact` | `export_compact_repair` | `frontend/src/lib/prompts/export/repairCompact.ts` | on invalid compact output |
| `repair summary` | `export_summary_repair` | `frontend/src/lib/prompts/export/repairSummary.ts` | on invalid summary output |

Notes:
- `E1/E2` remain shared stage slots, but use separate prompt artifacts
- `step` remains a compatibility / fallback line until phase 2 task-specific tuning

## Offline handoff distillation prototype

This prototype is intentionally separate from shipping runtime and exists to run one bounded handoff-only chain end to end.

| Stage | Prototype implementation | Status |
| --- | --- | --- |
| `P1 heuristic_annotator` | `frontend/src/lib/prompts/export/distillPrototype.ts` | active in offline prototype only |
| `E1 handoff planner` | `frontend/src/lib/prompts/export/e1HandoffStructurePlanner.ts` | active in offline prototype only |
| `E2 handoff evidence compactor` | `frontend/src/lib/prompts/export/e2HandoffEvidenceCompactor.ts` | active in offline prototype only |
| `E3 handoff composer from evidence` | `frontend/src/lib/prompts/export/e3HandoffComposerFromEvidence.ts` | active in offline prototype only |
| `repair compact` | inline one-shot repair in `scripts/export-distill-prototype.ts` | active in offline prototype only |
| runner | `scripts/export-distill-prototype.ts` + `frontend/package.json#distill:handoff` | active in offline prototype only |

Prototype guardrails:
- handoff only; `Knowledge Export` is not yet part of the runtime prototype
- low-confidence signals are preserved as hints, not treated as hard facts
- `repair` may run once and never reopens upstream stages

## Adjacent systems kept outside export canonical ownership

### Explore
- runtime owner: `frontend/src/lib/services/searchService.ts`
- status: independent feature line
- reuse policy: patterns only, not document-structure inheritance

### Legacy Insights
- runtime owner: `frontend/src/lib/services/insightGenerationService.ts`
- status: compatibility line, not prompt-engineering mainline
- legacy docs archived under `documents/archive/prompt_engineering/legacy_insights/`

## Migration debt inventory

These files still carry prompt-like runtime text outside the target export folder model:
- `frontend/src/lib/services/insightGenerationService.ts`
- `frontend/src/lib/services/searchService.ts`

They remain visible here so future cleanup does not lose track of them.
