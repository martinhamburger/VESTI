# Capture Engine Refactor Tasks

Status: Active task ledger  
Audience: Parser maintainers, runtime engineers, QA

## Goal

把 capture engine 从“外层治理边界基本成型，但 parser 内核仍偏 ad hoc”的状态，
推进到以 `platform normalization` 和 `content package` 为中心的架构。

## Track 1. Parser Layering

- 把 `discovery`、`boundary / role inference`、`platform normalization`、`shared extraction` 拆成正式 stage
- 先从 ChatGPT / Qwen 开刀，作为 reference implementation
- 不再继续把平台私有 DOM 猜测堆进 shared extractor

## Track 2. Content Package Expansion

- 为 `normalized_html_snapshot` 预留持久化位置
- 为 `attachments[] / artifacts[] / citations[] / message_meta` 明确 schema 和 payload 扩展位
- 先保证“存在性保留”，再讨论二进制和高保真渲染

## Track 3. Multimodal Sampling

- GPT：补 uploaded image、generated image、citation-heavy、artifact/canvas case
- 豆包：补图片、搜索卡片、引用、下载产物、CoT/final 双区 case
- 每个 case 产出 DOM snippet、截图、reader 结果和 export 结果

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

## Deferred Items

- host-page copy interception
- parser diagnostics for math capture / render paths
- `Kimi / Yuanbao` fallback / shadow-path support
- richer artifact / citation package beyond current MVP
- full multimodal `content package` persistence contract

## Current Slice Recommendation

下一轮优先级：

1. 把 math fidelity 主链送进主线，形成协作者可继续开发的 reader/capture 基线
2. ChatGPT / Qwen `platform normalization` stage
3. content package schema slots
4. multimodal sampling and regression fixtures
5. reader / export / compression 对接第一批新结构
