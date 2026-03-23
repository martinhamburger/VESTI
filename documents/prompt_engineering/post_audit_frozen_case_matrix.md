# Post-Audit Frozen Case Matrix

Status: Frozen post-audit regression map  
Last Updated: 2026-03-23  
Audience: Prompt/runtime engineers, parser maintainers, reader/web reviewers

## Purpose

This document ties the post-audit frozen case set to the shipped consumers that must keep honoring it.

Use it when a change touches:
- citation handling
- artifact sidecars
- title provenance
- canonical table / math / code behavior

Concrete operator-local source paths are intentionally kept out of tracked docs.
See `documents/_local/sample_source_map.md` for the local mapping.

## Frozen Text Cases

| Case ID | Source Handle | Frozen rule | Required shipped consumers |
| --- | --- | --- | --- |
| `SEARCH_CITATION_001` | `text:SEARCH_CITATION_001` | citation label uses first visible line; `utm_*` stripped; citation stays out of `bodyText` | `promptIngestionAdapter.ts`, `exportCompression.ts`, `conversationSummary.ts`, `exportSerializers.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `CLAUDE_ARTIFACT_001` | `text:CLAUDE_ARTIFACT_001` | standalone artifact is sidecar-only; excerpt priority is `markdownSnapshot -> plainText -> normalizedHtmlSnapshot` | `ClaudeParser.ts`, `promptIngestionAdapter.ts`, `exportSerializers.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx`, `insightGenerationService.ts` |
| `CLAUDE_TITLE_001` | `text:CLAUDE_TITLE_001` | title provenance is app-shell-first and never inferred from body headings | `ClaudeParser.ts`, `conversationSummary.ts`, `exportCompression.ts`, `insightGenerationService.ts` |
| `TABLE_FIDELITY_001` | `text:TABLE_FIDELITY_001` | canonical table/math/code fidelity is AST/semantic-first, not renderer-text-first | `astTableExtractor.ts`, `astMathProbes.ts`, `promptIngestionAdapter.ts`, `exportCompression.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |

## Frozen Domestic DOM Cases

| Case ID | Source Handle | Frozen rule | Required shipped consumers |
| --- | --- | --- | --- |
| `DOM_DOUBAO_W2_001` | `dom:DOM_DOUBAO_W2_001` | wrapper shell and action overflow stay out of canonical body text | `DoubaoParser.ts`, `promptIngestionAdapter.ts`, `exportCompression.ts` |
| `DOM_QWEN_W2_001` | `dom:DOM_QWEN_W2_001` | table/code chrome stays out of body while code/table/math signals remain intact | `QwenParser.ts`, `promptIngestionAdapter.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_YUANBAO_W2_001` | `dom:DOM_YUANBAO_W2_001` | canvas/preview remain sidecars and toolbar/process shell stay out of body | `YuanbaoParser.ts`, `promptIngestionAdapter.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_KIMI_W2_001` | `dom:DOM_KIMI_W2_001` | code header / preview chrome stay out of body and code remains prompt-visible | `KimiParser.ts`, `promptIngestionAdapter.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_DEEPSEEK_W2_001` | `dom:DOM_DEEPSEEK_W2_001` | final answer remains sourced from `.ds-markdown`; app chrome and thinking shell stay out of body | `DeepSeekParser.ts`, `promptIngestionAdapter.ts`, `conversationSummary.ts`, `insightGenerationService.ts` |

## Change Review Rule

Every change touching citation, artifact, title provenance, or rich table/math/code behavior must:

1. name at least one case ID from this matrix
2. state which shipped consumers are affected
3. verify that `bodyText` remains clean and sidecars stay sidecar-only where applicable

## Explicit defers

- artifact replay / interactive preview
- schema migration
- weekly digest rewrite
- overseas live sampling expansion