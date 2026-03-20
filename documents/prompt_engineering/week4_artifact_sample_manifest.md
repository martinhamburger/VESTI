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

This manifest is meant to be used together with:

- [`week3_prompt_signal_mapping.md`](D:/DEV/VESTI-main-git/documents/prompt_engineering/week3_prompt_signal_mapping.md)
- [`week3_runtime_regression_checklist.md`](D:/DEV/VESTI-main-git/documents/prompt_engineering/week3_runtime_regression_checklist.md)
- [`week2_regression_sample_manifest.md`](D:/DEV/VESTI-main-git/documents/capture_engine/week2_regression_sample_manifest.md)

## Artifact Primary Cases

| Case ID | Source | Focus | Required Shipped Consumers |
| --- | --- | --- | --- |
| `CLAUDE_ARTIFACT_001` | `C:\Users\苏祎成\Downloads\artifact.txt` | standalone artifact capture, artifact fidelity, sidecar-only storage | `promptIngestionAdapter.ts`, `exportSerializers.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_YUANBAO_W2_001` | `.playwright-auth/samples/20260321-004613-yuanbao-parser-regression` | preview/canvas/split-pane presence, toolbar isolation, false-positive preview suppression | `YuanbaoParser.ts`, `promptIngestionAdapter.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_KIMI_W2_001` | `.playwright-auth/samples/20260321-004707-kimi-parser-regression` | preview/code-header/action chrome exclusion around code-like content | `KimiParser.ts`, `promptIngestionAdapter.ts` |
| `DOM_QWEN_W2_001` | `.playwright-auth/samples/20260321-004643-qwen-parser-regression` | Monaco/code-preview chrome exclusion while preserving code/table/math signals | `QwenParser.ts`, `promptIngestionAdapter.ts` |

## Artifact-Adjacent Regression Cases

| Case ID | Source | Focus | Required Shipped Consumers |
| --- | --- | --- | --- |
| `SEARCH_CITATION_001` | `C:\Users\苏祎成\Downloads\search.txt` | citation sidecars remain outside body text | `promptIngestionAdapter.ts`, `exportCompression.ts`, `conversationSummary.ts`, `exportSerializers.ts` |
| `TABLE_FIDELITY_001` | `C:\Users\苏祎成\Downloads\table.txt` | table/math/code fidelity remains grounded after artifact cleanup | `promptIngestionAdapter.ts`, `exportCompression.ts`, `MessageBubble.tsx`, `RichMessageContent.tsx` |
| `DOM_DOUBAO_W2_001` | `.playwright-auth/samples/20260320-222437-doubao-week2-regression` | action overflow and wrapper shell stay out of body text | `DoubaoParser.ts`, `promptIngestionAdapter.ts` |
| `CLAUDE_TITLE_001` | `C:\Users\苏祎成\Downloads\claude.txt` | title still comes from app-shell metadata, not body | `conversationSummary.ts`, `exportCompression.ts` |

## Week 4 Refresh Evidence

These refreshed live samples are not new case IDs. They are the latest operator-collected DOM confirmations
for the existing case families above:

- `.playwright-auth/samples/20260321-032658-qwen-week4-artifact-cleanup`
- `.playwright-auth/samples/20260321-032718-yuanbao-week4-artifact-cleanup`
- `.playwright-auth/samples/20260321-032739-kimi-week4-artifact-cleanup`
- `.playwright-auth/samples/20260321-032759-doubao-week4-artifact-cleanup`

## Expected Artifact Signals

### `CLAUDE_ARTIFACT_001`

Expected package behavior:

- `artifacts[].captureMode = "standalone_artifact"`
- `artifacts[].normalizedHtmlSnapshot` exists
- `artifacts[].plainText` exists
- `artifacts[].markdownSnapshot` exists only when safely derived
- artifact content does not return to `content_text`

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
