# 2026-03-18 Export Shipped Prompt Review Package

Status: Active review prep memo  
Audience: Internal team, external prompt/domain experts

## Purpose

This note defines the smallest useful package for expert review of the **currently shipped export prompts**.

It exists to keep the next expert pass focused on downloaded handoff artifacts rather than prompt modules in isolation:
- prompt contract alignment
- decomposition direction
- shipped `E3` quality limits
- current compact versus conditional-handoff experiment quality
- distilled handoff completeness and anti-truncation behavior
- distilled transcript packing quality on long threads
- distilled handoff density after switching from compression framing to distilled execution-state framing
- prose `## State Overview` quality and whether it gives the next agent enough situational awareness
- stronger recall framing for `summary`
- section-level exemplar effectiveness
- reusable pattern / insight anchoring
- fallback conservatism versus compliance

It does **not** ask the expert to review the full repo or legacy prompt surface.

## Current review posture

For this round, the distilled-handoff experiment is treated as **sealed for review**:
- the team considers the current distilled handoff line good enough to evaluate as a downloaded artifact
- soft density warnings may still be present; they are review signals, not automatic reopen-the-scope triggers
- reviewer attention should stay on artifact usefulness, overview quality, reasoning preservation, and false-artifact control
- `summary` remains frozen and is not being reopened in this review package
- online validation of the distilled handoff line depends on the proxy-side token-cap change in `vesti-proxy` commit `9ffea11`, plus a Vercel redeploy with `VESTI_CHAT_MAX_TOKENS_LIMIT=5000`

## What is already settled before prompt review

These higher-level architecture decisions are already documented and should be treated as the current baseline:
- export remains a bounded pipeline, not an open-ended agent loop
- `AI Handoff` and `Knowledge Export` remain two long-lived paths
- cross-platform complexity is front-loaded into `P0/P1`, not pushed into export stages
- phase 1 delivery order remains:
  1. stabilize `AI Handoff`
  2. expand `Knowledge Export`

Relevant docs:
- `documents/prompt_engineering/export_ai_handoff_architecture.md`
- `documents/prompt_engineering/export_knowledge_export_architecture.md`
- `documents/prompt_engineering/cross_platform_conversation_normalization_architecture.md`
- `documents/prompt_engineering/export_workflow_runner_spec.md`

## Current shipped prompt sources

The current shipped export prompts to review are:
- `frontend/src/lib/prompts/export/compactComposer.ts`
- `frontend/src/lib/prompts/export/summaryComposer.ts`

For `compact`, that file now contains two different lines that can both be exported from the plugin:
- shipping `current`: exact 5-heading contract used as the default Compact path
- the user-facing `Compact` export path now defaults to the distilled handoff line, which keeps `StartedAt` + `Conversation Type` hard-coded and allows only a fixed whitelist of conditional sections
- the distilled handoff line now packs long transcripts as `first 4 turns + Middle Evidence Windows + last 12 turns` to prioritize LLM-delivered handoffs over deterministic fallback
- the distilled handoff line now frames the task as distilled execution state and expands the runtime taxonomy to six types by adding `generation`
- the distilled handoff line now requires a prose `## State Overview` section before any conditional sections
- the distilled handoff line now upgrades middle packing from short signal lines to grounded evidence windows
- current expert-review focus is on downloaded plugin artifacts from the same thread, not on prompt text alone

`summary` remains shipping-only for this round. It is not part of the conditional-handoff experiment.

Dormant extraction-prep drafts also exist now for review, but are not runtime-active:
- `frontend/src/lib/prompts/export/e1HandoffStructurePlanner.ts`
- `frontend/src/lib/prompts/export/e1KnowledgeStructurePlanner.ts`

Registry entry:
- `frontend/src/lib/prompts/index.ts`

Runtime caller:
- `frontend/src/sidepanel/utils/exportCompression.ts`

Compatibility re-export shims still exist here:
- `frontend/src/lib/prompts/exportCompact.ts`
- `frontend/src/lib/prompts/exportSummary.ts`

## Recommended expert review package

Send only this bundle:

### Architecture context
- `documents/prompt_engineering/export_ai_handoff_architecture.md`
- `documents/prompt_engineering/export_knowledge_export_architecture.md`
- `documents/prompt_engineering/export_workflow_runner_spec.md`

### Current shipped prompt text
- `frontend/src/lib/prompts/export/compactComposer.ts`
- `frontend/src/lib/prompts/export/summaryComposer.ts`

### Dormant extraction-prep prompt drafts
- `frontend/src/lib/prompts/export/e1HandoffStructurePlanner.ts`
- `frontend/src/lib/prompts/export/e1KnowledgeStructurePlanner.ts`

### Real output samples
At least:
- one same-thread distilled handoff sample from the LLM line, plus a pre-seal baseline compact sample if comparison against the old exact-heading path is still useful
- one same-thread pair from a harder or failure-prone compact case
- one `summary` success or near-success sample
- one diagnostics sample showing invalid reasons

Do not use `Deterministic handoff fallback` as the primary expert sample. Keep it only as a failure appendix.

## What to ask the expert in that prompt review round

Keep the prompt-review ask narrow:

1. Does `summaryComposer` now make future human recall the first priority strongly enough, or is the framing still too close to timeline reconstruction?
2. Do the updated `Reusable Snippets` anchors finally point toward reusable pattern / insight artifacts, rather than defaulting to file references?
3. Does the compact distilled-handoff line look like a reasonable conditional-handoff contract, now that it includes a required prose `## State Overview`, or is the classification/section whitelist still missing an important conversation shape?
4. Does the distilled handoff line now preserve completeness and situational awareness well enough to be judged as a handoff artifact, or are there still signs of truncation, half-open sections, weak overview prose, missing anchor content, or packing-induced omissions?
5. Are the fallback prompts now conservative-in-compliance, or do they still read as merely shorter versions of the main composer?
6. Do the dormant `E1` planner drafts look like the right first step for moving extraction pressure forward out of `E3`?

## Reviewer setup note

Before validating new plugin samples, reviewers/testers should ensure:
1. `vesti-proxy` has been redeployed from commit `9ffea11`
2. Vercel includes `VESTI_CHAT_MAX_TOKENS_LIMIT=5000`
3. comparison is based on downloaded artifacts from the same thread:
   - archived baseline compact sample from the old exact-heading path
   - current distilled handoff sample from this review line

## What not to ask in that round

- do not ask for repo-wide prompt cleanup
- do not ask for full orchestration framework advice again
- do not ask the expert to re-decide `P0/P1/E0` boundaries
- do not ask for shipping schema replacement unless the team is ready to reopen the contract

## Working conclusion

The next expert prompt-review round should judge the downloaded distilled handoff artifact directly, optionally compare it against an archived baseline compact sample from the old exact-heading path, evaluate overview quality, classification plausibility, completeness, rejected-path preservation, false artifact control, packing quality on long threads, and actual handoff usefulness, verify that `summary` still reads like a real knowledge artifact on its frozen shipping path, check whether fallback is now conservative-in-compliance instead of merely shorter, and confirm whether the dormant `E1` drafts are the right first extraction move.
