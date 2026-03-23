# 2026-02-27 BYOK Dual-Key Design Memo

Status: Public thin handoff
Local original: `documents/_local/engineering_handoffs/2026-02-27-byok-dual-key-design-memo.md`

## Reason for condensation

The original memo explored a broader dual-key BYOK design, including rejected configuration and routing options. The public repo keeps only the durable decision boundary that survived this design pass.

## Durable outcomes

1. The dual-key BYOK design was deferred rather than adopted into the public shipping line.
2. The visible user model stayed on a single `API Key` field instead of separate chat and embeddings keys.
3. Embeddings routing decisions were narrowed into the later single-key proxy lock decision.

## Canonical follow-ups

- `documents/prompt_engineering/model_settings.md`
- `documents/prompt_engineering/embedding_proxy_contract_v2_0.md`
- `documents/engineering_handoffs/2026-02-28-single-key-embeddings-proxy-lock-note.md`
