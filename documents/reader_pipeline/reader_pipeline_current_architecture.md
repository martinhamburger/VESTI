# Reader Pipeline Current Architecture

Status: Active as-is architecture and gap analysis  
Audience: Reader/export/compression owners, schema maintainers, web contributors

## 1. Purpose

本文档描述 reader pipeline 当前真实代码链路、已经成型的边界、仍然明显漂移的部分，
以及从当前状态迁移到目标 contract 的推荐顺序。
这是一份只读诊断，不是实现变更日志。

## 2. Current End-to-End Flow

当前主链路可以概括为：

1. capture 落库
   - parser 和 capture middleware 将 `Conversation` / `Message` 写入 IndexedDB
2. repository / storage service
   - repository 负责 DB record 到 typed `Conversation` / `Message` 的转换
   - sidepanel 和 web 通过 storage bridge 消费这些 typed records
3. reader
   - 优先消费 AST，必要时回退到纯文本
4. export
   - JSON 可携带 AST 与更多 metadata
   - MD / TXT 过去更偏 `content_text`
5. compression / summary / weekly insight
   - 过去更偏 text-centric prompt input
6. web consumer
   - `vesti-web` 通过 storage bridge 读取 conversation，但类型和时间逻辑长期存在漂移

## 3. Boundaries That Are Already Reasonable

### 3.1 Repository and Consumer Split Exists

DB 层、repository 层、consumer 层至少有明确分层，这使得时间 helper 和统一 contract
有可插入位置。

### 3.2 Reader / Export / Insight Surfaces Are Already Distinct

reader、export、summary / weekly insight 现在都有相对独立的入口。
这意味着统一 contract 可以逐层接入，而不是只能一次性推翻重来。

### 3.3 Web Surface Already Reuses the Same Storage Bridge

`vesti-web` 不是完全独立的数据世界。这为跨端统一时间语义提供了现实基础。

## 4. Main Gaps

### 4.1 Timestamp Semantics Were Overloaded

过去 `source_created_at / created_at / updated_at` 在不同地方承担了不同意义：

- 有的地方把 `source_created_at ?? updated_at` 当线程时间
- 有的地方把 `created_at` 当 chronology
- 有的地方把 `updated_at` 同时当“最近捕获”和“最近修改”

这是 reader pipeline 当前最需要先收口的问题之一。

### 4.2 Consumer Logic Drifted Across Surfaces

sidepanel、timeline、insights、export、compression、web library 过去没有统一 helper。
结果是相同 conversation 在不同页面会显示成不同的“开始时间”或“更新时间”。

### 4.3 Reader Package Is Still Incomplete

reader 对文本、代码、列表、公式、表格等结构已经有一定支持，
但 attachment、image、artifact、citation 等更完整的 conversation package
仍未成为各 consumer 的一等结构。

### 4.4 Export and Compression Were Still Too Text-Centric

JSON export 较强，但 MD / TXT 和 compression prompt 过去更依赖 `content_text`
与 ad hoc metadata。这意味着即使 capture 未来保留更多结构，如果 consumer contract
不升级，下游仍会再次丢信息。

### 4.5 Web Type Drift Was Real

`vesti-web` 过去没有完整跟上扩展侧 `Conversation` 时间字段。
再加上一些 prototype-only 的展示逻辑，web 端尤其容易发生语义漂移。

### 4.6 Reader / Web Still Do Not Share One Rich-Structure Renderer

当前 sidepanel reader 已经具备 AST-first 渲染能力，但 web / library 仍明显更 text-centric：
- web library / preview 仍直接渲染 `message.content_text`
- web reader 并未真正复用 sidepanel 的 rich renderer contract
- citation / artifact 仍缺少 sidecar 区域，容易重新退化为正文尾巴或直接消失

这意味着“有 AST”与“所有阅读表面都真正消费 AST”之间仍有明显距离。

### 4.7 Export Is Still Split Between Package-Aware JSON And Text-Centric Body Exports

当前导出链路并不统一：
- JSON 已能带 `content_ast` 与部分 message metadata
- MD / TXT 仍以 `message.content_text` 为正文主输入
- citation / artifact 只能作为局部补丁追加，而不是从稳定 package contract 派生

这使得 export 是当前最先需要 package-aware 的 consumer，
因为它同时暴露标题、正文、表格、citation、artifact 的全部信息密度。

### 4.8 Insights And Compression Are Still Deeply Text-Centric

现有 `insightGenerationService`、`exportCompression`、`exportConversations`
大量直接消费 `message.content_text`：
- transcript 拼装依赖 `content_text`
- sentence splitting / excerpt building 依赖 `content_text`
- artifact signal 目前主要依赖正文中的文本线索，而不是 sidecar metadata

这并不等于它们立刻需要 package-aware 实现，但意味着文档必须先明确：
- `content_text` 只是 canonical plain text fallback
- 在 package-aware rollout 前，insights / compression 不得假设 `content_text` 承载全部 rich structure
- `citations[] / artifacts[]` 的存在将改变未来 prompt 输入边界

## 5. Current Time Display Matrix

截至当前实现，Threads 页和 reader / web 至少同时使用三种时间：

| Surface | 当前使用时间 | 当前语义 |
| --- | --- | --- |
| Threads 分组与排序 | `originAt` | 线程起点 |
| Threads 卡片副文案 `Last captured ...` | `captureFreshnessAt` | 最近一次成功捕获 |
| Threads 顶部 `first captured today` | `first_captured_at` | 今天首次被捕获的线程数 |
| Reader 主日期 `Started ...` | `originAt` | 线程起点 |
| Reader metadata | `source_created_at / first_captured_at / last_captured_at / updated_at` | 明细时间 |
| Web card `Last captured ...` | `captureFreshnessAt` | 最近一次成功捕获 |
| Web reader header | `originAt` + metadata | 起点时间 + 明细时间 |

这意味着当前 UI 不是“一个时间方案”，而是“三钟并行”：

- 起点钟：`originAt`
- 首捕钟：`first_captured_at`
- 末捕钟：`captureFreshnessAt`

## 6. Why Manual Capture Feels Especially Confusing

手动模式会把这些时间更明显地拉开：

1. `manual` 模式下 capture 先被 held
2. transient store 为当前线程维护 `firstObservedAt`
3. 首次 force archive 后，`first_captured_at` 会定格
4. 后续再次 force archive，保留既有 `first_captured_at`
5. 只推进 `last_captured_at` 和 `updated_at`

因此一条线程可能同时满足：

- `first_captured_at = 昨天`
- `last_captured_at = 今天`
- `originAt = source_created_at ?? first_captured_at ?? created_at`

用户看到的现象就是：

- 分组在 `Started This Week`
- 卡片写 `Last captured 4h ago`
- 顶部 `first captured today` 可能并不包含它

这从工程上是可解释的，但从文案上很容易让人误以为冲突。

## 7. Current Decision Snapshot

截至当前代码和文档，推荐的统一解释是：

- `source_created_at`
  - 来源站点时间，占位且可空
- `first_captured_at`
  - 首次观察到线程的代理时间
- `last_captured_at`
  - 最近一次成功 capture 并持久化的时间
- `created_at`
  - record 创建 / 首次落库时间
- `updated_at`
  - record modified time

派生 selector：

- `originAt = source_created_at ?? first_captured_at ?? created_at`
- `captureFreshnessAt = last_captured_at ?? updated_at`
- `recordModifiedAt = updated_at`

统计接口名也已经显式收口为 acquisition 语义：

- `firstCapturedTodayCount`
- `firstCaptureStreak`
- `firstCaptureHeatmapData`

## 8. Recommended Migration Order

推荐顺序固定如下：

1. 先统一文案和展示语义，明确每个表面到底在表达哪一个时间
2. 保持 `originAt / captureFreshnessAt / recordModifiedAt` 作为唯一 shared helper
3. 先让 `reader / web / export` 对齐 shared conversation package
4. 明确 `citations[] / artifacts[] / semantic_ast_v2` 的消费 contract
5. 最后再推进 `insights / compression` 从 text-centric 迁移到 package-aware

## 8.1 Current Exclusion: Network

需要单独说明的是，当前 reader / web 时间统一**不包含 `Network` 图谱页**。

原因很具体：

- Threads、reader、export、web library / reader 现在已经显式消费 `originAt / captureFreshnessAt / recordModifiedAt`
- `Network` 仍主要依赖 graph node set、vector edge set 和独立的 graph rendering contract
- 这条线当前还没有正式决定节点时间、时间过滤和时间动画分别应该对应哪一个字段

因此这轮 reader pipeline 基线只能得出一个明确结论：

- 主阅读链路时间语义已经收口
- `Network` 仍是待专项校准的下一个 consumer

任何 `Network` 贡献者都不应该从“Threads / Reader 已统一”推出“Network 已自动跟随统一”。

## 9. Decision Statement

reader pipeline 当前不是“没有架构”，而是“主通道已经存在，但共享 consumer contract 还不够强”。
现在最需要解决的不是单个页面显示错时间，而是同一条线程在多条消费链路里是否共享同一套结构、时间语义，以及正文/sidecar 分离后的同一份 conversation package。
