# Web Dashboard Current Architecture

Status: Current implementation baseline  
Audience: Maintainers and release owners

## 1. Architectural position

The web dashboard is a **shell over extension runtime capabilities**.

Current layering is:
1. page entry in `frontend/src/dashboard.tsx`
2. shared dashboard UI shell in `packages/vesti-ui`
3. typed storage adapter in `frontend/src/lib/services/storageService.ts`
4. runtime message transport to background/offscreen
5. runtime-side execution in offscreen/background services and Dexie-backed repositories

This means the web layer is a strong consumer and orchestrator, but not the canonical engine layer for capture, storage, vectorization, or semantic processing.

## 2. Key runtime-facing components

### 2.1 Web entry
`frontend/src/dashboard.tsx`
- imports global web styles
- initializes and syncs UI theme mode
- passes a full `storage` object into `VestiDashboard`

### 2.2 Dashboard shell
`packages/vesti-ui/src/dashboard.tsx`
- controls active tab state (`library`, `explore`, `network`)
- hosts Settings and Data drawers
- wraps tab content in `LibraryDataProvider`
- routes ?open conversation? actions between tabs

### 2.3 Shared data provider
`packages/vesti-ui/src/contexts/library-data.tsx`
- fetches `topics` and `conversations`
- recomputes topic counts locally
- listens for `VESTI_DATA_UPDATED`
- exposes refresh capability to dashboard consumers

## 3. Tab architecture

### 3.1 Library
Primary responsibilities:
- conversation list and selection
- summary retrieval / generation
- related conversations fetch
- note linkage and message retrieval
- metadata operations (rename, update topic, tags, star, delete)

Important architectural note:
- `Library` contains rich drill-down behavior and historically triggered useful side effects such as related-conversation lookup
- those side effects must not be treated as required prerequisites for other tabs

### 3.2 Explore
Primary responsibilities:
- knowledge-base style query flow
- explore session lifecycle
- source conversation surfacing and jump-back into Library

### 3.3 Network
Primary responsibilities:
- determine current graph node set
- request edge data for those nodes
- render the graph via a canvas-based temporal playback system with deterministic fixed anchors
- map conversation chronology into a day-by-day playback timeline while keeping the underlying node-set fetch contract explicit
- allow panning across a larger logical graph area instead of forcing all visible anchors to fit inside the viewport
- reset and auto-run the replay whenever the `Network` tab becomes active again
- expose a local trend-chart scrubber over daily new-conversation counts so users can pause on a specific time point
- distribute same-day births within that day by capture order so one-day datasets still produce a visible replay
- treat node clicks as local inspection: highlight connected nodes in-graph and open a right-side node details drawer, rather than navigating away immediately

As of rc8, `Network` explicitly requests edges for its active base node set rather than passively reading whatever vectors already exist.
The current renderer no longer depends on ECharts or a live force simulation; it builds temporal node state in the web layer, computes deterministic fixed anchors for the full graph, lets the viewport pan across a larger logical graph space, draws nodes/edges onto `<canvas>`, and drives only the visible time position from a fixed-duration local playback clock.

Current temporal status:
- `Network` node chronology now uses the same `originAt = source_created_at ?? first_captured_at ?? created_at` start-time semantics as Threads / Reader / Web Reader
- `first_captured_at` and `last_captured_at` remain secondary acquisition / freshness clocks and do not move nodes on the main playback timeline
- the trend scrubber / replay UI is local to the tab and does not yet imply a stable runtime-backed time-filtering contract
- temporal playback is only partially finalized: node chronology and fixed anchor placement are locked, but filtering / edge-contract time semantics remain pending

## 4. Message and data flow

### 4.1 General request path
1. dashboard tab invokes a `StorageApi` method
2. `frontend/src/lib/services/storageService.ts` packages a runtime request
3. request goes to offscreen or background
4. runtime handler dispatches to repository/service logic
5. response returns to the web UI

### 4.2 Relevant handlers
- `GET_CONVERSATIONS`
- `GET_TOPICS`
- `GET_RELATED_CONVERSATIONS`
- `GET_ALL_EDGES`
- `GET_MESSAGES`
- `ASK_KNOWLEDGE_BASE`

### 4.3 Edge flow after rc8
For `Network`:
1. derive current base node ids from current conversation subset
2. call `getAllEdges({ threshold, conversationIds })`
3. runtime performs best-effort vector ensure for those ids
4. runtime computes edges among the ensured node set
5. UI derives node/edge visibility from the current replay time locally after receiving the edge set

## 5. Known design constraints

### 5.1 Runtime dependency
The dashboard depends on extension runtime messaging and should not be documented as an independent backend or fully isolated knowledge engine.

### 5.2 Internal interface coupling
The dashboard relies on internal typed adapter contracts. These are stable enough for product work, but still internal and subject to repo-level evolution.

### 5.3 Live data timing
Data may arrive after the shell is already mounted. Tabs must therefore tolerate:
- initial empty states
- late refreshes
- asynchronous runtime recomputation

### 5.4 Network temporal contract is still pending
There is active work on dynamic network-generation animation, where nodes may appear or connect progressively over time.

That work must not assume that:
- anything other than `originAt` should drive node chronology
- `first_captured_at` or `last_captured_at` should move node positions on the main playback timeline
- the current trend scrubber already implies edge-level or storage-level filtering

Before the rest of time-driven `Network` behavior is treated as a finalized contract, the dashboard layer still needs to fix:
- whether time filtering is UI-only or part of the graph data contract
- whether capture / freshness clocks surface only as metadata or also influence secondary visual channels
- whether animation beyond node birth expresses origin time, first capture time, or last capture freshness

### 5.5 Historical document split
Older web/dashboard knowledge is currently spread across dated memos and handoffs. This file replaces them as the canonical ?current architecture? entry for web surfaces while leaving those older files intact as evidence.

### 5.6 Reader parity is still incomplete

Current web/library detail rendering remains more text-centric than the sidepanel reader.

Practical current-state observations:
- the active Library detail surface still renders `message.content_text` directly
- web-side message detail does not yet consume the same rich renderer contract as sidepanel
- citation / artifact sidecars are not yet first-class web detail surfaces

This means web currently has:
- shared or near-shared time semantics
- but incomplete structure semantics relative to sidepanel reader

## 6. Current canonical sources

For web work, the preferred source order is now:
1. `documents/web_dashboard/web_dashboard_engineering_spec.md`
2. `documents/web_dashboard/web_dashboard_current_architecture.md`
3. `documents/web_dashboard/web_dashboard_reader_render_contract.md`
4. `documents/web_dashboard/web_dashboard_rc8_repairs.md`
5. `documents/web_dashboard/web_dashboard_technical_roadmap.md`

Older handoffs remain useful for historical context, but are not the primary norm-setting layer anymore.
