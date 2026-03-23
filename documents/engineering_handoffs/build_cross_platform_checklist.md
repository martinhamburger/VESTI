# Build Cross-Platform Checklist (Browser Extension)

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/build_cross_platform_checklist.md`

## Reason for condensation

The original checklist mixed durable release principles with local emergency packaging and release-operator details that are better kept in the maintainer-local layer.

## Durable outcomes

1. CI-built artifacts are the public release truth.
2. pnpm and the root lockfile remain the single package-management baseline.
3. OS-specific release splitting should happen only when native runtime requirements make it necessary.

## Canonical follow-ups

- `documents/version_control_plan.md`
- `.github/workflows/extension-package.yml`
- `vesti-release/README.md`
