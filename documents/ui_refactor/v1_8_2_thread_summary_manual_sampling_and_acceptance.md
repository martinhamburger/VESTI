# Vesti v1.8.2 Thread Summary Manual Sampling and Acceptance

Version: v1.8.2  
Status: Ready for QA execution  
Audience: QA, Frontend, Release Owner

---

## 1. Pre-check

1. Build passes: `pnpm -C frontend build`.
2. Package passes: `pnpm -C frontend package`.
3. Insights page opens with no runtime error in sidepanel.

---

## 2. Sampling Matrix

### A. Parser/Schema Compatibility

1. New v2 structured payload renders with all major sections.
2. Legacy v2 payload (old shape) still renders via compatibility bridge.
3. Malformed payload falls back gracefully (no card crash).

### B. State Machine Coverage

1. `no_thread`: open Insights with no thread selected.
2. `selected_idle`: select a thread with no summary.
3. `selected_loading`: click Generate from empty state.
4. `ready`: generation succeeds.
5. `ready_loading`: click Regenerate on ready state.
6. `selected_error` and `ready_error`: simulate request failure and verify Retry.

### C. Label and Language Semantics

1. Verify there is no `EMP` label in UI.
2. Verify step anchor label is `实证案例`.
3. Verify meta chips avoid technical shorthand labels in default-path output.

### D. Layout and Overflow

1. 1-step journey does not leave large empty gaps.
2. 8-step journey remains readable in narrow sidepanel.
3. Long `assertion` and long `definition` wrap correctly without horizontal overflow.
4. Missing `real_world_anchor` leaves no empty anchor block.

### E. Regeneration / Lazy Upgrade

1. Load a legacy record and confirm render success.
2. Click Regenerate and verify refreshed record still opens after reload.
3. Confirm no regression in Weekly Digest sections.

---

## 3. Acceptance Checklist

- [ ] Build gate passed
- [ ] Package gate passed
- [ ] New v2 parse path passed
- [ ] Legacy v2 compatibility path passed
- [ ] State machine path coverage passed
- [ ] Label semantics passed (`EMP` removed)
- [ ] Narrow-layout overflow checks passed
- [ ] Regeneration/lazy-upgrade checks passed

---

## 4. Result Template

Execution date:

Tester:

Scope executed:

Findings:

1. Critical:
2. Major:
3. Minor:

Final decision: Go / No-Go
