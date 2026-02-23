# Vesti v1.8.1 Insights State Machine Contract (Weekly Dynamic)

Version: v1.8.1  
Status: Decision Complete  
Audience: Frontend, QA

---

## 1. Purpose

Freeze deterministic UI behavior for the v1.8.1 Weekly Digest dynamic upgrade, while keeping Thread Summary compatible.

---

## 2. Thread Summary (Compatibility Contract)

Thread Summary is not the focus of this iteration but remains stable.

```ts
type ThreadSummaryUiState =
  | "no_thread"
  | "selected_idle"
  | "selected_loading"
  | "selected_error"
  | "ready"
  | "ready_loading"
  | "ready_error";
```

Mapping inputs:

1. `conversation`
2. `summaryStatus` (`idle | loading | ready | error`)
3. `summaryData` (adapter result, nullable)

Render guarantees:

1. No thread -> centered guidance copy.
2. Selected + no result -> context card + generate path.
3. Ready -> compact result + regenerate path.
4. Loading/error -> explicit feedback and retry.

---

## 3. Weekly Digest State Contract

```ts
type WeeklyDigestUiState =
  | "idle"
  | "generating"
  | "ready"
  | "sparse_week"
  | "error";
```

```ts
type WeeklyGenerationPhase =
  | "ready_to_compile"
  | "loading_thread_summaries"
  | "pattern_detection"
  | "cross_domain_mapping"
  | "composing_and_persisting";
```

### 3.1 Source signals

1. `weeklyReport` (nullable)
2. `weeklyData` (adapter result from report, nullable)
3. `insufficient_data`
4. Generate request lifecycle result

### 3.2 Stable-state mapping

1. No report -> `idle`
2. Report with `insufficient_data=false` -> `ready`
3. Report with `insufficient_data=true` -> `sparse_week`
4. No report + request/load failure -> `error`

### 3.3 Generate transition mapping

1. User action -> `generating` + phase reset + timer reset.
2. Phase progression follows fixed order and minimum durations.
3. Final transition:
   - success -> `ready` or `sparse_week` by `insufficient_data`
   - failure with prior report -> keep prior stable state + show retry
   - failure without prior report -> `error`

---

## 4. Weekly Range Contract

Use one shared utility:

```ts
getPreviousNaturalWeekRangeLocal(): { rangeStart: number; rangeEnd: number };
```

Rules:

1. Local timezone.
2. Previous natural week, Monday to Sunday.
3. Shared across:
   - `getWeeklyReport(rangeStart, rangeEnd)`
   - `generateWeeklyReport(rangeStart, rangeEnd)`
   - `getConversations({ dateRange: { start, end } })`

Date anchor example:

- On **2026-02-22**, range resolves to **2026-02-09 .. 2026-02-15**.

---

## 5. Idle List Collapse Contract

1. `COLLAPSE_AT = 3`.
2. If thread count <= 3: no collapse row.
3. If thread count > 3:
   - collapsed row label: `N more`
   - expanded row label: `Collapse`
4. Expand/collapse is local UI state only; no extra remote calls.

---

## 6. Weekly Rendering Bridge Contract

Input priority:

1. Future structured fields when present (e.g. `cross_domain_echoes`)
2. Current structured weekly fields
3. Plain-text fallback extraction

Section policy:

1. `Highlights` renders with fallback lines when needed.
2. Optional sections (`Recurring Questions`, `Cross-Domain Echo`, `Unresolved`, `Next Week`) render only when data exists.
3. Missing fields never break the full card render.

---

## 7. Non-goals

1. No runtime schema migration code (`conversation_summary.v3` / `weekly_lite.v2`).
2. No mainline `INSIGHT_PIPELINE_PROGRESS` integration in v1.8.1.
3. No Explore & Network behavior implementation.

