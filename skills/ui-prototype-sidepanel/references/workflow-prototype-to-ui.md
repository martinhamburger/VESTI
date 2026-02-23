# Workflow: Prototype -> Sidepanel UI Delivery

Use this workflow when a request provides a prototype and asks for high-fidelity UI implementation.

## Step 1: Prototype parsing and semantic extraction

Objective: extract stable meaning before implementation choices.

Capture:

1. Naming decisions (for example `Conversation Summary -> Thread Summary`).
2. Group order and information architecture.
3. Icon semantics and action semantics (`Generate` vs `Regenerate`).
4. State definitions and visible transitions.
5. Typography/spacing/contrast constraints from the prototype.

Output:

- Prototype Semantics Notes (short, explicit, testable).

## Step 2: IA and copy freeze

Objective: avoid rework by freezing labels and layout hierarchy early.

Do:

1. Freeze section names and order.
2. Freeze short descriptions and helper copy.
3. Mark what is intentionally deferred.

Output:

- IA Freeze block in the implementation plan.

## Step 3: State machine contract freeze

Objective: define deterministic UI behavior before coding.

Do:

1. Define UI states (idle/loading/error/ready/sparse variants).
2. Define source signals and mapping rules.
3. Define transitions and retry behavior.
4. Define "preserve old result" policy for loading/error overlays.

Output:

- State machine contract doc (template-based).

## Step 4: Map to existing components and tokens

Objective: reuse before rewrite.

Do:

1. Map prototype parts to existing component slots.
2. Reuse existing CSS tokens before introducing new utility classes.
3. Keep rollback-safe compatibility layers when risk is high.

Output:

- Design unit mapping table (existing -> new/updated).

## Step 5: Stage implementation in low-risk slices

Objective: preserve momentum and reduce regressions.

Recommended slicing:

1. Structure + naming.
2. State machine behavior.
3. Visual refinement.
4. A11y and edge polishing.

Output:

- Milestone checklist with `P0/P1` priority.

## Step 6: Regression minimization strategy

Objective: avoid broad breakage during refactor.

Do:

1. Keep legacy components until replacement is proven.
2. Avoid deleting old paths too early.
3. Use additive styles and local class names to reduce cross-page impact.
4. Keep message/API protocols stable unless explicitly in scope.

Output:

- Regression guardrail list.

## Step 7: Build and manual acceptance gates

Objective: block incomplete delivery.

Required minimum:

1. Build command passes.
2. Package command passes.
3. Manual sampling checklist executed.
4. Known risks documented.

Output:

- Build logs + sampling result summary.

## Step 8: Documentation synchronization

Objective: keep code and docs aligned.

Update as needed:

1. UI refactor spec.
2. State machine contract.
3. Manual acceptance matrix.
4. Prompt/UI engineering linkage.
5. Changelog.

Output:

- Linked doc update list with changed paths.

---

## M7 Document-Driven Rehearsal (3 tasks)

Run these dry exercises when validating skill usability:

1. Insights state-machine refactor task.
2. Settings information-density adjustment task.
3. Cross-page naming/icon semantics alignment task.

For each rehearsal, verify:

1. Trigger clarity: skill is the obvious workflow.
2. Template fit: required docs can be generated with no missing sections.
3. Decision completeness: implementer does not need extra product decisions.
4. Reuse quality: units and gates are reused consistently.

