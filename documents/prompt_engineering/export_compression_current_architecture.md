# Export Compression Current Architecture

Status: Transition note  
Last Updated: 2026-03-17  
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
