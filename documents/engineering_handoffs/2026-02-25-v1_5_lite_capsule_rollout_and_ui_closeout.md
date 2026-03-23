# Engineering Handoff - v1.5-lite Capsule Rollout and UI Closeout

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-25-v1_5_lite_capsule_rollout_and_ui_closeout.md`

## Reason for condensation

The original note mixed shipped capsule behavior with rollout inventory, branch-specific UI closeout, and local validation detail. The public repo keeps the stable floating-capsule decisions only.

## Durable outcomes

1. The floating capsule reached a usable v1.5-lite shell with collapsed and expanded modes inside an isolated Shadow DOM container.
2. The drag regression was fixed without re-opening protocol, parser, or storage contracts.
3. Primary rollout expanded across the supported model hosts while preserving a smaller fallback behavior on non-primary hosts.

## Canonical follow-ups

- `documents/floating_capsule/README.md`
- `documents/floating_capsule/v1_5_floating_capsule_engineering_spec.md`
- `documents/floating_capsule/floating_capsule_manual_sampling_and_acceptance.md`
