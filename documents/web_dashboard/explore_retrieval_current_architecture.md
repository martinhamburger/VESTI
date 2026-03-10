# Explore Retrieval Current Architecture

Status: Current implementation baseline  
Audience: Explore maintainers, frontend/runtime engineers, QA

## 1. Scope

This document describes the current Explore retrieval stack behind the web dashboard.

It focuses on:
- how Explore chooses a route
- what the current runtime tools actually do
- how semantic retrieval currently works
- how weekly and time-scoped retrieval currently works
- where evidence comes from before answer synthesis
- the main quality and correctness limits in the present implementation

It does not redefine global dashboard shell architecture. That baseline remains in:
- `documents/web_dashboard/web_dashboard_current_architecture.md`
- `documents/web_dashboard/web_dashboard_engineering_spec.md`

## 2. Architectural position

Explore is a web/dashboard consumer over runtime-side retrieval logic.

Current layering for Explore retrieval is:
1. `packages/vesti-ui/src/tabs/explore-tab.tsx`
2. `frontend/src/lib/services/storageService.ts`
3. runtime request transport in `background` and `offscreen`
4. `frontend/src/lib/services/searchService.ts`
5. Dexie-backed persistence in `frontend/src/lib/db/*`
6. optional model calls through `llmService.ts` and `embeddingService.ts`

This means:
- the web UI owns presentation, drawer state, source controls, and mode switching
- retrieval strategy, vector usage, summary generation, and answer synthesis are runtime concerns
- Explore is not currently a separate retrieval engine or backend service

## 3. Current user modes and execution routes

Explore currently exposes two top-level user modes:

1. `classic`
   - direct semantic retrieval plus answer synthesis
   - no persisted planner metadata required

2. `agent`
   - bounded transparent execution with persisted tool traces
   - the planner currently selects one of two routes:
     - `rag`
     - `weekly_summary`

### 3.1 Agent `rag` route

Current bounded path:
1. `intent_planner`
2. `search_rag`
3. `summary_tool`
4. `context_compiler`
5. `answer_synthesizer`

This is the normal route for topic lookup and cross-conversation retrieval.

### 3.2 Agent `weekly_summary` route

Current bounded path:
1. `intent_planner`
2. `time_scope_resolver`
3. `weekly_summary_tool`
4. `context_compiler`
5. `answer_synthesizer`

This route is intended for requests such as:
- "what did I do this week"
- "what did I work on in the last 7 days"
- "summarize my recent week"

Planner guardrails now explicitly prevent topic-only queries from taking the weekly path unless the query contains a real time signal.

## 4. What the current tools mean

Current Explore tool traces are not an open-ended model-native tool loop.

They are best described as:
- bounded runtime steps
- partly model-guided at the planning layer
- explicitly logged for user inspection

Current tool semantics:

### 4.1 `intent_planner`

Purpose:
- classify the query
- choose a retrieval route
- decide whether time scope is required
- produce a structured plan for the bounded pipeline

Important note:
- this is the current model-driven decision point
- it does not grant the model unrestricted tool execution

### 4.2 `search_rag`

Purpose:
- run the normal semantic retrieval path
- retrieve candidate conversations from local vectors
- respect user-selected conversation scope when present

### 4.3 `summary_tool`

Purpose:
- enrich top retrieved conversations with cached or generated summaries
- improve downstream answer synthesis readability

This is not a retrieval tool. It does not change which sources were retrieved.

### 4.4 `time_scope_resolver`

Purpose:
- turn relative time language into a concrete date range
- examples: current week to date, last week, last 7 days

### 4.5 `weekly_summary_tool`

Purpose:
- collect sources inside the resolved time window
- reuse cached weekly reports when possible
- otherwise generate a time-scoped retrospective summary

This is a time-window aggregation path, not standard semantic RAG.

### 4.6 `context_compiler`

Purpose:
- transform selected evidence into a structured, editable context draft
- feed the same evidence package into final answer synthesis

### 4.7 `answer_synthesizer`

Purpose:
- generate the final user-facing answer from the compiled evidence package

### 4.8 Manual user control steps

The following UI actions are user control points, not model tools:
- search scope selection
- conversation selection
- source inclusion or exclusion
- context draft editing
- regenerate answer from selected sources

These steps are part of Explore behavior, but should not be mislabeled as LLM tool calls.

## 5. Current semantic retrieval design

### 5.1 Index granularity

Semantic retrieval is currently conversation-level, not chunk-level.

Each conversation contributes at most one vector record:
- table: `vectors`
- key fields:
  - `conversation_id`
  - `text_hash`
  - `embedding`

Current schema baseline:
- `frontend/src/lib/db/schema.ts`

### 5.2 Embedding input

Current embedding input is built from:
- conversation title
- conversation snippet
- the first `MAX_MESSAGE_COUNT` messages

Important current limits:
- `MAX_MESSAGE_COUNT = 12`
- `MAX_TEXT_LENGTH = 4000`
- embedding input is normalized again to `MAX_EMBEDDING_CHARS = 2048`

This means long conversations are represented by a compressed head-of-thread snapshot rather than their full content.

### 5.3 Embedding provider path

Embeddings are currently requested through the proxy embeddings route:
- `frontend/src/lib/services/embeddingService.ts`

Current assumptions:
- embedding is online, not local
- embedding availability depends on model and proxy configuration
- Explore retrieval quality is therefore partly constrained by embedding availability

### 5.4 Retrieval algorithm

Current `search_rag` behavior:
1. embed the user query
2. load all vectors from IndexedDB
3. filter by user-selected conversation scope if present
4. compute similarity against each stored conversation vector
5. discard results below a fixed threshold (`0.15`)
6. sort descending
7. keep top `k`

Current consequences:
- retrieval is a full local scan, not ANN
- cost grows with number of conversations
- retrieval quality depends heavily on a single vector per conversation

### 5.5 Retrieved evidence package

For each retrieved conversation, Explore currently builds:
- a source chip
- an excerpt
- a context block with:
  - title
  - platform
  - the first `12` messages

Those context blocks are concatenated and handed to answer synthesis.

## 6. Current summary and synthesis stack

### 6.1 Summary enrichment

The `summary_tool` is an evidence-enrichment layer, not a primary retrieval layer.

Behavior:
1. check summary cache
2. if missing and a model is available, generate a summary for top sources
3. feed those summary snippets into the final synthesis prompt

This improves readability and answer cohesion, but it does not change which conversations were retrieved in the first place.

### 6.2 Final synthesis

Final answer generation currently uses:
- retrieved conversation blocks
- optional prior chat history context
- optional summary hints

The final prompt is source-grounded, but source quality is still bounded by the coarse conversation-level retrieval described above.

## 7. Current weekly retrieval design

Weekly retrieval is not standard semantic RAG.

It currently behaves as:
1. planner detects a weekly or time-scoped intent
2. `time_scope_resolver` turns relative time into a concrete date range
3. `weekly_summary_tool` collects conversations in that range
4. the tool reuses:
   - cached weekly report, or
   - generated weekly report, or
   - custom summary fallback

### 7.1 Important correctness caveat

Current weekly range selection uses:
- `conversation.created_at`

not:
- message-level timestamps inside the requested range
- reliable activity timestamps for the thread

This is a real limitation.

Example:
- a conversation created last month but heavily updated this week
- may not appear in "what did I do this week"

Therefore the weekly route is currently useful, but not yet fully correct for activity-based retrospective questions.

### 7.2 Why the UI may show `In range`

When the weekly route is active, a source may be labeled `In range`.

That label means:
- the conversation was included because it falls inside the selected time window
- it was not selected because of semantic similarity score

This is correct for the current route, but the label is more of an implementation-facing marker than ideal user language.

## 8. Existing non-vector retrieval capability

The repository already contains a lexical helper:
- `searchConversationIdsByText(query)`

Current behavior:
- scans message text and returns matching conversation ids

Important note:
- Explore retrieval does not currently integrate this helper into the normal retrieval path
- semantic and lexical retrieval are still separate capabilities

This means precise keyword queries, special symbols, or exact terminology are not yet strengthened by a hybrid retrieval layer.

## 9. Current strengths

The current stack already has several useful properties:

1. fully local retrieval over persisted conversation vectors
2. transparent execution trace in agent mode
3. user-visible source controls and editable context draft
4. bounded planner route selection instead of open-ended hidden loops
5. graceful degradation when model synthesis is unavailable

These are meaningful product strengths even though retrieval quality is still first-generation.

## 10. Current limitations

### 10.1 Coarse retrieval unit
- one vector per conversation
- no chunk-level targeting

### 10.2 Head-of-thread bias
- only first messages are embedded and later reused for answer context
- later turns in long conversations can be invisible to retrieval

### 10.3 No hybrid retrieval
- semantic retrieval is used alone
- lexical hit candidates are not merged

### 10.4 No reranking stage
- top semantic results are passed directly downstream
- there is no second-stage relevance refinement

### 10.5 No retrieval observability metrics
- current UI shows tool traces
- it does not yet expose recall-oriented retrieval diagnostics

### 10.6 Weekly path is range-based, not activity-based
- current weekly selection uses conversation creation time
- this can miss ongoing work in older threads

### 10.7 Selected scope fallback can be noisy
- when selected scope is enforced, non-matching selected conversations may still be appended with low or zero similarity semantics
- this is transparent, but not ideal retrieval hygiene

### 10.8 Similarity implementation assumes normalized embeddings
- the current similarity helper behaves like a dot product unless embeddings are already unit-normalized
- if embedding normalization assumptions change, ranking quality can drift

## 11. Current architectural implication

The current Explore system should be described as:

**bounded transparent agent orchestration over a first-generation local RAG stack**

It is not yet:
- chunk-based RAG
- hybrid retrieval
- rerank-based retrieval
- message-level temporal retrospective retrieval
- a fully autonomous multi-agent research system

## 12. Canonical code references

Current implementation hotspots:
- `frontend/src/lib/services/searchService.ts`
- `frontend/src/lib/db/repository.ts`
- `frontend/src/lib/db/schema.ts`
- `frontend/src/lib/services/storageService.ts`
- `packages/vesti-ui/src/tabs/explore-tab.tsx`

## 13. Canonical companion docs

For current Explore work, recommended reading order is:
1. `documents/web_dashboard/web_dashboard_engineering_spec.md`
2. `documents/web_dashboard/web_dashboard_current_architecture.md`
3. `documents/orchestration/v1_9_explore_agent_transparent_tooling_spec.md`
4. `documents/web_dashboard/explore_retrieval_current_architecture.md`
5. `documents/web_dashboard/explore_retrieval_technical_roadmap.md`
