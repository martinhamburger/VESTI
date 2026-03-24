# Web Dashboard Architecture Cleanup Checklist

Status: Active cleanup checklist
Audience: Maintainers, web contributors, sidepanel contributors

## Summary

这份清单不要求本轮立即重写 dashboard。它的目标是把当前最容易继续制造 drift 的结构问题按优先级压平，方便后续功能开发在同一套 source of truth 上推进。

当前判断固定如下：

- `packages/vesti-ui` 是 dashboard UI 的主实现层
- `frontend/src/dashboard.tsx` 和 `vesti-web/app/page.tsx` 都只是挂载 / 注入 storage 的宿主壳
- `vesti-web/components/*` 是 legacy residue，不应继续被当成当前 web dashboard 的主实现

## 1. Current Source of Truth

### 1.1 Locked ownership

- UI shell owner: `packages/vesti-ui/src/dashboard.tsx`
- active detailed-reading owner: `packages/vesti-ui/src/tabs/library-tab.tsx`
- extension-hosted dashboard shell: `frontend/src/dashboard.tsx`
- Next-hosted dashboard shell: `vesti-web/app/page.tsx`

### 1.2 Immediate interpretation rule

- 后续 web dashboard 功能改动默认先看 `packages/vesti-ui`
- `vesti-web/app/page.tsx` 只负责壳层集成，不承接 reader 细节实现
- `vesti-web/components/*` 没有被当前入口消费的部分，不得继续添加新功能

## 2. P0 Drift Risks

### 2.1 Dual detailed-reading implementations

- sidepanel detailed reader 仍在 `frontend/src/sidepanel/containers/ReaderView.tsx`
- web detailed reader 仍嵌在 `packages/vesti-ui/src/tabs/library-tab.tsx`
- 这意味着 reader metadata、rich content contract、annotation affordance 仍可能跨端漂移

### 2.2 Timestamp helper fragmentation

当前同类 helper 至少散落在：

- `frontend/src/lib/conversations/timestamps.ts`
- `vesti-web/lib/conversation-timestamps.ts`
- `packages/vesti-ui/src/tabs/network/temporal-graph-utils.ts`

这会导致：

- 相同字段在不同 surface 上被重新解释
- reader 修复不一定自动传导到 web / network
- 贡献者容易复制 helper，而不是复用统一 contract

### 2.3 `LibraryTab` is too large

- `packages/vesti-ui/src/tabs/library-tab.tsx` 当前约 2800+ 行
- 同时承载 conversation list、detail reader、summary、annotations、notes、folder/tag operations
- 任一 reader 级改动都需要进入一个巨石文件，局部 patch 风险和 review 成本都偏高

### 2.4 Legacy residue keeps misleading contributors

- 仓库里仍有 `vesti-web/components/reader-view.tsx`
- 仓库里仍有 `vesti-web/components/tabs/library-tab.tsx`
- 它们即使不在当前入口上，也会继续误导贡献者判断“哪套实现才是真的”

## 3. P1 Cleanup Slices

### 3.1 Extract a shared detailed-reader shell

- 把 detailed-reading 的公共结构抽成 package-level shared shell
- 目标至少覆盖：header skeleton、footer metadata、message list framing、empty/loading states
- sidepanel 和 `@vesti/ui` 共用同一套 shell contract，而不是各自维护 reader chrome

### 3.2 Extract a shared reader timestamp module

- 把 reader footer model 从 surface-specific helper 提升成 shared module
- reader、web、后续 smoke tests 都只消费一套 derived timestamp contract
- `vesti-web/lib/conversation-timestamps.ts` 不再继续扩张 reader 级逻辑

### 3.3 Break `LibraryTab` into reader-facing subcomponents

优先拆这三块：

- detailed-reading panel
- annotation surface / annotation drawer orchestration
- summary card / summary actions

拆分目标不是视觉重构，而是让 reader 级改动不再触碰整页状态洪流。

### 3.4 Freeze the legacy boundary

- 明确 active web = `packages/vesti-ui`
- legacy `vesti-web/components/*` 进入 deprecation 状态
- 在真正清理前，不再往 legacy surface 加 feature 或 contract fix

## 4. P2 Structural Cleanup

### 4.1 Resolve legacy directory fate

对 `vesti-web/components/*` 做三选一，但必须尽快落定：

- 归档到明确的 legacy 目录
- 删除未使用实现
- 保留但加显式 deprecation header 和 README 说明

目标是降低误读，而不是维持“仓库里有两套 web dashboard”。

### 4.2 Converge rich reader contract

- web / sidepanel 必须共享同一份 rich content reader contract
- `content_text` fallback、AST-first rendering、citation/artifact sidecar 都要在共享 reader 层表达
- 不允许 web detailed reader长期停留在 text-centric 特判状态

### 4.3 Add drift guardrails

最低限度补这几类 guardrails：

- reader footer timestamp smoke coverage
- sidepanel / web parity checks for metadata labels
- legacy path warnings in docs so新贡献者不会沿旧实现继续开发

## 5. Exit Criteria

达到以下状态时，dashboard 架构才算从“容易继续漂”进入“可持续扩展”：

- detailed-reading 只剩一套共享实现骨架
- reader timestamp helper 只剩一套主实现
- `LibraryTab` 不再同时承担 reader、summary、annotation、notes 的全部细节
- `vesti-web/components/*` 不再被误认为当前 source of truth
- web / sidepanel 的 reader metadata contract 有最小可回归的 smoke guardrails
