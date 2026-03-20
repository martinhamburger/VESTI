# Reader Pipeline Engineering Spec

Status: Active canonical engineering spec  
Audience: Reader maintainers, export/compression owners, schema and web contributors

## 1. Product Goal

reader pipeline 不是“把数据库里的消息显示出来”这么简单。
它服务的是一个可回看、可检索、可导出、可压缩上下文、可跨端消费的对话归档系统。

这意味着它必须同时回答四个问题：

- reader 如何尽可能保真地重建 conversation
- export 如何共享同一份结构化输入，而不是只吐纯文本
- compression / summary / weekly insight 如何继承结构与时间语义
- web 端与 sidepanel 如何在同一时间 contract 下展示同一条线程

## 2. Non-Negotiable Principles

### 2.1 Shared Conversation Package

reader、JSON / MD / TXT export、compression、insights、web 必须共享同一份规范化
conversation package。不再鼓励每个 consumer 各自从 `content_text`、`created_at`
或 ad hoc fallback 中重建自己的世界观。

### 2.2 Timestamp Semantics Must Be Explicit

线程级时间语义固定为：

| 字段 | 角色 | 说明 |
| --- | --- | --- |
| `source_created_at` | 来源时间 | 站点原始时间占位，抓得到就保留，抓不到为 `null` |
| `first_captured_at` | 首次观察时间 | 扩展第一次观察到该线程的时间，不等于按钮点击时间 |
| `last_captured_at` | 最近捕获时间 | 最近一次成功 capture 并持久化该线程的时间 |
| `created_at` | 记录创建时间 | 兼容字段，表示记录首次落库时间 |
| `updated_at` | 记录修改时间 | 通用 record modified time，不再承担纯捕获语义 |

本轮不新增消息级 `source_created_at`。`Message.created_at` 保持现状。

### 2.3 Display Semantics Must Be Shared

所有 consumer 共用同一套派生 selector：

- `originAt = source_created_at ?? first_captured_at ?? created_at`
- `captureFreshnessAt = last_captured_at ?? updated_at`
- `recordModifiedAt = updated_at`

### 2.4 Reader Fidelity Is Not Enough

即使 reader 看起来正常，只要 export、compression、insights 或 web 端仍然各自使用
不同时间语义或丢失结构信号，就不算完成。

### 2.5 Body And Sidecar Must Be Rendered Separately

conversation package 不仅包含正文，还包含正文之外的 sidecar 结构。

固定规则：
- `citations[]` 不得以内联尾巴的形式挂回正文
- `artifacts[]` 不得被伪装成 `content_text` 的补充段落
- `content_text` 只承担 canonical plain text fallback，不承担“把所有结构都揉成一段文本”的职责

## 3. Stable Baseline That Remains In Force

- 本轮不重写 capture governance 模式
- 本轮不新增消息级 source timestamp
- `created_at` 继续保留，作为兼容字段和兜底值
- `updated_at` 继续保留 generic modified 语义，避免影响 title / tag / star / topic 等更新逻辑

## 4. Shared Consumer Rules

### 4.1 Timeline and Thread Lists

- 主时间使用 `originAt`
- 默认排序和日期分组也使用 `originAt`
- 如果界面展示“最近捕获”语义，应单独以副文案呈现 `captureFreshnessAt`

### 4.2 Reader Header

- 主日期显示 `originAt`
- metadata 区显式展示：
  - `Source Time`，若存在
  - `First Captured`
  - `Last Captured`
  - `Last Modified`

### 4.2.1 Reader Body Contract

- 正文主渲染输入固定为 `semantic_ast_v2`
- `content_text` 只作为 fallback plain text
- table / math / code 必须按 `semantic_ast_v2` 保真渲染
- 不允许 reader 再从正文尾部推断 citation 或 artifact

### 4.2.2 Sources And Artifact Sections

- `citations[]`
  - sidepanel 与 web 统一渲染为 message-level `Sources` disclosure
  - 每项至少显示 `label + host`
  - 点击后跳转 `href`
- `artifacts[]`
  - 先渲染存在性占位
  - 对 `standalone_artifact` 允许显示 `label / captureMode / renderDimensions`
  - 本轮不要求完整 Artifact 预览复刻

### 4.3 Export

- JSON 必须带齐全部时间字段
- MD / TXT 至少显式写出 `Started At`、`First Captured At`、`Last Captured At`
- 不再把 `updated_at` 当作线程起点时间
- JSON / MD / TXT 必须共享同一份 conversation package，而不是重新从 `content_text` 组装世界观
- `citations[]`
  - JSON 原样输出
  - MD / TXT 每条消息单独 `Sources` 区
- `artifacts[]`
  - JSON 原样输出
  - MD / TXT 先输出存在性占位，不混入正文
- 导出标题固定依赖 app-shell metadata，而不是正文里的最大标题

### 4.4 Compression, Summary, and Weekly Insight

- 会话级 chronology 使用 `originAt`
- 带“captured”语义的统计使用 `first_captured_at`
- prompt 输入不能继续把 `updated_at` 混作 conversation start time
- 在下一实现阶段前，`insights / compression` 允许保持 text-centric 主路径，但必须显式承认：
  - `content_text` 只是 canonical plain text fallback，不保证承载全部 rich structure
  - `citations[] / artifacts[]` 只能作为影响评估对象，不应被假设已经进入 prompt 输入
- package-aware rollout 的优先级低于 `reader / web / export`

### 4.5 Web Parity

- `vesti-web` 的类型、helper 和显示逻辑必须与扩展侧一致
- web library card 与 reader header 不允许重新发明另一套时间解释
- web reader 不允许继续停留在“纯文本 reader”
- sidepanel 与 web 必须共享同一套 `reader renderer contract`

### 4.6 Consumer Rollout Order

推荐顺序固定如下：
1. `reader / web / export`
2. `insights / compression`

理由：
- export 最先受到 app-shell metadata、table fidelity、citation / artifact sidecar 的影响
- reader / web 必须先共享同一套渲染 contract，才能避免 cross-surface drift
- insights / compression 在下一实现阶段前继续允许 text-centric 主路径，但文档必须预先收紧其边界

## 5. Decision Statement

reader pipeline 的当前目标不是只修某个界面的日期文案，而是让 sidepanel、web、export、
compression 和 insights 真正共享同一套结构与时间语义。
