# Vesti UI Refactor Spec Package

Status: Active canonical UI refactor directory.
Owner: Frontend + UI Design + QA

## What this directory covers

This directory stores canonical UI interaction, state-machine, and UX refactor specifications for the extension surfaces owned by the frontend.

It is the correct home for:
- Threads / Reader interaction contracts
- Sidepanel UI state topology
- Feature-specific UI refactor specs and state-machine contracts
- UI debugging and manual acceptance guidance

It is not the correct home for:
- capture/parser DOM normalization strategy (`documents/capture_engine/`)
- web dashboard runtime/productization specs (`documents/web_dashboard/`)
- floating capsule feature specs (`documents/floating_capsule/`)

## Active topic-based canonical entries

- `threads_search_engineering_spec.md`
  - Canonical engineering spec for Threads search contract upgrade, list highlight, Reader navigation, and phased delivery boundaries.
- `threads_search_state_machine_contract.md`
  - Canonical state topology and data contract for lifted `SearchSession`, lightweight offscreen summaries, and Reader occurrence navigation.

## Supporting UI refactor references

- `ui_refactor_debugging_playbook.md`
  - UI refactor debugging and regression workflow shared by engineering and QA.
- `ui_refactor_manual_sampling_and_acceptance.md`
  - Manual sampling matrix, evidence expectations, and Go/No-Go gates.

## Existing versioned spec tracks

- `v1_4_information_architecture_contract.md`
  - v1.4 information architecture contract for four-zone boundaries, naming, and route semantics.
- `v1_4_settings_information_density_contract.md`
  - v1.4 Settings information density contract.
- `v1_4_ui_refactor_engineering_spec.md`
  - v1.4 global UI refactor engineering spec.
- `v1_4_ui_refactor_component_system_spec.md`
  - v1.4 component system and visual token contract.
- `v1_8_1_insights_ui_refactor_spec.md`
  - v1.8.1 Insights refactor specification.
- `v1_8_1_insights_state_machine_contract.md`
  - v1.8.1 Insights state machine contract.
- `v1_8_1_insights_manual_sampling_and_acceptance.md`
  - v1.8.1 Insights manual sampling and acceptance guide.
- `v1_8_2_thread_summary_ui_refactor_spec.md`
  - v1.8.2 Thread Summary full-stack UI refactor spec.
- `v1_8_2_thread_summary_state_machine_contract.md`
  - v1.8.2 Thread Summary state machine contract.
- `v1_8_2_thread_summary_manual_sampling_and_acceptance.md`
  - v1.8.2 Thread Summary manual sampling and acceptance guide.

## Naming and version policy

- Release versions continue to use `vX.Y.Z` and `vX.Y.Z-rc.N`.
- New canonical UI refactor documents should prefer topic-based filenames over new pseudo-release prefixes.
- Existing `v1_4_*`, `v1_8_1_*`, and `v1_8_2_*` files remain as historical and still-valid versioned materials; they are not renamed in this pass.
- New Threads search / Reader navigation docs intentionally use `threads_search_*` topic-based filenames rather than a new `v1.8.x` prefix.
- Cross-domain parser/capture dependencies must reference `documents/capture_engine/`.
- IA decisions in the global UI track still use `v1_4_information_architecture_contract.md` as source of truth.
- Settings density/support semantics in the global UI track still use `v1_4_settings_information_density_contract.md` as source of truth.
- Extension sans fonts remain local-only in `frontend/public/fonts/*`, built via `scripts/build-ui-fonts.ps1`.
