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
- render graph via ECharts
- apply platform filtering without mutating the underlying node-set fetch contract

As of rc8, `Network` explicitly requests edges for its active base node set rather than passively reading whatever vectors already exist.

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
5. UI filters visibility by active platform selection only after receiving the edge set

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

### 5.4 Historical document split
Older web/dashboard knowledge is currently spread across dated memos and handoffs. This file replaces them as the canonical ?current architecture? entry for web surfaces while leaving those older files intact as evidence.

## 6. Current canonical sources

For web work, the preferred source order is now:
1. `documents/web_dashboard/web_dashboard_engineering_spec.md`
2. `documents/web_dashboard/web_dashboard_current_architecture.md`
3. `documents/web_dashboard/web_dashboard_rc8_repairs.md`
4. `documents/web_dashboard/web_dashboard_technical_roadmap.md`

Older handoffs remain useful for historical context, but are not the primary norm-setting layer anymore.
