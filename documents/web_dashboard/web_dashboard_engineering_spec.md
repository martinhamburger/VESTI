# Web Dashboard Engineering Spec

Status: Active baseline  
Audience: Frontend engineers, QA, release owners  
Scope: Web dashboard shell and its Library / Explore / Network views

## 1. Summary

The web dashboard is the **browser-extension-hosted web surface** for browsing, exploring, and inspecting Vesti data. It is not the primary home of capture, parser, persistence, or semantic extraction logic. Instead, it acts as a structured UI consumer over extension runtime capabilities exposed through an internal message-backed storage adapter.

The dashboard currently centers on three tabs:
1. `Library`
2. `Explore`
3. `Network`

It also includes two shared shell concerns:
- appearance/theme synchronization
- settings/data-operation drawers

## 2. Product and engineering boundary

### Web dashboard responsibilities
- render dashboard shell and tab routing
- orchestrate user interactions for Library / Explore / Network
- subscribe to data refresh and UI theme changes
- consume internal storage/runtime capabilities through a typed adapter
- present recovery-safe UI even when runtime capabilities are temporarily unavailable

### Out of scope for the web dashboard
- parser and DOM extraction strategy
- capture governance decisions
- persistence semantics and dedupe rules
- embedding generation policy
- offscreen/background business logic implementation

These remain owned by extension runtime modules and capture-engine internals.

## 3. System shape

### 3.1 Entry and shell
- `frontend/src/dashboard.tsx` mounts the web dashboard page and injects the full `storage` adapter plus theme synchronization hooks
- `packages/vesti-ui/src/dashboard.tsx` is the primary UI shell
- `@vesti/ui` owns tab layout, drawer state, and most user-facing dashboard interactions

### 3.2 Tabs
- `Library`
  - conversation browsing, metadata updates, messages, summary access, related conversations, notes linkage
- `Explore`
  - question-driven retrieval and conversation-source exploration
- `Network`
  - relationship graph over conversation nodes and similarity edges

### 3.3 Data contract
The dashboard depends on an internal `StorageApi` contract rather than talking directly to Dexie or runtime modules.

Important internal dependencies include:
- `getConversations`
- `getTopics`
- `getRelatedConversations`
- `getAllEdges`
- `getMessages`
- `askKnowledgeBase`
- note / summary / export / data-management methods

## 4. State flow and refresh rules

### 4.1 Data refresh
Library data is loaded through a shared provider and refreshed on runtime `VESTI_DATA_UPDATED` events.

This means the web dashboard should assume:
- runtime data may change outside the current page
- tab-level components should be resilient to late-arriving state
- UI correctness must not depend on hidden side effects from another tab

### 4.2 Theme state
The dashboard shell consumes shared UI settings and stays synchronized with dock appearance through `vesti_ui_settings.themeMode`.

### 4.3 Tab isolation rule
A web tab must not rely on another tab?s incidental side effects for baseline correctness.

Examples:
- `Network` must not require prior `Library` detail opens to obtain valid edges
- `Explore` must not depend on unrelated Library refresh order for its own correctness

This rule is now a formal engineering constraint for future web work.

## 5. Network-specific contract

`Network` operates on two logical datasets:
- current node set: typically the recent conversation subset chosen for graph display
- edge set: similarity links among the current node set

Locked requirements:
- entering `Network` must be sufficient to compute and render real edges for the active node set
- edge availability must not depend on whether a conversation was previously opened in `Library`
- platform filtering may reduce visible edges, but must not silently redefine the underlying node-set computation contract
- genuine empty graphs are allowed if similarity truly does not produce edges

## 6. Internal interface notes

The web dashboard depends on the following internal edge contract as of rc8:
- `StorageApi.getAllEdges(options?: { threshold?: number; conversationIds?: number[] })`
- `GET_ALL_EDGES` payload: `{ threshold?: number; conversationIds?: number[] }`

These are internal engineering contracts used to keep `Network` self-sufficient. They are not public API commitments.

## 7. Non-goals for this spec version

This spec does not define:
- new graph UX patterns
- new storage schema
- parser/runtime refactors
- unified diagnostics system for all tabs
- handoff/release procedures

Those concerns belong to other document families unless they directly change web dashboard behavior.
