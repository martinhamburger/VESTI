# Vesti v1.8.2 Thread Summary State Machine Contract

Version: v1.8.2  
Status: Decision Complete  
Audience: Frontend, QA

---

## 1. Purpose

Freeze deterministic Thread Summary behavior after v1.8.2 redesign while preserving backward compatibility for stored records.

---

## 2. State Definition

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

Input signals:

1. `conversation` (selected thread)
2. `summaryStatus` (`idle | loading | ready | error`)
3. `summaryData` (adapter result, nullable)

Mapping:

1. no conversation -> `no_thread`
2. conversation + no summaryData + `idle` -> `selected_idle`
3. conversation + no summaryData + `loading` -> `selected_loading`
4. conversation + no summaryData + `error` -> `selected_error`
5. conversation + summaryData + `ready` -> `ready`
6. conversation + summaryData + `loading` -> `ready_loading`
7. conversation + summaryData + `error` -> `ready_error`

---

## 3. Render Guarantees

1. `no_thread`: show guidance copy only.
2. `selected_idle`: context card + generate button + empty hint.
3. `selected_loading`: generation shell only (plus context and controls).
4. `ready`: full structured summary sections.
5. `ready_loading`: full structured summary remains visible; generation shell appears at top.
6. `selected_error`/`ready_error`: retry path always available.

---

## 4. Generation Shell Contract

1. Shell includes status text, timer, and four ordered phases.
2. Phase order is fixed:
   - Initialising pipeline
   - Distilling logic
   - Curating summary
   - Finalising artefacts
3. Timer starts when `summaryStatus` enters `loading` and resets when leaving `loading`.
4. Phase progression is elapsed-time-based, independent from backend progress events.

---

## 5. Legacy Compatibility Contract

1. Legacy v2 records (old object journey + string insights) remain readable.
2. Parser/adapter bridge maps legacy data into upgraded v2 presentation shape.
3. Regenerate writes upgraded v2 shape while keeping schema version key as `conversation_summary.v2`.

---

## 6. Non-goals

1. Runtime migration job rewriting all historical summary rows.
2. New schema enum introduction (`conversation_summary.v3`).
3. Weekly state machine changes (owned by v1.8.1).
