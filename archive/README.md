# Repository Archive

Status: Local-only archive notice
Audience: Maintainers, release owners, engineers validating current repo boundaries

## Purpose

`archive/` no longer carries public tracked legacy code or prototype projects.

The public repository keeps this README only as a boundary notice. Historical code, trial workspaces, and prototype payloads are retained in the ignored local mirror under:

- `archive/_local/repo_snapshot/`

## Current rule

- do not treat `archive/` as a public source of truth
- do not add new prototype code or legacy snapshots back into the tracked tree
- if historical material becomes relevant again, promote the needed parts into active engineering directories intentionally

## Current source of truth

For active engineering work, use:

- `frontend/`
- `packages/`
- `vesti-web/app/`
- current canonical docs under `documents/`
