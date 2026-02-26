# RC Batching and Tagging

## 1. Branch strategy

1. Work on a release branch, for example `release/v1.2.0-rc.2`.
2. Merge into `main` through PR.
3. Create annotated tag on updated `main`.

## 2. Batch slicing strategy

Use separate commits to keep review and rollback clear:

1. Batch A: feature behavior.
2. Batch B: rollout scope toggles.
3. Batch C: release metadata only.

## 3. Recommended commands

### Batch commits on release branch

```bash
git checkout release/<target>
git add <feature-files>
git commit -m "feat(...): <summary>"

git add <rollout-files>
git commit -m "feat(...): <summary>"

git add frontend/package.json CHANGELOG.md
git commit -m "chore(release): prepare <version> metadata"
git push origin release/<target>
```

### After PR merge to main

```bash
git checkout main
git pull origin main
node -p "require('./frontend/package.json').version"
git tag -a vX.Y.Z-rc.N -m "Release candidate vX.Y.Z-rc.N"
git push origin main
git push origin vX.Y.Z-rc.N
```

## 4. Version consistency checks

```bash
git status -sb
git log --oneline --decorate -n 8
git show vX.Y.Z-rc.N --no-patch
node -p "require('./frontend/package.json').version"
git describe --tags --abbrev=0
```

Expected:
1. `package.json` version matches tag without leading `v`.
2. Latest tag is the planned release tag.

## 5. Changelog rules

1. Move accepted items from `[Unreleased]` to `[X.Y.Z-rc.N]`.
2. Stamp with the release date.
3. Update compare links:
- `[Unreleased]` should compare from the new tag to `HEAD`.
- add link for `[X.Y.Z-rc.N]`.

## 6. Rollback policy

1. Prefer scoped rollback:
- remove one problematic host/toggle and ship next RC.

2. Use broader rollback only if issues cannot be isolated quickly.

