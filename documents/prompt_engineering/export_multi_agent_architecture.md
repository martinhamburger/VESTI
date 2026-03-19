# Export Multi-Agent Architecture

Status: Active canonical architecture note  
Audience: Prompt engineering, runtime engineering, release owner

First-read note:
- For expert-facing bridge docs, start with:
  - `export_ai_handoff_architecture.md`
  - `export_knowledge_export_architecture.md`
  - `cross_platform_conversation_normalization_architecture.md`
  - `export_stage_artifact_schemas.md`
  - `export_workflow_runner_spec.md`

## Purpose

Define the export-centric bounded-chain baseline that supersedes Insights as the main product architecture for prompt work.

This document treats export as the primary bounded workflow and borrows only selected patterns from Explore and legacy Insights.

## Core design

For internal Vesti threads, export can currently be reasoned about from `E0` onward.
For cross-platform ingestion, the effective upstream boundary is:

0. `P0 platform_normalizer`
- deterministic structural normalization across source platforms

1. `P1 semantic_annotator`
- heuristic / semantic labeling that prepares higher-quality downstream state
- outputs a structured sidecar annotation layer

Export itself is modeled as a bounded chain:

2. `E0 dataset_builder`
- deterministic local stage
- input: selected threads, messages, conversation metadata, export mode, locale
- output: normalized export dataset

3. `E1 structure_planner`
- LLM-assisted planning stage
- shared stage slot, but implemented with separate prompt artifacts per mode
- output: planning notes schema family

4. `E2 evidence_compactor`
- LLM-assisted evidence distillation stage
- shared stage slot, but implemented with separate prompt artifacts per mode
- output: evidence skeleton schema family

5. `E3 export_composer`
- LLM-assisted final composition stage
- turns the `E2` skeleton into either `Compact` or `Summary`
- applies task-aware profile routing
- supports bounded repair and deterministic fallback

6. optional `repair`
- single bounded exception path after final contract failure

## Product boundaries

- `Compact` and `Summary` share `E0 -> E2` as stage slots and artifact boundaries, but not as mode-agnostic prompt implementations
- `Compact` and `Summary` use separate prompt artifacts for `E1/E2`
- `Full` remains a deterministic local export and does not enter the agent chain
- the export chain is bounded and single-pass by design
- no open-ended reflective loops or autonomous retry trees are part of the baseline
- Explore's tool taxonomy is not copied into export verbatim

## Model-profile routing

Current shipped profile routing is still a bridge-state abstraction. It mixes:
- model choice
- task/output strategy

The target decomposition separates:
- model axis: `kimi`, `step`, future compatible models
- task axis: `handoff`, `knowledge`

The phase 1 activation strategy is intentionally narrower:
- active tuning target: `kimi + handoff`
- active tuning target: `kimi + knowledge`
- `step` remains a compatibility / fallback line until phase 2 tuning

## Delivery order and known risks

The intended phase 1 order is:
1. stabilize `AI Handoff`
2. expand `Knowledge Export` on top of the validated shared upstream chain

This order is chosen for evaluation quality, not because summary is less important.

Known risks that need explicit ongoing management:
- bounded `repair` turning into a hidden retry loop
- `P1` label-set growth as both task paths demand richer upstream signals
- `P1` drifting from heuristic annotation toward open-ended semantic interpretation

## Relationship to current shipped export compression

Current production export compression remains the live shipping path.
That path is documented in:
- `export_compression_current_architecture.md`

This document defines the forward-looking canonical architecture for the next decomposition phase.
