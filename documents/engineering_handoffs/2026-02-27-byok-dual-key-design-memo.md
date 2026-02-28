# 2026-02-27 BYOK Dual-Key Design Memo

## 0) Status Update (2026-02-28)
- This memo is **deferred** for the current release line.
- Accepted implementation baseline is now:
  - single visible `API Key` in UI (chat / ModelScope);
  - embeddings client path locked to proxy (`/api/embeddings`);
  - no client-side direct embeddings fallback.
- See follow-up decision note:
  - `documents/engineering_handoffs/2026-02-28-single-key-embeddings-proxy-lock-note.md`

## 1) 背景
- 当前 `custom_byok` 只有一个 `apiKey` 字段。
- 聊天请求与词嵌入请求实际走不同上游：
  - Chat: ModelScope (`/chat/completions`)
  - Embeddings: DashScope compatible endpoint (`/embeddings`)
- 单 key 语义在“双供应商 key 分离”的实际场景下不充分，导致配置表达能力不足和排障成本上升。

## 2) 现状与问题
- `LlmConfig` 仅有 `apiKey`、`proxyServiceToken`，没有 `embeddingsApiKey`。
- `llmService` 使用 `apiKey` 访问 ModelScope chat。
- `embeddingService` 直连时也使用 `apiKey` 访问 embeddings endpoint。
- 结果：
  - 若用户有两把不同 key（ModelScope + DashScope），当前 UI/配置无法正确表达。
  - 只能依赖 proxy 或复用同一 key，配置与运行语义容易错位。

## 3) 目标
- 增加 `embeddingsApiKey`，实现 chat/embeddings 凭据解耦。
- 兼容旧配置：未设置 `embeddingsApiKey` 时回退到 `apiKey`。
- 保持外部 API、消息协议、DB schema 不变。

## 4) 设计方案
### 4.1 配置模型
- `LlmConfig` 新增可选字段：
  - `embeddingsApiKey?: string`
- 兼容规则：
  - 读取时：`effectiveEmbeddingsKey = embeddingsApiKey?.trim() || apiKey?.trim()`
  - 写入时：若未填写 embeddings key，不强制落盘空字符串。

### 4.2 路由行为
- `demo_proxy`
  - chat 与 embeddings 都走 proxy。
  - 本地 key 可为空（由 proxy 环境承担上游鉴权）。
- `custom_byok`
  - chat: 使用 `apiKey`（ModelScope）。
  - embeddings: 优先 `embeddingsApiKey`，缺失时回退 `apiKey`。
  - 若 `effectiveEmbeddingsKey` 为空，返回 `EMBEDDING_API_KEY_MISSING`。

### 4.3 UI 表单
- Settings / Model Access 增加字段：
  - `Embeddings API Key (optional, defaults to API Key)`
- 提示文案：
  - Chat API Key 用于 ModelScope chat。
  - Embeddings API Key 用于 embeddings endpoint；留空则复用 Chat API Key。

## 5) 兼容与迁移策略
- 无迁移脚本，无破坏升级。
- 旧用户配置行为保持：
  - 未新增字段时仍可按旧逻辑运行（embeddings 回退 `apiKey`）。
- 新用户可按供应商分离方式独立配置。

## 6) 错误语义与可观测性
- 保留现有 embeddings 错误码细分：
  - `PROXY_EMBEDDINGS_ROUTE_MISSING`
  - `PROXY_ACCESS_DENIED`
  - `PROXY_RATE_LIMITED`
  - `EMBEDDING_API_KEY_MISSING`
- 新增日志建议（实现轮）：
  - 记录 embeddings route（direct/proxy）与 key 来源（embeddingsApiKey/apiKey/fallback），不打印密钥值。

## 7) 验收矩阵
### 7.1 demo_proxy
- `apiKey=""`, `embeddingsApiKey=""`, `proxyServiceToken=""`：
  - chat/embeddings 均可经 proxy 正常调用（proxy 无强制 token 情况）。

### 7.2 custom_byok（同 key）
- `apiKey=valid`, `embeddingsApiKey=""`：
  - chat 成功，embeddings 成功（回退 `apiKey`）。

### 7.3 custom_byok（双 key）
- `apiKey=modelscope_valid`, `embeddingsApiKey=dashscope_valid`：
  - chat 与 embeddings 均成功。

### 7.4 custom_byok（缺 embeddings key）
- `apiKey=""`, `embeddingsApiKey=""`：
  - chat/embeddings 分别返回缺 key 语义化错误。

## 8) 风险与缓解
- 风险：用户误填两把 key 导致“chat 正常、embeddings 失败”。
  - 缓解：Settings 明确字段用途 + 错误码细化 + 连接测试提示。
- 风险：新增字段导致配置对象兼容性问题。
  - 缓解：字段可选 + normalize 时保守回退。

## 9) 非目标（本备忘录轮）
- 不改外部接口路径：`/api/chat`、`/api/embeddings`。
- 不改 `protocol.ts` 消息名集合。
- 不改 DB schema / parser 契约。
- 不在本轮实施代码改动，仅沉淀设计与验收标准。
