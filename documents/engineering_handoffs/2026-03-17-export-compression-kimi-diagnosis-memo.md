# Export Compression Kimi Diagnosis Memo

Date: 2026-03-17
Branch: `feat/threads-select-batch-base`
Related PR: `#50`

## Summary

Current export compression failures are no longer blocked by proxy auth or model routing.

The active issue has moved to prompt/output contract stability:

- `Settings > Model Access > Test` succeeds
- export compression is routing through `Current LLM settings`
- the active model is `moonshotai/Kimi-K2.5`
- the active export profile is `kimi_handoff_rich`
- failures occur after LLM text returns, during export validation

This means the current blocker is prompt-engineering/runtime-output quality, not infra.

## Latest Observed Failure

Observed on real-thread export:

- mode: `compact`
- route: `Current LLM settings`
- model: `moonshotai/Kimi-K2.5`
- profile: `kimi_handoff_rich`
- primary invalid reason: `export_output_too_short`
- fallback invalid reason: `export_missing_required_headings`

Representative user-facing feedback:

> Local fallback used for all selected threads
>
> LLM returned text, but the required markdown sections were missing. Validation: `export_missing_required_headings`.
>
> Compression route: Current LLM settings · Model: `moonshotai/Kimi-K2.5` · Profile: `kimi_handoff_rich` · Primary: `export_output_too_short` · Fallback: `export_missing_required_headings`

Interpretation:

- the primary prompt did produce text, but it was too short
- the fallback prompt also produced text, but it did not include the exact shipping headings
- the system therefore fell back to deterministic local formatting

## Non-Causes Ruled Out

The following have effectively been ruled out for this failure class:

- proxy auth / `401` issues
- missing ModelScope token
- model switch not propagating
- export route misconfiguration
- time-semantics contract rollout as the direct cause

Time semantics may influence prompt context indirectly, but they do not explain the concrete validation failure:

- `export_output_too_short`
- `export_missing_required_headings`

Those are prompt/output-shape issues.

## Why This Matters

The important system state is now:

- infra path: healthy enough
- model selection: healthy enough
- prompt profile routing: healthy enough
- export validator: working as designed
- remaining issue: prompt/profile does not yet reliably force Kimi into the exact markdown schema required by shipping export

This is a good failure mode for the next contributor because the problem space is now narrow and local.

## Current Diagnostic Support

The branch now surfaces enough information in export feedback to debug without opening DevTools:

- compression route
- model id
- export prompt profile
- primary invalid reason
- fallback invalid reason

Relevant runtime area:

- `frontend/src/sidepanel/utils/exportCompression.ts`

## Recommended Next Step

Treat the next round as prompt-engineering work, not infra work.

Priority order:

1. capture one or two raw Kimi outputs for `compact` and `summary`
2. tighten `exportCompact` / `exportSummary` prompt wording to force exact headings
3. tighten fallback prompts first before loosening validators
4. only revisit validator strictness if the model keeps producing high-value output with minor schema drift

Do not spend the next round on:

- proxy auth
- service token behavior
- time contract rollout
- export route selection

Those are not the current bottleneck.
