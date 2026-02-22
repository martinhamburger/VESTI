# Quality Gates and Anti-Patterns for UI Refactors

Use this checklist before merging prototype-driven sidepanel UI changes.

## Priority risks from recent iterations

### Risk 1: Semantic drift from prototype

Failure mode:

- Naming, grouping, or icon meaning drifts from agreed prototype.

Do:

1. Freeze semantics before implementation.
2. Keep a single source section listing frozen naming and icon logic.

Do not:

1. "Improve wording" during coding without explicit decision.
2. Swap icons based on visual taste only.

### Risk 2: One-shot large patch instability

Failure mode:

- Big rewrite causes file loss, hard rollback, or hidden regressions.

Do:

1. Slice changes into structure/state/style phases.
2. Keep rollback-safe legacy components until new path stabilizes.

Do not:

1. Delete old implementation early in same step as major replacement.
2. Combine architecture, state machine, and styling overhauls in one blind patch.

### Risk 3: State transition flash or break

Failure mode:

- UI drops old result during loading/error and feels unstable.

Do:

1. Define preserve-old-result policy in contract.
2. Validate fast/slow request convergence explicitly.

Do not:

1. Tie render only to request status without data-preservation rules.

### Risk 4: Header description unreadable

Failure mode:

- Header description only shows `...` with no recovery path.

Do:

1. Closed state: one-line ellipsis.
2. Open state: up to two lines.
3. Full text on tooltip/title.

Do not:

1. Leave description permanently single-line without expanded readability rule.

### Risk 5: Narrow-width overflow and misalignment

Failure mode:

- Sidepanel width causes clipping, overlap, or chevron drift.

Do:

1. Test long labels and long descriptions.
2. Validate icon/text/chevron alignment in both themes.

Do not:

1. Assume desktop-width behavior reflects sidepanel behavior.

## Merge gate checklist (must pass)

### A. Semantic gate

- [ ] Naming/group order matches frozen contract.
- [ ] Icon semantics and action semantics are unchanged.

### B. State gate

- [ ] State machine matches contract mapping.
- [ ] Loading/error preserve old content when expected.
- [ ] Retry path works and is visible.

### C. Readability gate

- [ ] Header descriptions follow closed/open/tooltip rule.
- [ ] No critical text becomes unreadable in narrow panel width.

### D. Accessibility gate

- [ ] Keyboard path for triggers/buttons is valid.
- [ ] Focus-visible is visible.
- [ ] Disabled controls are semantically correct.

### E. Build and regression gate

- [ ] Build command passes.
- [ ] Package command passes.
- [ ] Non-target pages (Timeline/Reader/Data/Settings) show no regression.

## Anti-pattern table

| Anti-pattern | Why it fails | Safe alternative |
| --- | --- | --- |
| Prototype semantics changed mid-implementation | Causes hidden product drift | Freeze semantics first and log deltas explicitly |
| Massive replace-in-place patch | High rollback risk | Incremental slices with compatibility buffers |
| Status-only rendering | Produces visual flash and data loss | Data + status composite mapping |
| Single-line-only descriptors | UX becomes unreadable in sidepanel | Closed compact + open two-line + tooltip |
| Flat "pass/fail" QA note | Hard to localize defects | Unit-level gate checklist and file-scoped findings |

## Rehearsal rubric (for skill self-check)

Run three dry tasks and score each 1-5:

1. Trigger precision.
2. Plan completeness.
3. Unit mapping clarity.
4. Gate coverage.
5. Regression awareness.

Target: each category >= 4 before relying on this skill for release-critical UI work.

