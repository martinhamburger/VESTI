# Drag Regression Triage

## Symptom to cause map

1. Can drag into composer input, cannot reposition capsule.
- Likely cause: native image drag is active; pointer drag path not active.

2. Capsule moves but click also fires after drag.
- Likely cause: no distance threshold or no post-drag click suppression.

3. Drag works only in one view (collapsed or expanded).
- Likely cause: drag gate tied to state-specific condition or stale setting.

4. Drag fails on some hosts only.
- Likely cause: host rollout gate or host-specific DOM interference.

## Fast checks

1. Ensure logo/image has native drag disabled.
- `element.draggable = false`
- `-webkit-user-drag: none`
- `user-select: none`

2. Verify pointer chain:
- `pointerdown` captures origin
- `pointermove` computes dx/dy
- threshold check runs
- position writes apply
- `pointerup` cleans session

3. Verify suppression logic:
- distance greater than threshold marks dragging
- click/open action suppressed when dragged

4. Verify gates:
- no accidental hard gate from stale persisted settings
- host is on primary rollout path when expected

## Fix order

1. Recover drag path.
2. Block native drag side effects.
3. Re-check click suppression.
4. Re-check viewport clamp and resize clamp.

## Regression checklist

1. Collapsed drag works.
2. Expanded drag works.
3. Drag does not trigger unwanted click/open.
4. No native drag-to-input behavior.
5. Small viewport still keeps capsule visible.

