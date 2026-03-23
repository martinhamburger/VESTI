# 2026-03-13 pnpm Build Scripts Warning Memo

Status: Public thin handoff  
Local original: `documents/_local/engineering_handoffs/2026-03-13-pnpm-build-scripts-warning-memo.md`

## Reason for local-only demotion

The original memo described local dependency approval posture and operator build decisions that are not durable public project spec.

## Durable outcomes

1. Ignored dependency build-script warnings are advisory signals, not automatic build failures.
2. `pnpm approve-builds` and `pnpm rebuild` remain explicit maintainer tools when local environments need full dependency activation.
3. Public build documentation should describe the supported workflow without leaking machine-specific install traces.

## Canonical follow-ups

- `documents/version_control_plan.md`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`