# 2026-03-23 Text Sample Closure Audit And Next Slice

Status: Next Slice / Closure Audit
Audience: Capture, prompt, and runtime maintainers

## Scope

This handoff records the closure audit for the four operator text samples and fixes the next active slice after that audit.

## Closure audit result

The following cases are considered shipped in code and frozen as acceptance inputs:

| Case ID | Result | Shipped rule |
| --- | --- | --- |
| `SEARCH_CITATION_001` | closed in implementation | citation pills are clone-removed from body, labels collapse to first visible line, `utm_*` params are stripped, citations persist as sidecars |
| `CLAUDE_ARTIFACT_001` | closed in implementation | Claude standalone artifact is a sidecar with `plainText`, `normalizedHtmlSnapshot`, optional safe `markdownSnapshot`, and `renderDimensions`; artifact content stays out of body text |
| `CLAUDE_TITLE_001` | closed in implementation | Claude title resolution is app-shell-first with sidebar fallback before generic page/body fallback |
| `TABLE_FIDELITY_001` | closed for shipped baseline | `semantic_ast_v2`, cell-level inline-rich content, KaTeX `annotation` recovery, and structural alignment extraction are already in place |

## Shipped vs deferred

Shipped in this audit baseline:

- no schema migration is required
- `MessageCitation`, `MessageArtifact`, `PromptReadyMessage`, `conversation_summary.v2`, and `weekly_lite.v1` remain unchanged
- citation, artifact, title provenance, and AST-aware table, math, and code behavior are all treated as frozen acceptance gates

Deferred, not missing:

- artifact replay, iframe execution, and interactive preview
- richer artifact extraction beyond the current sidecar contract
- AST and canonical-text hardening outside frozen-case-adjacent cleanup
- weekly rewrite; only the summary-to-weekly bridge is in scope
- overseas live sampling expansion

## Next active slice

1. artifact-first contract unification across prompt, export, reader, and web using the existing sidecar fields
2. AST and canonical-text hardening only where a frozen case or its domestic DOM companions still leave ambiguity
3. package-aware summary-to-weekly bridge guardrails, without rewriting `weekly_lite.v1`

## Review rule

Any future change touching citation, artifact, title provenance, or rich table, math, and code behavior must map back to at least one frozen case ID and name the shipped consumers affected.
