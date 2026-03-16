# External Contributor Route Map: Threads Select One-Shot

## Target Branch

You must branch from and open your PR against:

- `origin/feat/threads-select-batch-base`

Do not branch from `main`.
Do not open your PR against `main`.

## Allowed Scope

Keep this to one submission only. Limit your changes to the Threads `select` interaction.

Preferred files:

- `frontend/src/sidepanel/components/ConversationCard.tsx`
- `frontend/src/sidepanel/components/BatchActionBar.tsx`
- `frontend/src/sidepanel/pages/TimelinePage.tsx`

Avoid changing these unless it is strictly required to fix a build break:

- `frontend/src/lib/services/storageService.ts`
- `frontend/src/sidepanel/utils/exportConversations.ts`
- `frontend/src/sidepanel/types/export.ts`

Do not change:

- lockfiles
- workspace/package manager setup
- `documents/engineering_handoffs/*`
- unrelated docs

## Required Workflow

1. Fetch the latest remote branches:

   ```powershell
   git fetch origin
   ```

2. Create your working branch from the frozen base:

   ```powershell
   git switch -c feat/select-one-shot origin/feat/threads-select-batch-base
   ```

3. Make your changes.

4. Run the required build check:

   ```powershell
   pnpm -C frontend build
   ```

5. Commit with this message:

   ```text
   feat(sidepanel): refine threads select interaction
   ```

6. Push your branch:

   ```powershell
   git push -u origin feat/select-one-shot
   ```

7. Open a PR and manually change the base branch to:

   - `feat/threads-select-batch-base`

## PR Requirements

Your PR description must include:

- the files you changed
- a short summary of the interaction changes
- the result of `pnpm -C frontend build`
- 2 to 3 screenshots, or one short video

## Review Constraints

- Only one round of submission is allowed unless explicitly requested otherwise.
- The maintainer will integrate your branch locally and resolve conflicts there.
- If your PR includes unrelated changes, those hunks may be dropped during integration.

## Notes

The current local selection architecture already assumes:

- batch mode is local to the Threads page
- `Select All` applies only to the current filtered result set
- selected cards must not reuse hover or expanded card visuals
- export and delete actions stay aligned with the Data surface language

Optimize within that direction rather than redesigning the interaction model.
