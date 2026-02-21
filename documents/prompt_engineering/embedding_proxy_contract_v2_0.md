# Vesti Embedding Proxy Contract (v2.0)

- Version: v2.0
- Scope: local/private proxy routes for extension + web view
- Related:
  - `documents/prompt_engineering/model_settings.md`
  - `documents/prompt_engineering/insights_prompt_ui_engineering.md`

## 1) Routes

- `POST /api/chat` (existing stable route)
- `POST /api/embeddings` (new)
- `OPTIONS` supported on both routes

## 2) Security Policy

Required checks on both routes:

1. Origin allowlist via `VESTI_ALLOWED_ORIGINS`
2. `x-vesti-service-token` equals `VESTI_SERVICE_TOKEN`
3. CORS headers on success/error/preflight

No wildcard-open deployment in production-like environments.

## 3) `/api/embeddings` Request

OpenAI-compatible payload:

```json
{
  "model": "text-embedding-v2",
  "input": ["text A", "text B"],
  "encoding_format": "float"
}
```

Validation defaults:

- empty input => `400 INVALID_INPUT`
- batch size > `VESTI_EMBED_BATCH_MAX` => `413 BATCH_TOO_LARGE`
- single text length > `VESTI_EMBED_TEXT_MAX_CHARS` => `422 TEXT_TOO_LONG`

## 4) `/api/embeddings` Upstream

- URL: `https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings`
- Header: `Authorization: Bearer ${MODELSCOPE_API_KEY}`
- Timeout: `VESTI_UPSTREAM_TIMEOUT_MS` (default 20000ms)

## 5) Response Contract

### Success

- proxy returns upstream OpenAI-compatible payload unchanged
- includes `x-request-id`

### Failure

Standard JSON envelope:

```json
{
  "error": {
    "code": "UPSTREAM_EMBEDDING_ERROR",
    "message": "Embedding upstream request failed.",
    "requestId": "uuid",
    "upstreamStatus": 429
  }
}
```

## 6) Frontend Binding

`LlmConfig` fields:

- `proxyBaseUrl` (canonical)
- `proxyUrl` (legacy read compatibility)
- `proxyServiceToken` (header source)

Derived routes:

- chat: `${proxyBaseUrl}/chat`
- embeddings: `${proxyBaseUrl}/embeddings`

Migration rule:

- if legacy `proxyUrl` is `.../api/chat`, auto-upgrade to `proxyBaseUrl = .../api`

## 7) Logging (No content leak)

Log fields only:

- `route`, `requestId`, `origin/clientType`, `batchSize`, `model`, `upstreamStatus`, `latencyMs`

Never log raw prompt/message text or raw embedding vectors.
