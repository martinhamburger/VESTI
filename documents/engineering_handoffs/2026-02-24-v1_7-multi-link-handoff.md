# Engineering Handoff - v1.7 Multi-Link API + BYOK Lockdown

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-24-v1_7-multi-link-handoff.md`

## Reason for condensation

The original handoff mixed durable BYOK and runtime-contract outcomes with repo snapshots, branch heads, and local operator state across multiple repositories. The public version keeps the lasting product and contract decisions only.

## Durable outcomes

1. BYOK model selection moved to a whitelist-only posture instead of free-text model entry.
2. BYOK model normalization now auto-falls back to supported values rather than trusting raw user input.
3. Multi-link runtime RPC and event boundaries were promoted into explicit orchestration-facing documentation.

## Canonical follow-ups

- `documents/prompt_engineering/model_settings.md`
- `documents/orchestration/v1_7_runtime_event_contract.md`
- `documents/orchestration/tool_trace_contract.md`
