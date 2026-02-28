# 2026-02-27 `vesti-web` 架构现状备忘录（事实层）

## 0. 执行摘要

本文用于回答三个工程问题：
1. `vesti-web` 当前在系统中到底是什么角色。
2. 它和 `@vesti/ui`、Chrome Extension Runtime 的依赖边界是什么。
3. 目前可交付能力和技术债分别在哪里。

结论前置：
1. `vesti-web` 是 Next.js Web 壳层，核心业务 UI 实际由 `@vesti/ui` 承载。证据：`vesti-web/app/page.tsx:3`, `vesti-web/app/page.tsx:31`。
2. 业务数据不在 `vesti-web` 内部实现，主要通过 `chrome.runtime.sendMessage` 请求扩展侧能力。证据：`vesti-web/lib/storageService.ts:350`, `vesti-web/lib/storageService.ts:361`。
3. `vesti-web/components/*`（含 `components/tabs/*`）存在一套早期原型实现，但当前主入口未引用，是历史残留。证据：`vesti-web/components/tabs/library-tab.tsx:26` 与主入口 `vesti-web/app/page.tsx:31` 的接线方式。
4. `next.config.mjs` 开启 `typescript.ignoreBuildErrors: true`，当前工程策略是“先可运行，后类型治理”。证据：`vesti-web/next.config.mjs:4`。

---

## 1. 背景与范围

### 1.1 目标范围
本备忘录覆盖：
1. `vesti-web/*`
2. `packages/vesti-ui/*`
3. `frontend/src/lib/messaging/protocol.ts`（仅作为耦合依赖事实）

### 1.2 非目标
本备忘录不覆盖：
1. Extension 采集算法细节（parser/observer 逐模块实现）
2. 数据库 schema 的业务语义评审
3. proxy 服务部署细节

---

## 2. 运行架构图（Web 壳层 / UI 包 / Extension Runtime）

```mermaid
flowchart LR
  A[vesti-web Next.js Shell<br/>app/page.tsx] --> B[@vesti/ui<br/>VestiDashboard]
  B --> C[StorageApi Adapter<br/>vesti-web/lib/storageService.ts]
  C --> D[chrome.runtime.sendMessage]
  D --> E[Extension Background/Offscreen]
  E --> F[(IndexedDB + LLM + Vector + Summary)]

  G[Legacy Prototype<br/>vesti-web/components/tabs/*] -. not wired to entry .-> A
```

架构要点：
1. `vesti-web` 负责“装配与承载”，不是知识引擎主实现层。
2. `@vesti/ui` 负责主交互与三页签编排。证据：`packages/vesti-ui/src/dashboard.tsx:22`。
3. 数据与计算能力最终落在 Extension Runtime（Background/Offscreen）。

---

## 3. 关键模块与职责矩阵

| 层级 | 模块 | 主要职责 | 证据锚点 |
| --- | --- | --- | --- |
| Web 壳层 | `vesti-web/app/page.tsx` | 挂载 `VestiDashboard` 并注入 `storage` 适配 | `vesti-web/app/page.tsx:3`, `vesti-web/app/page.tsx:31` |
| UI 核心 | `packages/vesti-ui/src/dashboard.tsx` | 顶栏、Tab 编排、Settings/Data 抽屉、事件流组织 | `packages/vesti-ui/src/dashboard.tsx:15`, `packages/vesti-ui/src/dashboard.tsx:22` |
| UI 契约 | `packages/vesti-ui/src/types.ts` | `StorageApi` 接口定义，约束数据能力边界 | `packages/vesti-ui/src/types.ts:87` |
| Web 适配 | `vesti-web/lib/storageService.ts` | Message 协议封装、超时处理、响应解码 | `vesti-web/lib/storageService.ts:22`, `vesti-web/lib/storageService.ts:350`, `vesti-web/lib/storageService.ts:377` |
| 同步钩子 | `vesti-web/hooks/use-extension-sync.ts` | 监听扩展消息，做最小状态同步 | `vesti-web/hooks/use-extension-sync.ts:55` |
| 历史原型 | `vesti-web/components/tabs/*` | 早期页面内实现（含 MOCK 与直连调用），当前未接主入口 | `vesti-web/components/tabs/library-tab.tsx:26` |

---

## 4. 数据流与调用链（UI -> storageService -> runtime -> offscreen）

### 4.1 主调用链
1. `VestiDashboard` 触发 UI 行为（搜索、归档、问答、导出）。
2. 通过 `StorageApi` 调用 `vesti-web/lib/storageService.ts` 对应方法。
3. `storageService` 使用 `chrome.runtime.sendMessage` 发送请求。
4. Extension 侧（Background/Offscreen）返回数据。
5. `storageService` 统一转换响应并回传 UI。

### 4.2 协议面能力（示例）
`storageService` 已封装以下关键请求类型：
1. `RUN_GARDENER`：`vesti-web/lib/storageService.ts:53`
2. `ASK_KNOWLEDGE_BASE`：`vesti-web/lib/storageService.ts:89`
3. `GET_ALL_EDGES`：`vesti-web/lib/storageService.ts:65`
4. `GET/GENERATE_CONVERSATION_SUMMARY`：`vesti-web/lib/storageService.ts:124`, `vesti-web/lib/storageService.ts:130`
5. `GET_STORAGE_USAGE` / `EXPORT_DATA` / `CLEAR_ALL_DATA`：`vesti-web/lib/storageService.ts:136`, `vesti-web/lib/storageService.ts:141`, `vesti-web/lib/storageService.ts:147`

---

## 5. 依赖与耦合清单

### 5.1 包管理与工作区
1. 仓库根声明 monorepo workspaces，包含 `vesti-web` 与 `packages/*`。证据：`package.json:4`, `package.json:6`, `package.json:7`。
2. `vesti-web` 通过 `file:../packages/vesti-ui` 引用共享 UI 包。证据：`vesti-web/package.json:42`。
3. `next.config.mjs` 使用 `transpilePackages: ["@vesti/ui"]` 与 `experimental.externalDir: true`，允许跨目录构建。证据：`vesti-web/next.config.mjs:9`, `vesti-web/next.config.mjs:11`。

### 5.2 协议类型耦合
1. `vesti-web/hooks/use-extension-sync.ts` 直接引用 `frontend/src/lib/messaging/protocol.ts` 类型。证据：`vesti-web/hooks/use-extension-sync.ts:2`。
2. `packages/vesti-ui/src/hooks/use-extension-sync.ts` 同样直接跨层引用 `frontend`。证据：`packages/vesti-ui/src/hooks/use-extension-sync.ts:2`。
3. 该耦合会影响拆仓、独立发布、协议演进稳定性。

### 5.3 样式与字体耦合
1. `vesti-web/app/globals.css` 通过 `@source '../packages/vesti-ui/src/**/*'` 让 Tailwind 扫描共享 UI 源码。证据：`vesti-web/app/globals.css:8`。
2. `vesti-web` 使用 `Nunito Sans + Lora` 字体策略。证据：`vesti-web/app/globals.css:1`, `vesti-web/app/layout.tsx:3`。

---

## 6. 当前可用能力与不在本层实现的能力

| 能力 | 当前状态 | 落点 |
| --- | --- | --- |
| Library/Explore/Network 三页签 UI | 已可用 | `@vesti/ui` 组件层 |
| 对话检索与问答触发 | 已可用（依赖扩展响应） | Web 触发 + Extension 执行 |
| Summary 生成与读取 | 已可用（依赖扩展侧） | Web 触发 + Offscreen 执行 |
| 数据导出与清理入口 | 已可用（依赖扩展侧） | `DataManagementPanel` + runtime |
| DOM 捕获/清洗/会话提取 | 不在本层 | Extension content scripts |
| 向量化引擎与索引写入 | 不在本层 | Extension offscreen/service |
| Gardener 后台策略执行 | 不在本层（本层仅触发） | Extension runtime |

---

## 7. 已知技术债

### 7.1 类型治理债
1. `ignoreBuildErrors` 开启。证据：`vesti-web/next.config.mjs:4`。
2. 风险：潜在类型回归在构建期被掩盖。

### 7.2 双实现债（历史原型残留）
1. `vesti-web/components/tabs/*` 仍保留完整实现，且包含 `MOCK_NOTES` 与独立数据加载逻辑。证据：`vesti-web/components/tabs/library-tab.tsx:6`, `vesti-web/components/tabs/library-tab.tsx:26`。
2. 风险：维护者误改“非主路径”代码，导致认知分裂。

### 7.3 协议硬耦合债
1. `vesti-web`/`@vesti/ui` 钩子直接依赖 `frontend` 协议类型路径。
2. 风险：路径变化或拆仓会导致跨项目编译/发布脆弱。

### 7.4 视觉栈分叉债
1. `vesti-web` 与 `frontend` 的字体与 token 策略存在历史分叉。
2. 风险：跨入口视觉一致性与品牌一致性难以长期保证。

---

## 8. 维护建议（短期 / 中期）

### 8.1 短期（1-2 迭代）
1. 明确标注 `vesti-web/components/*` 为 legacy（文档与目录注释层面先收口）。
2. 在 handoff/README 中固定口径：`vesti-web` 是 Web 容器层，不是独立知识引擎。
3. 维持 `@vesti/ui` 为唯一主渲染路径，避免新功能回流到 legacy 目录。

### 8.2 中期（2-4 迭代）
1. 协议类型收口到共享包（例如 `packages/shared-protocol`）。
2. 清理 `ignoreBuildErrors` 依赖，恢复类型门禁。
3. 决策 legacy tabs 的最终命运：删除或迁移为实验分支资产。

---

## 9. 结论

`vesti-web` 当前工程定位清晰但存在技术债：它已经成为“可运行的 Web 容器 + 共享 UI 展示层”，并通过 runtime 调用扩展侧能力；下一阶段重点不应再扩展壳层功能，而应聚焦契约收口、类型治理和历史双实现清理。

