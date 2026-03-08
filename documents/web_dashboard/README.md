# Web Dashboard Documentation Package

Status: Active canonical documentation tree for web surfaces  
Audience: Frontend engineers, release owners, QA, future maintainers

## Purpose

`documents/web_dashboard/` is the primary home for **web-view-specific engineering and technical documentation**.

It exists to solve a recurring problem in the repository: web dashboard knowledge has historically been spread across dated handoff notes, UI refactor specs, and capture/runtime documents. That distribution is useful for history, but weak as a long-term source of truth for the web surface itself.

This directory is the stable entrypoint for:
- current web dashboard engineering boundaries
- current architecture and data/message flow
- repair history for web-view regressions
- forward technical roadmap for dashboard / library / explore / network

## Boundaries

### This directory owns
- web dashboard engineering specifications
- current architecture description for the web view
- repair records specific to web-view behavior and regressions
- web-view technical roadmap and dependency boundaries

### This directory does not replace
- `documents/engineering_handoffs/`
  - dated delivery snapshots and handoff context
  - useful as historical evidence, not the canonical spec source
- `documents/ui_refactor/`
  - global UI, IA, component-system, and interaction-level contracts
- `documents/capture_engine/`
  - parser / DOM / normalization / semantic extraction / runtime-boundary design

## Files

- `web_dashboard_engineering_spec.md`
  - canonical engineering spec for dashboard / library / explore / network
- `web_dashboard_current_architecture.md`
  - current implementation baseline, module boundaries, and live system flow
- `web_dashboard_rc8_repairs.md`
  - repair ledger for web-view regressions, starting with the rc8 Network edge fix
- `web_dashboard_technical_roadmap.md`
  - forward roadmap for web-surface engineering evolution

## Recommended reading order

1. `web_dashboard_engineering_spec.md`
2. `web_dashboard_current_architecture.md`
3. `web_dashboard_rc8_repairs.md`
4. `web_dashboard_technical_roadmap.md`

## Primary source inputs

This directory consolidates and supersedes web-specific guidance previously scattered across:
- `documents/engineering_handoffs/2026-02-27-vesti-web-current-architecture-memo.md`
- `documents/engineering_handoffs/2026-02-27-vesti-web-convergence-roadmap.md`
- `documents/engineering_handoffs/2026-03-07-v1_2_0-rc7-yuanbao-web-dashboard-handoff.md`
- `documents/ui_refactor/v1_4_ui_refactor_engineering_spec.md`
- `documents/capture_engine/v1_4_capture_engine_hardening_retrospective.md`
- `documents/capture_engine/v1_5_capture_engine_refactor_roadmap.md`
