# Vesti v1.8.2 Thread Summary UI Refactor Spec (Skill-Aligned)

Version: v1.8.2  
Status: Decision Complete (Docs + Frontend + Prompt/Schema)  
Audience: Frontend, Prompt Engineer, QA, Release Owner

---

## 1. Summary

v1.8.2 upgrades Thread Summary to align with the latest `documents/prompt_engineering/thread-summary-skill.md` contract.

Locked decisions:

1. Keep schema version name as `conversation_summary.v2`.
2. Upgrade v2 payload shape to step-array journey + glossary insights:
   - `thinking_journey[]` with `step/speaker/assertion/real_world_anchor`
   - `key_insights[]` with `term/definition`
3. Keep backward compatibility for existing legacy v2 records via adapter/parser bridge.
4. Use user-facing Chinese labels in Thread Summary UI (e.g. `实证案例`).

---

## 2. Scope

In scope:

1. Prompt contract rewrite for Thread Summary (`frontend/src/lib/prompts/conversationSummary.ts`).
2. Summary parser/schema upgrade with new-v2-first + legacy-v2 fallback mapping (`frontend/src/lib/services/insightSchemas.ts`).
3. Adapter and presentation model upgrade (`frontend/src/lib/services/insightAdapter.ts`, `frontend/src/lib/types/insightsPresentation.ts`).
4. Thread Summary ready/loading UI redesign in Insights page (`frontend/src/sidepanel/pages/InsightsPage.tsx`, `frontend/src/style.css`).
5. Text renderer alignment for stored plain text (`frontend/src/lib/services/insightGenerationService.ts`).

Out of scope:

1. New schema version name (`conversation_summary.v3`) introduction.
2. One-shot migration job for historical summary records.
3. Weekly Digest contract redesign (already delivered in v1.8.1).

---

## 3. Data Contract (v2 upgraded shape)

Target `conversation_summary.v2` shape:

1. `core_question: string`
2. `thinking_journey: Array<{ step, speaker, assertion, real_world_anchor }>`
3. `key_insights: Array<{ term, definition }>`
4. `unresolved_threads: string[]`
5. `meta_observations: { thinking_style, emotional_tone, depth_level }`
6. `actionable_next_steps: string[]`

Compatibility bridge:

1. Parse new shape first.
2. If parse fails, parse legacy v2 object shape.
3. Legacy shape is deterministically mapped to new shape and returned as normalized v2.

---

## 4. Thread Summary UI Contract (Ready View)

Render order (fixed):

1. `核心问题`
2. `思考轨迹` (step cards with speaker chips: `你/助手`)
3. step-level `实证案例` block (when `real_world_anchor` exists)
4. `关键洞察` (term + definition)
5. `未解问题`
6. `下一步建议`
7. `思维侧写` chips (`depth/style/tone`)

Depth label mapping:

1. `superficial` -> `轻量梳理`
2. `moderate` -> `逐步深挖`
3. `deep` -> `深度拆解`

---

## 5. Loading/Error Behavior

1. `selected_loading`: show generation shell (phase list + timer).
2. `ready_loading`: keep existing summary visible and show generation shell at top.
3. `selected_error` and `ready_error`: show explicit retry affordance.
4. No hard blank state during generation or refresh.

---

## 6. Build and Release Gates

Required commands:

1. `pnpm -C frontend build`
2. `pnpm -C frontend package`

Acceptance focus:

1. New-v2 parsing works.
2. Legacy-v2 records still render.
3. No `EMP` label appears in UI.
4. No technical-jargon meta chips like `deductive` by default-path output.
5. Narrow sidepanel does not overflow with 8-step journey.
