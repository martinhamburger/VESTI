# 2026-03-20 Claude App Shell Metadata Interceptor

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-03-20-claude-app-shell-metadata-interceptor.md`

## Reason for condensation

This memo captured a title-provenance investigation on Claude, including sample-specific diagnosis and stage-ordering notes. The public repo keeps the durable metadata-governance rule only.

## Durable outcomes

1. Claude conversation title extraction must be treated as an app-shell stage, not as a side effect of message parsing.
2. App-shell metadata should run before message-stream parsing so page-level titles do not get overwritten by message payload structure.
3. Generic `h1` or largest-text heuristics are fallback-only after app-shell selectors fail.

## Canonical follow-ups

- `documents/capture_engine/capture_engine_current_architecture.md`
- `documents/capture_engine/capture_engine_engineering_spec.md`
- `documents/prompt_engineering/post_audit_frozen_case_matrix.md`
