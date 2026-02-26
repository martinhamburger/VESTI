---
name: vesti-capsule-rollout-hotfix
description: Vesti floating capsule rollout, hotfix, and acceptance workflow. Use when implementing or fixing capsule behavior (drag, host rollout, fallback), aligning capsule UI with sidepanel tokens/typography, or preparing 26-case evidence for release gates.
---

# Vesti Capsule Rollout Hotfix

## Scope

Use this skill to ship capsule changes with low regression risk.
Keep it focused on content-script capsule work, rollout gating, and acceptance evidence.

## Load Order

Read only what is needed:
1. `references/capsule-rollout-checklist.md` for default implementation and release flow.
2. `references/drag-regression-triage.md` when drag behavior is broken or flaky.
3. `assets/templates/capsule-qa-result-template.md` when producing QA evidence.

## Invariants

Preserve these unless the user explicitly asks to change them:
1. Keep message protocol, DB schema, and parser contracts unchanged.
2. Keep fallback host path available (`Open Dock` only) for unsupported/non-primary hosts.
3. Keep drag anti-misfire protections (distance threshold and post-drag click suppression).
4. Keep release evidence complete (core matrix + edge cases + logs/screenshots).

## Workflow

1. Classify request type:
- rollout expansion
- drag regression hotfix
- visual alignment closeout
- release acceptance evidence only

2. Freeze boundaries:
- list in-scope files
- list explicit non-goals
- lock behavior invariants before editing

3. Implement minimal change set:
- touch the smallest file set possible (usually `frontend/src/contents/capsule-ui.ts`)
- avoid mixing visual, behavior, and release metadata into one commit when release slicing is requested

4. Validate:
- run build gates
- run capsule manual checks on required hosts
- collect evidence in the template

5. Decide rollback scope:
- single-host blocker: remove host from rollout list first
- single-feature blocker: revert the smallest capsule commit
- multi-host blocker: roll back to prior RC baseline

## Required Outputs

1. Problem statement and chosen fix scope.
2. Exact files changed and why.
3. Automated gate results.
4. Manual evidence summary with pass/fail and severity.
5. Rollback recommendation if risk remains.

## Commands

Use these standard checks:

```bash
pnpm -C frontend build
pnpm -C frontend eval:prompts --mode=mock --strict
pnpm -C frontend package
```

Use this skill with:
- `documents/floating_capsule/v1_5_floating_capsule_engineering_spec.md`
- `documents/floating_capsule/v1_5_floating_capsule_state_machine_spec.md`
- `documents/floating_capsule/floating_capsule_debugging_playbook.md`
- `documents/floating_capsule/floating_capsule_manual_sampling_and_acceptance.md`
- `documents/engineering_handoffs/2026-02-25-v1_5_lite_capsule_rollout_and_ui_closeout.md`
