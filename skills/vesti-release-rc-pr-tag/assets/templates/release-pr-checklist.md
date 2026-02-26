# Release PR Checklist

## Release Info

- Release branch:
- Target version:
- Target tag:
- Release date:

## Commit Batches

- [ ] Batch A (feature/runtime)
- [ ] Batch B (rollout scope)
- [ ] Batch C (metadata only)

## Metadata Alignment

- [ ] `frontend/package.json` version updated
- [ ] `CHANGELOG.md` release section added
- [ ] `[Unreleased]` compare baseline updated
- [ ] release compare link added

## Automated Gates

- [ ] `pnpm -C frontend build`
- [ ] `pnpm -C frontend eval:prompts --mode=mock --strict`
- [ ] `pnpm -C frontend package`

## Manual Evidence

- Changed feature smoke checks:
- Platform coverage:
- Screenshots/log snippets attached:

## Risk and Rollback

- Known risks:
- Workaround:
- Scoped rollback plan:

## Merge and Tag

- [ ] PR merged to `main`
- [ ] Local `main` synced
- [ ] Annotated tag created
- [ ] `main` pushed
- [ ] tag pushed

## Final Verification

- [ ] `node -p "require('./frontend/package.json').version"`
- [ ] `git describe --tags --abbrev=0`
- [ ] `git show <tag> --no-patch`

