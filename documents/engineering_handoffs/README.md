# Engineering Handoffs

Status: Maintainer-local only notice
Audience: Maintainers, private collaborators, engineers checking public repo boundaries

## Purpose

`documents/engineering_handoffs/` no longer syncs dated handoff bodies to GitHub.

The public repository keeps this README only as a boundary notice. Dated handoff notes, release-window memos, shipped-state snapshots, and closure audits are now maintained through private collaboration channels and local archive storage.

Maintainer-local handoff roots:

- `documents/_local/engineering_handoffs/`
- `documents/_local/engineering_handoffs/public_surface_archive/`

## Public rule

- do not add dated handoff bodies back into the tracked public tree
- do not treat handoff history as a public source of truth
- use canonical subsystem docs and `CHANGELOG.md` for public-facing project state

## Public source of truth

For current engineering decisions, start with:

- `documents/README.md`
- canonical subsystem docs under `documents/`
- `CHANGELOG.md`
