# Threads Search Engineering Spec

Version: topic-based canonical spec  
Phase: threads-search-and-reader-navigation  
Status: Decision Complete (Docs only; no code implementation in this pass)  
Audience: Frontend engineers, QA, release owners

---

## 1. Summary

This document defines the formal frontend engineering plan for upgrading Threads search from a conversation-level boolean hit model to a driven match-summary model that can support Reader navigation and highlight.

This is a topic-based canonical spec under `documents/ui_refactor/`.
It intentionally does not introduce a new `v1.8.x`-style filename.

Locked decisions:

1. `SearchSession` is promoted to `VestiSidepanel` top-level state instead of remaining local to `TimelinePage`.
2. Search result ordering remains `updated_at` descending.
3. Offscreen search returns only lightweight conversation-level match summaries.
4. Reader builds occurrence-level navigation locally after messages are loaded.
5. Reader must expose an explicit `reader_building_index` state.
6. List restore uses `anchorConversationId` as the primary restore target rather than raw `scrollTop`.
7. Highlight scope is limited to text-capable nodes; it does not expand into `code_block`, `math`, or table-cell-level rich parsing in this phase.

---

## 2. Current Baseline

Current behavior remains split across two unrelated mechanisms:

1. Title and snippet matching happen locally in the Threads list.
2. Message-body search goes through `searchConversationIdsByText(query)` and returns only `number[]` conversation ids.
3. Reader does not receive search context and cannot navigate or highlight body hits.
4. Opening Reader unmounts `TimelinePage`, so local search state would be lost unless it is lifted.

This means the current implementation can only answer "did this conversation match somewhere in messages" but cannot drive:
- best-match excerpt rendering in the list
- first-hit landing in Reader
- occurrence navigation in Reader
- stable return to the filtered list context

---

## 3. Phase Roadmap

### Phase 1 - State Machine Foundation

Goal: lift `SearchSession` into `VestiSidepanel` so Threads list and Reader consume one controlled state source.

Key changes:
- `VestiSidepanel.tsx` introduces `ThreadsState` reducer ownership.
- `TimelinePage.tsx` becomes a controlled surface for query and filters.
- `ConversationList.tsx` consumes `session` props instead of owning query state.

Completion criteria:
- `ConversationList` no longer owns query state via `useState` or query-driving `useEffect`.
- Opening and closing Reader does not mutate the top-level `session` unless the user intentionally changes list-side inputs.

Boundary rule:
- this phase only moves state ownership
- no rendering changes
- no search-result contract change

### Phase 2 - Offscreen Contract Upgrade

Goal: replace `searchConversationIdsByText` with a lightweight summary interface that can power list excerpts and Reader entry.

#### Repository / storage / messaging signature

```ts
export interface SearchConversationMatchesQuery {
  query: string;
  conversationIds?: number[];
}

export interface ConversationMatchSummary {
  conversationId: number;
  firstMatchedMessageId: number;
  bestExcerpt: string;
}

export async function searchConversationMatchesByText(
  params: SearchConversationMatchesQuery
): Promise<ConversationMatchSummary[]>;
```

The same shape must be used consistently in:
- repository
- `storageService`
- messaging protocol / offscreen handler

Message type upgrade:

```ts
SEARCH_CONVERSATION_MATCHES_BY_TEXT
```

Payload shape:

```ts
{ query: string; conversationIds?: number[] }
```

Response shape:

```ts
ConversationMatchSummary[]
```

Semantics:
- `firstMatchedMessageId` is the earliest matched message within that conversation by `created_at`; if timestamps tie, the lower message id wins.
- `bestExcerpt` must come from the same message identified by `firstMatchedMessageId`.
- `conversationIds` is an optional candidate-set constraint from the currently filtered list and exists to reduce offscreen scan cost.
- `matchedInMessages` is not a repository field; it is derived in the list layer from the presence of a summary plus local title/snippet matching.

Explicit exclusions for this phase:
- no `totalOccurrenceCount`
- no full `matchedMessageIds`
- no per-message occurrence offsets
- no occurrence-level data emitted from offscreen

Performance guardrail:
- benchmark the new summary interface against the current id-only path on the largest local conversation set before merge
- if excerpt extraction causes a meaningful responsiveness regression, simplify excerpt logic rather than expanding the return shape

### Phase 3 - List Highlight Rendering

Goal: make `ConversationCard` visually distinguish title hits, snippet hits, and message-body hits without using `dangerouslySetInnerHTML`.

Key changes:
- introduce `splitWithHighlight(text, query): HighlightedSegment[]` as a reusable pure function
- use `bestExcerpt` to replace the displayed snippet when the hit exists only in message body
- keep the existing `Matched in messages` badge as the explanatory hint

Completion criteria:
- title-hit, snippet-hit, and message-only-hit cards are visually distinguishable
- highlight logic is reusable by Reader in a later phase
- highlight utility includes tests for empty query, case-mixed query, and multi-line text behavior

### Phase 4 - Reader State Transition and Navigation Skeleton

Goal: make Reader search-aware before full inline highlight is injected.

Key changes:
- `ReaderView` receives `searchQuery` and `firstMatchedMessageId`
- Reader state is explicit:
  - `reader_loading_messages`
  - `reader_building_index`
  - `reader_ready`
- `ReaderSearchModel` is created locally after messages load
- navigation controls render disabled/loading state during `reader_building_index`

Completion criteria:
- opening a matched Reader first shows a loading/building state rather than a silent jump
- once index building completes, the UI shows `1 / N`
- the first occurrence is visible in the viewport
- `BACK_TO_LIST` restores the list query and `anchorConversationId`

Boundary rule:
- navigation must work even if the user exits during `reader_building_index`
- `SearchSession` remains frozen while Reader is active

### Phase 5 - Reader Highlight Injection

Goal: inject highlight markup into allowed text nodes and make prev/next navigation focus the current occurrence.

Key changes:
- `AstMessageRenderer` uses the shared highlight splitter on text-capable nodes
- `MessageBubble` uses the same utility in plain-text fallback mode
- Reader navigation scrolls and focuses the active rendered occurrence target

Allowed highlight targets:
- paragraph text
- heading text
- list item text
- blockquote text
- `strong`
- `em`
- `code_inline`

Out of scope for this phase:
- `code_block`
- `math`
- table-cell rich matching

Stability rule:
- occurrence indexing and rendered node targeting must use a stable node path string rather than ephemeral runtime ids
- recommended pattern: `msg-42:p[1]:text[0]`

---

## 4. UX and Performance Guardrails

### 4.1 Search session freeze/thaw

When entering Reader from Threads search results:
- freeze the current `SearchSession`
- do not allow Reader-side navigation to mutate list-side result summaries

When returning to the list:
- thaw the same `SearchSession`
- restore list context around `anchorConversationId`

### 4.2 List restore strategy

Primary restore key:
- `anchorConversationId`

Fallback only:
- `scrollTop?: number`

`scrollTop` may be stored for diagnostics or fallback use, but it must not be treated as authoritative in dynamic-height card scenarios.

### 4.3 Reader loading honesty

Reader must not appear fully ready before it has occurrence navigation.
The UI must visibly distinguish:
- loading messages
- building local occurrence index
- ready for navigation

---

## 5. Acceptance Criteria

1. The top-level Threads state survives Reader open/back transitions without losing search inputs.
2. Offscreen summary contract never expands into occurrence-level payloads.
3. `bestExcerpt` and `firstMatchedMessageId` are always sourced from the same message.
4. Reader exposes a visible `reader_building_index` step before first navigation is ready.
5. List restore is anchor-based, not `scrollTop`-based.
6. Highlight is reusable across list and Reader without raw HTML injection.

---

## 6. Non-goals

1. Persisting occurrence offsets to storage.
2. Relevance-based resorting of Threads list.
3. Rich highlight inside `code_block`, `math`, or table-cell substructures.
4. Expanding offscreen payloads with per-occurrence detail.
5. Implementing the code changes in this document during this pass.
