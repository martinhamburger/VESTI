# Vesti UI Refactor Debugging Playbook (v1.4)

Version: v1.1  
Status: Operational SOP  
Audience: Frontend + QA + UI Design

---

## 1. Purpose

Define a deterministic debug workflow for UI refactor regressions while preserving behavior semantics and IA boundaries.

Reference docs:
- `documents/ui_refactor/v1_4_information_architecture_contract.md`
- `documents/ui_refactor/v1_4_ui_refactor_engineering_spec.md`
- `documents/ui_refactor/v1_4_ui_refactor_component_system_spec.md`
- `documents/capture_engine/capture_debugging_playbook.md`

---

## 2. 5-Step Debug Lifecycle

1. **Isolate**
   - freeze branch + commit SHA
   - disable unrelated experimental flags
2. **Reproduce**
   - capture exact region, action sequence, viewport
3. **Classify**
   - `layout_regression`
   - `state_render_regression`
   - `interaction_regression`
   - `ia_boundary_regression`
   - `accessibility_regression`
   - `performance_regression`
4. **Minimal fix**
   - patch only one component tier per round
5. **Regression sweep**
   - rerun failing case + minimum smoke set

---

## 3. Evidence Contract

Each issue must include:
- screenshot/video (before + after)
- host page and sidepanel region
- expected vs actual behavior
- commit hash
- severity

If interaction-related:
- include keyboard path (`Tab`, `Enter`, `Esc`) result

If IA boundary-related:
- include misplaced feature location and expected region based on IA contract

If performance-related:
- include rough timing or DevTools profile notes

---

## 4. Fault Matrix

| Symptom | Likely cause | Verify first | Fix target |
| --- | --- | --- | --- |
| Card action hard to click | hit-area overlap | inspect pointer target + z-order | card/action row layout |
| Title wraps unpredictably | truncation/token mismatch | compare typography + line clamp rules | text/metadata layout |
| Wrong loading/empty state | conditional branch drift | check region state map | region render contract |
| Button style inconsistent | token leakage | check hard-coded style usage | token mapping |
| KB link appears outside Insights header | IA boundary drift | check IA contract mapping | region ownership refactor |
| Compaction only in Data or only in Threads | ownership split not applied | verify trigger vs audit placement | threads/data action wiring |
| Center logo opens multi-entry hub | action contract drift | inspect Dock interaction spec | center action implementation |
| Keyboard flow broken | focus order/handler issue | tab order + key handlers | interactive component logic |

---

## 5. Round Cadence

One round = one hypothesis.
- end with `confirmed` / `rejected` / `inconclusive`
- do not stack unrelated UI fixes in one round

---

## 6. Minimum Regression Smoke

- Threads list render + search + card action row
- Threads -> Reader open/back flow
- Insights summary generate/view states + KB header entry
- Data storage dashboard + export/clear panel states + compaction audit surface
- Settings save/test/archive flows + external links section
- Center action state transitions (enabled/disabled/loading)
