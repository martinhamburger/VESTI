# Web Dashboard rc8 Repairs

Status: Active repair ledger  
Audience: Frontend engineers, release owners, QA

## 1. Purpose

This document records web-view-specific repair work that should remain discoverable after a release ships.

It is not a dated delivery handoff. It is the durable repair knowledge base for the web dashboard track.

---

## 2. rc8 Repair: Network edges no longer depend on Library detail opens

### 2.1 Symptom
In the web `Network` view, users could see conversation nodes but no relationship edges.

A critical behavioral clue was observed during manual testing:
- after opening a conversation card in `Library`, that conversation could then begin to participate in Network edges
- without that prior Library open, the graph frequently rendered nodes without connections

### 2.2 Root cause
The failure came from two hidden couplings:

1. `Library` detail opens called `getRelatedConversations()`
2. `getRelatedConversations()` ensured vectors for the selected conversation as part of related-conversation lookup
3. `Network` previously only consumed existing vectors when computing edges
4. therefore, the graph depended on whether vectors had already been created elsewhere as a side effect

This violated a core dashboard correctness rule:
- a tab must not rely on another tab?s incidental side effects for baseline correctness

### 2.3 Repair implemented in rc8
The fix made `Network` self-sufficient.

Behavioral change:
- `Network` now determines its active base node set first
- it then requests edge computation specifically for those node ids
- runtime performs best-effort lazy vector ensure for that node set before computing edges

Internal contract change recorded for traceability:
- `StorageApi.getAllEdges(options?: { threshold?: number; conversationIds?: number[] })`
- `GET_ALL_EDGES` payload: `{ threshold?: number; conversationIds?: number[] }`

### 2.4 What did not change
- no capture governance changes
- no storage schema changes
- no dedupe changes
- no `Library` related-conversation behavior changes
- no graph style or threshold redesign

### 2.5 Validation outcome
Acceptance criteria passed for the repair path:
- entering `Network` directly can produce real edges without first opening `Library` cards
- platform filtering still only affects visibility, not the underlying node-set fetch contract
- genuine empty graphs remain possible when real similarity does not produce edges

### 2.6 Engineering lesson
This repair formalized a reusable rule for web work:

**Every web tab must own the minimum runtime requests required for its own baseline correctness.**

If another tab happens to trigger compatible side effects, that may improve performance or warm caches, but it must never be required for correctness.

---

## 3. Repair taxonomy for future entries

Future entries in this file should use the same structure:
1. symptom
2. root cause
3. repair implemented
4. unchanged scope
5. validation outcome
6. engineering lesson

This keeps the repair log readable and useful for future regression triage.
