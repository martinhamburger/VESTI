# Reusable Design Unit Architecture (Sidepanel-wide)

This document defines reusable UI units for Vesti sidepanel refactors.

## Layering model

Use this logical order:

`PanelShellUnit -> GroupLabelUnit -> AccordionItemUnit -> HeaderDescriptorUnit -> StateSurfaceUnit -> ActionTriggerUnit -> StatusMachineUnit -> TokenBridgeUnit`

Notes:

1. Higher layers consume lower-layer constraints.
2. Replace one unit at a time; avoid cross-unit rewrites in one patch when possible.

## Unit catalog

### 1) PanelShellUnit

Purpose:

- Provide shared sidepanel shell rhythm: page header, spacing, section cadence.

Inputs:

- Page title, top-level groups, scroll behavior.

Outputs:

- Stable shell container and vertical rhythm contract.

Must not break:

- Global sidepanel layout and navigation context.

Common reuse:

- Insights, Settings, Timeline shells.

### 2) GroupLabelUnit

Purpose:

- Label semantic buckets (`On-demand`, `Scheduled`, `Discovery`).

Inputs:

- Group name and order.

Outputs:

- Consistent uppercase micro-label with spacing rhythm.

Must not break:

- Group order semantics and hierarchy readability.

### 3) AccordionItemUnit

Purpose:

- Provide expandable item shell with icon, title, description, chevron/soon-tag.

Inputs:

- Title, description, icon, open state, disabled state.

Outputs:

- Trigger + body container with keyboard accessibility.

Must not break:

- `aria-expanded`, focus-visible behavior, disabled semantics.

### 4) HeaderDescriptorUnit

Purpose:

- Keep short descriptions readable without losing compact closed layout.

Inputs:

- Description text and open/closed state.

Outputs:

- Closed: one-line ellipsis.
- Open: up to two lines.
- Full text available via tooltip/title.

Must not break:

- Trigger layout alignment, chevron/icon stability in narrow width.

### 5) StateSurfaceUnit

Purpose:

- Standardize empty/loading/error/ready/sparse rendering shells.

Inputs:

- State enum, data availability, error details.

Outputs:

- Deterministic state surface with explicit fallback strategy.

Must not break:

- Existing result preservation during loading/error overlays.

### 6) ActionTriggerUnit

Purpose:

- Standardize generate interactions and action semantics.

Inputs:

- Existing artifact presence, loading state, retry path.

Outputs:

- `Generate` vs `Regenerate` text policy with stable capability icon.

Must not break:

- Semantic distinction between create and refresh actions.

### 7) StatusMachineUnit

Purpose:

- Encapsulate transition logic for synthetic local phases and future event bridge.

Inputs:

- Source data status, async lifecycle, optional progress events.

Outputs:

- Stable UI state transitions and convergence rules.

Must not break:

- Terminal-state correctness and retry determinism.

### 8) TokenBridgeUnit

Purpose:

- Enforce typography, spacing, color, and theme consistency via existing tokens.

Inputs:

- Existing design tokens and utility class conventions.

Outputs:

- New UI styles that match sidepanel visual language.

Must not break:

- Dark/light parity, focus-visible, narrow-width resilience.

## Replaceable vs non-replaceable boundaries

Replaceable:

1. Local utility classes.
2. Internal component composition.
3. Copy layout details where semantics remain intact.

Non-replaceable:

1. Naming semantics frozen by product decisions.
2. Icon meaning conventions.
3. State naming and transition contracts once frozen.
4. Accessibility baseline (`aria-*`, keyboard path, focus-visible).

## Mapping checklist before implementation

For each requested UI upgrade:

1. Map requirement to one or more units.
2. Mark unit as `reuse`, `extend`, or `new`.
3. List invariant constraints that cannot regress.
4. Attach acceptance tests per touched unit.

