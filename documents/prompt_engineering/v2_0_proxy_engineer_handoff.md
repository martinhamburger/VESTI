# Vesti v2.0 Proxy + Embeddings Engineer Handoff

Status: Implemented in extension branch, ready for backend/web-view integration.

## 1) What changed

This delivery adds v2.0 proxy architecture support:

1. Proxy topology: single base URL with dual routes
   - `${proxyBaseUrl}/chat`
   - `${proxyBaseUrl}/embeddings`
2. Embeddings route contract aligned to DashScope OpenAI-compatible endpoint.
3. Security baseline enforced for proxy access:
   - origin allowlist
   - service token (`x-vesti-service-token`)
4. Frontend config migration:
   - legacy `proxyUrl` (`.../api/chat`) auto-upgrades to `proxyBaseUrl` (`.../api`)

## 2) Files delivered

### Frontend (extension)

- `frontend/src/lib/types/index.ts`
  - `LlmConfig` adds `proxyBaseUrl?: string`, `proxyServiceToken?: string`
- `frontend/src/lib/services/llmConfig.ts`
  - adds proxy base/route helpers and migration utilities
- `frontend/src/lib/services/llmSettingsService.ts`
  - auto-backfill/migration on settings read
- `frontend/src/lib/services/llmService.ts`
  - chat proxy call now derives route from base URL and forwards service token
- `frontend/src/lib/services/embeddingService.ts`
  - dual-track embeddings routing:
    - BYOK direct (`dashscope compatible`)
    - fallback proxy route
- `frontend/src/sidepanel/pages/SettingsPage.tsx`
  - adds `Proxy Base URL` and `Proxy Service Token` inputs
  - displays resolved chat/embeddings routes
- `frontend/src/background/index.ts`
- `frontend/src/offscreen/index.ts`
  - demo mode config validation updated for `proxyBaseUrl`

### Local proxy (new)

- `proxy-local/server.mjs`
  - `POST /api/chat`
  - `POST /api/embeddings`
  - `OPTIONS` for both routes
  - origin allowlist + service-token checks
  - structured error envelope with `requestId`
- `proxy-local/.env.example`
- `proxy-local/package.json`
- `proxy-local/README.md`

### Specs/docs

- `documents/prompt_engineering/model_settings.md` (updated)
- `documents/prompt_engineering/insights_prompt_ui_engineering.md` (updated)
- `documents/prompt_engineering/embedding_proxy_contract_v2_0.md` (new contract doc)

## 3) Required env for proxy

Minimum required:

- `MODELSCOPE_API_KEY`
- `VESTI_SERVICE_TOKEN`
- `VESTI_ALLOWED_ORIGINS`

Recommended:

- `VESTI_EMBEDDING_MODEL=text-embedding-v2`
- `VESTI_EMBED_BATCH_MAX=32`
- `VESTI_EMBED_TEXT_MAX_CHARS=8000`
- `VESTI_UPSTREAM_TIMEOUT_MS=20000`
- `VESTI_CHAT_PRIMARY_MODEL=deepseek-ai/DeepSeek-R1-Distill-Qwen-14B`
- `VESTI_CHAT_BACKUP_MODEL=Qwen/Qwen3-14B`

## 4) Runtime configuration for QA/integration

Set in extension Settings → Model Access (Demo mode):

- `Proxy Base URL`: `http://127.0.0.1:3000/api`
- `Proxy Service Token`: must equal proxy env `VESTI_SERVICE_TOKEN`

Resolved routes:

- chat: `http://127.0.0.1:3000/api/chat`
- embeddings: `http://127.0.0.1:3000/api/embeddings`

## 5) API behavior summary

### `/api/chat`

- keeps existing stable behavior:
  - primary model + one fallback model
  - retry only on network/timeout/429/5xx
- adds origin + token guard

### `/api/embeddings`

- accepts OpenAI-style body:
  - `model`
  - `input` (`string` or `string[]`)
- forwards to:
  - `https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings`
- input guards:
  - empty input → 400
  - batch too large → 413
  - text too long → 422

## 6) Migration/compatibility behavior

Existing stored setting:

- `proxyUrl = https://.../api/chat`

Will auto-migrate to:

- `proxyBaseUrl = https://.../api`
- `proxyUrl = https://.../api/chat` (compat field retained)

No user action required.

## 7) Validation already executed

- `pnpm -C frontend build` ✅
- `pnpm -C frontend package` ✅
- `node --check proxy-local/server.mjs` ✅

## 8) Integration checklist for the web-view engineer

1. Reuse the same `proxyBaseUrl` and service token contract.
2. Send `x-vesti-service-token` header on both chat + embeddings calls.
3. Keep embeddings payload OpenAI-compatible (`input` string/string[]).
4. Handle structured proxy error payload (`error.code`, `error.message`, `error.requestId`).
5. Log `requestId` in client telemetry for cross-side debugging.

## 9) Known limits

1. Local proxy uses in-memory process state (no distributed rate limiter).
2. CORS allowlist uses string/wildcard matching; production gateway can replace with stricter policy.
3. `embeddingService.ts` is delivered but not yet wired into a UI command path in this branch.
