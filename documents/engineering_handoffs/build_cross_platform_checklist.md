# Build Cross-Platform Checklist (Browser Extension)

Date: 2026-02-26  
Scope: Vesti extension build and release consistency across Windows/macOS/Linux

## 1) Release Principle

1. Release artifacts are browser-targeted, not OS-targeted.
2. Use one canonical release zip per browser target.
3. Only split by OS when native binaries/native messaging are involved.

## 2) Toolchain Lock

1. Pin Node.js version for all environments.
2. Pin pnpm version for all environments.
3. Keep lockfile stable and enforce frozen installs in CI.

Recommended:
```bash
node -v
pnpm -v
pnpm install --frozen-lockfile
```

## 3) Lockfile and Package Manager Policy

1. Use pnpm as the single package manager.
2. Keep root `pnpm-lock.yaml` as the single source of truth.
3. Do not mix npm install flows for release builds. Delete any `package-lock.json` before release.
4. Avoid lockfile churn from local-only dependency edits.

## 4) Build Source of Truth

1. CI produces the official release zip.
2. Local builds are for development validation only.
3. Do not upload local emergency artifacts as official stable release assets.

## 5) Build Pipeline Order

1. Install dependencies with frozen lockfile.
2. Run compile/build checks first.
3. Package only after build is stable.
4. Record artifact hash and size.

Recommended:
```bash
pnpm install --frozen-lockfile
pnpm -C frontend build
pnpm -C vesti-web build
pnpm -C frontend package
```

## 6) Cross-Platform Safety Checks

1. Check import path casing consistency.
2. Avoid OS-specific absolute paths.
3. Avoid shell syntax that differs across environments in release scripts.
4. Verify no hidden native binary dependency in extension package.

## 7) Runtime Smoke Gates

1. Extension loads without manifest errors.
2. Sidepanel opens normally.
3. Capsule entry renders and drag/click behavior works.
4. At least one primary host smoke test passes before release.

## 8) Artifact Governance

1. Attach SHA256 for each published zip.
2. Keep release notes with exact build environment and commit SHA.
3. Distinguish clearly:
- official release artifact (CI-built)
- temporary safe artifact (local emergency fallback)

## 9) Exception Rule (When OS-Specific Artifacts Are Needed)

Create OS-specific artifacts only if one of the following exists:
1. Native Messaging host program.
2. Embedded native binary (`.exe`, `.dylib`, `.so`).
3. OS-specific code-signing/runtime requirement.

