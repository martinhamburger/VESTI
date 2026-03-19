# Export Multi-Agent Architecture

Status: Active canonical architecture note  
Audience: Prompt engineering, runtime engineering, release owner

## Purpose

Define the export-centric multi-agent baseline that supersedes Insights as the main product architecture for prompt work.

This document treats export as the primary bounded agent workflow and borrows only selected patterns from Explore and legacy Insights.

## Core design

Export is modeled as a bounded four-stage chain:

1. `E0 dataset_builder`
- deterministic local stage
- input: selected threads, messages, conversation metadata, export mode, locale
- output: normalized export dataset

2. `E1 structure_planner`
- LLM-assisted planning stage
- identifies task emphasis such as handoff density, artifact density, unresolved density, and summary focus
- output: compact planning notes for downstream composition

3. `E2 evidence_compactor`
- LLM-assisted evidence distillation stage
- extracts reasoning chain, constraints, decisions, artifacts, and unresolved work
- output: intermediate evidence skeleton

4. `E3 export_composer`
- LLM-assisted final composition stage
- turns the E2 skeleton into either `Compact` or `Summary`
- applies model-profile-specific prompt profile selection
- supports repair and deterministic fallback

## Product boundaries

- `Compact` and `Summary` share `E0 -> E2` and diverge only at `E3`
- `Full` remains a deterministic local export and does not enter the agent chain
- the export chain is bounded and single-pass by design
- no open-ended reflective loops or autonomous retry trees are part of the baseline
- Explore's tool taxonomy is not copied into export verbatim

## Borrowed patterns

### Borrowed from legacy Insights
- compaction-style evidence distillation as a distinct intermediate stage
- explicit fallback-aware pipeline thinking
- structured downstream composition rather than one-shot summary generation

### Borrowed from Explore
- bounded chain semantics
- visible tool / stage trace potential
- context compiler mindset for intermediate artifacts

### Explicitly not borrowed
- Insights as the product mother-architecture
- Explore session model and UI structure
- long-lived generic agent taxonomies shared by every feature

## Model-profile routing

Export composition remains profile-aware:
- `kimi_handoff_rich`
- `step_flash_concise`
- legacy compatibility profiles may remain for rollback, but do not define the active architecture

Model profile affects:
- prompt budget
- response-format strategy
- composer prompt profile
- repair/fallback expectations

## Relationship to current shipped export compression

Current production export compression remains the live shipping path.

That path is documented in:
- `export_compression_current_architecture.md`

This document is the forward-looking canonical architecture for the next cleanup and decomposition phase.

Implementation blueprint for non-disruptive execution is documented in:
- `export_non_disruptive_engineering_architecture.md`

## Non-Architectural Improvement Guardrails (2026-03-18)

This iteration is constrained to non-architectural improvements only.

Hard constraints:
- no stage-boundary changes for the bounded chain `E0 -> E1 -> E2 -> E3`
- no new orchestrator layer
- no autonomous loop, retry tree, or reflective extra stage
- `Compact` and `Summary` still diverge only at `E3`
- `Full` remains deterministic local export outside the agent chain

Allowed in this iteration:
- E1 strategy enrichment within existing stage semantics
- E2 evidence selection and validation refinement within existing stage semantics
- prompt wording refinement under existing output contracts
- fallback diagnostics and observability enrichment

Explicitly disallowed in this iteration:
- changing runtime stage ownership
- changing pipeline control flow
- introducing breaking output-protocol changes