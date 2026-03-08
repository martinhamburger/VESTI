# Vesti Release Upload Directory

This directory is reserved for manually uploaded release bundles.

Current target release:
- Version: `v1.2.0-rc.7`
- Local artifact: `vesti-release/Vesti_MVP_v1.2.0-rc.7.zip`
- Safe mirror artifact: `vesti-release/vesti-chrome-mv3-prod-2026-03-08-safe.zip`
- Tag: `v1.2.0-rc.7` (pending merge/create/push)
- Source commit: `7804262cd3304cc2cbf95a7693c1b6e5df2f7ab2`
- Built at: `2026-03-08 13:45:00 +08:00`
- SHA256: `633120b79984ac0ec25756679e7dad79ce0455a7c0f3774201a92806057c3a58`
- Size: `19.25 MB` (`20,190,067` bytes)

Artifact provenance / status:
1. `Vesti_MVP_v1.2.0-rc.7.zip` is the user-facing mirror package and is ready for direct deployment.
2. `vesti-chrome-mv3-prod-2026-03-08-safe.zip` is the local safe-packaging artifact generated from the same build output.
3. The official GitHub Release attachment should use the same `Vesti_MVP_v1.2.0-rc.7.zip` payload, while `.github/workflows/extension-package.yml` remains the CI provenance path.

Latest artifacts prepared locally:
- `vesti-release/Vesti_MVP_v1.2.0-rc.7.zip`
- `vesti-release/Vesti_MVP_v1.2.0-rc.7.zip.sha256`
- `vesti-release/vesti-chrome-mv3-prod-2026-03-08-safe.zip`
- `vesti-release/manifest-2026-03-08.json`
- `vesti-release/chrome-mv3-prod-files-2026-03-08.txt`

Historical artifacts retained locally:
- `vesti-release/Vesti_MVP_v1.2.0-rc.2.zip`
- `vesti-release/Vesti_MVP_v1.1.0-rc.4.zip`

Upload policy:
1. Keep one zip per release version.
2. Do not overwrite historical artifacts.
3. Keep checksum and manifest/file-list snapshots beside the mirrored bundle.
