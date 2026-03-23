# Safe Packaging and Crash Triage (2026-02-26)

Status: Public thin handoff  
Local original: `documents/_local/engineering_handoffs/2026-02-26-safe-packaging-and-crash-triage.md`

## Reason for local-only demotion

This handoff included machine-specific crash evidence, local packaging traces, and release upload operations that are useful to the maintainer but not appropriate for public sync to `main`.

## Durable outcomes

1. Public release truth stays CI-built rather than local emergency packaging.
2. Local safe packaging remains a maintainer fallback rather than a public release default.
3. Package size governance, checksum publication, and artifact metadata snapshots remain part of release hygiene.

## Canonical follow-ups

- `documents/version_control_plan.md`
- `.github/workflows/extension-package.yml`
- `frontend/package.json`
- `scripts/safe-package.ps1`