---
name: vesti-release-rc-pr-tag
description: Vesti RC release workflow for branch strategy, batch commits, changelog and version alignment, PR merge, and annotated tag publishing. Use when preparing rc or patch release lines, splitting feature and metadata commits, and verifying tag to package version consistency.
---

# Vesti Release Rc Pr Tag

## Scope

Use this skill to execute predictable release closure without rewriting history.
Focus on branch policy, commit slicing, validation gates, PR evidence, and tag safety.

## Load Order

Read only what is needed:
1. `references/rc-batching-and-tagging.md` for the canonical workflow and commands.
2. `assets/templates/release-pr-checklist.md` to prepare PR evidence and sign-off.

## Release Rules

1. `main` is release truth and should receive changes through PR.
2. Use annotated tags only (`git tag -a`).
3. Never rewrite published tags.
4. Keep `frontend/package.json` version aligned with target tag.

## Workflow

1. Select release branch and target version (`vX.Y.Z-rc.N` or `vX.Y.Z`).
2. Split commits by intent:
- Batch A: feature/runtime changes
- Batch B: rollout toggles or scope adjustments
- Batch C: release metadata (`package.json`, `CHANGELOG.md`)

3. Run required gates and collect outputs.

4. Open PR to `main` with evidence:
- command results
- manual checks for changed features
- risk and rollback note

5. After merge, sync local `main`, create annotated tag, and push `main` plus tag.

6. Run post-tag verification commands and record final release proof.

## Required Outputs

1. Batch plan with exact file ownership per batch.
2. Version and changelog alignment proof.
3. CI/local gate results.
4. PR evidence checklist.
5. Tag verification output and rollback fallback.

## Commands

Use this baseline command set:

```bash
pnpm -C frontend build
pnpm -C frontend eval:prompts --mode=mock --strict
pnpm -C frontend package
node -p "require('./frontend/package.json').version"
git describe --tags --abbrev=0
```

Use this skill with:
- `documents/version_control_plan.md`
- `documents/engineering_handoffs/2026-02-25-v1_5_lite_capsule_rollout_and_ui_closeout.md`
