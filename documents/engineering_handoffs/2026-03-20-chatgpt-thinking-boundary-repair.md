# 2026-03-20 ChatGPT Thinking Boundary Repair

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-03-20-chatgpt-thinking-boundary-repair.md`

## Reason for condensation

This note documented a narrow parser repair for ChatGPT thinking UI along with verification detail and deferred ideas. The public repo keeps the lasting boundary policy only.

## Durable outcomes

1. ChatGPT thinking UI is treated as message-internal visual noise rather than as a second logical message.
2. `data-message-id` plus author role remains the hard boundary for ChatGPT assistant message parsing.
3. Reasoning metadata capture remained deferred in this repair window.

## Canonical follow-ups

- `documents/capture_engine/capture_engine_current_architecture.md`
- `documents/capture_engine/capture_engine_engineering_spec.md`
- `documents/capture_engine/capture_engine_operational_playbook.md`
