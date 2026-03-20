# Capture Engine Current Architecture

Status: Active as-is architecture and gap analysis  
Audience: Parser maintainers, runtime engineers, reader/export/compression owners

## 1. Purpose

本文档描述 capture engine 当前真实代码链路、已经稳定的边界、仍然明显 ad hoc 的部分，以及从当前状态迁移到目标架构的推荐顺序。

这是一份只读诊断，不是运行时代码设计变更记录。

## 2. Current End-to-End Flow

当前主链路可以概括为：

1. `contents/*.ts`
   - 平台 content script 创建 parser、`ConversationObserver`、`CapturePipeline`、transient store。
2. `ConversationObserver`
   - 监听页面 DOM 变化并做 debounce 触发。
3. `CapturePipeline`
   - 调用 parser 产出 conversation payload，做基本状态判断，并调用持久化入口。
4. `storage-interceptor`
   - 执行 governance 决策，处理 `mirror / smart / manual`、`force archive`、跳过场景等。
5. transient store
   - 缓存最近一次可手动存档的 payload 与 decision。
6. dedupe / DB
   - 对消息文本做去重并落入 IndexedDB。
7. reader
   - 优先消费 AST，fallback 到纯文本。
8. export
   - JSON 能携带 AST，TXT / MD 主要依赖 `content_text`。
9. compression
   - 当前基本直接消费 `content_text`。
10. search
   - 当前主要基于 `content_text` 搜索。

## 3. Boundaries That Are Already Reasonable

### 3.1 Parser Interface Is Unified

各平台 parser 至少共享了一套统一入口与基本 payload contract，这为后续重构提供了良好的外壳。

### 3.2 Observer / Pipeline / Governance Are Mostly Unified

`ConversationObserver`、`CapturePipeline`、`storage-interceptor`、transient store 之间的职责边界已经比较清楚：
- observer 管 DOM 触发
- pipeline 管捕获主流程
- interceptor 管治理与落盘前决策
- transient store 管手动补存与最近状态

### 3.3 Governance Semantics Are Stable Enough

`mirror / smart / manual`、`force archive`、`missing conversation id`、transient availability 这些语义已经有较稳定的运行时边界，不是当前最需要推倒重来的部分。

## 4. Main Gaps in the Current Architecture

### 4.1 `htmlContent` Is Collected but Not Persisted

parser contract 里已经出现 `htmlContent`，但当前持久化链路没有把它入库。结果是很多未来可恢复的信息在保存那一刻就丢了。

### 4.2 Attachment Exists in AST Types but Not as a Real First-Class Capture Path

AST 类型里已经有 `attachment`，但 shared extractor 没有形成稳定产出路径，reader 也主要把它降级成普通文本显示。

### 4.3 Link / Image / Artifact / Citation Are Not First-Class Structures

当前 shared extraction 更像“rich text extractor”，不是“conversation archival extractor”。

对以下对象的支持仍然明显不足：
- link target
- uploaded image
- generated image
- artifact / preview / downloadable output
- citation pill
- message-level tool / model metadata

### 4.4 Export / Compression / Search Remain Overly Text-Centric

JSON 导出已经能带 AST，但 MD / TXT 导出、压缩输入与搜索都仍高度依赖 `content_text`。

这意味着即使 parser 或 reader 将来能保留更多结构，如果下游仍只消费纯文本，信息仍然会再次丢失。

### 4.5 `content_text` Contract Was Too Loose for Math Fidelity

就数学公式问题而言，当前架构里最关键的缺口并不只是 probe。

过去多个平台 parser 会直接把原始 DOM 的 `textContent` 当成 `content_text`。
一旦公式节点同时挂了视觉层、语义源码层和纯文本降级层，这份 `content_text`
就会被多层重复结构污染。随后：

- reader 会拿这份脏 `content_text` 去判断 AST coverage
- dedupe 如果只看文本签名，会阻断 AST-only upgrade
- export / compression / search 会继续继承被污染的 `content_text`

所以数学公式的真正修复点是：

- `content_text` 收紧为 canonical plain text
- structured AST 存在时，允许从 AST 派生 canonical `content_text`
- dedupe 允许 AST-only upgrade
- repair migration 对旧记录执行可控的 canonical text upgrade

### 4.6 Warm-Start Capture Is Not Institutionalized

历史线程冷打开时，manual capture 是否能立即拿到 transient payload 仍不是跨平台统一能力。当前只有部分平台显式做了 delayed startup capture。

### 4.7 App-Shell Metadata Still Bleeds Into Content Parsing

Claude 标题误捕获已经证明，当前架构仍然默认把“页面里视觉权重最高的文本”当成 candidate title。

这会导致：
- app shell 的真实标题被正文 Markdown `<h1>` 劫持
- session / conversation metadata 的解析职责与正文解析职责混在同一阶段
- parser 在 message stream 上补丁式修标题，而不是在 app shell 层先拦截 metadata

因此当前标题错误首先是 **app-shell interception 缺失**，不是 markdown 抽取失效。

### 4.8 Table, Math, and Code Still Lack One Unified Rich-Structure Contract

本轮样本已经暴露出四类完全不同的表格家族：
- Claude：标准原生 `<table>`
- Qwen：标准 `<table>`，但有深包裹、对齐样式与 KaTeX 进入单元格
- Doubao：伪表格
- ChatGPT：标准表格中混入 KaTeX 重影

这说明当前 AST 的 `table(headers: string[], rows: string[][])` 仍然偏扁平：
- 无法表达列级对齐
- 无法表达单元格内的 rich inline children
- 无法把 math / code_inline 安全地保留在单元格内部

同样地，公式与代码块的 truth source 仍未统一：
- 部分路径仍依赖渲染后的 `innerText / textContent`
- KaTeX / MathML / annotation 的优先级没有在架构层写死
- 代码块的 UI 控件（copy、badge、toolbar）是否应先被物理剥离，仍停留在平台特判层

### 4.9 Citation Tail Pollution Proves Body/Sidecar Separation Is Still Weak

联网搜索引用的样本已经证明：
- citation pill 是 inline component，不是正文的一部分
- 如果先读正文再做清洗，引用文本会和正文主句粘连
- 如果只读 `innerText`，label 与 url 都会被下拉项、角标和 tracking 参数污染

当前实现虽然开始引入 `citations[]`，但从架构上仍未彻底写死：
- citation 必须先从正文 clone 中物理剔除
- citation 必须作为 message sidecar，而不是正文 AST 节点
- body / sidecar 分离必须成为 shared extraction 的硬边界

### 4.10 Artifact Is Still Not Treated As A First-Class Capture Object

Claude 独立 Artifact 的样本说明，Artifact 已经不是“消息正文里的一段复杂 HTML”，而是：
- 一个独立的小型应用 DOM
- 有自己的 render dimensions
- 有自己的 plain-text / markdown / normalized-html 三种潜在表示

当前架构仍然主要以“正文是否被污染”为标准来思考 Artifact，
而不是把它作为单独 sidecar object 看待。这会直接导致：
- Artifact 被错误降维成 `content_text`
- reader / export / web 无法为 Artifact 留出独立表达位置
- `normalized_html_snapshot` 无法被精准应用到富结构对象，而只能停留在抽象愿景

## 5. Why Current Parser Internals Still Feel Ad Hoc

问题不在于“没有 parser”，而在于 parser 内部尚未完成正式分层。

当前多个平台 parser 仍在单文件里混合处理：
- candidate discovery
- role inference
- boundary selection
- sanitize / normalize
- source scoring
- shared extraction fallback
- text cleanup

典型重复模式包括：
- `chooseBestExtraction`
- `scoreExtraction`
- `dedupeNearDuplicates`
- `normalizeSessionId`
- `cleanExtractedText`
- `sanitizeContentElement`

这说明共享 contract 还停留在壳层，尚未进入 parser 内核。

## 6. Platform Diagnosis Matrix

| 平台 | 当前判断 | 主要问题 |
| --- | --- | --- |
| ChatGPT | 最接近 reference implementation | 已有 normalization 雏形，但 discovery、normalize、extract 混在重文件里；多模态仍未进入统一 contract |
| Qwen | 最接近 reference implementation | 本地 normalization 比较明确，但职责仍未抽层，文件过重 |
| Kimi | 平台语义理解较清楚 | 边界处理思路较好，但尚未被抽象成通用模式 |
| Yuanbao | 平台语义理解较清楚 | semantic candidate 管线方向正确，但共享化不足 |
| Doubao | 理解平台语义，但实现过载 | CoT / final answer / noise pruning / fallback 逻辑集中在单个 parser，维护成本高 |
| Claude | 可用但 metadata / artifact 语义分层不足 | 标题仍可能被正文 `<h1>` 劫持；独立 Artifact 仍未被定义为单独 capture object |
| Gemini | 明显偏浅层 | 更像文本清洗与前缀剥离，未真正掌握 DOM 语义 |
| DeepSeek | 当前最脆弱 | 存在依赖哈希类名片段的 brittle 机制，不适合作为长期架构 |

## 7. GPT Rich-Structure Evidence From the Current Sampling Round

本轮 `gpt.txt` 样本已经说明，GPT 消息不是“正文字符串”这么简单。样本中至少出现了：
- 消息外壳与角色 / model 元数据
- citation pill
- task-list checkbox
- KaTeX
- 代码块 viewer
- action button / thinking UI

这类样本足以证明 capture engine 面对的对象已经是结构化消息。

但它还不构成完整的多模态回归样本，因为尚未覆盖：
- uploaded image
- generated image
- artifact / canvas / iframe
- 文件附件 / 下载卡片

与此并行，`claude.txt / table.txt / search.txt / artifact.txt` 进一步证明：
- Claude 标题问题属于 app shell 与正文 payload 未分层
- 表格问题不是单一平台 bug，而是 `semantic_ast` contract 过于扁平
- citation 问题不是简单噪声词清洗，而是 body / sidecar 未分离
- Artifact 问题不是“正文更难抓”，而是 capture object 已经从 transcript 变成独立应用

## 8. Distance to the Target Architecture

如果目标只是“让 reader 更好地显示文本、代码、数学、表格”，当前架构已经走了一大半。

如果目标是“让用户在阅读中台系统性回看、导出、检索、压缩自己所有重要对话，并且图片 / artifact / citation / 上传物不会静默消失”，那当前架构还差一次真正的中心转移：

从 `message.content_text` 中心  
转向 `content package` 中心。

## 9. Recommended Migration Order

为避免继续扩散 ad hoc 机制，推荐顺序固定如下：

1. 先补文档规范，明确 `App Shell Interceptor`、body / sidecar separation 和 rich-only snapshot policy。
2. 再引入 `content package` 与 persistence contract。
3. 再升级到 `semantic_ast_v2`，收口 table / math / code 的统一 contract。
4. 先对接 `reader / web / export`，最后再推进 `insights / compression / search`。
5. 最后收敛各平台 parser 抽象，把 normalization 抽成正式 stage。

## 10. Decision Statement

当前 capture engine 不是整体错误，而是外层边界已经成型、内层 parser architecture 仍未完成。

接下来的重构重点不应是继续增加站点特判，而应是：
- 明确要保留什么
- 明确这些信息进入哪一层 contract
- 明确 shared extraction 与 platform normalization 的边界
