# Vesti v1.9 Explore Transparent Agent Tooling Spec

Version: v1.9.0-proposed  
Status: implementation baseline  
Audience: dashboard/frontend engineers, QA

---

## 1. Goal

Upgrade Explore from a single opaque RAG call into a transparent, controllable agent flow while preserving the existing chat-first UI layout.

Key principles:

1. Keep the existing Explore shell (session list + chat stream + input).
2. Add an explicit mode switch: `Agent` vs `Classic`.
3. Persist full tool-call traces on each assistant message.
4. Provide editable context draft workflow:
   - select sources
   - edit draft
   - save
   - copy/download txt
   - prefill into new chat

---

## 2. Runtime Design

Explore now supports two execution modes:

1. `classic`
   - Original vector retrieval + answer synthesis path.
   - No tool-call timeline required.
2. `agent`
   - Controlled 4-step chain with bounded behavior:
     - `query_planner`
     - `search_rag`
     - `summary_tool`
     - `context_compiler`
     - `answer_synthesizer`
   - Any step failure records a failed tool call and downgrades to classic answer fallback.

### 2.1 Tool semantics

1. `query_planner`
   - Heuristic plan from user query.
   - Decides source limit + summary target count.
2. `search_rag`
   - Reuses existing embedding/vector retrieval.
   - Produces ranked sources + retrieved context blocks.
3. `summary_tool`
   - Priority: read existing summary cache.
   - On miss: opportunistically generate summary for top N candidates.
4. `context_compiler`
   - Builds user-editable context draft text.
   - Builds source candidates list with snippet/excerpt.
5. `answer_synthesizer`
   - Synthesizes answer from retrieved context + summary hints.
   - If model unavailable, falls back to deterministic local answer.

### 2.2 Failure behavior

Failure of any tool step:

1. Mark that tool call `failed` with error text.
2. Keep accumulated successful tool calls.
3. Generate fallback answer through classic/local fallback.
4. Persist tool trace + context payload so user can inspect.

---

## 3. Data Contract Changes

### 3.1 Types

Added explore-agent types:

1. `ExploreMode` (`agent | classic`)
2. `ExploreToolCall`
3. `ExploreContextCandidate`
4. `ExploreAgentMeta`

`RagResponse` now supports optional:

- `agent?: ExploreAgentMeta`

`ExploreMessage` now supports:

- `agentMeta?: ExploreAgentMeta`

### 3.2 IndexedDB schema

Dexie upgraded to v11:

- Table: `explore_messages`
- Added field: `agentMeta` (JSON serialized string)

Stored fields inside `agentMeta`:

1. `mode`
2. `toolCalls[]`
3. `contextDraft`
4. `contextCandidates[]`
5. `selectedContextConversationIds[]`
6. optional `totalDurationMs`

### 3.3 Repository API

Added method:

- `updateExploreMessageContext(messageId, contextDraft, selectedContextConversationIds)`

Behavior:

1. Loads existing message.
2. Merges and persists updated context data into `agentMeta`.
3. Keeps prior tool calls unchanged.

---

## 4. Messaging & Storage API

### 4.1 Protocol updates

`ASK_KNOWLEDGE_BASE` request payload now supports:

- `mode?: ExploreMode`

Added request type:

- `UPDATE_EXPLORE_MESSAGE_CONTEXT`

Payload:

1. `messageId`
2. `contextDraft`
3. `selectedContextConversationIds`

Response:

- `{ updated: true }`

### 4.2 Service API updates

`storage.askKnowledgeBase(...)` now accepts optional mode:

- `(query, sessionId?, limit?, mode?)`

Added optional storage API:

- `updateExploreMessageContext(messageId, contextDraft, selectedContextConversationIds)`

Web adapter can omit it; UI falls back to local-only edit state.

---

## 5. Explore UI Behavior

### 5.1 Main area

1. Header mode switch: `Agent | Classic`.
2. Existing message stream remains unchanged.
3. Agent assistant messages include a `Tool Calls` summary strip.
4. Strip click opens right-side detail drawer.

### 5.2 Right detail drawer

Tabs:

1. `Tool Calls`
   - Ordered step cards.
   - Shows status, duration, input summary, output summary, error.
2. `Context Draft`
   - Candidate source checklist.
   - Editable draft textarea.
   - Actions: Save / Copy / Download TXT / New Chat (Prefill).

### 5.3 New chat prefill

`New Chat (Prefill)`:

1. Starts a new Explore chat session context.
2. Injects context draft into input box as visible editable text.
3. Does not auto-send.

---

## 6. QA Acceptance Checklist

1. Agent mode returns answer + sources + tool-call trace.
2. Classic mode returns answer + sources without tool-call strip.
3. Summary cache miss does not break response path.
4. LLM config missing does not hard-fail Explore; fallback answer is shown.
5. Context draft save survives message reload via storage.
6. Copy/download/new-chat-prefill actions work.
7. Existing session rename/delete/new chat/source open behavior remains intact.

---

## 7. Known Scope Boundaries

1. This release is extension-first.
2. Web adapter support is best-effort and may run in degraded mode for context-save API.
3. Tool parameter editing/replay is not included in this phase.
4. Agent chain is bounded; no open-ended iterative loop.
