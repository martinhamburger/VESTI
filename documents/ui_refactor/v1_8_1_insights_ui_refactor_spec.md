# Vesti v1.8.1 Insights UI Refactor Spec (Weekly Dynamic Upgrade)

Version: v1.8.1  
Status: Decision Complete (Docs + Frontend)  
Audience: Frontend, Design, QA, Release Owner

---

## 1. Summary

v1.8.1 keeps the Insights IA/name freeze, but this round upgrades only **Weekly Digest** from a static block to a four-state dynamic machine.

Locked naming and IA:

1. `Thread Summary` (On-demand)
2. `Weekly Digest` (Scheduled)
3. `Explore & Network` (Discovery, disabled with `Soon`)

Scope emphasis:

1. Weekly state machine: `idle -> generating -> ready`, plus `sparse_week` and `error`
2. Idle week thread list with local collapse interaction (`COLLAPSE_AT = 3`)
3. Local synthetic generation phases (forward-ready for future push-event mapping)
4. Forward-compatible rendering bridge for current + future weekly structured fields

---

## 2. Scope

In scope:

1. Weekly Digest dynamic UI state machine and phase track.
2. Previous natural week window unification for list/get/generate.
3. Weekly rendering sections:
   - Highlights
   - Recurring Questions
   - Cross-Domain Echo (hide if field missing)
   - Unresolved
   - Next Week
4. Sparse week dedicated fuse state (`insufficient_data=true`).
5. Accordion description readability contract for `Thread Summary` and `Weekly Digest`:
   - closed: single-line ellipsis
   - open: up to two lines
   - tooltip (`title`) exposes full text
6. Documentation and acceptance updates for this upgrade.

Out of scope:

1. Runtime schema migrations (`conversation_summary.v3`, `weekly_lite.v2`) in code.
2. Mainline UI connection to `INSIGHT_PIPELINE_PROGRESS`.
3. Explore & Network feature implementation.
4. Thread Summary visual redesign (kept compatible, not rebuilt to the same depth as Weekly).

---

## 3. Time Window Contract

All Weekly data paths use the same local-time previous natural week range:

1. Monday 00:00:00.000 to Sunday 23:59:59.999
2. Local timezone
3. Same range for:
   - `GET_WEEKLY_REPORT`
   - `GENERATE_WEEKLY_REPORT`
   - `GET_CONVERSATIONS` (Idle list)

Reference example:

- When current local date is **2026-02-22** (Sunday), previous natural week is **2026-02-09 to 2026-02-15**.

---

## 4. Weekly Interaction Contract

### 4.1 Idle

1. Show week banner (range + thread count chip).
2. Show current week thread list.
3. Show only first 3 rows by default.
4. If overflow, show inline row:
   - collapsed: `N more`
   - expanded: `Collapse`
5. Show `Generate digest for this week` wand trigger row.

### 4.2 Generating

1. Enter immediately on generate action.
2. Show wand pulse shell, status text, timer, phase track.
3. Phase order:
   - Loading thread summaries
   - Pattern detection
   - Cross-domain mapping
   - Composing and persisting
4. Sync strategy:
   - Request faster than phase minimum: wait until minimum phase timeline completes.
   - Request slower than phase minimum: hold on final phase until response returns.

### 4.3 Ready

1. Render sections only when data exists.
2. Missing optional future fields do not break card.
3. Use `Regenerate` action with same wand semantic.

### 4.4 Sparse week

1. Triggered by `insufficient_data=true`.
2. Render dedicated sparse card (not treated as error).
3. Keep regenerate path available.

### 4.5 Error

1. Render recoverable error block with `Retry`.
2. If previous digest exists, preserve stable layout and show retry path.

---

## 5. Compatibility Bridge (Current + Future Schema)

Presentation mapping policy:

1. Prefer future structured weekly fields when present (e.g. `cross_domain_echoes`).
2. Fall back to current structured fields.
3. Fall back to plain text extraction when structured content is absent.

Rendering policy:

1. Missing field => hide that section.
2. Never fail the whole Weekly card because one field is missing.

---

## 6. Implementation Footprint

Primary code:

1. `frontend/src/sidepanel/pages/InsightsPage.tsx`
   - Weekly state machine, range contract, idle list collapse, phase shell
2. `frontend/src/style.css`
   - Weekly dynamic shell/list/phase/section utility classes
3. `frontend/src/lib/services/insightAdapter.ts`
   - Optional `cross_domain_echoes` normalization bridge
4. `frontend/src/lib/types/insightsPresentation.ts`
   - Weekly presentation type extension for optional `cross_domain_echoes`

Support components retained:

1. `frontend/src/sidepanel/components/InsightsAccordionItem.tsx`
2. `frontend/src/sidepanel/components/InsightsWandIcon.tsx`

---

## 7. Build and Release Gates

Required commands:

1. `pnpm -C frontend build`
2. `pnpm -C frontend package`

Release checks:

1. Weekly window consistency across list/get/generate
2. Weekly dynamic state transitions and retry path
3. No regression in Timeline/Reader/Data/Settings
4. Discovery row remains disabled (`Soon`)
5. Thread/Weekly header descriptions are readable when expanded and expose tooltip full text.
