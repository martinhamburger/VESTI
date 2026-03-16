# Export Compression Current Architecture

Status: Active canonical design note  
Last Updated: 2026-03-16  
Audience: Frontend, prompt engineering, release owner

## Purpose

Define the current VESTI-native architecture for Threads export compression after the PR #49 feature-slice merge.

This document covers:
- the single canonical export entry
- prompt-as-code ownership for export compression
- current LLM execution path
- deterministic local fallback behavior
- future dormant seam for Moonshot direct routing

This document does not authorize a new public provider or a new Settings page surface.

## Shipping baseline

### Canonical export entry

Threads export keeps one canonical runtime entry:
- `frontend/src/sidepanel/utils/exportConversations.ts`

There is no parallel `exportConversationsV2`, `Enhanced`, or `UltraMinimal` public path.

The export pipeline is now structured as three stages:
1. dataset gathering
2. compression strategy selection
3. format serialization

### User-facing modes

Threads batch export now exposes three content modes inside the existing tray export panel:
- `Full`
- `Compact`
- `Summary`

Format rows remain Data-aligned:
- `JSON`
- `TXT`
- `MD`

### Prompt ownership

Export compression prompts live in the shared prompt registry under:
- `frontend/src/lib/prompts/exportCompact.ts`
- `frontend/src/lib/prompts/exportSummary.ts`

New prompt types:
- `exportCompact`
- `exportSummary`

This keeps export compression inside the same prompt-as-code discipline as compaction, thread summary, and weekly digest.

## Current execution path

### Active route

The only active export compression route is:
- `current_llm_settings`

This route reuses the existing application stack:
- `getLlmSettings()`
- `callInference(...)`
- `llmConfig.ts`
- current Settings page storage and model config semantics

### Compression behavior

- `Full` always stays local and exports the full transcript.
- `Compact` and `Summary` first try the active LLM route.
- If the LLM output is empty, invalid, unavailable, or the request fails, runtime falls back to deterministic local compression.

### Local fallback

Local fallback is intentionally structured rather than naive truncation.

`Compact` fallback preserves:
- background
- key questions
- decisions and answers
- reusable artifacts
- unresolved work

`Summary` fallback preserves:
- TL;DR
- problem frame
- important moves
- reusable snippets
- next steps
- tags

Fallback is still considered a successful export and must surface warning-style feedback in the Threads tray.

### Phase 2 content-quality baseline

`Compact` is optimized for high-fidelity AI or engineer handoff:
- preserve the real task background, constraints, and driving questions
- surface actual decisions rather than only the last assistant turn
- retain concrete commands, file paths, APIs, and code references whenever they appear
- end with unresolved work that the next agent can continue

`Summary` is optimized for human recall with a `conversation_summary.v2`-aligned mindset:
- `TL;DR` should stay plain and grounded
- `Problem Frame` should capture the central question and constraints
- `Important Moves` should reflect the thread's actual progression, not just takeaways
- `Reusable Snippets` should preserve commands, files, and code references when present
- `Next Steps` should stay actionable
- `Tags` should remain concrete and limited

### Validation baseline

LLM output validation is intentionally stricter in this phase:
- all required markdown headings must appear
- `Compact` must contain at least 3 grounded sections
- `Summary` must contain at least 4 grounded sections
- if the transcript contains code, commands, or file paths, the output must preserve at least one grounded artifact signal
- invalid LLM output falls through to fallback prompt, then deterministic local fallback

## Future routing seam

### Dormant route

A second route identifier is reserved but not enabled:
- `moonshot_direct`

This seam exists only inside export compression internals.
It is not a user-facing provider choice.
It is not exposed in Settings.
It is not part of the current public `LlmProvider` contract.

### Candidate anchors

`llmConfig.ts` keeps two future anchor sets near model configuration:
- `FUTURE_MODELSCOPE_EXPORT_MODEL_CANDIDATES`
- `FUTURE_MOONSHOT_DIRECT_EXPORT_MODEL_CANDIDATES`

Current intent:
- keep `moonshotai/Kimi-K2.5` as a future ModelScope candidate anchor
- keep Moonshot direct integration as a dormant export-only seam until real API validation is complete

### Explicit non-goals for this phase

This phase does not:
- add `Kimi-K2.5` to `BYOK_MODEL_WHITELIST`
- add a standalone Kimi API key flow
- add a standalone `kimiService.ts`
- expose `moonshot_direct` in Settings
- merge PACS or archived documentation into the main product line

## Guardrails

1. Export compression must remain feature-sliced into the current Threads tray flow.
2. `exportConversations.ts` stays the canonical export entry.
3. Prompt changes for compression go through the shared prompt registry, not ad hoc local strings.
4. `BYOK_MODEL_WHITELIST` remains unchanged until route verification is complete.
5. Future Kimi enablement must be a separate explicit rollout step.
