# 2026-03-21 Week 2 Shipped State

Status: Shipped State

## Summary

Week 2 core rollout on `feature/capture-week2-rollout` is now split into three implementation commits:

- `6760ec2` `feat(parser): close week2 platform normalization regressions`
- `ce93906` `feat(web): finish package-aware reader fidelity for math and code`
- `f3f1bc3` `test(capture): freeze week2 sample manifest and regression checklist`

The branch already contained the earlier package-aware baseline:

- `16eeb6a` `feat(reader): add week2 package-aware export and web rendering`

## What Landed

### Capture / parser

- `Qwen`
  - extra shell/noise exclusions for header, sidebar, thinking status card, footer chrome
- `Kimi`
  - code-header noise removal for preview/copy/header strip
- `DeepSeek`
  - assistant final-answer preference stays on `.ds-markdown`
  - user/assistant content now goes through a real sanitize path
  - input/button/sidebar chrome is no longer allowed to leak into body text
- `Yuanbao`
  - app-card shell and toolbar-adjacent noise are stripped more aggressively

### Reader / web

- `@vesti/ui` rich message rendering now handles:
  - `ast_v2` tables
  - KaTeX-backed math rendering
  - code blocks with clean copy affordance
  - `Sources` and `Artifacts` sidecars
- web consumers now load KaTeX CSS explicitly
- package manifests were updated to make the KaTeX dependency explicit

### Regression assets

- Week 2 approved text sample manifest is now frozen
- Week 2 approved DOM sample manifest is now frozen
- QA checklist is now repo-resident instead of being kept only in chat history

## Deferred After Week 2

- `insights / compression` package-aware implementation
- historical repair migration
- artifact replay / interactive artifact viewing
- richer multimodal image/upload capture
- overseas three-platform live sampling (`ChatGPT / Claude / Gemini`)
- `Kimi / Yuanbao` non-DOM fallback / shadow-path exploration

## Operator Notes

- Build verification for Week 2 was re-run after each implementation slice:
  - `pnpm -C packages/vesti-ui build`
  - `pnpm -C frontend build`
  - `pnpm -C vesti-web build`
- Parser regression sampling was re-run against:
  - `Qwen`
  - `Yuanbao`
  - `Kimi`
  - `DeepSeek`
- `vesti-web/next-env.d.ts` continues to drift during Next builds and must stay out of commits.
