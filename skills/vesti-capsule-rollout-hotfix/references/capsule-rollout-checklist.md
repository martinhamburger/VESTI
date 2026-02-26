# Capsule Rollout Checklist

## 1. Pre-change framing

1. Record goal, success criteria, and non-goals.
2. List exact files that are allowed to change.
3. Confirm whether this round is rollout, hotfix, or acceptance-only.

## 2. Safe implementation order

1. Stabilize behavior first:
- drag capability
- click suppression after drag
- fallback action path

2. Then adjust rollout scope:
- host allowlist changes
- platform-specific exceptions

3. Last, adjust visual polish:
- token alignment
- typography alignment
- theme wiring

## 3. Build and gate commands

```bash
pnpm -C frontend build
pnpm -C frontend eval:prompts --mode=mock --strict
pnpm -C frontend package
```

## 4. Manual acceptance minimum

Core matrix:
1. 6 platforms x 3 modes = 18 cases.
2. Validate render, status semantics, `Open Dock`, and archive availability.

Edge set:
1. At least 8 edge cases.
2. Include drag regression checks and fallback checks.

## 5. Evidence package

Per case include:
1. Case ID, platform, mode.
2. Input conditions.
3. Expected vs actual.
4. Pass/fail verdict.
5. Timestamp.
6. Screenshot.
7. Log snippets (status/action/capture decision where applicable).

## 6. Go/No-Go policy

1. Blocker must be 0.
2. Major can be at most 2 with owner, workaround, and retest plan.
3. Keep rollback option ready before merge.

