# Vesti Engine Technical Memo: Doubao CoT Segmentation Hardening

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-23-doubao-cot-segmentation.md`

## Reason for condensation

This memo recorded detailed DOM evidence, parser experiments, and branch-local implementation notes for a Doubao capture regression window. The public version keeps the reusable parser outcomes only.

## Durable outcomes

1. Doubao parsing now uses role-first candidate gating instead of broad message selection.
2. AI extraction is treated as segmented content, so reasoning and final answer branches can be merged into one canonical assistant turn.
3. Pagination, search widgets, and other container noise should stay outside canonical message text.

## Canonical follow-ups

- `documents/capture_engine/capture_engine_engineering_spec.md`
- `documents/capture_engine/capture_engine_current_architecture.md`
- `documents/capture_engine/capture_engine_operational_playbook.md`
