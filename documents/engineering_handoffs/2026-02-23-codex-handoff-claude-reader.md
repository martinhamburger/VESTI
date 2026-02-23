# Codex Handoff Memo (Claude Reader / Parser)

Date: 2026-02-23
Repo: d:\Python Code\Hackathon\vesti

## 1) Objective at handoff

Fix Claude capture -> reader rendering regression:
- Capture is present in DB, but reader can show raw flattened text (missing markdown structure, formulas, blocks).
- Side issue: extension UI injection noise on Claude page.

## 2) Current development stage

Stage: P0 hotfix implementation done, pending end-to-end validation in fresh extension build.

What is already implemented (uncommitted):
1. Claude parser content-root selection improved for multi-leaf Claude responses.
2. Reader render fallback policy adjusted to avoid false fallback from AST to raw text on rich Claude content.
3. Claude text normalization now preserves line breaks better.
4. Claude message auto-collapse disabled in reader (avoid apparent height truncation).
5. Capsule content script moved from TSX to TS and restricted to top frame (to reduce duplicate injection and React #130 path).

## 3) Working tree status (IMPORTANT)

Current git status:
- D `frontend/src/contents/capsule-ui.tsx`
- ?? `frontend/src/contents/capsule-ui.ts`
- M `frontend/src/lib/core/parser/claude/ClaudeParser.ts`
- M `frontend/src/sidepanel/components/MessageBubble.tsx`

No commit has been created yet.

## 4) File-level change summary

### A) `frontend/src/lib/core/parser/claude/ClaudeParser.ts`
- Added Claude-specific content leaf selectors:
  - `[class*='font-claude-response-body']`
  - assistant message markdown/prose descendants.
- Added `resolveContentElement(...)` + shared container resolution for multi-leaf messages.
- `extractMessageText(...)` now uses the same resolved content root as AST extraction.
- `cleanExtractedText(...)` now preserves newlines better (stops collapsing all whitespace to one line).

### B) `frontend/src/sidepanel/components/MessageBubble.tsx`
- Added AST coverage metrics and structural AST inspection.
- Added Claude-rich-content coverage floor (`CLAUDE_RICH_AST_COVERAGE_FLOOR = 0.22`) to reduce false raw fallback.
- `shouldUseAst` now depends on platform-aware floor + AST richness.
- Disabled long-message collapse for Claude (`platform !== "Claude"` condition).

### C) `frontend/src/contents/capsule-ui.ts` (new) + remove TSX
- Same floating button logic migrated to `.ts`.
- Added `all_frames: false` in Plasmo config.
- Added top-frame guard in mount (`window.top !== window.self` early return).

## 5) Why this was needed (root-cause hypothesis)

1. Claude DOM often splits one assistant answer into multiple visual leaves.
2. Previous parser could pick a partial content node; reader then received mismatched `content_text` vs `content_ast`.
3. Reader had strict AST coverage gate and would fall back to raw text when mismatch was detected.
4. Raw renderer does limited formatting only, so markdown/math looked unrendered.
5. Claude auto-collapse made this look like message-height truncation.

## 6) Known constraints / caveats

- Repo has pre-existing TypeScript errors unrelated to this hotfix, so full `tsc --noEmit` is not a clean gate today.
- Validation must be done by extension build + manual scenario replay on Claude.
- Historical polluted conversation data exists in some local DB entries; evaluate with fresh conversation IDs only.

## 7) Validation checklist for next Codex

1. Build and reload extension:
   - `pnpm -C frontend build`
   - reload unpacked extension in browser.
2. Open fresh Claude conversation, run markdown+math stress prompt.
3. Verify in sidepanel reader:
   - headings/list/code/math/table/blockquotes render structurally.
   - message not visually truncated due to default collapse.
4. Run DOM + DB sampling (use the self-contained console probe from previous session).
5. Compare:
   - parser logs (`keptMessages`, source anchor/selector)
   - DB message lengths and `content_ast_version`.

## 8) Workdir skeleton (quick map)

Top-level directories in `d:\Python Code\Hackathon\vesti`:
- `.github` CI/workflows
- `architecture` architecture notes
- `documents` docs and prompt engineering material
- `frontend` extension app (main active workspace)
- `scripts` utility scripts
- `skills` local repo skills (`parser-debugging`, `markdown-writing`, `ui-prototype-sidepanel`)
- `release`, `vesti-release`, `Frontend_Polish`, `Backend_Trial`, `proxy-local`, `eval`, `.tmp`

For this task, primary focus is:
- `frontend/src/lib/core/parser/claude/ClaudeParser.ts`
- `frontend/src/sidepanel/components/MessageBubble.tsx`
- `frontend/src/contents/capsule-ui.ts`

## 9) Agent/skill instructions for next Codex

1. Read AGENTS instructions first (repo root thread instructions already include them).
2. Current AGENTS declared session skills are system skills:
   - `skill-creator`
   - `skill-installer`
   They are not required for this parser/render hotfix unless explicitly requested.
3. Repo-local skills exist and are relevant for debugging reference:
   - `skills/parser-debugging/SKILL.md` (recommended to read first for continuity)
   - `skills/markdown-writing/SKILL.md`
   - `skills/ui-prototype-sidepanel/SKILL.md`

## 10) Suggested first 5 commands for next Codex

1. `git status --short`
2. `git diff -- frontend/src/lib/core/parser/claude/ClaudeParser.ts`
3. `git diff -- frontend/src/sidepanel/components/MessageBubble.tsx`
4. `git diff -- frontend/src/contents/capsule-ui.ts frontend/src/contents/capsule-ui.tsx`
5. `pnpm -C frontend build`

## 11) Update (2026-02-23) — Reader UI alignment + compact pass

Status: implemented, accepted in manual UI review, committed and pushed.

### A) Commit and push record

- Branch: `feature/ui-minimalist-sidebar-compare`
- Commit: `af280bd`
- Message: `feat(reader): align quote rendering and compact visual rhythm`
- Pushed to: `origin/feature/ui-minimalist-sidebar-compare`

### B) Scope delivered in this pass

1. Reader P0/P1 alignment:
   - Restored blockquote structural rendering in reader AST pipeline.
   - Added attribution detection/rendering (`— Author`) without changing AST schema.
   - Fixed language-label leakage handling in parser + reader-side sanitation path.
   - Applied warm user text tone and corrected code/maths visual specs.
2. Chinese typography reliability:
   - Reader text flow now uses strict CJK-friendly line break policy.
   - Reduced line-start punctuation artifacts in narrow sidepanel width.
3. 92% compact mode (no font-size change):
   - Proportional tightening of letter spacing, line height, paragraph spacing, and paddings.
   - Reader header also compacted via dedicated reader classes.
   - Collapse parameters scaled from `120/94/40` to `110/86/37`.

### C) Primary files touched in the shipped commit

- `frontend/src/lib/core/parser/shared/astExtractor.ts`
- `frontend/src/sidepanel/components/AstMessageRenderer.tsx`
- `frontend/src/sidepanel/components/MessageBubble.tsx`
- `frontend/src/sidepanel/containers/ReaderView.tsx`
- `frontend/src/style.css`

### D) Verification run

- Build gate executed:
  - `pnpm -C frontend build`
  - Result: success (`plasmo build`)

### E) Current working tree state after push

- Clean (no uncommitted local modifications at handoff update time).

