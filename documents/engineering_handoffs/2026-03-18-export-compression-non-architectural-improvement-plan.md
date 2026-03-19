# Export Compression Non-Architectural Improvement Plan (2026-03-18)

Status: Active implementation plan
Audience: Prompt engineering, runtime engineering, QA, release owner

## Scope And Constraints

This plan prioritizes compression-quality improvement with non-disruptive changes only.

Hard constraints:
- no architecture rewrite
- no stage-boundary change for `E0 -> E1 -> E2 -> E3`
- no new orchestrator layer
- no output protocol break for shipping `Compact` and `Summary`
- no behavior that removes deterministic rollback capability

Canonical engineering blueprint:
- `documents/prompt_engineering/export_non_disruptive_engineering_architecture.md`

## Current Baseline

Current shipping path remains unchanged:
- `ExportDialog -> exportConversations -> compressExportDataset -> compressWithCurrentLlmSettings -> callInference`

Quality risks identified for current baseline:
- pseudo-structure under fixed headings
- incomplete evidence retention for certain dialogue shapes
- limited visibility into coverage quality before fallback

## Allowed And Disallowed Changes

Allowed changes in this plan:
- strategy enrichment inside existing `E1` semantics
- evidence selection refinement and quality scoring inside existing `E2` semantics
- prompt wording improvements under existing heading contracts
- fallback diagnostics enrichment
- feature-flagged rollout controls (default off)

Disallowed changes in this plan:
- changing stage ownership
- changing pipeline control flow
- adding reflective loops or autonomous retry trees
- introducing new mandatory heading schema

## Iteration Plan

### Iteration 1: Documentation And Offline Baseline

Goals:
- finalize contract-level docs and review gates
- establish dialogue-shape buckets and baseline fixtures
- run strict mock eval and collect baseline report

Deliverables:
- updated governance docs in `documents/prompt_engineering/`
- bucketed fixture notes for export quality review
- baseline metrics report for comparison

### Iteration 2: Observation-Only Quality Scoring

Goals:
- add non-blocking quality scoring (MSS coverage, artifact retention, groundedness, pseudo-structure)
- keep runtime behavior unchanged for user-visible outputs

Deliverables:
- score-only diagnostics in logs/notice context
- no hard rejection introduced in this iteration

### Iteration 3: Guarded Fallback Linkage

Goals:
- enable threshold-driven fallback linkage under feature flag
- retain existing fallback taxonomy and compatibility contracts

Deliverables:
- feature flag for guarded fallback activation
- rollback switch verified in release checklist

### Iteration 4: Bilingual And Long-Thread Hardening

Goals:
- improve robustness for Chinese-English mixed threads
- validate behavior on long threads while preserving non-architectural constraints

Deliverables:
- bilingual cue refinements and quality validation notes
- long-thread sampling report

## Quality Metrics (Non-Disruptive Gate)

Primary metrics:
- MSS coverage per dialogue shape
- artifact preservation rate (code/command/path)
- grounded section density
- pseudo-structure rate

Review expectation:
- compare before/after by dialogue bucket
- report fallback frequency and reason-code distribution

## Verification And Rollback

Verification checklist:
1. preserve current heading contracts for `Compact` and `Summary`
2. preserve current invalid-reason code taxonomy
3. preserve deterministic `Full` export behavior
4. verify feature flag off-state equals previous behavior
5. verify strict eval command passes before merge

Rollback policy:
- disable new feature flag(s) to return to prior runtime behavior
- keep previous prompt profiles available for immediate fallback
- block release if compatibility checklist is not satisfied

## Open Risks

- score thresholds may be too strict on sparse threads at first pass
- bilingual cue heuristics may underperform on mixed jargon conversations
- observation metrics may drift without periodic fixture refresh

Mitigation:
- start with conservative thresholds
- require bucket-based manual spot checks
- run scheduled fixture refresh in prompt governance cadence

## Decision Log

- 2026-03-18: Approved documentation-first implementation order.
- 2026-03-18: Approved non-architectural, non-breaking scope.
- 2026-03-18: Approved staged rollout with explicit rollback-first principle.

## Landing Note (2026-03-19)

Current implementation landed a constrained subset of Iteration 2:
- strategy-signal extraction and dialogue-shape routing inside `exportCompression.ts`
- strategy-conditioned guidance injected into `exportCompact.ts` and `exportSummary.ts`
- observe-only quality scoring for MSS coverage, artifact preservation, groundedness, and pseudo-structure
- strategy-aware local fallback extraction budgets and richer internal diagnostics/logging

Explicitly not landed in the shipping contract:
- no new user-visible heading schema
- no new invalid-reason taxonomy
- no guarded fallback activation
- no LLM strategy review activation
- no JSON/TXT/MD download schema expansion for observe-mode diagnostics

Verification completed for this landing:
- `pnpm -C frontend exec tsc --noEmit`
- `pnpm -C frontend run eval:prompts`
- `pnpm -C frontend build`
