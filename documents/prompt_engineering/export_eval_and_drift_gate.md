# Export Eval And Drift Gate

Status: Active canonical governance note  
Audience: Prompt engineering, QA, CI owner

## Purpose

Define the export-specific evaluation and drift-governance baseline for the export multi-agent direction.

## Required local gate

Mandatory command before merging export prompt or export-compression changes:
- `pnpm -C frontend eval:prompts --mode=mock --strict`

This remains the first-line local gate.

## Export fixture set

Export fixtures live under:
- `eval/gold/export/`

Current baseline cases must continue to cover:
- code-heavy engineering handoff
- research / note-taking summary
- sparse short thread
- Chinese configuration / debugging thread

## Export-specific validation focus

Export regression review must explicitly inspect:
- required heading preservation
- grounded section density
- artifact preservation for code / commands / paths
- fallback frequency and fallback reason codes

## Invalid-reason codes

The export baseline recognizes these explicit invalid-output reason codes:
- `export_output_too_short`
- `export_missing_required_headings`
- `export_grounded_sections_insufficient`
- `export_artifact_signal_missing`

These codes must remain visible in logs, reports, and export-quality debugging.

## Governance rules

- export prompt changes must be traceable to a named runtime artifact in `frontend/src/lib/prompts/**`
- new export prompt paths must be added to `export_prompt_inventory.md`
- new service-local export prompt strings are not allowed
- export drift discussion should no longer rely on legacy Insights-only prompt docs

## Relationship to repo-wide thresholds

Repo-wide eval thresholds remain anchored in:
- `eval/rubrics/thresholds.json`

This document does not redefine global scoring thresholds. It adds export-specific review obligations on top of the shared gate.

## Non-Disruptive Quality Gates For Compression (2026-03-18)

These gates improve compression quality without changing architecture or shipping output protocol.

Additional export-specific review metrics:
- minimum sufficient statistics (MSS) coverage per dialogue shape
- artifact preservation rate for code, commands, and file paths
- grounded section density by mode
- pseudo-structure rate (sections present but evidentially empty)

Recommended dialogue-shape buckets:
- debugging and troubleshooting
- architecture tradeoff discussion
- learning and explanation
- process alignment and collaboration rules
- decision support

Rollout policy:
- Phase 1: score-only observation mode
- Phase 2: soft warning with fallback recommendation
- Phase 3: guarded fallback linkage under feature flag

Compatibility constraints in this cycle:
- shipping heading contracts for `Compact` and `Summary` remain unchanged
- current invalid-reason code taxonomy remains unchanged

## Current Observe-Mode Landing Rule (2026-03-19)

For the current landed implementation:
- observe-mode metrics are allowed in logs and internal runtime state
- observe-mode metrics are not part of the shipping JSON/TXT/MD download contract in this commit
- guarded fallback recommendation may be computed internally, but activation remains off by default
