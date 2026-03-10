# Explore Retrieval Technical Roadmap

Status: Forward-looking roadmap  
Audience: Explore maintainers, runtime engineers, product owners

## 1. Goal

Upgrade Explore retrieval from a first-generation conversation-level RAG stack into a higher-trust retrieval system that is:
- more precise
- more inspectable
- more controllable
- more correct for time-scoped questions

The product goal is not to maximize autonomous agent complexity.
The product goal is to make Explore a transparent, controllable, evidence-grounded retrieval workspace.

## 2. Directional principles

### 2.1 Retrieval quality before agent complexity

More planner intelligence does not compensate for poor retrieval evidence.

Priority order should remain:
1. retrieve the right evidence
2. show the evidence clearly
3. let the user control the evidence
4. then add more planning sophistication

### 2.2 High-level planning may be model-driven; evidence collection must remain bounded

The model can decide:
- intent
- route
- whether a time scope is needed

The runtime should still own:
- retrieval execution
- summary generation
- context compilation
- provenance recording

### 2.3 Provenance must stay explicit

Users should be able to see:
- why a source was selected
- whether it came from semantic retrieval or time-scope inclusion
- which route produced the answer
- what evidence was missing when the answer degraded

### 2.4 Weekly retrospective questions must become activity-correct

Questions such as:
- "what did I do this week"
- "what did I work on in the last 7 days"

should ultimately be grounded in message activity within a time window, not only conversation creation dates.

### 2.5 User control steps should remain distinct from model tools

The system should keep a clean distinction between:
- model-chosen or runtime-executed tools
- user decisions such as source inclusion, scope selection, and draft editing

This avoids turning every UI control into fake tool-calling terminology.

### 2.6 Web docs and runtime docs should stay split

This roadmap documents how Explore retrieval should evolve as a user-facing system.
It should not become a duplicate of parser-runtime refactor docs under `capture_engine/`.

## 3. Target future execution model

The desired model is:
- LLM planner decides the high-level route
- bounded runtime tools execute retrieval and evidence preparation
- user checkpoints remain visible and editable

Concretely:
1. planner decides whether the query is:
   - topic lookup
   - cross-conversation summary
   - weekly or time-scoped retrospective
   - clarification-needed
2. retrieval executes with explicit strategy:
   - semantic
   - lexical
   - hybrid
   - time-scoped
3. user may inspect and adjust sources
4. context is compiled
5. answer is synthesized
6. later phases allow partial rerun without redoing the entire pipeline

This is the intended middle ground between:
- a fixed black-box pipeline
- an unrestricted autonomous agent loop

## 4. Near-term roadmap

### 4.1 Fix weekly range correctness

Priority: P0

Current issue:
- weekly retrieval filters on `conversation.created_at`

Target behavior:
- weekly retrieval should derive membership from message timestamps or equivalent activity evidence

Expected result:
- old conversations updated during the selected week are eligible
- "what did I do this week" becomes materially more trustworthy

Likely implementation direction:
- add message-range retrieval helpers
- derive participating conversation ids from messages in range
- build weekly source candidates from those conversation ids

### 4.2 Introduce hybrid retrieval

Priority: P0

Current issue:
- Explore only uses semantic retrieval for normal RAG
- exact keyword matching capability already exists, but is disconnected

Target behavior:
- combine:
  - semantic retrieval
  - lexical retrieval
- merge and dedupe candidate sets before downstream ranking

Expected result:
- better recall on exact terms, formulas, names, acronyms, and unusual tokens
- fewer misses on highly specific user queries

### 4.3 Tighten selected-scope semantics

Priority: P1

Current issue:
- selected scope can append low-confidence conversations into the candidate list

Target behavior:
- selected scope should act as a true hard filter during retrieval
- user-selected but non-matching conversations should be shown separately as manual context candidates, not silently mixed into semantic top-k

Expected result:
- cleaner retrieval evidence
- easier explanation of why a source was used

### 4.4 Add retrieval diagnostics

Priority: P1

Target additions:
- candidate count before thresholding
- candidate count after thresholding
- route label
- time-scope label when applicable
- whether lexical hits were used
- whether summaries were cache hits or generated

This should make retrieval regressions cheaper to debug.

### 4.5 Clarify source inclusion language in the UI

Priority: P1

Current issue:
- labels such as `In range` are technically correct but not user-centered enough

Target behavior:
- source cards should state why they were selected in product language
- examples:
  - `Matched semantically`
  - `Included from selected week`
  - `Included by exact keyword match`

Expected result:
- lower black-box feeling
- clearer mental model for planner route differences

## 5. Medium-term roadmap

### 5.1 Move from conversation-level to chunk-level indexing

Priority: P1

Current issue:
- one vector per conversation is too coarse

Target behavior:
- split conversations into retrieval chunks
- store chunk embeddings separately
- allow top chunks from a single long conversation to compete independently

Benefits:
- better recall for long conversations
- less head-of-thread bias
- better grounding for answer excerpts

Expected architectural consequences:
- new retrieval schema or expanded vector table
- chunk provenance surfaced in UI
- retrieval context built from matched chunks rather than only conversation heads

### 5.2 Add second-stage reranking

Priority: P1

Current issue:
- semantic top-k goes directly into synthesis

Target behavior:
- retrieve a wider candidate pool first
- rerank candidates using a stronger relevance signal before answer synthesis

Possible routes:
- prompt-based reranker
- model-based lightweight scorer
- deterministic score fusion in early versions

### 5.3 Add query rewriting and multi-query retrieval

Priority: P2

Target behavior:
- planner emits one or more retrieval-oriented rewrites:
  - topic-focused rewrite
  - time-constrained rewrite
  - exact-term rewrite
- retrieval unions results across those rewrites before rerank

This is especially useful for ambiguous or high-level questions.

### 5.4 Add explicit retrieval evaluation fixtures

Priority: P2

Target behavior:
- maintain a small local benchmark set of Explore questions and expected source ids
- run this set during major retrieval changes

This will reduce subjective regression review and make retrieval improvements measurable.

## 6. Longer-term roadmap

### 6.1 Background indexing and scalable vector access

Priority: P2

Current issue:
- retrieval currently scans all vectors locally

Target behavior:
- move toward:
  - incremental indexing
  - background refresh
  - more scalable retrieval structures

The exact storage shape can remain local-first, but full scans should not remain the final design.

### 6.2 Rich provenance UX

Target behavior:
- source cards should eventually show:
  - matched chunk summary
  - lexical hit markers
  - retrieval score origin
  - rerank position
  - time-scope inclusion reason

This is the retrieval-side counterpart to transparent tool calls.

### 6.3 Editable retrieval plan and partial rerun

Target behavior:
- user edits:
  - source limit
  - route
  - time scope
  - retrieval depth
- system supports:
  - rerun from retrieval
  - rerun from summary
  - rerun answer only

This work belongs at the boundary between retrieval and agent orchestration.

### 6.4 Run-level persistence instead of message-only metadata

Target behavior:
- move from message-attached execution metadata toward explicit run objects
- store step history, revisions, and rerun lineage cleanly

Expected benefit:
- cleaner audit trail
- better support for partial rerun
- less overload on a single assistant message record

## 7. Recommended implementation order

The highest-value execution order is:

1. weekly activity-range correctness
2. hybrid retrieval
3. retrieval diagnostics
4. selected-scope hard-filter cleanup
5. chunk-level indexing
6. reranking
7. query rewriting and multi-query retrieval
8. benchmark and evaluation set
9. editable retrieval plan and partial rerun

This order improves trust and relevance earlier than a larger agent-loop redesign would.

## 8. Explicit non-goals for this roadmap version

This roadmap does not commit to:
- open-ended autonomous multi-agent loops
- a black-box planner with unrestricted tool replay
- immediate backend or cloud retrieval migration
- replacing current dashboard shell architecture
- redefining parser or capture internals here

Those may interact with Explore in the future, but they are not the primary retrieval roadmap.

## 9. Dependency boundaries

This roadmap depends on, but does not own:
- parser quality and message structure fidelity
- embedding proxy availability and contract stability
- summary and weekly prompt quality
- runtime and offscreen service boundaries

Related companion docs:
- `documents/web_dashboard/web_dashboard_current_architecture.md`
- `documents/orchestration/v1_9_explore_agent_transparent_tooling_spec.md`
- `documents/capture_engine/v1_5_capture_engine_refactor_roadmap.md`

## 10. Recommended reading order

For future Explore retrieval work:
1. `documents/web_dashboard/explore_retrieval_current_architecture.md`
2. `documents/web_dashboard/explore_retrieval_technical_roadmap.md`
3. `documents/orchestration/v1_9_explore_agent_transparent_tooling_spec.md`
4. relevant runtime implementation in `frontend/src/lib/services/searchService.ts`
