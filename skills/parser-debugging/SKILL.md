---
name: vesti-parser-debugging
description: Parser and capture-governance debugging SOP for Vesti. Use when capture issues involve role mismatch, response loss, duplicate/order problems, smart/manual interception decisions, transient force-archive failures, or release sampling evidence for v1.2/v1.3.
---

# Vesti Parser Debugging Skill

## Scope

Use this skill when Vesti capture behavior is incorrect in parser or governance layers:
- role mismatch (`user:N, ai:0/1`)
- AI response missing or partial capture
- duplicate messages or ordering mismatch
- smart mode never commits or always holds
- manual mode force archive does not persist
- release sampling evidence is incomplete or inconsistent

## Preconditions

- Keep one Vesti extension instance in `chrome://extensions`.
- Reproduce on real conversation pages (new + historical session when possible).
- Open DevTools and confirm parser logs + capture decision logs are visible.
- Load these references first:
  - `documents/capture_engine/v1_2_capture_governance_spec.md`
  - `documents/capture_engine/capture_debugging_playbook.md`
  - `documents/capture_engine/manual_sampling_and_acceptance.md`
- Use `documents/capture_engine/parser_debug_playbook_legacy.md` as legacy parser-only supplement.

## Step-by-step

1. **Environment isolation**
   - Disable other similar extensions.
   - Reload extension and refresh target page.

2. **Sampling and evidence**
   - Collect parser stats, capture decision logs, and status event traces.
   - Collect `chrome.storage.local` capture settings snapshot.
   - Collect IndexedDB before/after counts.
   - Save screenshots with local timestamp.

3. **Root cause classification**
   - `parser_miss` (assistant marker drift)
   - `parser_noise` (Thought/toolbar content pollution)
   - `gate_misdecision` (smart/manual rule wrong)
   - `transient_chain_failure` (force archive path break)
   - `storage_persist_failure` (write rejected/failed)

4. **Fix strategy**
   - For parser drift: prioritize `anchor + exclusion`, keep selector as fallback.
   - For governance drift: inspect mode/decision/reason fields first.
   - For force archive: verify sidepanel -> background -> active tab -> offscreen chain.
   - Keep fixes minimal and single-cause per round.

5. **Regression acceptance**
   - Validate role distribution, ordering, duplicate suppression, and noise cleaning.
   - Validate smart/manual interception decisions.
   - Validate force archive success and event correctness.
   - Run mandatory regression set from `documents/capture_engine/manual_sampling_and_acceptance.md`.

## Decision Table

| Condition | Primary Strategy | Secondary Strategy |
| --- | --- | --- |
| Assistant selector stable | Role Selector | Anchor fallback |
| Assistant selector missing/classless | Anchor & Exclusion | Copy-action reverse |
| Thought text pollution | Text cleaning regex | Message content selector refinement |
| Duplicate writes / historical dirty data | Signature compare + replace | Transactional full rewrite by uuid |
| Smart mode no commit | Capture decision trace (`reason`) | Rule normalization fix |
| Manual force archive failed | Transient status + route trace | Active-tab routing hardening |

## Required Outputs per Debug Round

- One-line symptom statement
- Parser stats object
- Capture decision log object
- `chrome.storage.local` settings snapshot
- IndexedDB before/after counts
- At least one timestamped screenshot
- Round conclusion (what changed, what remains)

## Acceptance Checklist

- [ ] Non-empty sessions do not show persistent single-side role distribution
- [ ] Parsed message count is close to visible page bubbles
- [ ] No adjacent duplicates after save
- [ ] AI text is clean from `Thought for Ns` / `Show more` / `Done`
- [ ] Sidepanel ordering matches page ordering
- [ ] Smart/manual decisions match active settings
- [ ] `VESTI_DATA_UPDATED` fires only on real successful writes
- [ ] `FORCE_ARCHIVE_TRANSIENT` persists reliably when transient exists
- [ ] Sampling deliverables satisfy `manual_sampling_and_acceptance.md`

