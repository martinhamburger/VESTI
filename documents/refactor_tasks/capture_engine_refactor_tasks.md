# Capture Engine Refactor Tasks

Status: Active task ledger  
Audience: Parser maintainers, runtime engineers, QA

## Goal

把 capture engine 从“外层治理边界基本成型，但 parser 内核仍偏 ad hoc”的状态，
推进到以 `platform normalization` 和 `content package` 为中心的架构。

## Track 0. App Shell Interceptor

- 把 `conversation title / session identity / page-level status` 从 message parsing 前置拦截
- 为各平台维护 app shell selector 词典，而不是继续依赖正文 `<h1>` / largest-text fallback
- 明确标题误捕获属于 app-shell metadata 问题，不再在正文 parser 内做补丁式修复

## Track 1. Parser Layering

- 把 `discovery`、`boundary / role inference`、`platform normalization`、`shared extraction` 拆成正式 stage
- 先从 ChatGPT / Qwen 开刀，作为 reference implementation
- 不再继续把平台私有 DOM 猜测堆进 shared extractor

## Track 2. Content Package Expansion

- 为 rich-only `normalized_html_snapshot` 预留持久化位置
- 为 `attachments[] / artifacts[] / citations[] / message_meta` 明确 schema 和 payload 扩展位
- `citations[]` 升级为下一实现阶段硬要求，而不再只是长期愿景
- `artifacts[]` 明确 sidecar object 语义与 `captureMode`
- 先保证“存在性保留”，再讨论二进制和高保真渲染

## Track 3. Multimodal Sampling

- GPT：补 uploaded image、generated image、citation-heavy、artifact/canvas case
- 豆包：补图片、搜索卡片、引用、下载产物、CoT/final 双区 case
- 每个 case 产出 DOM snippet、截图、reader 结果和 export 结果

## Track 3.2 Table / Formula / Code Structure Unification

- 定义 `semantic_ast_v2`
- `AstTableNodeV2`
  - `columns[]` 含列级对齐
  - `rows[]`
  - `cells[]` 为 inline-rich children
- 统一公式 truth source 优先级：
  - `KaTeX annotation / MathML / vendor semantic source`
  - 禁止直接把渲染层 `innerText` 当公式 truth
- 统一代码块净化：
  - 先剥离 copy / badge / toolbar / line-number UI
  - 再提取 code + language
- `ChatGPT / Claude / Qwen / Doubao`
  - 形成四类表格渲染家族的归一策略，不再各写一套“降维脚本”

## Track 3.1 Math Formula Fidelity Baseline

- `ChatGPT / Claude / Gemini / Qwen / DeepSeek / Doubao`
  - 统一到 `DOM source -> normalized TeX -> AstMathNode.tex` 主链
- `Gemini`
  - 以 `data-math` 为主，`data-formula` 为兼容 fallback
- `Doubao`
  - 以 `data-custom-copy-text` 为主，执行 delimiter stripping，而不是全局反转义
- `content_text`
  - 对含 `math / table / code_block / list / blockquote / heading` 的消息，优先收紧为 AST 派生 canonical plain text
- `reader`
  - 允许 AST-first math render，但仍需要 coverage / confidence gate，避免 partial AST 压掉更完整 prose
- `dedupe`
  - 允许 AST-only upgrade，不再只看文本签名
- `repair`
  - IndexedDB repair migration 对 `ast_v1` 且含 `math` 的旧消息回填 canonical `content_text`
- `Kimi / Yuanbao`
  - 明确标记为 deferred fallback track
  - 不再继续堆 DOM probe，转向 shadow-state / copy-full-markdown / network interception 方案

## Track 4. Consumer Alignment

- reader 接住 attachment / artifact / citation 占位
- export / compression / search 继承 content package，而不是继续硬挖 `content_text`
- warm-start / manual transient availability 形成跨平台一致要求

## Track 4.1 Artifact Sidecar

- 将 Claude 独立 Artifact 明确为 `standalone_artifact`
- 允许 sidecar 字段：
  - `renderDimensions`
  - `plainText`
  - `markdownSnapshot`
  - `normalizedHtmlSnapshot`
- 不再把独立 Artifact 当成“正文里更难抓的一段 HTML”

## Deferred Items

- host-page copy interception
- parser diagnostics for math capture / render paths
- `Kimi / Yuanbao` fallback / shadow-path support
- richer artifact / citation package beyond current MVP
- full multimodal `content package` persistence contract

## Week 2 Shipped State

- completed:
  - Claude `App Shell Interceptor`
  - `semantic_ast_v2` minimum table path
  - `citations[] / artifacts[] / rich-only normalized_html_snapshot`
  - `Qwen / Yuanbao` live DOM realignment
  - `Kimi / DeepSeek / Yuanbao / Qwen` parser regression cleanups
  - Doubao wrapper-shell table noise cleanup
  - frozen Week 2 DOM/text regression manifest
- still deferred:
  - `Kimi / Yuanbao` non-DOM fallback track
  - richer artifact replay / markdown reconstruction
  - multimodal image / upload capture
  - historical repair migration

## Week 4 Shipped State

- completed:
  - Claude standalone artifact second pass now preserves:
    - `plainText`
    - `normalizedHtmlSnapshot`
    - safe `markdownSnapshot` derivation when possible
  - prompt/export/reader/web artifact summaries now consume the same sidecar fields
  - Qwen artifact-adjacent code/table chrome cleanup expanded to code-header and Monaco helper nodes
  - Kimi artifact-adjacent action cleanup now excludes `segment-user-actions` and code/table header shells
  - Yuanbao artifact presence became more stable by suppressing hidden preview false positives
  - Doubao action overflow shell cleanup expanded without changing its main parser strategy
  - artifact-first sample manifest and shipped regression checklist are frozen in-repo
- still deferred:
  - artifact replay / interactive preview
  - `Kimi / Yuanbao` shadow-path / network-interception fallback track
  - richer artifact extraction beyond current sidecar fields
  - weekly digest runtime migration

## Current Slice Recommendation

下一轮优先级：

1. artifact replay planning without changing current sidecar storage shape
2. `semantic_ast_v2` 扩展到更完整的 math / code / pseudo-table case
3. `Kimi / Yuanbao` fallback / shadow-path exploration
4. weekly bridge 和更深的 prompt/runtime package-native rollout
