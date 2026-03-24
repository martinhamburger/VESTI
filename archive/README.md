# Repository Archive

Status: Active archive index
Audience: Maintainers, release owners, engineers reviewing historical assets

## Purpose

`archive/` stores repository-level legacy code, prototypes, and experimental assets that are intentionally preserved but are no longer treated as active top-level engineering work.

This tracked public surface now keeps only lightweight historical references.
Full workspace snapshots may be retained locally under the ignored directory `archive/_local/`.

## Rules

- content here is preserved for history, traceability, and reuse reference
- content here is not part of the active release surface by default
- content here should not be assumed to participate in current build, CI, or daily development workflows
- if archived material becomes relevant again, it should be intentionally promoted back into active engineering directories rather than silently reused in place

## Subdirectories

- `backend_trials/` — historical backend and core-engine trial references
- `frontend_prototypes/` — historical frontend prototype references and prompt assets
