# Documents Index

Status: Active documentation navigation entry  
Audience: Engineers, QA, release owners, maintainers

## Purpose

This file is the root index for the repository documentation tree.

The repository now contains multiple long-lived documentation families with different responsibilities. Without a root index, it becomes too easy to confuse:
- canonical engineering specs
- dated handoff notes
- roadmap material
- historical drafts and legacy standalone files

This README is intentionally lightweight.
Its purpose is to answer three questions quickly:
1. where a topic should be documented
2. which directory is the source of truth for that topic
3. how to distinguish canonical docs from historical handoffs

## Directory map

### `capture_engine/`
Owns capture/parser/runtime-adjacent documentation.

Use this for:
- parser strategy
- DOM extraction and normalization
- semantic extraction and AST concerns
- capture debugging playbooks
- capture sampling and acceptance
- parser/runtime refactor roadmaps

Canonical examples:
- `capture_engine/v1_2_capture_governance_spec.md`
- `capture_engine/v1_3_platform_expansion_spec.md`
- `capture_engine/v1_4_capture_engine_hardening_retrospective.md`
- `capture_engine/v1_5_capture_engine_refactor_roadmap.md`

### `web_dashboard/`
Owns web dashboard engineering and technical specifications.

Use this for:
- dashboard / library / explore / network engineering boundaries
- current web architecture and message flow
- web-view-specific repair records
- forward roadmap for web surfaces

Canonical examples:
- `web_dashboard/web_dashboard_engineering_spec.md`
- `web_dashboard/web_dashboard_current_architecture.md`
- `web_dashboard/web_dashboard_rc8_repairs.md`
- `web_dashboard/web_dashboard_technical_roadmap.md`

### `ui_refactor/`
Owns global UI, IA, and component-system specifications.

Use this for:
- sidepanel IA and route contracts
- component-system and token contracts
- UI sampling / acceptance rules
- cross-surface UI refactor specs

### `reader_pipeline/`
Owns reader/data-pipeline docs related to schema, fallback, migration, and pipeline evolution.

### `floating_capsule/`
Owns floating capsule specs, state-machine contracts, and acceptance guidance.

### `orchestration/`
Owns feature-flag and multi-agent orchestration design.

### `prompt_engineering/`
Owns prompt, model-routing, and prompt-UI interaction docs.

### `engineering_handoffs/`
Owns **dated delivery snapshots and handoff context**.

Important rule:
- this directory is valuable historical evidence
- it is **not** the preferred place to discover current canonical specifications
- when a handoff grows into long-lived guidance, that guidance should be promoted into a canonical directory above

## Root-level standalone files

There are still several root-level files under `documents/`.
Treat them as one of three categories:
- historical context
- transition-era notes not yet absorbed into a dedicated directory
- project-wide utility docs

Notable project-wide utility docs include:
- `version_control_plan.md`
- `zip_deploy_guide.md`
- `mvp_guide.md`

If a new document clearly belongs to an existing topic family, prefer placing it inside that family directory instead of adding another root-level file.

## Placement rules

When adding a new document, use these rules:

1. **Parser / DOM / capture / AST / normalization** -> `capture_engine/`
2. **Web dashboard / Library / Explore / Network / dashboard runtime contract** -> `web_dashboard/`
3. **Global UI / IA / component system / interaction contract** -> `ui_refactor/`
4. **Dated delivery snapshot or branch handoff** -> `engineering_handoffs/`
5. **Feature-specific subsystem docs** -> that subsystem directory (`floating_capsule/`, `reader_pipeline/`, etc.)

## Reading order

For current product engineering work, the recommended order is:

1. subsystem canonical directory README (if present)
2. subsystem engineering spec
3. subsystem current architecture / contract docs
4. subsystem repair or roadmap docs
5. only then consult dated handoffs for historical context

## Current canonical entrypoints

- Capture / parser work: `documents/capture_engine/`
- Web dashboard work: `documents/web_dashboard/`
- UI refactor work: `documents/ui_refactor/`

## Naming guidance

Use these patterns when possible:
- canonical spec: `<topic>_engineering_spec.md`
- current baseline: `<topic>_current_architecture.md`
- repair ledger: `<topic>_<release>_repairs.md` or `<topic>_repairs.md`
- roadmap: `<topic>_technical_roadmap.md`
- dated handoff: `YYYY-MM-DD-<topic>-handoff.md`

The goal is not rigid uniformity; the goal is discoverability.
