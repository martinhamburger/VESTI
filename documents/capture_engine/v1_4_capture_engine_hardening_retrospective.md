# Vesti v1.4 Capture Engine Hardening Retrospective

Status: Draft for next-cycle planning  
Audience: Capture / parser / reader engineers, release owners  
Source window: rc7 pre-release GPT + Qwen manual debugging and compatibility fixes

---

## 1. Purpose

This document fixes the engineering lessons from the rc7 pre-release debugging rounds for ChatGPT and Qwen.

It does **not** define a new runtime contract.
Its job is to answer four questions clearly:

1. What kind of failures actually happened?
2. Which fixes worked and should be repeated?
3. Which anti-patterns caused unnecessary fragility?
4. Which lessons must be promoted into future capture-engine design rules?

---

## 1.1 Evidence Basis

This retrospective is based on the following materials:
- `documents/capture_engine/capture_debugging_playbook.md`
- `documents/capture_engine/manual_sampling_and_acceptance.md`
- `documents/capture_engine/v1_3_phase2_manual_sampling_checklist.md`
- `documents/capture_engine/v1_3_phase2_execution_log.md`
- `documents/capture_engine/v1_3_phase3_manual_sampling_checklist.md`
- `documents/capture_engine/v1_3_phase3_execution_log.md`
- `documents/capture_engine/v1_3_platform_expansion_spec.md`
- `documents/engineering_handoffs/2026-03-07-v1_2_0-rc7-yuanbao-web-dashboard-handoff.md`
- rc7 implementation anchors in ChatGPT/Qwen parser, shared AST, reader, and content entrypoints

---

## 2. What Changed in rc7

The rc7 cycle surfaced a different class of parser failures from the earlier v1.2/v1.3 rounds.

Earlier platform fixes were dominated by **selector drift**:
- host changed class names
- candidate roots moved
- role markers changed
- session ID extraction needed re-alignment

The ChatGPT/Qwen rounds showed that modern chat surfaces fail even after candidate roots are found.
The dominant risk shifted from **"cannot find the node"** to **"found the wrong structure and extracted it incorrectly"**.

The key examples were:
- ChatGPT mixed real content with copy actions, toolbar controls, CodeMirror blocks, KaTeX, tables, and custom markdown wrappers.
- Qwen embedded Monaco Editor and custom markdown block wrappers, so direct `innerText` and transparent `div` traversal destroyed code and paragraph boundaries.
- Threads Reader sometimes appeared to be the broken layer, but root cause analysis showed that several "rendering bugs" were actually upstream AST-shape or pre-AST sanitization bugs.

---

## 3. Observed Failure Classes

## 3.1 Candidate discovery was necessary but not sufficient

`selector + anchor` remained a valid backbone for message discovery, especially on ChatGPT where assistant copy actions are stable anchors when role markers drift.

But discovery alone did not guarantee usable output:
- the candidate could still contain noisy toolbars
- the message boundary could still include non-content siblings
- complex subtrees could still be structurally misread

**Lesson:** candidate discovery must be separated from structural interpretation.

## 3.2 Structural collapse became a first-class failure mode

Two rc7 incidents make this explicit:

1. Qwen flowing prose used `div.qwen-markdown-paragraph` and `div.qwen-markdown-space`. Shared AST treated generic `div` as transparent containers, so multiple paragraphs collapsed into one long block.
2. ChatGPT content with formulas, tables, headings, and lists showed that even when the correct content subtree is selected, the semantic shape can still be damaged before or during AST extraction.

**Lesson:** there is a distinct failure bucket between discovery and AST extraction: **structure collapse**.

## 3.3 Complex editors break naive text extraction

Qwen used Monaco Editor instead of a simple `<pre><code>` block.
If the parser calls `innerText` on the editor root, the browser returns line numbers, header text, code body, and layout artifacts in DOM traversal order.

This produced the classic corruption pattern:
- language name leaks into content
- line numbers leak into content
- line breaks are lost or reordered
- final code becomes unreadable in both `textContent` and reader AST

The same principle applies to any high-performance editor surface:
- Monaco
- CodeMirror-like editors
- future virtualized code viewers

**Lesson:** complex editor containers are not text nodes; they are view models that require dedicated normalization.

## 3.4 Shared extraction can misclassify semantic roots

The math/table issue showed another recurring pattern:
- descendant math probes can cause an entire `<p>` or `<table>` to be promoted to `math`
- the actual problem is not formula extraction itself, but **incorrect root qualification**

The fix worked by making math detection stricter and letting tables win before math probing.

**Lesson:** shared semantic extractors must operate on validated semantic roots, not on broad descendant heuristics.

## 3.5 Parser and reader bugs must be sampled together

Several issues initially looked like reader-only regressions:
- headings appearing but surrounding content spacing collapsing
- table rendering degrading into flat pipe text
- list numbering disappearing
- inline math appearing as raw TeX

In practice these failures were split across three layers:
1. parser local sanitization / normalization
2. shared AST extraction
3. reader AST rendering

**Lesson:** parser QA and reader QA must be coupled for format-rich content.

## 3.6 Warm-start availability matters for manual capture

ChatGPT history threads that were already fully rendered could remain unarchivable until a new mutation arrived.
A one-time delayed capture after observer startup materially improved transient availability for manual mode and force archive.

**Lesson:** startup capture behavior is part of the capture contract, not an optional optimization.

---

## 4. Fix Patterns That Worked

## 4.1 Local platform normalization before shared AST

This was the highest-value rc7 pattern.

Instead of teaching the shared layer every vendor-specific DOM shape, the platform parser first converts special structures into stable semantic HTML, then hands the result to shared AST.

Proven examples:
- Qwen Monaco -> synthetic `<pre><code>`
- Qwen `qwen-markdown-paragraph` -> `<p>`
- Qwen `qwen-markdown-space` -> removed
- ChatGPT local sanitize path for code/toolbars/noise before AST extraction

**Why this worked:**
- local parser knows the platform-specific DOM best
- shared AST stays simpler and more reusable
- risk stays platform-contained
- rollback surface is smaller when a site changes again

## 4.2 Dual extraction strategies with explicit source scoring

ChatGPT selector and anchor paths were both run locally, then scored using balanced role distribution plus message count.
This avoided overcommitting to a single brittle path.

The explicit `source: "selector" | "anchor"` stat also improved diagnosis.

**Why this worked:**
- parser fallback became observable
- single-role captures were easier to classify
- anchor fallback remained platform-local rather than leaking into shared abstractions prematurely

## 4.3 Sanitize first, then extract

Both ChatGPT and Qwen fixes reinforced the same order of operations:
1. isolate content subtree
2. remove or normalize UI noise
3. convert special structures to stable semantic nodes
4. only then derive `textContent`, `htmlContent`, and AST

**Why this worked:**
- prevented noise from polluting all downstream outputs at once
- allowed shared AST to benefit without direct platform branching
- reduced the need for risky post-hoc text regex cleanup

## 4.4 Small fixes by root-cause bucket

The most stable rc7 fixes were the ones that stayed single-bucket:
- parser discovery problem -> parser discovery patch
- structure collapse -> normalization patch
- shared semantic misclassification -> shared extractor patch
- reader unsupported node -> reader renderer patch

**Why this worked:**
- regression verification stayed small
- evidence was easier to interpret
- rollback remained practical late in the RC window

---

## 5. Anti-Patterns Exposed by rc7

These should be treated as explicit engineering anti-patterns.

## 5.1 Calling `innerText` on complex editor roots

Do not treat editor containers like plain text blocks.
This is invalid for Monaco and likely invalid for future virtualized editors.

## 5.2 Letting descendant probes define semantic roots

A paragraph or table should not become `math` merely because it contains a formula descendant.
Root qualification must be explicit.

## 5.3 Using shared extraction to guess vendor-specific DOM

If a platform needs vendor-specific recovery logic, put it in the platform normalization layer first.
Do not immediately expand shared heuristics to guess every new site-specific widget.

## 5.4 Sampling only governance mode behavior

Mirror / smart / manual sampling is necessary but incomplete.
It does not prove content fidelity.
A parser can commit the correct conversation while still destroying code, tables, math, or paragraph spacing.

## 5.5 Mixing parser, governance, and reader fixes in one unbounded patch

This makes root-cause attribution ambiguous and slows down RC stabilization.
A single patch may still touch multiple layers, but only when the causality chain is explicit and evidence-backed.

---

## 6. Sampling Upgrades That Must Become Standard

The current manual sampling standards are governance-heavy and format-light.
rc7 shows that format fidelity now needs its own mandatory matrix.

## 6.1 ChatGPT format fidelity additions

Future mandatory samples should include:
- code block with toolbar noise
- mixed math + table + headings + list answer
- already-rendered history thread warm-start capture
- reader verification for code / math / table / list output
- noise-clean checks for `Copy`, `Retry`, `Show more`, `Done`, `Run`

## 6.2 Qwen format fidelity additions

Future mandatory samples should include:
- Monaco code block with visible line numbers and language header
- long flowing prose with paragraph separators
- custom markdown block spacing
- reader verification that code and prose remain structurally distinct

## 6.3 Evidence definition must expand

Per-case evidence should no longer stop at:
- parser stats
- governance decision
- storage diff

It should additionally require at least one of:
- raw DOM snippet for failing structure
- AST excerpt or rendered reader screenshot
- explanation of whether the failure is in normalization / semantic extraction / reader rendering

---

## 7. Engineering Rules to Promote into the Next Cycle

The following rules should be treated as future capture-engine guardrails.

1. **Discovery is not extraction.** Candidate discovery, boundary inference, normalization, and semantic extraction are separate stages.
2. **Normalize platform-specific structures locally.** Shared AST should receive stable semantic DOM whenever possible.
3. **Complex editors require dedicated normalization.** Do not generalize them as plain text.
4. **Shared semantic extractors must be root-strict.** Broad descendant heuristics are acceptable only for probing content inside a validated root.
5. **Reader regressions must be traced upstream.** Treat AST shape as a suspect before blaming rendering.
6. **Startup transient availability is a product requirement.** Warm-start capture must be designed, not improvised.
7. **Observability must expose fallback and normalization behavior.** Candidate counts alone are no longer enough.

---

## 8. Future Spec Backfills Required

The following existing documents now contain gaps and should be updated in the next documentation sweep:

- `documents/capture_engine/v1_3_platform_expansion_spec.md`
  - parser stack should be upgraded from `selector -> anchor -> cleanup` to `selector -> anchor -> structural normalization -> semantic extraction -> cleanup/dedupe`
- `documents/capture_engine/capture_debugging_playbook.md`
  - fault matrix should add:
    - `structure_collapse`
    - `editor_virtualization`
    - `semantic_extractor_misclassification`
- `documents/capture_engine/manual_sampling_and_acceptance.md`
  - mandatory matrix should add format fidelity cases and reader verification

---

## 9. Code Anchors from rc7

Useful reference anchors from the rc7 implementation round:

- ChatGPT local dual strategy and sanitize flow
  - `frontend/src/lib/core/parser/chatgpt/ChatGPTParser.ts`
  - `frontend/src/contents/chatgpt.ts`
- Qwen local Monaco + markdown block normalization
  - `frontend/src/lib/core/parser/qwen/QwenParser.ts`
- Shared semantic extraction fixes
  - `frontend/src/lib/core/parser/shared/astExtractor.ts`
  - `frontend/src/lib/core/parser/shared/astMathProbes.ts`
- Reader rendering fixes
  - `frontend/src/sidepanel/components/AstMessageRenderer.tsx`

These are implementation anchors, not future API commitments.

---

## 10. Closing Statement

The rc7 cycle proved that Vesti's next parser challenges are no longer primarily about finding the right node.
They are about preserving the right structure.

The next-stage capture engine should therefore be designed around a stable principle:

> platform DOM must first be normalized into semantic structure, and only then extracted, scored, rendered, and governed.
