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

## Active canonical docs

- `model_settings.md`
- `embedding_proxy_contract_v2_0.md`
- `export_multi_agent_architecture.md`
- `export_non_disruptive_engineering_architecture.md`
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