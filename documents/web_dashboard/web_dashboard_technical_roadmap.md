# Web Dashboard Technical Roadmap

Status: Forward-looking roadmap  
Audience: Frontend maintainers, release owners, adjacent runtime engineers

## 1. Goal

Define the next technical evolution of the web dashboard as a product surface and engineering system, while keeping clear boundaries with capture-engine and runtime-internal refactors.

This roadmap is intentionally limited to the web view and its immediate contracts.

## 2. Directional principles

### 2.1 Web correctness must be self-owned
Each tab should request or derive the data needed for its own baseline correctness.
No tab should rely on another tab?s warm side effects.

### 2.2 UI shell and runtime contracts must stay explicit
The dashboard should continue to consume typed adapter methods instead of reaching into runtime internals directly.

### 2.3 Web specs and runtime specs should stay split
Parser / DOM / semantic-extraction redesign belongs in `documents/capture_engine/*`.
The web roadmap should only describe how the dashboard depends on those systems, not duplicate their internal plans.

## 3. Near-term web roadmap

### 3.1 Network hardening
Priority work after rc8:
- add stronger graph diagnostics for node count / edge count / empty-graph reasons
- separate ?true empty graph? from ?runtime unavailable? and ?edge computation failed? states
- consider lightweight graph refresh hooks when base node set changes rapidly

### 3.2 Explore / Network contract clarity
- keep retrieval and network graph contracts explicit in `StorageApi`
- avoid hidden coupling where one discovery surface quietly prepares another
- document all cross-tab jumps and the data they are allowed to assume

### 3.3 Dashboard observability
- add web-surface-focused debug views or structured logs for late data, empty graph, and adapter failure modes
- make regression diagnosis cheaper without requiring deep runtime forensics every time

## 4. Medium-term roadmap

### 4.1 Dedicated web state contracts
The dashboard increasingly deserves explicit local contracts for:
- loading states
- stale states
- runtime unavailable states
- partial capability states

This is especially important for `Network` and `Explore`, where user trust depends on understanding whether the system is empty, loading, or degraded.

### 4.2 Web-specific spec maturity
The new `documents/web_dashboard/` directory should become the durable source of truth for:
- architecture
- repair history
- roadmap
- engineering boundaries

Future web work should add or revise canonical docs here instead of creating another scattered web memo unless the document is intentionally a dated handoff.

## 5. Dependency boundaries with capture engine

The dashboard roadmap depends on, but does not own, the following deeper work:
- parser structural normalization
- shared semantic extraction improvements
- parser diagnostics expansion
- runtime/parser boundary clarification

Those future directions are already tracked in:
- `documents/capture_engine/v1_4_capture_engine_hardening_retrospective.md`
- `documents/capture_engine/v1_5_capture_engine_refactor_roadmap.md`

The web layer should reference those documents when a UI feature depends on improved parser/runtime guarantees, rather than re-specifying parser internals here.

## 6. Explicit non-goals for this roadmap version

This roadmap does not commit to:
- new storage schema
- new release packaging flow
- parser-layer implementation plans
- redesigning global IA or component-system contracts

Those belong to other document families unless they directly alter web dashboard behavior.
