# Capture Engine Engineering Spec

Status: Active canonical engineering spec  
Audience: Parser maintainers, runtime engineers, reader/export/compression contributors

## 1. Product Goal

Capture engine 的服务对象不是单纯 transcript parser，而是一个可回看、可检索、可导出、可压缩上下文的对话归档系统。

它的核心职责不是“尽可能提取文字”，而是“尽可能保留一段对话未来仍有价值的信息结构”，以便：
- 用户在阅读中台快速翻阅过往对话
- reader 尽可能保真地重建消息结构
- JSON / MD / TXT 导出共享同一份规范化输入
- 上下文压缩和后续搜索能继承结构化信号，而不是只消费纯文本

## 2. Non-Negotiable Principles

### 2.1 Preservation First

以下信息至少要保留存在性，不能静默丢失：
- uploaded image
- generated image
- artifact / preview / downloadable output
- citation / link target
- task state
- message meta

即使当前阶段无法完整抓取二进制内容，也必须有结构化占位或元数据摘要。

### 2.2 One Normalized Input Contract

reader、JSON / MD / TXT 导出、上下文压缩、后续搜索不应各自从 `content_text` 硬挖，而应共享同一份规范化输入。

### 2.3 Layered Parsing Direction

`raw site DOM -> normalized semantic DOM -> shared extraction` 是唯一推荐方向。

平台差异应优先在 platform-local normalization 中被吸收，而不是继续把站点私有 DOM 猜测堆进 shared extractor。

### 2.4 No Silent Loss

多模态与结构化信息允许降级，不允许静默消失。

允许的降级形式：
- attachment / artifact 元数据占位
- citation 文字加链接目标
- image 的缩略图、alt、来源、数量、所在消息位置

不允许的结果：
- reader 没有任何存在痕迹
- 导出完全丢失该信息
- compression / search 输入里完全没有该信息

### 2.5 App Shell Metadata Must Win Over Content Payload

conversation title、session identity、page-level status 等 metadata 属于应用外壳（App Shell），
不是 message stream 的一部分。

这意味着：
- 标题提取必须先在 app shell 层拦截，再进入正文解析
- 正文里的 Markdown `<h1>`、大字号文本、代码标题都不得反向覆盖 conversation title
- generic `h1 / largest-text` 搜索只能作为 app-shell selector 全部失效后的最终 fallback

换句话说，标题误捕获首先是 **app-shell metadata interception 失败**，不是 markdown parser 失败。

## 3. Stable Baseline That Remains In Force

以下既有治理语义继续有效，本规格不重写它们：
- `mirror / smart / manual` capture governance
- transient capture store
- `force archive`
- `missing conversation id`
- 既有 capture decision 与 sidepanel 交互语义

本轮规范收口不重新设计以下内容：
- 存储去重策略
- runtime event 语义
- IndexedDB schema 的既有行为
- 已上线平台 host scope 与平台命名

## 4. Target Content Package Contract

长期目标不是只产出 `textContent`，而是产出一个内容包。

| 字段 | 角色 | 说明 |
| --- | --- | --- |
| `canonical_plain_text` | 最小可搜索文本 | 用于检索、简单 fallback、纯文本导出；必须是去重影、去 UI 污染后的 canonical text |
| `semantic_ast_v2` | 主渲染结构 | reader、结构化导出、未来 package-aware consumer 的首选输入 |
| `normalized_html_snapshot` | 可回放兜底 | 用于 reparsing、调试、未来修复和保真导出；仅对富结构消息或 artifact-bearing 消息持久化 |
| `attachments[]` | 附件存在性 | 上传文件、图片、文件卡、下载物、引用附件等 |
| `artifacts[]` | 产物存在性 | 代码 artifact、画布、预览卡、图表、工具输出等；允许独立于正文 AST 存在 |
| `citations[]` | 引用存在性 | `label / href / host / sourceType / occurrenceRole`；作为 message sidecar，不进入正文 AST 主干 |
| `message_meta` | 消息元数据 | model slug、tool / thinking 状态、生成状态、任务状态等 |

说明：
- `attachments[] / artifacts[] / citations[] / message_meta` 是目标规范，即使实现尚未齐备，也必须作为未来 contract 保留。
- `citations[]` 在下一实现阶段不是“可选加分项”，而是 **hard requirement**：只要存在稳定 link-bearing 锚点，就必须结构化提取并从正文中剥离。
- `artifacts[]` 允许作为 sidecar object 独立存在，不要求一定映射为正文 AST 节点。
- `normalized_html_snapshot` 是平台归一化后的快照，不是原始站点 DOM 的无限制镜像。
- `normalized_html_snapshot` 的默认持久化策略是：**仅对 rich-structure message / artifact-bearing message 持久化**，不做全量消息快照。

## 5. Target Layered Architecture

### 5.1 App Shell Interceptor

职责：
- 在 message stream 解析前拦截 conversation title
- 解析 session identity / thread identity 的稳定来源
- 识别 page-level status（例如 active thread、collapsed shell、generation state 的 app-level 入口）

规则：
- 先拦截 app shell metadata，再进入正文 candidate discovery
- 不允许正文 payload 覆盖 app shell metadata
- 允许为不同平台维护 `app header / shell title / active sidebar item` 的优先级词典

### 5.2 Discovery

职责：
- 找到 conversation root、turn root、candidate root
- 找到稳定的 session / conversation identity 来源
- 判断页面是否处于可捕获状态

### 5.3 Boundary / Role Inference

职责：
- 确定一条消息的最小边界
- 识别 `user / assistant / system-like` 角色
- 把 action bar、retry、toolbar、header、pagination 等噪声排除在正文边界之外

### 5.4 Platform Normalization

职责：
- 将 vendor-specific DOM 清洗成 normalized semantic DOM
- 处理复杂 editor、code viewer、math、rich card、citation pill、task list、artifact shell
- 为 shared extraction 提供更稳定的输入

这是下一轮重构的第一优先层，必须从 parser 内部被正式抽出。

### 5.5 Shared Semantic Extraction

职责：
- 从 normalized semantic DOM 产出 `canonical_plain_text`、`semantic_ast_v2` 与 sidecar 信号
- 对 table、math、code、blockquote、list、attachment placeholder 等通用语义做统一抽取

统一规则：
- **table**
  - 统一进入 `AstTableNodeV2`
  - 列级对齐信息进入 `columns[]`
  - 行进入 `rows[]`
  - 单元格进入 `cells[]`，其内容为 inline-rich children，而不是单纯字符串
  - 允许单元格内混排 `text / strong / em / code_inline / math`
- **math**
  - DOM 渲染层永不作为 truth source
  - 优先提取 `KaTeX annotation / MathML / data-math / data-formula / vendor semantic source`
  - `canonical_plain_text` 只能接 canonical math text，不接受渲染重影的 `innerText`
- **code**
  - 代码块的内容与语言标识必须从语义源提取
  - copy button、badge、toolbar、行号等 UI 状态必须在 extraction 前被剥离
- **citation**
  - 作为 message-level sidecar 提取
  - 必须先从正文 DOM clone 中物理剔除，再提取正文
  - 不进入正文 AST 主干
- **artifact**
  - 允许作为 sidecar object 独立于正文 AST 存在
  - 对独立 Artifact，允许提取 `renderDimensions / plainText / markdownSnapshot / normalizedHtmlSnapshot`

shared AST 不应继续承担平台私有 DOM 猜测。

### 5.6 Persistence / Indexing

职责：
- 持久化内容包中的当前已落地部分
- 为未来的 `normalized_html_snapshot`、attachment / artifact / citation 元数据扩展预留规范位置
- 保证 dedupe、governance 与 transient integration 可以继续复用

当前建议：
- `normalized_html_snapshot`
  - rich-structure message / artifact-bearing message 才持久化
  - 普通纯文本消息默认不持久化 snapshot
- `artifacts[] / citations[]`
  - 作为消息侧车元数据持久化
  - 不要求索引优先落地
- 历史脏数据
  - 不默认做自动 repair migration
  - 优先通过 recapture 或专项 migration 设计处理

### 5.7 Reader / Export / Compression Consumers

职责：
- reader 尽可能保真渲染结构化内容
- JSON / MD / TXT 导出共享同源结构
- compression 利用结构化信息保留上下文密度
- search 至少能利用 `plain_text` 与关键存在性元数据

## 6. Multi-Platform Rules

- 允许 platform-local normalization。
- shared AST 只消费 normalized semantic DOM。
- 不再鼓励把站点私有 DOM 猜测写进 shared extractor。
- 不允许因为某个平台难抓就降低全局 contract。
- 允许分阶段落地，但每个平台都应朝同一 contract 收敛。

## 7. What This Spec Explicitly Does Not Do

本规格不要求本轮立即完成：
- 图片或 artifact 二进制落库
- 全平台一次性切换到新 parser 分层
- reader / export / compression / search 在同一版本中全部升级

但本规格要求后续所有实现都朝同一个目标 contract 收敛，而不是继续扩散 `textContent + ad hoc fallback`。

## 8. Recommended First Implementation Slice

下一轮工程实现建议按以下顺序推进：
1. 先把 `App Shell Interceptor` 固化为正式 stage，阻断标题与 session metadata 被正文劫持。
2. 再把 ChatGPT / Qwen 的 `platform normalization` 抽成正式 stage。
3. 让 shared extraction 只吃 normalized semantic DOM，并确立 `semantic_ast_v2`。
4. 为内容包扩出 rich-only `normalized_html_snapshot` 与 `citations[] / artifacts[]` 的规范位置。
5. 再逐步对接 reader / export / compression / search。

## 9. Historical Source

本规格整合自以下历史文档与本轮只读诊断：
- `v1_2_capture_governance_spec.md`
- `v1_3_platform_expansion_spec.md`
- `v1_4_capture_engine_hardening_retrospective.md`
- `v1_5_capture_engine_refactor_roadmap.md`

上述文件已归档保留，但不再维护为活文档。
