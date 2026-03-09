# Documents Archive

Status: Active archive index  
Audience: Maintainers, release owners, engineers performing historical lookup

## Purpose

`documents/archive/` stores documentation that is intentionally preserved but no longer serves as the primary source of truth.

Archive content includes:
- retired root-level planning notes
- historical stage briefs
- candidate drafts
- legacy material superseded by canonical subsystem directories

## Rules

- archive content is preserved instead of hard-deleted
- archive content is not canonical for current engineering decisions
- when a document is moved here, living guidance should be discoverable from a canonical directory or from `documents/README.md`
- archived files should usually keep their original filenames for traceability

## Structure

### `legacy_root/`
Historical root-level docs that were useful during earlier phases but should no longer live at the root of `documents/`.

### `candidate_drafts/`
Candidate proposals, exploration drafts, and design alternatives that are not active specification entrypoints.

## How to use archive material

Use archive docs for:
- reconstructing older decisions
- understanding project evolution
- tracing the origin of current canonical specs

Do not use archive docs as the default answer to "what is the current spec?"
