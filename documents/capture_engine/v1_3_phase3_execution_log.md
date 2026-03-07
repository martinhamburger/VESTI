# Vesti v1.3 Phase3 Execution Log (Kimi + YUANBAO)

Date: 2026-03-07  
Owner: Engineering  
Status: In progress (rc.6)

---

## 1. Baseline

- Base line: v1.2 governance + v1.3 Phase1/Phase2 completed.
- Identity policy unchanged:
  - no stable session ID => `held/missing_conversation_id`
  - force archive does not bypass missing ID.

---

## 2. Implemented in Phase3

1. Platform scope
   - Added Kimi + YUANBAO in `Platform` unions and distribution/mapping contracts.
2. Host routing
   - Added strict hosts (with Kimi transition compatibility):
     - `www.kimi.com` (primary)
     - `kimi.com` (primary)
     - `kimi.moonshot.cn` (compatibility)
     - `yuanbao.tencent.com`
3. Capture entrypoints
   - Added `frontend/src/contents/kimi.ts` and `frontend/src/contents/yuanbao.ts`.
4. Parser modules
   - Added `KimiParser` / `YuanbaoParser` with selector+anchor strategy, strict session ID extraction, parse stats logging, and v1.2 governance compatibility.
5. UI + capsule mapping
   - Added light/dark tokens and platform mappings for Kimi/YUANBAO.
   - Explicitly preserved Threads layout structure (mapping-only change).
6. Kimi DOM realignment + warm start snapshot
   - Replaced generic `ds-message` assumptions with semantic Kimi anchors (`.user-content`, `.segment-container`).
   - Switched AI capture to Final-Only markdown stitching inside each turn and excluded `.toolcall-container` descendants.
   - Added one delayed startup capture in Kimi content script to prevent persistent `no_transient` on already-rendered threads.
7. Kimi header-pollution hotfix
   - Restricted selector and anchor candidate sets to `.user-content` + `.segment-container` only.
   - Added hard reject for `.chat-header` scope and explicit sanitization blacklist (`.chat-header`, `.chat-header-content`, `.chat-header-actions`).
   - Removed cross-container AI fallback so captured text can only come from in-turn `.markdown` leaves (Final-Only).
8. Yuanbao `hyc-*` DOM realignment + Final+CoT merge
   - Replaced legacy `.ds-message` assumptions with Yuanbao semantic roots (`.hyc-component-text .hyc-content-text`, `.hyc-component-deepsearch-cot__think__content__item-text .ybc-p`, `.hyc-common-markdown:not(.hyc-common-markdown-style-cot)`).
   - Changed AI assembly to one message per turn: CoT paragraphs first, separator `---`, then final answer body.
   - Excluded deepsearch document list/citation UI blocks from captured text and dropped orphan CoT without a following final block.
---

## 3. Validation Status

- Static checks:
  - `pnpm -C frontend exec tsc --noEmit` -> pass (2026-03-07)
- Build:
  - `pnpm -C frontend build` -> pass (2026-03-07)
- Prompt evaluation:
  - `pnpm -C frontend eval:prompts --mode=mock --strict` -> pass (2026-03-07)
- Manual sampling checklist:
  - `documents/capture_engine/v1_3_phase3_manual_sampling_checklist.md`

---

## 4. Known Limits / Risks

- Source timestamp extraction remains best-effort and may be `null`.
- Parser selectors are resilient but still sensitive to upstream DOM churn.
- Strict host scope currently follows phase-3 primary domains with one-cycle Kimi compatibility (`kimi.moonshot.cn`).

---

## 5. Go/No-Go Rule

Release is blocked unless:
- Blocker = 0
- Major <= 2 with owner/workaround/retest evidence
