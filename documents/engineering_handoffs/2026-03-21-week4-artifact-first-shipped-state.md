# 2026-03-21 Week 4 Artifact-First Shipped State

Status: Shipped State

## Summary

Week 4 on `feature/capture-week2-rollout` was shipped as four review-sized commits:

- `63759d7` `feat(artifact): refine standalone artifact capture and shipped artifact summaries`
- `a83955b` `feat(capture): harden artifact-adjacent structure cleanup across domestic platforms`
- `19a830f` `test(prompt): freeze artifact-first sample manifest and shipped regression checklist`
- `docs(architecture): sync artifact-first shipped state and weekly defer boundary`

## What Changed

### Artifact capture fidelity

- Claude standalone artifacts now preserve a stronger bounded package:
  - `plainText`
  - `normalizedHtmlSnapshot`
  - safe `markdownSnapshot` derivation when possible
- the artifact rich source of truth remains the sidecar, not the body transcript

### Shipped consumer alignment

- prompt-ready runtime now produces richer artifact summary lines from sidecars
- export artifact sections now include bounded excerpts
- sidepanel and web `Artifacts` disclosures now show:
  - label
  - kind
  - `captureMode`
  - optional `renderDimensions`
  - bounded excerpt

### Domestic platform cleanup

- Qwen:
  - code-header and table-header chrome are stripped more aggressively
  - Monaco helper nodes no longer belong in canonical body text
- Kimi:
  - `segment-user-actions` no longer leak edit/copy/share text into body text
  - code/table header chrome remains outside canonical body text
- Yuanbao:
  - hidden preview placeholders no longer force preview artifacts
  - toolbar/process shell remains outside canonical body text
- Doubao:
  - action overflow shell is stripped more consistently without changing the main parser model

## Frozen Week 4 Assets

Week 4 artifact review now relies on:

- `documents/prompt_engineering/week4_artifact_sample_manifest.md`
- `documents/prompt_engineering/week4_artifact_regression_checklist.md`

These assets should be treated as the canonical bridge between:

- artifact-focused text samples
- domestic DOM samples
- shipped prompt/export/reader/web behavior

## Explicit Boundary

Week 4 is artifact-first, not weekly-first.

Still deferred:

- weekly digest runtime rewrite
- artifact replay / interactive preview
- schema migration
- overseas three-platform live sampling expansion

The intended next step is not “put weekly into the same commit chain”, but:

1. keep artifact sidecars stable
2. bridge package-aware summaries into weekly
3. then expand the remaining package-native runtime surfaces
