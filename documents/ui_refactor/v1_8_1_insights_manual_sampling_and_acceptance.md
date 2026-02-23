# Vesti v1.8.1 Insights Manual Sampling and Acceptance (Weekly Dynamic)

Version: v1.8.1  
Status: QA Gate Spec  
Audience: QA, Frontend, Release Owner

---

## 1. Coverage

Minimum required:

1. Naming/group/disabled discovery checks: 9 cases
2. Weekly range consistency checks: 6 cases
3. Weekly idle/collapse behavior checks: 8 cases
4. Weekly generating phase machine checks: 8 cases
5. Weekly ready/sparse/error rendering checks: 10 cases
6. Accessibility/theme/regression checks: 8 cases

Minimum total: 49 cases

---

## 2. Case Matrix

### A. Naming and layout freeze

1. Group order is `On-demand -> Scheduled -> Discovery`.
2. First item title is `Thread Summary`.
3. Second item title is `Weekly Digest`.
4. Third item title is `Explore & Network`.
5. Discovery row shows `Soon`.
6. Discovery row is not expandable.
7. `Thread Summary` description is single-line ellipsis when closed and up to 2 lines when open.
8. `Weekly Digest` description is single-line ellipsis when closed and up to 2 lines when open.
9. Description text exposes full content through tooltip (`title`) in both states.

### B. Weekly range consistency (Mon-Sun local)

1. On local date **2026-02-22**, resolved range is **2026-02-09 .. 2026-02-15**.
2. Same range is used for weekly list (`GET_CONVERSATIONS` dateRange).
3. Same range is used for weekly load (`GET_WEEKLY_REPORT`).
4. Same range is used for weekly generate (`GENERATE_WEEKLY_REPORT`).
5. Switching to next week shifts range by exactly 7 days.
6. No off-by-one around day boundaries (Mon 00:00 and Sun 23:59:59.999).

### C. Weekly Idle + collapse behavior

1. Idle state shows week banner and count chip.
2. `<=3` threads: no collapse row.
3. `>3` threads: collapse row appears with `N more`.
4. Click collapse row once -> full list + `Collapse`.
5. Click `Collapse` again -> first 3 rows only.
6. Expand/collapse does not trigger new remote request.
7. Empty week thread list shows friendly empty guidance.
8. Generate trigger row remains keyboard focusable and clickable.

### D. Weekly Generating phase machine

1. Clicking generate enters `generating` shell immediately.
2. Timer increments while generating.
3. Phase order is fixed:
   - Loading thread summaries
   - Pattern detection
   - Cross-domain mapping
   - Composing and persisting
4. Request fast path still respects minimum phase visibility.
5. Request slow path remains on final phase until response returns.
6. Final success lands in `ready` or `sparse_week` by data.
7. Final failure with no prior report lands in `error`.
8. Final failure with prior report preserves stable render and exposes retry.

### E. Weekly ready/sparse/error render

1. `ready` renders `Highlights` when data exists.
2. `Recurring Questions` renders only when data exists.
3. `Cross-Domain Echo` renders only when `cross_domain_echoes` exists.
4. `Unresolved` renders only when data exists.
5. `Next Week` renders only when data exists.
6. Missing optional sections do not break the page.
7. `sparse_week` renders dedicated insufficient-data card.
8. Sparse card copy clearly mentions threshold semantics (`<3`).
9. `error` state renders retry action.
10. Regenerate action remains available in ready/sparse states.

### F. Accessibility, theme, and regressions

1. Accordion triggers are keyboard reachable.
2. Generate/Retry actions are keyboard reachable.
3. Focus-visible rings remain visible.
4. Dark/light theme contrast remains readable for phase shell and cards.
5. No horizontal overflow in sidepanel width.
6. Thread Summary generate/regenerate behavior remains intact.
7. Timeline/Reader/Data/Settings behavior unchanged.
8. No runtime protocol changes were introduced.

---

## 3. Required Evidence

Each case must include:

1. Case ID
2. Expected vs actual
3. Timestamp
4. Screenshot or short recording
5. Owner and retest plan for failed case

---

## 4. Severity and Gate

Blocker:

1. Weekly generate action unavailable
2. Weekly state machine enters impossible transition
3. Weekly range mismatch across list/get/generate

Major:

1. Wrong naming/group order
2. Missing phase feedback or retry path
3. Broken keyboard path for primary actions

Minor:

1. Small spacing mismatch without behavior impact
2. Cosmetic visual misalignment

Go/No-Go:

1. Blocker = 0
2. Major <= 2 with mitigation owner/date

---

## 5. Build Gate

Required:

1. `pnpm -C frontend build`
2. `pnpm -C frontend package`

---

## 6. Result Template

```md
# v1.8.1 Insights Weekly Dynamic Sampling Result

- Planned: 49
- Executed: <n>
- Passed: <n>
- Failed: <n>

## Severity
- Blocker: <n>
- Major: <n>
- Minor: <n>

## Go/No-Go
- Decision: Go | No-Go
- Reason:
- Remaining risks:
- Sign-off:
```
