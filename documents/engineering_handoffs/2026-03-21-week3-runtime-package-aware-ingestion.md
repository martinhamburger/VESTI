# 2026-03-21 Week 3 Runtime Package-Aware Ingestion

Status: Shipped State
Audience: Capture, prompt, and runtime maintainers

## Summary

Week 3 shipped runtime work on `feature/capture-week2-rollout` was split into:

- `3ed88d6` `feat(prompt): add package-aware prompt ingestion adapter for shipped export runtime`
- `9788db7` `feat(insights): align summary and insight generation with prompt-ready package text`
- `ff509c3` `test(prompt): freeze week3 sample-to-signal mapping and runtime regression checklist`

## What changed

The shipped runtime now has a bounded prompt-ingestion layer between stored messages and prompt assembly.

That layer produces:

- `bodyText`
- `transcriptText`
- `structureSignals`
- `sidecarSummaryLines`
- `artifactRefs`

This boundary is now used by:

- export compression
- conversation summary generation
- insight generation

## Durable boundary

Week 3 solved prompt-ingestion packaging, not full AST-native runtime conversion.

Still deferred:

- full AST-native consumption
- weekly rewrite to the same package-aware depth
- artifact replay and historical repair

## Canonical follow-ups

- `documents/prompt_engineering/week3_prompt_signal_mapping.md`
- `documents/prompt_engineering/week3_runtime_regression_checklist.md`
- `documents/reader_pipeline/reader_pipeline_current_architecture.md`
