# 2026-02-27 `vesti-web` vs《知识库管理.docx》差距分析

## 0. 执行摘要

本文件目标是将《知识库管理.docx》中的目标蓝图与当前代码实况进行一一映射，避免“愿景叙事”与“工程现实”混用。

核心判断：
1. 蓝图中的 `Ingestion Pipeline / Gardener / Vector Engine / Storage Layer` 主要由 Extension Runtime 承担，而不是 `vesti-web` 本地实现。
2. `vesti-web` 当前定位是 Web 容器与 UI 展示层，其能力高度依赖 `chrome.runtime.sendMessage` 到扩展侧。
3. 当前最大差距不在“有没有页面”，而在“架构语义是否清晰、类型契约是否稳固、叙事是否准确”。

---

## 1. 蓝图能力拆解（来自《知识库管理.docx》）

依据 docx 已提取要点，蓝图核心能力包括：
1. 自动分类（LLM Agent 自动打标签与归档）
2. 语义检索（向量相似度跨对话关联）
3. 手动策展（重点标记、笔记关联）
4. 知识网络（关系图可视化）
5. Local-First 架构（IndexedDB/Web Worker/WASM）
6. 系统性能指标（Timeline <500ms、Agent <2s、检索 <1s、网络图<3s）

---

## 2. 逐项对照表（蓝图项 / 当前实现位置 / 完成度 / 风险）

| 蓝图项 | 当前实现位置 | 完成度 | 主要风险 |
| --- | --- | --- | --- |
| Ingestion Pipeline（DOM 捕获） | Extension content scripts（不在 `vesti-web`） | 对 `vesti-web` 而言为“外部依赖” | 容器层容易被误解为采集实现层 |
| The Gardener（自动分类） | `vesti-web` 仅触发 `RUN_GARDENER`，执行在扩展侧 | 部分（触发已接，执行不在本层） | “可触发”被误读为“本地已实现” |
| Vector Engine（向量化） | `vesti-web` 仅请求问答/关联，向量化在扩展侧 | 部分（消费层完成，引擎层不在本层） | 组件演示能力与引擎能力边界不清 |
| Storage Layer（Dexie/IndexedDB） | `vesti-web` 无本地 DB 实现，走 runtime message | 部分（接口消费层完成） | Web 层离线行为受扩展可用性影响 |
| Curator UI（Library/Explore/Network） | `@vesti/ui` 主实现已接入 `vesti-web` | 已完成（UI 层） | 与 legacy 目录并存导致维护分叉 |
| 手动策展（笔记/关联） | `@vesti/ui` 调用 `saveNote/updateNote/getNotes` | 已完成（依赖扩展侧存储） | 失败模式和回退语义主要在扩展侧 |
| 知识网络可视化 | `@vesti/ui` Network 基于 ECharts，含 mock fallback | 部分（可视化已可用） | docx 推荐 D3 与现实 ECharts 存在选型偏差 |
| 性能指标门禁 | docx 定义了指标，当前无 `vesti-web` 独立性能门禁 | 未闭环 | 难以验证“蓝图指标已达成” |

---

## 3. 已完成能力（通过扩展侧提供）

### 3.1 Web 容器可消费的核心能力
`vesti-web/lib/storageService.ts` 已封装并可调用：
1. 自动分类触发：`RUN_GARDENER`（`vesti-web/lib/storageService.ts:53`）
2. 语义问答：`ASK_KNOWLEDGE_BASE`（`vesti-web/lib/storageService.ts:89`）
3. 网络边：`GET_ALL_EDGES`（`vesti-web/lib/storageService.ts:65`）
4. 摘要读写：`GET/GENERATE_CONVERSATION_SUMMARY`（`vesti-web/lib/storageService.ts:124`, `vesti-web/lib/storageService.ts:130`）
5. 数据治理：`GET_STORAGE_USAGE`、`EXPORT_DATA`、`CLEAR_ALL_DATA`（`vesti-web/lib/storageService.ts:136`, `vesti-web/lib/storageService.ts:141`, `vesti-web/lib/storageService.ts:147`）

### 3.2 UI 主体已收敛到共享包
1. 入口直接挂载 `VestiDashboard`：`vesti-web/app/page.tsx:3`, `vesti-web/app/page.tsx:31`
2. 共享接口契约为 `StorageApi`：`packages/vesti-ui/src/types.ts:87`

---

## 4. 未闭环项（相对蓝图）

### 4.1 架构语义未完全闭环
1. 蓝图描述易让读者理解为 `vesti-web` 是“全栈知识引擎”。
2. 实际上它是“扩展能力的 Web 容器层”。

### 4.2 工程契约未闭环
1. `use-extension-sync` 在 `vesti-web` 和 `@vesti/ui` 均直接引用 `frontend` 协议类型路径。证据：`vesti-web/hooks/use-extension-sync.ts:2`, `packages/vesti-ui/src/hooks/use-extension-sync.ts:2`。
2. 该结构对拆仓、版本发布、CI 类型稳定性不友好。

### 4.3 质量门禁未闭环
1. `ignoreBuildErrors` 打开。证据：`vesti-web/next.config.mjs:4`。
2. 当前类型错误可能被隐藏，难以形成可靠质量基线。

### 4.4 代码收敛未闭环
1. legacy 原型（`vesti-web/components/tabs/*`）仍在仓库，且存在 mock 逻辑。证据：`vesti-web/components/tabs/library-tab.tsx:6`, `vesti-web/components/tabs/library-tab.tsx:26`。
2. 主入口未引用，形成“可见但非真源”的维护风险。

---

## 5. 语义偏差与术语统一建议

建议统一术语，避免对内对外误导：

| 当前易混淆表述 | 建议表述 | 说明 |
| --- | --- | --- |
| `vesti-web 是知识库管理系统` | `vesti-web 是知识库 Web 容器层（UI shell）` | 强调容器职责 |
| `vesti-web 实现了向量引擎` | `vesti-web 消费扩展侧向量能力` | 强调能力来源 |
| `vesti-web 本地完成自动分类` | `vesti-web 触发，Extension Runtime 执行` | 强调执行边界 |

推荐在 README/路演中采用：
1. “Web Dashboard 负责知识交互入口，核心采集与智能处理运行于扩展侧 Local-First Runtime。”
2. “UI 可见能力不等于本层独立实现能力。”

---

## 6. 对版本叙事的影响（README / 路演 / handoff）

### 6.1 建议口径（工程与叙事一致）
1. `vesti-web`: 展示与交互容器（Library/Explore/Network/Notes）。
2. Extension Runtime: 采集、向量化、分类、摘要、存储与导出执行层。
3. `@vesti/ui`: 跨入口复用的 UI 组件与交互流程。

### 6.2 不建议口径
1. 不将 `vesti-web` 描述为“独立后端”或“独立知识引擎”。
2. 不将蓝图目标默认写成“已在 `vesti-web` 内部完成”。

---

## 7. 结论

《知识库管理.docx》是正确的目标方向，但当前代码现实属于“Extension 为主、Web 容器为辅”的实现格局。后续文档与工程计划应优先收敛边界语义、契约依赖与类型门禁，再推进更深层功能叙事。

