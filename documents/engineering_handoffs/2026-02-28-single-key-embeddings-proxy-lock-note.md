# 2026-02-28 单 Key + Embeddings 锁 Proxy 决策备忘录

## 0) Decision Summary
- UI remains unchanged:
  - users configure one `API Key` only (BYOK chat / ModelScope).
- Embeddings path is locked to proxy:
  - frontend always calls `/api/embeddings`;
  - no direct DashScope route in frontend;
  - no direct->proxy fallback branch.
- Service token remains optional:
  - only required when proxy enforces token checks.

## 1) Why This Decision
- Keep user mental model simple:
  - one visible key field, no endpoint-level choices for embeddings.
- Reduce configuration drift:
  - embeddings routing is now single-path and auditable.
- Improve release stability:
  - avoid split behavior between local direct route and proxy route.

## 2) Scope of Change
- Code scope:
  - `frontend/src/lib/services/embeddingService.ts`
  - `frontend/src/sidepanel/pages/SettingsPage.tsx` (copy update only)
- Out of scope:
  - no new settings field (no `embeddingsApiKey`);
  - no custom embeddings URL option;
  - no `vesti-proxy` code change in this round.

## 3) Behavioral Contract
- For all frontend modes (`demo_proxy` / `custom_byok`):
  - embeddings request route is proxy only.
- Chat behavior remains unchanged:
  - BYOK chat still uses single `API Key` for ModelScope route.
- Error diagnostics for embeddings remain explicit:
  - `PROXY_EMBEDDINGS_ROUTE_MISSING` (404)
  - `PROXY_ACCESS_DENIED` (401/403)
  - `PROXY_RATE_LIMITED` (429)
  - `EMBEDDING_REQUEST_FAILED` (other upstream failures)

## 4) Validation Record
- Build and gates passed on branch:
  - `pnpm -C frontend install --frozen-lockfile`
  - `pnpm -C frontend build`
  - `pnpm -C frontend eval:prompts --mode=mock --strict`
- Expected runtime acceptance:
  - Explore no longer fails with local embedding-credential-missing branch;
  - embeddings success/failure depends on proxy availability and policy only.

## 5) Operational Prerequisites
- Proxy deployment must include `/api/embeddings`.
- Proxy production env must include valid upstream embeddings credentials.
- If proxy enforces service token, frontend token must be configured.

## 6) Follow-up (Deferred)
- Dual-key design remains an optional future track:
  - `apiKey` for chat + `embeddingsApiKey` for embeddings.
- That track is deferred until current single-key + proxy-lock baseline is stable.
