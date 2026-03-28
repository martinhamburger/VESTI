# UI Runtime Package Sidecar Manual Acceptance

Status: Active manual QA checklist
Audience: QA, frontend engineers, release reviewers

## Purpose

Use this checklist when validating that the shipped runtime treats message sidecars consistently across the extension and web surfaces.

This checklist assumes the current package contract:

- `semantic_ast_v2` is the preferred message body source
- `citations[]` renders as `Sources`
- `attachments[]` renders as index-only `Attachments`
- `artifacts[]` renders as excerpt-first `Artifacts`
- dynamic content never re-enters runtime as direct live replay

## Required sample matrix

Run manual acceptance against these frozen cases:

- `CHATGPT_TABLE_MATH_001`
- `GEMINI_TABLE_BODY_001`
- `TABLE_FIDELITY_001`
- `CHATGPT_SOURCE_001`
- `GEMINI_SOURCE_001`
- `SEARCH_CITATION_001`
- `CHATGPT_ARTIFACT_001`
- `GEMINI_ARTIFACT_PREVIEW_001`
- `CLAUDE_ARTIFACT_001`
- one frozen domestic artifact case
- `CHATGPT_UPLOAD_FILE_001`
- `CHATGPT_UPLOAD_IMAGE_001`
- `GEMINI_UPLOAD_FILE_001`
- `GEMINI_UPLOAD_IMAGE_001`
- `CLAUDE_TITLE_001`
- one frozen app-shell title case

## Surfaces

Validate all of these:

- sidepanel reader
- web/dashboard detail view
- full export JSON
- full export Markdown
- full export TXT
- sidepanel export flow
- prompt/compression transcript output
- conversation snippet / preview surfaces
- annotation preview
- search hit / retrieval excerpt

## Checks

For each relevant case, confirm:

1. Body source
- rich messages still render from AST/body, not from tail-appended source text
- canonical body text remains clean when citations, attachments, or artifacts exist

2. Sources
- `Sources` appears when `citations[]` exists
- source labels and hosts are visible
- source text is not duplicated inside the main body

3. Attachments
- `Attachments` appears when `attachments[]` exists
- each item shows at least `indexAlt`
- optional `label / mime` appears only when captured safely
- attachment-only messages do not collapse into blank rows
- no uploaded image/file is directly replayed in runtime

4. Artifacts
- `Artifacts` appears when `artifacts[]` exists
- excerpt/descriptor text is visible when available
- runtime does not directly replay iframe/canvas/web-preview/mini-app content

5. Fallback and secondary consumers
- conversation preview text remains non-empty for attachment-only or artifact-only messages
- annotation export anchor text is not blank when the anchor turn only has sidecars
- prompt/compression transcript includes sidecar summaries when body text is absent
- search/retrieval can still surface attachment-only messages via summary text
- single CJK character query enters full-text search across body + sidecars
- single non-CJK character query remains title/snippet-only and does not trigger body-sidecar full-text scan
- Threads search can distinguish `Matched in messages / sources / attachments / artifacts / notes`
- Reader search auto-expands the owning `Sources / Attachments / Artifacts` section when the active hit lands in a sidecar item

6. Metadata
- title still follows app-shell title truth, not the largest body heading
- reader/web ordering remains `Sources -> Attachments -> Artifacts`

## Release questions

Before sign-off, answer all of these:

- Did any surface still treat `content_text` as the only truth source?
- Did any sidecar leak back into body text?
- Did any attachment imply raw replay support?
- Did any dynamic artifact render as a live embedded surface?
- Did any attachment-only message disappear from preview, export, or prompt flow?
- Did any single CJK character query fail to reach full-text body + sidecar search?
- Did any Reader sidecar hit fail to auto-expand and focus the correct item?
