# Library Reader Inline Annotations + Export Upgrade (v1.4-a)

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-03-11-library-inline-annotations.md`

## Reason for condensation

The original handoff combined schema details, UI behavior, export flows, and local repo context for a larger annotation feature push. The public repo keeps the stable feature boundary and durable contract outcomes only.

## Durable outcomes

1. Library Reader annotations became an append-only, message-level timeline instead of a single note slot per message.
2. Annotation text participates in search and vectorization through conversation-level text fusion rather than standalone annotation embeddings.
3. Annotation export paths were expanded into note and Notion flows while the core reader remained the source of truth for annotation context.

## Canonical follow-ups

- `documents/ui_refactor/v1_4_library_annotation_storage_and_export_spec.md`
- `documents/reader_pipeline/reader_pipeline_current_architecture.md`
- `documents/ui_refactor/README.md`
