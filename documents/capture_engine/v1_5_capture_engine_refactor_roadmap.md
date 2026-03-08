# Vesti v1.5 Capture Engine Refactor Roadmap

Status: Planning draft  
Audience: Capture engine maintainers, parser engineers, release owners  
Scope: Parser layer + shared semantic abstraction layer only

---

## 1. Goal

Define the next-step refactor direction for capture-engine internals after rc7.

This roadmap is intentionally limited to:
- parser internals
- shared semantic extraction
- parser observability
- parser/runtime boundary clarity

It explicitly does **not** redesign:
- capture governance reason codes
- dedupe or persistence semantics
- storage schema
- full multi-platform unification in one step

The practical objective is to make future platform repair work cheaper, more observable, and less coupled to reader-specific regressions.

---

## 1.1 Design Inputs

This roadmap is derived from:
- `documents/capture_engine/capture_debugging_playbook.md`
- `documents/capture_engine/manual_sampling_and_acceptance.md`
- `documents/capture_engine/v1_3_phase2_*`
- `documents/capture_engine/v1_3_phase3_*`
- `documents/capture_engine/v1_3_platform_expansion_spec.md`
- the rc7 handoff and the shipped ChatGPT / Qwen / shared AST / reader fixes

---

## 2. Why a Refactor Is Needed

The current parser architecture evolved successfully through platform onboarding, but it now shows scaling pressure:

- platform parsers mix discovery, role inference, sanitization, normalization, extraction, and diagnostics in one file
- shared AST still sees too much raw vendor DOM
- similar fixes repeat across platforms without an explicit abstraction boundary
- debugging vocabulary is governance-oriented, but newer failures are structure-oriented

rc7 showed that patching platform-specific issues is still feasible, but the cost rises sharply once the page contains:
- Monaco / CodeMirror / virtualized editors
- custom markdown blocks without semantic HTML
- dense UI controls colocated with answer content
- mixed content answers combining prose, math, tables, lists, and code

---

## 3. Proposed Layered Model

The next version should formalize the capture pipeline into five internal layers.

## 3.1 Layer 1 - Candidate Discovery

Responsibility:
- locate likely conversation root
- collect candidate turn/message nodes
- support selector and anchor discovery paths

Inputs:
- raw document
- host/platform identity

Outputs:
- ordered candidate elements with discovery metadata

Rules:
- keep discovery broad enough to survive DOM drift
- keep discovery separate from semantic extraction
- record which path produced each candidate set

## 3.2 Layer 2 - Role and Boundary Inference

Responsibility:
- infer `user` vs `ai`
- decide message boundary for each candidate
- resolve ambiguous containers using scoring rules

Inputs:
- candidate elements from discovery
- platform-local role hints and boundary hints

Outputs:
- normalized message containers with role labels or explicit drop reasons

Rules:
- direct role markers beat heuristic descendants
- contradictory user/assistant evidence should remain nullable, not force-classified
- scoring should stay observable and platform-local when needed

## 3.3 Layer 3 - Platform Structural Normalization

Responsibility:
- convert vendor-specific DOM into stable semantic structure before shared extraction

Examples:
- Monaco / CodeMirror -> semantic code blocks
- custom markdown paragraph wrappers -> `<p>` / spacing normalization
- toolbar/action/noise blocks -> removed or detached
- special answer cards that should not enter message content -> dropped locally

Inputs:
- platform message container

Outputs:
- normalized semantic DOM subtree
- optional normalization diagnostics

Rules:
- normalization is the preferred home for vendor-specific DOM recovery
- this layer must not alter message meaning, only structure and noise boundaries
- normalization output should aim for standard semantic HTML whenever possible

## 3.4 Layer 4 - Shared Semantic Extraction

Responsibility:
- convert normalized semantic DOM into shared AST
- handle math, tables, lists, inline code, block code, blockquotes, headings, paragraphs

Inputs:
- normalized semantic DOM

Outputs:
- shared AST + degraded node diagnostics

Rules:
- extractor logic should assume normalized input, not raw vendor DOM
- semantic root qualification must be strict
- shared logic may probe descendants inside a validated root, but should not let descendants define the root class loosely

## 3.5 Layer 5 - Governance and Transient Integration

Responsibility:
- connect parser output to existing transient/governance flow
- define clean boundaries with runtime event emission and storage write path

Inputs:
- parsed messages + session identity + diagnostics

Outputs:
- existing parser contract consumed by capture pipeline

Rules:
- governance semantics remain unchanged in this refactor
- `held/committed/rejected` meaning does not move into parser internals
- startup warm capture belongs to content-entry/runtime integration, but should be designed as a formal parser availability hook

---

## 4. Proposed Internal Abstractions

These are design concepts for the next version, not immediate public APIs.

## 4.1 Platform normalizer

A per-platform module that receives a resolved message content container and returns a normalized semantic subtree.

Intent:
- keep Monaco / custom markdown / toolbar handling out of shared AST
- make platform quirks explicit and locally testable

## 4.2 Semantic extraction input contract

Shared extraction should explicitly treat its input as:

`normalized semantic DOM -> shared AST`

This is important because it narrows what shared code is expected to understand.
It should not be the first line of defense for arbitrary raw site DOM.

## 4.3 Extended parser diagnostics

Current parse stats are strong on candidate discovery but weak on structural interpretation.
Future diagnostics should add room for:
- normalization hit count
- normalization fallback count
- complex component markers hit (for example editor, custom markdown block, math root)
- degraded node causes, not only degraded totals

These additions should stay internal first and only become durable contract fields after they prove useful.

---

## 5. Migration Strategy

This refactor should be done incrementally, not as a flag-day rewrite.

## 5.1 Phase A ? Diagnostic and taxonomy upgrade

Deliverables:
- add new failure taxonomy to docs and debug playbook
- define normalization-stage diagnostics in design
- expand manual sampling to include format fidelity

No-go if:
- the team still lacks a shared vocabulary for structure failures

## 5.2 Phase B ? Extract normalization as a first-class parser stage

Deliverables:
- formalize a local normalization hook in parser flow
- move existing rc7 ad-hoc normalization logic into that stage without changing runtime semantics

Priority platforms:
1. ChatGPT
2. Qwen

Reason:
- highest complexity
- already proven by rc7 fixes
- strongest reference implementations for future platforms

## 5.3 Phase C ? Tighten shared semantic extraction assumptions

Deliverables:
- clean root qualification rules for math/table/list/code
- reduce shared fallback guessing against raw vendor DOM
- keep extractor focused on semantic structure only

## 5.4 Phase D ? Reader and parser contract alignment

Deliverables:
- document which AST nodes are considered release-critical
- ensure sampling validates parser output and reader output together for rich content

Note:
- this is not a reader redesign
- it is contract alignment between parser output and reader expectations

## 5.5 Phase E ? Extend the pattern to other platforms

After ChatGPT/Qwen become reference implementations, progressively apply the same model to:
- Doubao
- Kimi
- Yuanbao
- Claude / Gemini / DeepSeek only where complexity justifies it

Do not force all platforms into the same complexity level if their DOM remains simple enough.

---

## 6. What the Next Version Should Explicitly Not Do

To keep the scope stable, the next version should not:

- redesign governance decision rules
- change `missing_conversation_id` policy
- change dedupe write semantics
- change runtime event semantics such as `VESTI_DATA_UPDATED`
- redesign IndexedDB schema
- attempt a single universal parser framework that erases platform adapters

The correct target is **clearer layering**, not false uniformity.

---

## 7. Documentation Backfills Required Later

Once implementation starts, the following existing documents should be updated to reflect the new model:

1. `documents/capture_engine/v1_3_platform_expansion_spec.md`
   - upgrade parser strategy stack to include structural normalization and semantic extraction explicitly
2. `documents/capture_engine/capture_debugging_playbook.md`
   - add `structure_collapse`, `editor_virtualization`, `semantic_extractor_misclassification`
3. `documents/capture_engine/manual_sampling_and_acceptance.md`
   - add format fidelity matrix and reader-render verification

This roadmap intentionally records the gaps first instead of editing all old docs in the same round.

---

## 8. Acceptance Criteria for the Refactor Initiative

The next-cycle refactor should be considered successful only if it achieves all of the following:

1. A platform-specific complex structure can be fixed primarily in the normalization layer.
2. Shared AST no longer needs broad vendor-specific DOM heuristics for those cases.
3. Parser logs can distinguish discovery fallback from normalization fallback.
4. Manual QA can classify whether a bug belongs to discovery, normalization, extraction, or rendering.
5. ChatGPT and Qwen become the reference examples for the layered model.

---

## 9. Recommended First Implementation Slice

If engineering starts immediately after this planning round, the first practical slice should be:

1. formalize a normalization-stage hook in parser flow
2. port existing ChatGPT local sanitize/cleanup logic into that explicit stage
3. port existing Qwen Monaco + markdown block normalization into the same stage concept
4. document the expected input contract of shared AST extraction
5. upgrade sampling docs to require rich-content fidelity checks

This slice is small enough to ship incrementally and large enough to validate the architecture.

---

## 10. Closing Direction

The next capture-engine upgrade should be driven by one architectural rule:

> raw site DOM is not the final parser input; normalized semantic DOM is.

If that rule is adopted consistently, future platform fixes should become:
- smaller in scope
- easier to diagnose
- safer to ship late in RC cycles
- less entangled with reader regressions and governance stability
