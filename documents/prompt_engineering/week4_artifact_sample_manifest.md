# Week 4 Artifact-First Sample Manifest

Status: Frozen artifact-first runtime sample set for shipped consumers  
Audience: Capture maintainers, prompt/runtime engineers, reader/web reviewers

## Purpose

This manifest defines the approved sample set for the Week 4 artifact-first rollout.

It narrows the review focus to four connected questions:

- which messages are truly `artifact-bearing`
- which platform shells must stay out of `bodyText`
- which shipped consumers must honor artifact sidecars
- which adjacent table/code/math/citation cases must continue to hold after artifact work

The four operator text samples in this manifest are frozen acceptance references:
- `CLAUDE_ARTIFACT_001`
- `SEARCH_CITATION_001`
- `TABLE_FIDELITY_001`
- `CLAUDE_TITLE_001`

Concrete local sample paths are intentionally kept out of tracked docs.
See `documents/_local/sample_source_map.md` for the local mapping.

This manifest is meant to be used together with:

- [`week3_prompt_signal_mapping.md`](./week3_prompt_signal_mapping.md)
- [`week3_runtime_regression_checklist.md`](./week3_runtime_regression_checklist.md)
- [`week2_regression_sample_manifest.md`](../capture_engine/week2_regression_sample_manifest.md)

## Artifact Primary Cases

| Case ID | Source Handle | Focus | Required Shipped Consumers |
| --- | --- | --- | --- |
| `CLAUDE_ARTIFACT_001` | `text:CLAUDE_ARTIFACT_001` | standalone artifact capture, artifact fidelity, sidecar-only storage | `promptIngestionAdapter.ts`, `exportSerializers.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_YUANBAO_W2_001` | `dom:DOM_YUANBAO_W2_001` | preview/canvas/split-pane presence, toolbar isolation, false-positive preview suppression | `YuanbaoParser.ts`, `promptIngestionAdapter.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_KIMI_W2_001` | `dom:DOM_KIMI_W2_001` | preview/code-header/action chrome exclusion around code-like content | `KimiParser.ts`, `promptIngestionAdapter.ts` |
| `DOM_QWEN_W2_001` | `dom:DOM_QWEN_W2_001` | Monaco/code-preview chrome exclusion while preserving code/table/math signals | `QwenParser.ts`, `promptIngestionAdapter.ts` |

## Artifact-Adjacent Regression Cases

| Case ID | Source Handle | Focus | Required Shipped Consumers |
| --- | --- | --- | --- |
| `SEARCH_CITATION_001` | `text:SEARCH_CITATION_001` | citation sidecars remain outside body text | `promptIngestionAdapter.ts`, `exportCompression.ts`, `conversationSummary.ts`, `exportSerializers.ts` |
| `TABLE_FIDELITY_001` | `text:TABLE_FIDELITY_001` | table/math/code fidelity remains grounded after artifact cleanup | `promptIngestionAdapter.ts`, `exportCompression.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_DOUBAO_W2_001` | `dom:DOM_DOUBAO_W2_001` | action overflow and wrapper shell stay out of body text | `DoubaoParser.ts`, `promptIngestionAdapter.ts` |
| `CLAUDE_TITLE_001` | `text:CLAUDE_TITLE_001` | title still comes from app-shell metadata, not body | `conversationSummary.ts`, `exportCompression.ts` |

## Week 4 Refresh Evidence

These refreshed live confirmations remain local-only operator evidence and are referenced publicly through handles:

- `dom:QWEN_WEEK4_REFRESH_001`
- `dom:YUANBAO_WEEK4_REFRESH_001`
- `dom:KIMI_WEEK4_REFRESH_001`
- `dom:DOUBAO_WEEK4_REFRESH_001`

## Expected Artifact Signals

### `CLAUDE_ARTIFACT_001`

Expected package behavior:

- `artifacts[].captureMode = "standalone_artifact"`
- `artifacts[].normalizedHtmlSnapshot` exists
- `artifacts[].plainText` exists
- `artifacts[].markdownSnapshot` exists only when safely derived
- artifact content does not return to `content_text`
- shipped consumers keep excerpt priority:
  - `markdownSnapshot`
  - `plainText`
  - `normalizedHtmlSnapshot`

### `DOM_YUANBAO_W2_001`

Expected package behavior:

- hidden preview placeholders do not force `preview` artifacts
- visible canvas/split-pane remain sidecar presence only
- toolbar/app-card/process shell does not enter message body

### `DOM_KIMI_W2_001`

Expected package behavior:

- `segment-user-actions` and code header chrome do not enter `bodyText`
- code content still preserves `hasCode = true`
- preview-like shells are treated as UI chrome unless promoted by a future explicit contract

### `DOM_QWEN_W2_001`

Expected package behavior:

- `qwen-markdown-table-header` and code-header action chrome do not enter `bodyText`
- Monaco shell status/ARIA nodes do not enter `bodyText`
- code/table/math signals remain intact for prompt-ready flattening

## Review Rule

When a Week 4 change touches artifact capture or artifact-aware consumers, reviewers should verify:

1. the affected change still maps to one or more case IDs above
2. artifact summaries come from sidecars, not body-tail reconstruction
3. code/table/math/citation adjacency behavior did not regress while artifact fidelity improved
4. no shipped consumer silently invents a second artifact contract

## Explicit defers

- artifact replay / interactive preview
- weekly digest rewrite
- overseas three-platform live sampling expansion