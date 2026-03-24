# Web Dashboard Documentation Package

Status: Active canonical documentation tree for web surfaces
Audience: Frontend engineers, release owners, QA, future maintainers

## Purpose

`documents/web_dashboard/` is the primary home for web-surface-specific engineering and technical documentation.

This directory is the stable entrypoint for:
- current web dashboard engineering boundaries
- current architecture and data / message flow
- repair history for web-view regressions
- forward technical roadmap for dashboard / library / explore / network
- web-facing schema and reader/web rendering contracts
- web-only cleanup slices that do not rise to a cross-surface governance rule

## Boundaries

### This directory owns

- web dashboard engineering specifications
- current architecture description for the web view
- repair records specific to web-view behavior and regressions
- web-view technical roadmap and dependency boundaries
- surface-specific reader / library / explore / network contracts

### This directory does not replace

- maintainer-local handoff history
- `documents/ui_refactor/`
  - global UI, IA, component-system, and interaction-level contracts
- `documents/capture_engine/`
  - parser / DOM / normalization / semantic extraction / runtime-boundary design
- `documents/ui_runtime/`
  - cross-surface dynamic rendering governance, phase gating, transition discipline, and entity-scoped UI state reset

## Files

- `web_dashboard_engineering_spec.md`
  - canonical engineering spec for dashboard / library / explore / network
- `web_dashboard_current_architecture.md`
  - current implementation baseline, module boundaries, and live system flow
- `web_dashboard_reader_render_contract.md`
  - minimal web-facing schema draft and reader/web render contract draft
- `web_dashboard_architecture_cleanup_checklist.md`
  - prioritized cleanup checklist for reducing dashboard drift and preventing legacy reintroduction
- `web_dashboard_rc8_repairs.md`
  - repair ledger for web-view regressions, starting with the rc8 Network edge fix
- `web_dashboard_technical_roadmap.md`
  - forward roadmap for web-surface engineering evolution

## Relationship with `ui_runtime/`

当问题已经不再是 “web 单独怎么渲染”，而是 “sidepanel / web 何时显示 primary content、secondary metadata、overlay、motion”，应优先进入 `documents/ui_runtime/`。

简单判断：
- web-only contract、模块边界、技术路线图 -> `web_dashboard/`
- 跨 sidepanel / web 的动态渲染纪律 -> `ui_runtime/`

## Recommended Reading Order

1. `web_dashboard_engineering_spec.md`
2. `web_dashboard_current_architecture.md`
3. `../ui_runtime/ui_runtime_dynamic_rendering_contract.md`
4. `web_dashboard_architecture_cleanup_checklist.md`
5. `web_dashboard_reader_render_contract.md`
6. `web_dashboard_rc8_repairs.md`
7. `web_dashboard_technical_roadmap.md`

## Historical source note

Public handoff files are no longer synced into the repository.

Historical inputs that previously informed this directory now live in maintainer-local handoff history. Their durable outcomes have already been promoted into:

- `web_dashboard_current_architecture.md`
- `web_dashboard_architecture_cleanup_checklist.md`
- canonical docs under `documents/capture_engine/` and `documents/ui_refactor/`
