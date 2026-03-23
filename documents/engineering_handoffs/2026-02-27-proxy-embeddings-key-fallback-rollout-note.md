# 2026-02-27 Proxy Embeddings Key Fallback Rollout Note

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-27-proxy-embeddings-key-fallback-rollout-note.md`

## Reason for condensation

This note mixed proxy-repo branch state and deployment steps with one durable API-key routing decision. The public repo keeps the lasting contract outcome without the operator checklist.

## Durable outcomes

1. Proxy embeddings key resolution was standardized into a deterministic fallback order.
2. The `/api/chat` contract was intentionally left unchanged while embeddings policy evolved.
3. Public documentation should describe the policy boundary, while deploy-time secrets and redeploy steps stay outside the tracked repo surface.

## Canonical follow-ups

- `documents/prompt_engineering/embedding_proxy_contract_v2_0.md`
- `documents/prompt_engineering/model_settings.md`
- `documents/prompt_engineering/README.md`
