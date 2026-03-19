# 2026-03-18 Export Distillation Prototype

Status: Active engineering note  
Audience: Prompt engineering, runtime engineering

## Purpose

Record the first offline prototype that turns `AI Handoff` from a spec-only decomposition into a runnable bounded chain.

The prototype answers one narrow question:
- can `P1 -> E1 -> E2 -> E3` run once for handoff and still satisfy the live compact headings contract?

It does **not** change the shipping export runtime.

## Scope

In scope:
- handoff only
- TypeScript / Node prototype runner
- heuristic `P1` annotation
- structured `E1` JSON planning notes
- structured `E2` evidence skeleton
- prototype-only `E3` composer that consumes evidence instead of raw transcript
- one-shot repair after invalid `E3` output

Out of scope:
- shipping runtime activation
- `Knowledge Export` prototype runtime
- recursive repair
- `P1` LLM-assisted annotation
- continuation-agent eval

## Files

Prototype prompts and helpers:
- `frontend/src/lib/prompts/export/e1HandoffStructurePlanner.ts`
- `frontend/src/lib/prompts/export/e2HandoffEvidenceCompactor.ts`
- `frontend/src/lib/prompts/export/e3HandoffComposerFromEvidence.ts`
- `frontend/src/lib/prompts/export/distillPrototype.ts`

Runner:
- `scripts/export-distill-prototype.ts`
- `scripts/tsconfig.distill.json`
- `frontend/package.json` -> `distill:handoff`

## Commands

Mock:
- `pnpm -C frontend distill:handoff --mode=mock`
- `pnpm -C frontend distill:handoff --mode=mock --case=export-005`

Live:
- `pnpm -C frontend distill:handoff --mode=live --case=export-005`

Live mode reuses:
- `VESTI_EVAL_API_KEY`
- `VESTI_EVAL_MODEL_ID`
- `VESTI_EVAL_BASE_URL`

## Current behavior

`P1` first-pass labels:
- `artifact_marker`
- `confirmed_decision`
- `unresolved_cue`
- `core_question_cue`
- `topic_shift`

Low-confidence policy:
- weak signals are preserved as `low`
- `E1` may treat them as hints, not as hard facts

Prototype output path:
- `.tmp/distill/<case-id>/<timestamp>-<mode>/`

Per-case outputs:
- `e1-planning.json`
- `e2-evidence.json`
- `final.md`
- `report.json`

## Acceptance focus

The prototype is considered useful when it can show:
- `E1` outputs valid JSON planning notes, not markdown
- `E2` outputs a valid handoff evidence skeleton
- `E3` still satisfies the exact shipping compact headings
- one-shot repair does not recurse or reopen upstream stages
- compact output preserves decisions, rationale, artifacts, and unresolved continuation signals

## Known limits

- `summary` remains on the shipping `E3` line only
- `P1` label taxonomy is intentionally small and will need later governance
- quality gains are still bounded by heuristic `P1` and dormant `Knowledge Export`
- this prototype proves layered state handling, not full continuation quality
