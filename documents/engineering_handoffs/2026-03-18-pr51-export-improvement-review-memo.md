# PR #51 Export Improvement Review Memo

Date: 2026-03-18  
Branch: `feat/threads-select-batch-base`  
Related PRs:
- `#50` `feat(sidepanel): integrate threads export, timestamp semantics, and prompt architecture updates`
- `#51` `feat(export): intelligent export upgrade with AI Handoff and Knowledge Export`

## Summary

This memo records the review decision for PR `#51` and defines the local follow-up plan after PR `#50` merges.

The decision is fixed:

- PR `#51` should **not** be merged as a whole
- PR `#51` does **not** need to be fetched or checked out locally for the current decision
- the remote diff already provides enough evidence to judge scope and quality
- the valuable parts of PR `#51` are limited to:
  - some export panel wording / visual ideas
  - some prompt-content design ideas
- the PR does **not** provide a new runtime architecture baseline for export

This memo is for follow-up planning only. It must not be used to expand PR `#50`.

## Remote PR Snapshot

PR `#51` changes only 4 files:

- `frontend/src/lib/prompts/exportCompact.ts`
- `frontend/src/lib/prompts/exportSummary.ts`
- `frontend/src/sidepanel/components/BatchActionBar.tsx`
- `frontend/src/sidepanel/utils/exportCompression.ts`

The PR mainly does four things:

1. rewrites `compact` into a Chinese-only AI handoff schema
2. rewrites `summary` into a Chinese-only knowledge-card schema
3. rewrites export validation / fallback / notice copy to match that new schema
4. adjusts the export panel wording and visual treatment

This is therefore not a narrow UI PR. It is a coupled change across:

- prompt wording
- output contract
- validator expectations
- local fallback structure
- panel presentation

## Merge Decision

### Not accepted

The following parts of PR `#51` should **not** be merged into the current shipping line:

- the Chinese-only export schema in `exportCompact.ts`
- the Chinese-only knowledge-card schema in `exportSummary.ts`
- changing `EXPECTED_HEADINGS` in `exportCompression.ts` away from the current shipping headings
- changing local fallback output to the PR `#51` Chinese template format
- replacing current warning/notice semantics with the PR `#51` localized messaging bundle

Reason:

- this would overwrite the shipping export contract we just stabilized
- it would couple prompt tuning to validator/schema migration
- it would blur the line between prompt-engineering iteration and public export contract changes
- it would make diagnostics harder to compare with current Kimi/Step behavior

### Conditionally acceptable

The following parts are acceptable only as selective follow-up absorption:

- front-end label change:
  - `Compact -> AI Handoff`
  - `Summary -> Knowledge Export`
- some export panel visual language:
  - stronger mode cards
  - iconized format buttons

These are presentation-layer ideas only. They must not disturb:

- current `Download / Copy` dual-action flow
- clipboard availability / busy / copied-success states
- existing diagnostics callout
- current `ConversationExportResult` and export serialization behavior

### Worth keeping as design input

PR `#51` does contain useful prompt-engineering cues:

- exemplar-based output anchoring
- stronger emphasis on decision rationale
- stronger emphasis on preserving complete reusable code
- clearer framing of summary as a reusable knowledge artifact
- an implicit signal that locale-aware prompt profiles may eventually be useful

These ideas are worth reusing later, but only inside a controlled prompt-engineering follow-up.

## Why PR #51 Is Not an Architecture Upgrade

PR `#51` does not contribute a new export architecture layer.

It does **not** add or clarify:

- a bounded multi-stage export chain
- `E1 structure_planner`
- `E2 evidence_compactor`
- repair-stage abstraction
- prompt inventory decomposition
- profile-aware runtime contract separation

It is therefore not a source for the export multi-agent architecture defined in:

- `documents/prompt_engineering/export_multi_agent_architecture.md`
- `documents/prompt_engineering/export_prompt_contract.md`
- `documents/prompt_engineering/export_prompt_inventory.md`

The architectural baseline remains:

- export-centric
- bounded-chain
- runtime prompt source in `frontend/src/lib/prompts/**`
- current shipping export contract preserved until deliberately revised

## Follow-up Plan After PR #50 Merge

Two separate follow-up tracks are allowed. Neither belongs inside PR `#50`.

### Follow-up A: Export panel wording and light visual absorption

Goal:

- absorb the good presentation ideas from PR `#51`
- keep current runtime behavior unchanged

Fixed implementation direction:

- internal export modes remain:
  - `full`
  - `compact`
  - `summary`
- front-end labels may become:
  - `Full`
  - `AI Handoff`
  - `Knowledge Export`
- current shipping behavior must stay intact:
  - selected format picker
  - `Download / Copy` dual actions
  - clipboard states
  - diagnostic callout
  - fallback warning visibility

Allowed visual borrowing:

- stronger mode-card presentation
- iconized format buttons

Not allowed:

- changing `onDownload / onCopy` behavior
- reverting to row-level immediate export buttons
- altering export notice plumbing
- changing export content/file contracts

Target files:

- `frontend/src/sidepanel/components/BatchActionBar.tsx`
- `frontend/src/style.css`

### Follow-up B: Prompt-engineering absorption without schema change

Goal:

- reuse the strong prompt ideas from PR `#51`
- keep current shipping export headings and validator contract unchanged

Fixed implementation direction:

- compact keeps current shipping headings:
  - `## Background`
  - `## Key Questions`
  - `## Decisions And Answers`
  - `## Reusable Artifacts`
  - `## Unresolved`
- summary keeps current shipping headings:
  - `## TL;DR`
  - `## Problem Frame`
  - `## Important Moves`
  - `## Reusable Snippets`
  - `## Next Steps`
  - `## Tags`

Only these ideas may be imported:

- clearer exemplar-based output skeletons
- stronger decision-rationale requirements
- stronger reusable-code completeness requirements
- stronger summary framing as a knowledge artifact

If locale-aware behavior is needed later, it must be handled as:

- prompt-profile expansion
- not as a silent rewrite of the default export schema

Target files:

- `frontend/src/lib/prompts/exportCompact.ts`
- `frontend/src/lib/prompts/exportSummary.ts`
- if needed for governance notes:
  - `documents/prompt_engineering/export_prompt_contract.md`
  - `documents/prompt_engineering/export_prompt_inventory.md`

## Explicit Non-Goals

The following are explicitly out of scope for this review and follow-up:

- fetching PR `#51` locally to cherry-pick or merge it whole
- making Chinese headings the new default shipping export contract
- changing `exportCompression.ts` to accept PR `#51` schema as a second validator path
- replacing current deterministic local fallback with PR `#51`'s Chinese fallback templates
- treating PR `#51` as a source for export multi-agent runtime architecture

## Review Outcome In One Sentence

PR `#51` is useful as a **content-design reference** and a **minor UI inspiration source**, but it is **not** suitable for direct merge and it is **not** the right foundation for the export multi-agent architecture.

## Assumptions

- PR `#50` remains the current integration baseline.
- PR `#51` follow-up work starts only after that baseline is merged and collaborators have synced.
- A recent `main` merge related to Network does not materially change the conclusion in this memo because PR `#51` is confined to export prompts, validator behavior, and export panel UI.
