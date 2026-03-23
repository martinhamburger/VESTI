# 2026-03-20 Rich Structure Contract Synthesis

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-03-20-rich-structure-contract-synthesis.md`

## Reason for condensation

The original memo synthesized findings from table, math, and citation samples and projected future schema work. The public repo keeps the durable structure-contract conclusions only.

## Durable outcomes

1. Cross-platform table fidelity requires richer AST structure than flat headers-and-rows extraction.
2. Math fidelity must recover semantic math sources such as TeX annotations instead of trusting rendered text alone.
3. Citation metadata belongs in sidecars and dedicated source rendering, not inside canonical body AST.

## Canonical follow-ups

- `documents/capture_engine/capture_engine_current_architecture.md`
- `documents/prompt_engineering/post_audit_frozen_case_matrix.md`
- `documents/reader_pipeline/reader_pipeline_current_architecture.md`
