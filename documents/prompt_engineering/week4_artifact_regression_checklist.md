# Week 4 Artifact-First Regression Checklist

Status: Active checklist for artifact-first shipped behavior  
Audience: Prompt/runtime engineers, parser maintainers, reader/web reviewers

Reference manifest:

- [`week4_artifact_sample_manifest.md`](D:/DEV/VESTI-main-git/documents/prompt_engineering/week4_artifact_sample_manifest.md)

## Build Gates

Run after each functional commit:

- `pnpm -C packages/vesti-ui build`
- `pnpm -C frontend build`
- `pnpm -C vesti-web build`

If `vesti-web/next-env.d.ts` changes during build, restore it before commit.

## Capture / Parser Checks

### Claude

- `CLAUDE_ARTIFACT_001`
  - standalone artifact remains a sidecar
  - `plainText` exists
  - `normalizedHtmlSnapshot` exists
  - `markdownSnapshot` only appears when safely derived
  - artifact text does not leak into message body

### Yuanbao

- `DOM_YUANBAO_W2_001`
  - hidden preview shells do not create false `preview` artifacts
  - canvas / split-pane remain sidecar-only presence
  - toolbar / process shell / download CTA do not leak into body text

### Kimi

- `DOM_KIMI_W2_001`
  - `segment-user-actions` do not leak `编辑 / 复制 / 分享`
  - `segment-code-header` and table action chrome do not leak into body text
  - actual code text remains intact and prompt-relevant

### Qwen

- `DOM_QWEN_W2_001`
  - table-header chrome does not leak into body text
  - code-header action chrome does not leak into body text
  - Monaco ARIA/status helper nodes do not leak into body text
  - code/table/math still produce stable structure signals

### Doubao

- `DOM_DOUBAO_W2_001`
  - action overflow / message action button shell does not leak into body text
  - table wrapper cleanup still preserves actual table content

## Prompt / Runtime Checks

Targets:

- `frontend/src/lib/prompts/promptIngestionAdapter.ts`
- `frontend/src/sidepanel/utils/exportCompression.ts`
- `frontend/src/lib/prompts/conversationSummary.ts`
- `frontend/src/lib/services/insightGenerationService.ts`

Must remain true:

- artifact summary lines come from `artifacts[]` first
- `artifactRefs` remain sidecar-first, regex-fallback-second
- artifact excerpt text does not re-enter `bodyText`
- citation tail stays outside `bodyText`
- table/math/code-heavy messages still influence runtime heuristics through structure signals

## Export Checks

Target:

- `frontend/src/lib/services/exportSerializers.ts`

Must remain true:

- `Artifacts` sections include meaningful excerpt text when available
- excerpt priority is:
  - `markdownSnapshot`
  - `plainText`
  - `normalizedHtmlSnapshot` fallback
- JSON export keeps raw artifact sidecar fields
- Markdown / TXT export never rebuild artifact content from polluted body text

## Reader / Web Checks

Targets:

- `frontend/src/sidepanel/components/MessageBubble.tsx`
- `packages/vesti-ui/src/components/RichMessageContent.tsx`

Must remain true:

- `Artifacts` disclosure shows metadata plus excerpt
- excerpt comes from sidecar fields, not transcript tail
- `Sources` and `Artifacts` can coexist without polluting body text
- table/math/code rendering remains AST-first when AST exists

## Live Sampling Boundary

Week 4 live sampling should stay limited to:

- `Qwen`
- `Yuanbao`
- `Kimi`
- `Doubao`
- `DeepSeek` only when a parser-side adjacency rule is affected

Claude remains sample-text driven in this round. No new Claude login flow should be introduced.

## Explicit Defers

Do not fold these into Week 4 artifact commits:

- weekly digest runtime rewrite
- artifact replay / interactive preview
- schema migration
- overseas three-platform live sampling expansion
