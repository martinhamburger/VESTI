# Export Compression Current Architecture

Status: Transition note  
Last Updated: 2026-03-21  
Audience: Frontend, prompt engineering, release owner

## Positioning

This document describes the currently shipped export compression implementation.

It is no longer the top-level architecture authority for future export multi-agent design.

Authoritative forward-looking documents are now:
- `export_multi_agent_architecture.md`
- `export_prompt_contract.md`
- `export_eval_and_drift_gate.md`
- `export_prompt_inventory.md`

## Current shipped baseline

The current shipping export path still uses:
- canonical export entry: `frontend/src/sidepanel/utils/exportConversations.ts`
- compression runtime: `frontend/src/sidepanel/utils/exportCompression.ts`
- prompt registry entries:
  - `frontend/src/lib/prompts/export/compactComposer.ts`
  - `frontend/src/lib/prompts/export/summaryComposer.ts`

Compatibility re-export shims still exist at:
- `frontend/src/lib/prompts/exportCompact.ts`
- `frontend/src/lib/prompts/exportSummary.ts`

Shipping user modes remain:
- `Full`
- `Compact`
- `Summary`

Current active model baseline remains:
- primary: `moonshotai/Kimi-K2.5`
- backup: `stepfun-ai/Step-3.5-Flash`

## Why this note still exists

This file remains useful for:
- describing the live path in production
- anchoring debugging for the current tray export behavior
- bridging the current implementation to the future export multi-agent decomposition

## What is superseded

This file no longer serves as the canonical source for:
- export multi-agent stage design
- prompt artifact governance
- export-specific drift policy
- long-term prompt inventory

## 2026-03 shipped adapter note

The shipped runtime now contains a **prompt-ready ingestion adapter** between stored messages and
prompt assembly.

Practical effects:
- `message.content_text` is no longer the only prompt input surface
- prompt assembly can now consume:
  - canonical body text behavior
  - structure signals (`hasTable / hasMath / hasCode / hasCitations / hasArtifacts`)
  - sidecar summary lines from `citations[] / artifacts[]`
  - artifact refs derived from sidecars first, regex fallback second
- export compression fallback heuristics and validation now reason over prompt-ready messages,
  not only raw transcript text

This is still a **compatibility-enhanced** stage, not a full package-native prompt runtime.

## 2026-03 limitation note

The current shipped compression path is now less text-centric, but not fully package-native.

Practical implications:
- prompt-ready body text still ultimately derives from the stored message package, not from direct
  AST prompt serialization
- title still depends on upstream app-shell capture quality
- `citations[] / artifacts[]` enter prompt runtime as bounded sidecar summaries, not as full free-form payloads
- weekly/insight consumers are still in the compatibility phase, not the final package-native phase

So this path should be understood as:
- shipped and operational
- compatible with current export UX
- materially safer than the earlier raw-text-only path
- not yet the final package-aware consumer model defined by newer capture / reader docs

## 2026-03 artifact-first note

Week 4 tightened the shipped runtime around artifact sidecars without changing the storage shape.

Practical effects:
- artifact summaries now prefer sidecar content in this order:
  - `markdownSnapshot`
  - `plainText`
  - `normalizedHtmlSnapshot`
- prompt/runtime consumers now treat artifact summary lines as sidecar-only context
- export and reader/web consumers now show bounded artifact excerpts instead of body-tail reconstruction

This is still intentionally bounded:
- no artifact replay
- no interactive preview
- no weekly digest rewrite in the same slice

## Weekly defer boundary

`weekly digest` is not the active implementation target in this stage.

The expected next bridge is:

- package-aware summary outputs
- then summary-to-weekly adaptation

It should not regress back to direct raw-transcript dependence while artifact work is being expanded.
