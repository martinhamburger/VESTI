# Vesti v1.5 Floating Capsule Engineering Spec

Version: v1.5  
Status: Decision Complete (spec baseline)  
Scope: Floating capsule UX/interaction/runtime upgrade on supported chat hosts

---

## 1. Summary

v1.5 upgrades the injected floating ball into a full capsule widget with status visibility and direct actions.

Primary goals:
1. Keep users aware of capture state without opening sidepanel.
2. Allow one-click manual archive in `smart/manual` mode from page context.
3. Keep host-page impact low (style isolation, non-blocking rendering, no content overlap regression).

Locked constraints:
- Keep v1.3 capture governance logic unchanged (`mirror/smart/manual`, strict-id, force rules).
- No DB schema change in v1.5.
- No parser scope expansion in v1.5.

---

## 2. Current Baseline (As-Is)

Current file: `frontend/src/contents/capsule-ui.tsx`

Current behavior:
- Injects a static circular button.
- Click only opens sidepanel via `OPEN_SIDEPANEL`.
- No runtime capture state display.
- No direct archive action.
- No persistence for position/collapse/visibility preferences.

---

## 3. In Scope / Out of Scope

### In scope
- Replace static button with capsule component (collapsed + expanded states).
- Show capture runtime status on page.
- Provide direct actions:
  - Open sidepanel
  - Archive active thread now (when available)
  - Pause/Resume capture for current tab session
- Persist capsule UI preferences per host.
- Support all currently integrated platforms:
  - ChatGPT, Claude, Gemini, DeepSeek, Qwen, Doubao

### Out of scope
- New parser/platform integration.
- Capture governance rule redesign.
- Historical data backfill.
- Cloud sync for capsule preferences.

---

## 4. Data Model (new internal settings)

Storage key:
- `chrome.storage.local["vesti_capsule_settings"]`

```ts
type CapsuleAnchor = "bottom_right" | "bottom_left"

type CapsuleViewMode = "collapsed" | "expanded"

type CapsuleRuntimeState =
  | "idle"
  | "mirroring"
  | "holding"
  | "ready_to_archive"
  | "archiving"
  | "saved"
  | "paused"
  | "error"

interface CapsuleSettings {
  enabled: boolean                 // default true
  defaultView: CapsuleViewMode     // default "collapsed"
  autoCollapseMs: number           // default 2000, range 0..10000
  anchor: CapsuleAnchor            // default "bottom_right"
  offsetX: number                  // default 24
  offsetY: number                  // default 100
  draggable: boolean               // default true
  hiddenHosts: string[]            // default []
}
```

Normalization rules:
- `autoCollapseMs` clamp to `0..10000`.
- `offsetX/offsetY` clamp to viewport-safe bounds.
- `hiddenHosts` lowercased, deduplicated.

---

## 5. Runtime Contract and Messaging

## 5.1 Reused messages
- `OPEN_SIDEPANEL`
- `GET_ACTIVE_CAPTURE_STATUS`
- `FORCE_ARCHIVE_TRANSIENT`

## 5.2 New internal messages (target: `background`)

```ts
GET_CAPSULE_RUNTIME_STATUS
SET_CAPSULE_TAB_PAUSED
GET_CAPSULE_SETTINGS
SET_CAPSULE_SETTINGS
```

Response shape (new):

```ts
interface CapsuleRuntimeStatus {
  supported: boolean
  platform?: Platform
  mode: CaptureMode
  activeCapture: ActiveCaptureStatus
  paused: boolean
  uiState: CapsuleRuntimeState
  reason?: string
  updatedAt: number
}
```

Rules:
- `uiState` is derived from `mode + activeCapture + paused + inFlightAction`.
- `FORCE_ARCHIVE_TRANSIENT` semantics unchanged (strict-id still enforced).

---

## 6. UI and Interaction Contract

## 6.1 Render container
- Must use Shadow DOM to isolate style from host page.
- Host root id: `vesti-capsule-root`.
- z-index: `2147483646`.

## 6.2 Collapsed state
- Circular liquid-glass sphere with contrast-safe owl mark.
- Single click expands capsule (does not immediately archive).
- Keyboard accessible (`Enter`/`Space`).
- Capsule owl uses explicit light/dark variants selected by capsule theme; do not rely on one neutral mark across all backgrounds.

## 6.3 Expanded state
- Expanded state remains a single expanded panel shell. Rounded badges and controls may be used inside the panel, but the shell itself must not dissolve into a stack of independent floating pills.
- Displays:
  - platform badge
  - status label (e.g. `Mirroring`, `Held`, `Ready to archive`, `Saved`)
  - snapshot metrics (`messages`, `turns`)
- Action buttons:
  - `Archive now` (enabled only when `smart/manual` and `available=true`)
  - `Open Dock`
  - `Pause/Resume`
- Expanded-state copy may use softer, rounder internal controls, but metrics/status/actions must still read as content inside the same panel rather than detached utility chips.
- Status row and top-right collapse control are panel-native controls, not standalone pill badges/buttons.
- `messages` / `turns` metrics and primary action row must stay compact; avoid tall empty cards or oversized full-pill buttons inside the panel.

## 6.4 Auto-collapse
- On `saved` state, show success state for `autoCollapseMs`, then collapse.
- If `autoCollapseMs = 0`, keep expanded.

## 6.5 Drag and positioning
- Drag allowed only when expanded or while holding modifier key in collapsed mode.
- Snap to nearest horizontal anchor on drag end.
- Persist position/anchor to `vesti_capsule_settings`.

---

## 7. State Mapping Rules (high-level)

- `paused=true` => `paused`
- action in progress => `archiving`
- latest force archive success => `saved` (transient)
- `mode=mirror` and supported => `mirroring`
- `mode=smart/manual` and `activeCapture.available=true` => `ready_to_archive`
- `mode=smart/manual` and `available=false` => `holding`
- unsupported tab => `idle`
- any request failure => `error`

Full transition detail is defined in `v1_5_floating_capsule_state_machine_spec.md`.

---

## 8. Implementation Phases

### Phase 1 (P0): core shell + status
- Convert `capsule-ui.tsx` to componentized capsule with Shadow DOM.
- Add polling (3s) for `GET_CAPSULE_RUNTIME_STATUS`.
- Add collapsed/expanded UI + status text.

### Phase 2 (P0): action wiring
- Wire `Archive now` to `FORCE_ARCHIVE_TRANSIENT` via background.
- Wire `Open Dock` to `OPEN_SIDEPANEL`.
- Add pause/resume control (tab-local runtime flag).

### Phase 3 (P1): persistence + drag
- Add settings service for `vesti_capsule_settings`.
- Add draggable behavior and snap-to-edge.
- Persist user position and view preference.

### Phase 4 (P0): hardening
- Add retry/backoff for runtime calls.
- Add error display and fallback behavior.
- Regression run across 6 platforms.

---

## 9. Acceptance Criteria

1. Capsule renders reliably on all supported hosts.
2. `Archive now` from capsule can force-save held conversations in `smart/manual` mode.
3. `mirror` mode never shows archive action as primary.
4. Strict-id behavior remains unchanged.
5. Capsule state updates within 3s of capture status changes.
6. Build/package pass without parser/capture regressions.

---

## 10. Build and Validation

Commands:
- `pnpm -C frontend build`
- `pnpm -C frontend package`

Manual QA and evidence collection:
- `documents/floating_capsule/floating_capsule_manual_sampling_and_acceptance.md`
- `documents/floating_capsule/floating_capsule_debugging_playbook.md`

---

## 11. Explicit assumptions

1. v1.5 runs only on current 6 supported web hosts.
2. Pause/Resume is tab-local UI runtime control, not a global capture mode mutation.
3. Sidepanel remains source of truth for settings editing; capsule is quick-control surface.
4. Capsule failures must degrade to "Open Dock" fallback, not block capture pipeline.
