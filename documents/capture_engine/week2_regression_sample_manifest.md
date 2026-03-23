# Week 2 Regression Sample Manifest

Status: Frozen regression inputs for `feature/capture-week2-rollout`  
Audience: Parser maintainers, reader/web maintainers, QA

## Purpose

This manifest defines the approved public case set for Week 2 capture / reader / web regression work.

It is intentionally small and operator-friendly:

- text samples are referenced through stable logical handles
- DOM samples are referenced through stable logical handles
- new parser or reader work should validate against this manifest before merge

Concrete local sample paths are intentionally kept out of the tracked repo.
The operator-local mapping lives in `documents/_local/sample_source_map.md`.

## Approved Text Samples

| Case ID | Source Handle | Primary Focus |
| --- | --- | --- |
| `CLAUDE_TITLE_001` | `text:CLAUDE_TITLE_001` | Claude app-shell title vs body heading drift |
| `CLAUDE_ARTIFACT_001` | `text:CLAUDE_ARTIFACT_001` | Claude standalone artifact capture and sanitization |
| `TABLE_FIDELITY_001` | `text:TABLE_FIDELITY_001` | cross-platform table / formula / code fidelity |
| `SEARCH_CITATION_001` | `text:SEARCH_CITATION_001` | citation pill stripping and structured source retention |

## Approved Domestic DOM Samples

| Case ID | Platform | Source Handle | Primary Focus |
| --- | --- | --- | --- |
| `DOM_DOUBAO_W2_001` | Doubao | `dom:DOM_DOUBAO_W2_001` | table wrapper shell, native table body, search/tool noise |
| `DOM_QWEN_W2_001` | Qwen | `dom:DOM_QWEN_W2_001` | hard message root, table header noise, Monaco/code chrome |
| `DOM_YUANBAO_W2_001` | Yuanbao | `dom:DOM_YUANBAO_W2_001` | bubble root, toolbar isolation, artifact presence |
| `DOM_KIMI_W2_001` | Kimi | `dom:DOM_KIMI_W2_001` | segment root, code header noise, preview/action chrome |
| `DOM_DEEPSEEK_W2_001` | DeepSeek | `dom:DOM_DEEPSEEK_W2_001` | `ds-message` role split, thinking shell isolation, sidebar/input chrome |

## Historical Reference Rule

Older operator-collected DOM snapshots still exist locally for debugging drift, but they are not part of the public freeze set and are no longer named by raw path in tracked docs.

## Manifest Rules

1. When a regression is reported, map it to one of the case IDs above before editing code.
2. If a new DOM structure is discovered, add a new case ID rather than silently replacing an existing one.
3. Generic counters remain advisory only.
4. The source of truth for review remains the sampled HTML, screenshot, and associated bug memo, resolved through the local source map.
5. The four approved text samples are frozen acceptance gates and should be reviewed as implemented behavior, not reopened as open-ended investigation inputs.