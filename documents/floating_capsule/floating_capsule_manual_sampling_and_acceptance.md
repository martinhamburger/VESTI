# Vesti Floating Capsule Manual Sampling and Acceptance (v1.5)

Version: v1.0  
Status: QA Gate Spec  
Audience: QA, release owner, engineering

---

## 1. Sampling targets

Minimum mandatory set:
- Core matrix: `6 platforms x 3 modes x 1 standard scenario = 18 cases`
- Edge set: at least `8 cases`
- Total minimum: `26 cases`

Platforms:
- ChatGPT, Claude, Gemini, DeepSeek, Qwen, Doubao

Modes:
- mirror, smart, manual

---

## 2. Core matrix (mandatory)

For each `platform x mode`, validate:
1. Capsule renders and status text matches mode semantics.
2. Open Dock action works.
3. Archive action availability is correct:
   - mirror: disabled/secondary
   - smart/manual: conditionally enabled by availability

---

## 3. Edge scenarios (minimum 8)

1. No stable conversation ID (`missing_conversation_id`).
2. No transient payload (`TRANSIENT_NOT_FOUND`).
3. Unsupported tab fallback (`idle`).
4. Pause -> Resume state transition.
5. Archive success feedback -> auto-collapse.
6. Refresh resets to quiet default (collapsed + right edge).
7. Composer overlap avoidance on small viewport.
8. Host CSS stress (zoom/font override) with Shadow DOM stability.
9. Expanded-state panel baseline: the capsule expanded view still reads as one complete panel shell and does not fragment into separate floating pills.
10. Expanded-state internal control baseline: platform badge, status badge, and action controls may be more rounded, but metrics and controls still feel clearly contained by the panel.
11. Expanded-state density baseline: `Messages` / `Turns` and the primary action row remain compact, with no large empty cards or oversized full-pill action buttons.
12. Expanded-state control boundary baseline: `mirroring` / `held` / `ready` status and the top-right collapse affordance read as panel-native controls rather than separate pill chips.
13. Collapsed-state contrast baseline: the glass sphere remains legible on both light and dark host backgrounds, and the owl mark switches to the correct light/dark variant without obvious contrast loss.

---

## 4. Required evidence per case (DoD)

Each case must include:
- Case ID, platform, mode
- Input conditions
- Expected vs actual
- Verdict (pass/fail)
- Timestamp
- Screenshot (capsule visible)
- Log snippets:
  - capsule status log
  - action log (if action tested)
  - capture decision log (for archive-related cases)

Missing evidence => case invalid.

---

## 5. Severity and release threshold

Severity:
- Blocker:
  - capsule cannot render on supported host
  - archive action broken in manual/smart happy path
  - strict-id violated
- Major:
  - wrong state mapping or action availability
  - persistent positioning failure
- Minor:
  - non-blocking visual mismatch

Go/No-Go threshold:
- `Blocker = 0`
- `Major <= 2` with owner, workaround, retest plan

---

## 6. Regression set (must pass)

- Existing sidepanel manual archive still works.
- `VESTI_DATA_UPDATED` emission rule unchanged (only real write).
- Timeline/Insights refresh behavior unchanged.
- Build/package pass.

---

## 7. Result template

```md
# v1.5 Floating Capsule Sampling Result

- Planned: 26
- Executed: <n>
- Passed: <n>
- Failed: <n>

## Severity
- Blocker: <n>
- Major: <n>
- Minor: <n>

## Go/No-Go
- Decision: Go | No-Go
- Reason:
- Remaining risks:
- Sign-off:
```
