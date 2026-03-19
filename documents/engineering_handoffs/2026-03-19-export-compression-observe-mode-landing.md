# Export Compression Observe-Mode Landing (2026-03-19)

Status: Landed implementation snapshot  
Audience: Runtime engineering, prompt engineering, QA, release owner

## Purpose

Record exactly what shipped in the current export-compression hardening pass, what remained intentionally off, and how the final scope was closed before commit.

## What Changed

Runtime changes:
- added lightweight strategy-signal extraction in `frontend/src/sidepanel/utils/exportCompression.ts`
- added dialogue-shape routing (`debug_troubleshooting`, `architecture_tradeoff`, `learning_explanation`, `process_alignment`, `decision_support`, `general`)
- added route weights, MSS coverage scoring, groundedness scoring, pseudo-structure scoring, and gate recommendation calculation
- added strategy-aware fallback extraction budgets so local fallback retains different evidence depending on dialogue shape
- added internal observation logging and batch-level observation summary logging

Prompt changes:
- added routing-first strategy guidance blocks to `frontend/src/lib/prompts/exportCompact.ts`
- added routing-first strategy guidance blocks to `frontend/src/lib/prompts/exportSummary.ts`
- preserved existing `Compact` and `Summary` heading contracts
- bumped export prompt versions to `v1.2.1-export-compact-kimi-step-profiled` and `v1.2.1-export-summary-kimi-step-profiled`

Documentation changes:
- added non-disruptive architecture and gate docs under `documents/prompt_engineering/`
- kept the planning handoff for the 2026-03-18 non-architectural scope
- kept the supporting research note in `deep-research-report.md`

## What Did Not Change

These boundaries were intentionally preserved:
- no architecture rewrite for `ExportDialog -> exportConversations -> compressExportDataset -> compressWithCurrentLlmSettings -> callInference`
- no heading-schema change for `Compact` or `Summary`
- no invalid-reason code taxonomy change
- no deterministic `Full` export behavior change
- no observe-mode diagnostic fields added to user download payloads

## Intentionally Present But Disabled

The codebase now contains forward seams that remain off by default:
- guarded fallback linkage remains disabled
- LLM strategy review remains disabled
- observe mode computes recommendation data internally but does not change download schema

Reason:
- this keeps the implementation aligned with the non-breaking scope while still landing the routing/scoring substrate needed for later rollout

## Contract Decision

Observe-mode diagnostics are internal in this landing.

That means:
- logs may include quality and routing observations
- in-memory compression results may carry diagnostic fields for internal use
- exported JSON/TXT/MD downloads do not expose a new observe-mode schema surface in this commit

## Verification

Completed before commit:
- `pnpm -C frontend exec tsc --noEmit`
- `pnpm -C frontend run eval:prompts`
- `pnpm -C frontend build`

Observed result:
- TypeScript check passed
- prompt eval gate passed
- frontend build passed

## Follow-Up Candidates

Future work can build on this landing without reopening the contract boundary:
- promote guarded fallback to a real feature flag
- enable LLM strategy review only behind rollout control
- add fixture-level bucket reports for dialogue-shape slices
- retune thresholds after bilingual and long-thread sampling
