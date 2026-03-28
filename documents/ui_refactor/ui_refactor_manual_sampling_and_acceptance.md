# Vesti UI Refactor Manual Sampling and Acceptance (v1.4)

Version: v1.1  
Status: QA Gate Spec  
Audience: QA, release owner, frontend, UI design

---

## 1. Sampling Coverage

Minimum mandatory set:
- 4 top-level regions x 3 scenario types = 12 base cases
- plus 4 Threads->Reader child-flow cases
- plus 20 cross-cutting interaction and boundary cases
- total minimum: 36 cases

Scenario types:
1. standard ready state
2. loading/empty/error state
3. primary action path

---

## 2. Region Matrix (Mandatory)

Regions:
- Threads
- Insights
- Data
- Settings

Per region must validate:
- information hierarchy readability
- primary action discoverability
- state rendering consistency

Threads child flow (mandatory):
- open Reader from thread card
- Reader back navigation to Threads list
- selected conversation context continuity
- refresh behavior after `VESTI_DATA_UPDATED`

---

## 3. Cross-Cutting Scenarios (Minimum 20)

1. Keyboard navigation end-to-end.
2. Focus-visible correctness for icon buttons.
3. Card action row click precision.
4. Long-title truncation behavior.
5. Mixed-language text rendering (EN + 中文).
6. Platform tag contrast and consistency.
7. Small viewport density check.
8. Center action availability in mirror/smart/manual modes.
9. Center action disabled reason copy correctness.
10. KB entry exists in Insights header and nowhere else as structural entry.
11. Compaction trigger in Threads + compaction stats in Data.
12. External links placed in Settings only.
13. Threads full-text search: query hits title, no `Matched in messages` hint.
14. Threads full-text search: query hits only message body, hint appears.
15. Query length 1 does not trigger body-scan behavior; result remains title/snippet-only.
16. Right navigation rail width remains `52px` and main content area expansion is visually preserved.
17. Settings shows three group labels in order: Personalisation -> System -> Support.
18. Settings Language row is `Soon`, non-expandable, and does not show accordion affordance.
19. Support block has exactly three rows (Docs & Help / Send Feedback / What's New), not accordion cards.
20. Send Feedback row toggles inline reveal correctly; email copy action and issue-link path are available.
21. Threads / Insights / Data / Settings page titles use one unified 18px title role and aligned top spacing.
22. Insights top header has no extra gray divider line under the title.
23. Threads top header does not render duplicated brand logo/wordmark (Dock logo remains unchanged).
24. Threads search button opens inline search input; `Cancel` and `Esc` both exit search mode.
25. Threads UI baseline regression guard (not a redesign): selection UI defaults to 18px checkbox and no `Click to select` helper text.
26. Threads header layout baseline: status text is single-line (no wrap), all header elements are vertically centered, and left/right groups keep reasonable spacing.
27. Thread card footer metadata baseline: no stray `路` character; use a mid-dot separator (e.g., `·`) and keep metadata on one line without wrapping.
28. BatchActionBar density baseline: padding `7px`, font size `12px`, count badge horizontal padding `7px`, action button vertical padding `5px`.
29. Threads filter disclosure baseline: opening filter mode shows `Date` and `Source` as independent compact disclosure rows, both collapsed by default; closing and reopening filter mode resets both rows to collapsed.
30. Threads filter summary baseline: collapsed `Date` always shows the active preset label, and collapsed `Source` shows `All sources` / one name / two comma-joined names / `<first> +<n>` using `PLATFORM_OPTIONS` order.
31. Threads filter density baseline: date/source pills use compact `11px` rhythm, tighter wrapping, and source tone badges remain color-coded without overflow or awkward wrapping.
32. Threads overflow menu baseline: card overflow menu and submenu use the same compact Threads utility surface (`rounded-lg`, subtle border/background, `shadow-paper`) instead of generic popover styling.
33. Threads overflow item density baseline: menu rows use `13px` medium text, compact `min-h-8` spacing, smaller `3.5` icons/chevron, and the open trigger shows a light active state without turning into a heavy accent block.
34. Threads batch-selection visibility baseline: after choosing `Select` from a card overflow menu, every card in the current filtered result set shows the 18px circular checkbox slot and platform tags shift right consistently.
35. Threads batch-selection state baseline: selected cards use only a light selected surface and do not reuse hover/expanded snippet/footer behavior; card click toggles selection instead of opening Reader while batch mode is active.
36. Threads batch action tray baseline: tray actions are `Select All` / `Export` / `Delete` / `Exit`; `Select All` only targets the current filtered result set, and changing search/filter prunes hidden selections instead of preserving stale ids.
37. Threads batch export baseline: export opens a Data-style format panel with exactly `JSON` / `TXT` / `MD`, and the selected export mode controls whether the current selected threads are emitted as full transcript, compact handoff, or summary note content.
38. Threads batch delete baseline: delete opens a Data-style danger panel, requires typing `DELETE`, and successful confirmation clears selection and exits batch mode.
39. Threads export mode selector baseline: batch export panel shows `Full` / `Compact` / `Summary` above the Data-style `JSON` / `TXT` / `MD` rows, with `Full` selected by default and selector density matching the tray surface.
40. Threads compressed export resilience baseline: `Compact` and `Summary` first try the current LLM settings path, but export must still succeed through deterministic local fallback when the LLM path is unavailable or returns unusable output; post-export feedback must surface when fallback happened.
41. Threads export architecture baseline: the page must keep using the batch action tray flow and must not regress to the legacy modal-style `ExportDialog`.
42. Reader sidecar hierarchy baseline: `Sources`, `Attachments`, and `Artifacts` render as compact collapsed disclosure rows, remain visually subordinate to message body text, and do not read like primary content cards.
43. Reader sidecar spacing baseline: sidecar shells are inset from the Reader turn boundary and sidepanel outer frame; disclosure borders must not visually merge with the turn divider or page frame.
44. Gemini upload dedupe baseline: a single uploaded user turn with attachments renders exactly one `YOU` message row; attachment presence must not create a duplicate user turn.
45. Reader sidecar capsule baseline: collapsed `Attachment` / `Source` / `Artifact` renders as a single-line utility capsule aligned with the `Expand` / `Collapse` tool language; no second-line summary copy is shown in collapsed state.
46. Reader sidecar tray baseline: expanded sidecar content drops into a separate inset tray below the capsule, and the last visible tray edge remains visually separated from the Reader turn divider.

---

## 4. Required Evidence per Case (DoD)

Each case must include:
- Case ID, region, scenario
- expected/actual/verdict
- timestamp
- screenshot
- if action case: short interaction log

For regression-sensitive cases, include:
- pre-refactor screenshot reference
- post-refactor screenshot

For full-text search cases, include:
- search query string and expected hit source (title/snippet/body)
- screenshot proof of `Matched in messages` hint presence/absence

For navigation-rail calibration case, include:
- screenshot or DevTools evidence showing rail width is `52px` on sidepanel root

For Settings support-density cases, include:
- screenshot evidence for three-group label order and three support rows
- link-target verification for README and Releases destinations
- inline reveal open/close evidence and email copy result feedback

---

## 5. Severity and Release Gate

Severity:
- Blocker:
  - critical action unreachable
  - data-destructive action guard missing
  - page unusable due to layout break
  - IA boundary violation causing misplacement of core function
- Major:
  - wrong state rendering
  - accessibility path broken
  - repeated interaction misfire
- Minor:
  - visual inconsistency without functional impact

Go/No-Go threshold:
- `Blocker = 0`
- `Major <= 2` with owner + workaround + retest plan

---

## 6. Build Gate

Required:
- `pnpm -C frontend build`
- `pnpm -C frontend package`

---

## 7. Result Template

```md
# v1.4 UI Refactor Sampling Result

- Planned: 36
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
