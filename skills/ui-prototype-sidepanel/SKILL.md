---
name: vesti-ui-prototype-sidepanel
description: Prototype-driven sidepanel UI refactor workflow and reusable design-unit architecture for Vesti. Use when requests include HTML/CSS prototypes, state-machine UI contracts, high-fidelity UI rebuilds, naming/icon semantics alignment, or cross-page sidepanel pattern reuse across Insights, Settings, and Timeline.
---

# Vesti UI Prototype Sidepanel Skill

## Scope

Use this skill to convert UI prototypes into stable, low-regression sidepanel implementations with reusable units and clear quality gates.

This skill is optimized for:

1. Prototype -> state machine -> UI contract -> implementation flow.
2. Sidepanel-wide pattern reuse (Insights, Settings, Timeline).
3. Fast but disciplined UI iteration with explicit acceptance criteria.

## Relationship With `agent.md`

- `agent.md` remains the constitutional layer (architecture, quality boundaries, release-line rules).
- This skill is the execution layer for UI prototype-driven delivery.
- If conflicts appear, follow `agent.md`.

## Trigger Cues

Trigger this skill when the request includes one or more of:

1. Provided prototype code (HTML/CSS, screenshot spec, interaction mock).
2. Explicit state-machine UI requirements.
3. High-fidelity UI refactor requests.
4. Requests to reuse existing sidepanel style language and patterns.

Examples:

- "按这个原型重构 Insights accordion"
- "Keep Thread/Weekly naming semantics consistent across pages"
- "Build v1.8.x UI skeleton now, refine in v1.8.2"

## Quick Start (Progressive Disclosure)

Read only what is needed:

1. Start with `references/workflow-prototype-to-ui.md` for step-by-step execution.
2. Load `references/design-unit-architecture.md` when deciding component boundaries and reuse.
3. Load `references/quality-gates-and-anti-patterns.md` before finalizing implementation.
4. Copy templates from `assets/templates/` to produce plan/contract docs quickly.

## Core Execution Rules

1. Freeze semantics first (naming, grouping, icon meaning, trigger intent) before coding.
2. Define state machine contracts before styling details.
3. Prefer additive refactor with rollback safety over destructive replacement.
4. Keep output decision-complete: no hidden decisions for the implementer.
5. Treat "small readability details" (for example header descriptions) as first-class UX quality gates.

## Required Deliverables Per Task

1. Implementation plan (use `assets/templates/ui-refactor-plan-template.md`).
2. State machine contract (use `assets/templates/state-machine-contract-template.md`).
3. Design unit catalog/mapping (use `assets/templates/design-unit-catalog-template.md`).
4. Acceptance checklist with build + manual sampling gates.

