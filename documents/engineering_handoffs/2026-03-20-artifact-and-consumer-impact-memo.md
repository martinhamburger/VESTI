# 2026-03-20 Artifact And Consumer Impact Memo

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-03-20-artifact-and-consumer-impact-memo.md`

## Reason for condensation

The original memo combined sample-specific artifact diagnosis with downstream consumer rollout notes. The public repo keeps only the durable artifact contract boundary.

## Durable outcomes

1. Claude artifact content is treated as a message sidecar, not as part of canonical body text or AST body nodes.
2. Artifact capture preserves bounded rich fields such as `captureMode`, `renderDimensions`, `plainText`, `markdownSnapshot`, and `normalizedHtmlSnapshot` when available.
3. Reader, web, and export consumers should become package-aware before insights and compression consumers widen their package dependency.

## Canonical follow-ups

- `documents/reader_pipeline/reader_pipeline_current_architecture.md`
- `documents/web_dashboard/web_dashboard_reader_render_contract.md`
- `documents/prompt_engineering/export_stage_artifact_schemas.md`
