# Codex Handoff Memo (Claude Reader / Parser)

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-23-codex-handoff-claude-reader.md`

## Reason for condensation

This handoff captured a point-in-time Claude hotfix window that mixed parser changes, reader rendering adjustments, and local working tree state. The public repo keeps only the durable parser and reader outcomes.

## Durable outcomes

1. Claude parser content-root selection was hardened for multi-leaf assistant responses.
2. Reader fallback policy was tightened so Claude rich-content messages prefer AST-backed rendering over false raw-text fallback.
3. Capsule injection noise on Claude was reduced by narrowing the content-script entry path.

## Canonical follow-ups

- `documents/capture_engine/capture_engine_engineering_spec.md`
- `documents/capture_engine/capture_engine_current_architecture.md`
- `documents/reader_pipeline/reader_pipeline_current_architecture.md`
