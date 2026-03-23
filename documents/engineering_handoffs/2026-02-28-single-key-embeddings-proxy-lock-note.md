# 2026-02-28 Single Key + Embeddings Proxy Lock Note

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-28-single-key-embeddings-proxy-lock-note.md`

## Reason for condensation

This decision note included release gating and operational prerequisites around one durable frontend contract decision. The public repo keeps the lasting contract only.

## Durable outcomes

1. The user-facing settings model remains one visible `API Key`.
2. Frontend embeddings requests are locked to the proxy path rather than direct endpoint branching.
3. Direct-then-proxy fallback for embeddings was intentionally removed from the frontend surface.

## Canonical follow-ups

- `documents/prompt_engineering/model_settings.md`
- `documents/prompt_engineering/embedding_proxy_contract_v2_0.md`
- `documents/prompt_engineering/README.md`
