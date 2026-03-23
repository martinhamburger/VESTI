# 2026-02-27 vesti-web Current Architecture Memo

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-27-vesti-web-current-architecture-memo.md`

## Reason for condensation

This memo documented a point-in-time architecture readout for `vesti-web`, including evidence notes and local references that do not need to stay in the public handoff surface.

## Durable outcomes

1. `vesti-web` is a Next.js shell for the dashboard, not the primary implementation of the knowledge engine.
2. Runtime data and actions continue to depend on extension-side capabilities exposed through shared messaging.
3. Legacy prototype tabs inside `vesti-web/components/*` are historical residue rather than the current source of truth.

## Canonical follow-ups

- `documents/web_dashboard/web_dashboard_current_architecture.md`
- `documents/web_dashboard/web_dashboard_engineering_spec.md`
- `documents/web_dashboard/README.md`
