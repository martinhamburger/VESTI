# Prompt Engineering Documentation Package

Status: Active canonical documentation tree for export-centric prompt engineering, proxy contracts, and export eval governance  
Audience: Prompt engineers, runtime engineers, release owners

## Purpose

`documents/prompt_engineering/` is the canonical documentation tree for the export multi-agent direction.

This directory owns:
- export multi-agent architecture
- export prompt artifact contracts
- export eval and drift-governance rules
- model/proxy interface baselines used by export
- prompt inventory and migration debt tracking
- cross-platform normalization assumptions that export depends on before `E0`

This directory does not own:
- runtime event transport contracts
- Explore product flow specifications
- legacy Insights prompt workflow docs
- the runtime prompt text source itself

## Canonical split

Two sources of truth now coexist with different responsibilities:

- Runtime prompt source: `frontend/src/lib/prompts/**`
- Documentation source: `documents/prompt_engineering/**`

Documentation explains contracts, architecture, inventory, and evaluation. Runtime prompt text is no longer canonical in markdown docs.

## First-read package for expert review

For external expert review or fast onboarding on the export direction, start with this package in order:

1. `export_ai_handoff_architecture.md`
2. `export_knowledge_export_architecture.md`
3. `cross_platform_conversation_normalization_architecture.md`
4. `export_stage_artifact_schemas.md`
5. `export_workflow_runner_spec.md`

This package is designed to answer:
- what is currently shipped
- what is deliberately deferred
- how the future bounded chain should be implemented
- where cross-platform ingestion stops and export begins

## Active canonical docs

- `export_ai_handoff_architecture.md`
  - **first-read**
  - **expert-facing bridge doc**
  - single-file entrypoint for current shipped AI Handoff (compact) + future multi-agent direction
- `export_knowledge_export_architecture.md`
  - **first-read**
  - **expert-facing bridge doc**
  - single-file entrypoint for current shipped Knowledge Export (summary) + future multi-agent direction
- `cross_platform_conversation_normalization_architecture.md`
  - **first-read** when the discussion needs the pre-`E0` ingestion boundary
- `export_stage_artifact_schemas.md`
  - canonical schema note for `P1/E0/E1/E2/E3/repair` artifacts
- `export_workflow_runner_spec.md`
  - canonical note for the bounded export pipeline runner
- `model_settings.md`
- `embedding_proxy_contract_v2_0.md`
- `export_multi_agent_architecture.md`
- `export_prompt_contract.md`
- `export_eval_and_drift_gate.md`
- `export_prompt_inventory.md`

## Transition / supporting docs

- `export_compression_current_architecture.md`
  - transition note for the currently shipped export compression path
  - superseded in architecture authority by `export_multi_agent_architecture.md`
- `v2_0_proxy_engineer_handoff.md`
  - operational proxy handoff reference aligned with the active model baseline

## Legacy and archived docs

Legacy Insights-oriented prompt and orchestration docs now live under:
- `documents/archive/prompt_engineering/legacy_insights/`
- `documents/archive/orchestration/legacy_insights/`
- `documents/archive/orchestration/legacy_explore/`

Those files remain valuable as historical references, but they are not canonical for export multi-agent design.