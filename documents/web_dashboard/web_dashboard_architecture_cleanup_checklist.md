# Web Dashboard Architecture Cleanup Checklist

Status: Active cleanup checklist
Audience: Maintainers, web contributors, sidepanel contributors

## Summary

这份清单不要求本轮立即重写 dashboard。它的目标是把最容易继续制造 drift 的结构问题按优先级压平，方便后续功能开发继续建立在同一套 source of truth 上。

当前判断固定如下：
- `packages/vesti-ui` 是 dashboard UI 的主实现层
- `frontend/src/dashboard.tsx` 和 `vesti-web/app/page.tsx` 只是宿主壳与 storage 注入层
- 旧 `vesti-web/components/*` public surface 已清理；后续目标是避免再次引入第二套 web dashboard 实现

## 1. Current Source of Truth

### 1.1 Locked ownership

- UI shell owner: `packages/vesti-ui/src/dashboard.tsx`
- active detailed-reading owner: `packages/vesti-ui/src/tabs/library-tab.tsx`
- extension-hosted dashboard shell: `frontend/src/dashboard.tsx`
- Next-hosted dashboard shell: `vesti-web/app/page.tsx`

### 1.2 Immediate interpretation rule

- 后续 web dashboard 功能改动默认先看 `packages/vesti-ui`
- `vesti-web/app/page.tsx` 只负责壳层集成，不承接 reader 细节实现
- 不要重新引入第二套 tracked web dashboard surface

## 2. P0 Drift Risks

### 2.1 Dual detailed-reading implementations across active surfaces

- sidepanel detailed reader 仍在 `frontend/src/sidepanel/containers/ReaderView.tsx`
- web detailed reader 仍在 `packages/vesti-ui/src/tabs/library-tab.tsx`
- 这意味着 reader metadata、rich content contract、annotation affordance 仍可能跨端漂移

### 2.2 Timestamp helper fragmentation

当前时间 helper 的风险仍然存在，只是 public legacy copy 已经清理。

高风险主线包括：
- `frontend/src/lib/conversations/timestamps.ts`
- `packages/vesti-ui/src/tabs/network/temporal-graph-utils.ts`

治理目标：
- 同一字段不要在不同 surface 上被重新解释
- reader 修复能够自然传导到 web / network
- 不要重新长出 web-only helper 副本

### 2.3 `LibraryTab` is too large

- `packages/vesti-ui/src/tabs/library-tab.tsx` 仍然承担 conversation list、detail reader、summary、annotations、notes、folder/tag operations
- 任一 reader 级改动都仍然需要进入一个巨石文件，局部 patch 风险和 review 成本都偏高

### 2.4 Legacy reintroduction risk

- public legacy surface 已经退出 tracked 主线
- 当前风险转成了“后续有人把第二套 web surface 重新带回 repo”

## 3. P1 Cleanup Slices

### 3.1 Extract a shared detailed-reader shell

- 把 detailed-reading 的公共结构抽成 package-level shared shell
- 至少覆盖：header skeleton、footer metadata、message list framing、empty/loading states
- sidepanel 和 `@vesti/ui` 共享同一套 shell contract，而不是各自维护 reader chrome

### 3.2 Extract a shared reader timestamp module

- 把 reader footer model 从 surface-specific helper 提升成 shared module
- reader、web、后续 smoke tests 只消费一套 derived timestamp contract

### 3.3 Break `LibraryTab` into reader-facing subcomponents

优先拆这三块：
- detailed-reading panel
- annotation surface / annotation drawer orchestration
- summary card / summary actions

目标不是视觉重构，而是让 reader 级改动不再触碰整页状态洪流。

### 3.4 Keep the legacy boundary frozen

- 明确 active web = `packages/vesti-ui`
- 不再给第二套 web dashboard surface 加 feature 或 contract fix
- 如果确实需要历史材料，只能从 maintainer-local archive 查看，不能回流到 public tracked tree

## 4. P2 Structural Cleanup

### 4.1 Converge rich reader contract

- web / sidepanel 必须共享同一份 rich content reader contract
- `content_text` fallback、AST-first rendering、citation/artifact sidecar 都要在共享 reader 层表达
- 不允许 web detailed reader 长期停留在 text-centric 特判状态

### 4.2 Add drift guardrails

最低限度补这些 guardrails：
- reader footer timestamp smoke coverage
- sidepanel / web parity checks for metadata labels
- docs warning that active web source of truth is `@vesti/ui`, not a second implementation tree

## 5. Exit Criteria

达到以下状态时，dashboard 架构才算从“容易继续漂”进入“可持续扩展”：

- detailed-reading 只剩一套共享实现骨架
- reader timestamp helper 只剩一套主实现
- `LibraryTab` 不再同时承担 reader、summary、annotation、notes 的全部细节
- public repo 不再容易让贡献者误判 web source of truth
- web / sidepanel 的 reader metadata contract 具备最小可回归的 smoke guardrails
