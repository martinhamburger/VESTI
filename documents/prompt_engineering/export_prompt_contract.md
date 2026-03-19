# Export Prompt Contract

Status: Active canonical contract  
Audience: Prompt engineers, runtime engineers

## Purpose

Define the long-term runtime ownership and artifact boundaries for export prompts.

## Runtime source of truth

The only long-term runtime prompt source is:
- `frontend/src/lib/prompts/**`

Documentation in `documents/prompt_engineering/**` defines contracts and governance, but it is not the runtime prompt text authority.

## Target prompt layout

Export prompts should converge to this structure:

- `frontend/src/lib/prompts/export/structurePlanner.ts`
- `frontend/src/lib/prompts/export/evidenceCompactor.ts`
- `frontend/src/lib/prompts/export/compactComposer.ts`
- `frontend/src/lib/prompts/export/summaryComposer.ts`
- `frontend/src/lib/prompts/export/repair.ts`
- `frontend/src/lib/prompts/export/shared.ts`

Supporting domain folders:
- `frontend/src/lib/prompts/explore/`
- `frontend/src/lib/prompts/legacy/insights/`

The prompt registry entrypoint remains:
- `frontend/src/lib/prompts/index.ts`

## Export artifact contract

### `export_e1_structure_planner`
- stage: `E1`
- input: export dataset metadata + ordered messages + mode + locale + profile
- output: planning notes only

### `export_e2_evidence_compactor`
- stage: `E2`
- input: dataset + planning notes
- output: evidence skeleton with reasoning, artifacts, decisions, unresolved work

### `export_e3_compact_composer`
- stage: `E3`
- input: evidence skeleton + profile
- output: compact markdown under the shipping headings

### `export_e3_summary_composer`
- stage: `E3`
- input: evidence skeleton + profile
- output: summary markdown under the shipping headings

### `export_repair`
- stage: repair path after invalid structured output
- input: failed output + expected contract context
- output: repaired markdown candidate

## Contract rules

- `frontend/src/lib/services/**` must not become the long-term home for new prompt text
- service-local prompts already present in runtime services are migration debt
- `frontend/src/lib/prompts/index.ts` should remain a registry, not a mixed domain implementation dump
- export prompt payload types belong in `frontend/src/lib/prompts/types.ts`

## Current migration debt

The following locations still contain long-lived prompt text or repair text that should eventually migrate out:
- `frontend/src/lib/services/insightGenerationService.ts`
- `frontend/src/lib/services/searchService.ts`

This debt is tracked, not blessed.

## Compatibility And Non-Breaking Prompt Evolution (2026-03-18)

Prompt evolution in this cycle must preserve shipping format contracts.

Hard compatibility rules:
- required heading schemas for `Compact` and `Summary` remain unchanged
- prompt updates must prioritize evidence-selection quality, not output-shell redesign
- updates must remain profile-compatible for `kimi_handoff_rich`, `step_flash_concise`, and legacy rollback profiles

Strategy-conditioned guidance is allowed only if all conditions hold:
- no new mandatory heading contract is introduced
- no existing parser/validator assumption is broken
- fallback path behavior remains intact

Non-breaking prompt-upgrade checklist:
- preserve heading schema
- preserve section intent
- preserve fallback operability
- preserve mode-level user expectations

Any export prompt change in this cycle should ship with:
- fixture-backed before/after evaluation evidence
- explicit rollback note
- clear risk statement for false-positive validation failures

Current landed note (2026-03-19):
- `exportCompact.ts` and `exportSummary.ts` now include routing-first strategy guidance
- prompt versions were bumped to `v1.2.1-*` to keep eval and rollback attribution accurate
- headings and fallback contract remain unchanged

## Routing And Template Responsibility Split (2026-03-18)

Contract principle for this cycle:
- routing decides what evidence and state slices must be preserved
- template shell decides how preserved evidence is presented

Required implications:
- a comprehensive state library may be larger than any single output
- per-conversation output selects relevant state slices instead of filling all sections with generic text
- shipping heading contracts remain unchanged while routing quality evolves
