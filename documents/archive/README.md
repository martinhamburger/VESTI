# Documents Archive

Status: Local-only archive notice
Audience: Maintainers, release owners, engineers tracing historical decisions

## Purpose

`documents/archive/` no longer exposes archived documentation payloads on GitHub.

The public repository keeps this README only as a notice that historical specs, execution logs, legacy playbooks, and superseded planning materials have been moved to maintainer-local storage.

Maintainer-local archive root:

- `archive/_local/repo_snapshot/documents/archive/`

## Current rule

- do not use `documents/archive/` as a public decision entrypoint
- historical lookup now happens through maintainer-local archive material
- current decisions must be read from canonical docs under `documents/`

## Public reading order

1. `documents/README.md`
2. subsystem canonical docs
3. `CHANGELOG.md`
4. maintainer-local archive only when historical reconstruction is necessary
