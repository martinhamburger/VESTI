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
| Selection UI visual weight too high | checkbox oversize or helper text reintroduced | inspect selection row sizing and helper text presence | conversation card selection row |
| Footer metadata shows stray glyph or wraps | hardcoded copy or layout nowrap missing | compare footer copy and wrapping behavior | conversation card footer metadata |
| Threads header text wraps or misaligns | missing nowrap/align rules or layout drift | verify header flex alignment + status text nowrap | Threads header layout |
| Threads filter rows start expanded or retain stale open state | disclosure reset behavior lost | reopen filter mode and verify details mount-reset behavior | Threads filter disclosure rows |
| Threads filter summary is wrong or wraps | summary formatter/layout drift | compare active filter state against collapsed summary rules and truncation | Threads filter summary row |
| Threads filter pills feel oversized or uneven | compact density tokens drifted | inspect pill font, padding, gap, and source dot sizing | Threads filter pill density |
| Threads overflow menu feels like a generic popover | shell classes drifted back to shared defaults | compare menu border/background/shadow/radius against Threads utility surface baseline | conversation card overflow shell |
| Threads overflow submenu does not match parent menu | submenu content skipped Threads-local classes | open `Add to project` and compare shell density/radius to parent menu | conversation card overflow submenu |
| Threads overflow rows feel oversized or icon-heavy | item density tokens regressed | inspect item font size, row height, icon size, chevron size, and open-trigger active state | conversation card overflow item density |
| Only one card looks "entered" after Select | selected state still reuses hover/expanded layout | enter batch mode and compare unselected vs selected card detail visibility and action rows | conversation card batch-selection layout |
| Select All grabs the wrong threads | batch scope drifted from filtered result set | apply search/date/source filters, then compare tray count and selected ids against visible cards only | Threads batch-selection scope |
| Batch export no longer matches Data language | tray export panel drifted from Data export rows or format set | verify panel offers only JSON/TXT/MD and compare button hierarchy to Data export block | Threads batch export panel |
| Batch delete is too easy to trigger | destructive guard weakened or removed | open delete panel and verify `DELETE` input gate before confirm enables | Threads batch delete guard |
| Compact/Summary selector is missing or replaced by old modal flow | export UI regressed to pre-tray interaction model | verify export panel shows `Full / Compact / Summary` above JSON/TXT/MD rows and `TimelinePage` no longer mounts legacy export dialog wiring | BatchActionBar + Timeline export path |
| Compact/Summary export hard-fails when LLM path is unavailable | deterministic local fallback path missing or output validation too strict | simulate missing/bad LLM path and verify export still finishes with warning feedback | exportCompression + exportConversations |
| Future Kimi seam leaks into Settings too early | experimental route/model candidate was exposed through BYOK whitelist instead of staying export-internal | verify `BYOK_MODEL_WHITELIST` remains unchanged and `moonshot_direct` stays dormant in resolver only | llmConfig + export compression route seam |

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
