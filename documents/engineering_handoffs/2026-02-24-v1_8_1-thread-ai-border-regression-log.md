# Engineering Incident Log - v1.8.1 Thread AI Border Regression

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-24-v1_8_1-thread-ai-border-regression-log.md`

## Reason for condensation

This incident log recorded a narrow rollout diagnosis for a thread-summary visual regression, including local acceptance detail that does not need to stay in the public historical surface.

## Durable outcomes

1. The failed rollout was traced to data-path contamination, not the border CSS primitive itself.
2. Visual polish and data normalization should be separated by commit boundary when diagnosing thread-summary regressions.
3. Layout-neutral accents remain the preferred first-line UI treatment when stability matters more than decoration.

## Canonical follow-ups

- `documents/ui_refactor/v1_8_2_thread_summary_ui_refactor_spec.md`
- `documents/ui_refactor/v1_8_2_thread_summary_manual_sampling_and_acceptance.md`
- `documents/ui_refactor/README.md`
