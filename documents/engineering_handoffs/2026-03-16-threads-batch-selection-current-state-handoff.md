# 2026-03-16 交接：Threads 批量选择与底栏统一当前工程状态

## 0. 摘要

当前仓库处于一个很明确的“双层状态”：

1. 远端主线层：
   - PR `#48` 已合并到 `main`
   - 合并内容覆盖了此前的 Threads search / Reader / capture hardening / pnpm workspace 收口，以及最近一轮 Threads 选择入口和 filter disclosure UI polish
2. 本地继续开发层：
   - 当前工作树上还有一组**未提交**的 Threads 批量选择增强改动
   - 这组改动在已合并基线之上继续推进 `Select` 体验，重点是：
     - overflow 视觉兼容性
     - 批量选择状态机本地化
     - 底部 action tray
     - Data 风格的批量导出 / 强确认批量删除

这意味着：当前代码并不是“完全未落地”，而是“上一轮主线已经合并，这一轮批量选择仍停留在本地脏改动阶段”。

---

## 1. 分支 / PR / 工作树状态

### 1.1 Git 状态

- 当前分支：`docs/documents-governance-cleanup`
- 当前 HEAD：`b74904bf85a57725e81e196f46863912592823b6`
- HEAD 提交：`feat(sidepanel): compact threads filter disclosures`
- 当前工作树：**dirty**

当前未提交改动：

- `documents/ui_refactor/ui_refactor_debugging_playbook.md`
- `documents/ui_refactor/ui_refactor_manual_sampling_and_acceptance.md`
- `frontend/src/lib/services/storageService.ts`
- `frontend/src/sidepanel/components/BatchActionBar.tsx`
- `frontend/src/sidepanel/components/ConversationCard.tsx`
- `frontend/src/sidepanel/components/ExportDialog.tsx`
- `frontend/src/sidepanel/containers/ConversationList.tsx`
- `frontend/src/sidepanel/hooks/useBatchSelection.ts`
- `frontend/src/sidepanel/pages/TimelinePage.tsx`
- `frontend/src/sidepanel/utils/exportConversations.ts`
- `frontend/src/sidepanel/types/export.ts`（新文件，尚未 tracked）

脏改动规模（tracked files）：

- `10` 个已跟踪文件改动
- `667` 行新增
- `197` 行删除

### 1.2 PR 状态

- PR：`#48`
- 标题：`feat(sidepanel): land threads search flow, capture hardening, and pnpm workspace cleanup`
- 状态：`MERGED`
- 链接：<https://github.com/abraxas914/VESTI/pull/48>

### 1.3 与 `main` 的关系

- 当前本地分支相对 `origin/main`：`ahead 0 / behind 14`

解释：

- `docs/documents-governance-cleanup` 这条线已经通过 PR `#48` 合并进 `main`
- 当前分支本身还没同步回最新 `origin/main`
- 所以接下来如果要继续推进这批 Threads 批量选择改动，建议不要长期停留在这个“已 merge 但未 sync 的旧分支”上

---

## 2. 已合并基线（这轮本地工作之前已经存在）

以下内容已经不属于“本地脏改动”，而是上一轮已经进了主线的基线：

### 2.1 Capture / 工程化

- Claude 捕获稳健性增强
- capture 门槛收口
- pnpm workspace 和单一锁文件收口

### 2.2 Threads UI 已落地主线的部分

- Threads 选择入口已从 header 转移到 card overflow 菜单
- 顶部 filter 已切换为紧凑 disclosure 结构
- filter 的 `Date` / `Source` 默认折叠
- header / footer / batch bar 已做一轮密度与回归修正

对应最近已提交序列：

1. `dba4fe4` `docs(capsule): clarify quiet-start refresh reset`
2. `d5f4ad2` `feat(sidepanel): streamline threads batch selection UI`
3. `b74904b` `feat(sidepanel): compact threads filter disclosures`

---

## 3. 当前本地未提交工作：Threads 批量选择增强

### 3.1 目标

本地这组改动的目标，是把 `Select` 从“只是选中当前卡片”推进到“真正的批量模式”：

- 进入批量模式后，当前过滤结果里的所有卡片都进入统一可勾选态
- 所有卡片左侧都保留固定的圆形勾选框槽位
- 不再让 `selected` 复用 hover / expanded 视觉
- Threads 底部出现统一的 batch action tray
- `Export` / `Delete` 语言和层级向 Data 页对齐

### 3.2 当前本地实现概况

#### A. 批量选择状态机本地化

`useBatchSelection` 已从简单的 `isBatchMode` 扩展为本地模式：

- `inactive`
- `selecting`
- `export_panel`
- `delete_panel`

当前实现特征：

- 基于**当前过滤结果集**工作，而不是全部 conversations
- `Select All` 直接选中当前过滤结果集全部项
- 搜索 / filter 改变时，会自动 prune 掉已不可见的选中 id
- 当前过滤结果集为空时，会自动退回 `inactive`

#### B. ConversationCard 批量态改造

卡片批量态已经从 hover / expanded 视觉中剥离：

- 批量模式下所有卡片显示 18px 圆形勾选框槽位
- `PlatformTag` 右移并稳定占位
- 选中态只保留轻量背景 / ring，不再像“进入当前卡片”
- 批量模式下不再显示顶部 star / overflow 和底部 footer action row
- 卡片点击只做 toggle select，不再打开 Reader

#### C. Threads 底部 action tray

`BatchActionBar` 已被重做为 Threads-specific action tray，而不是原来那条很轻的 bar。

当前 tray 已包含：

- `Select All` / `Deselect All`
- 选中数 badge
- `Export`
- `Delete`
- `Exit`

并且支持两个展开子面板：

- export panel
- delete panel

#### D. 批量导出

批量导出已经开始向 Data 页语义对齐：

- Timeline 不再使用原先的 `ExportDialog` 作为主要交互
- tray 里会打开 Data 风格的 `JSON / TXT / MD` 导出面板
- 导出内容固定走 `full-thread` 语义

为了拆开旧依赖，当前还做了这些配套调整：

- 新增 `frontend/src/sidepanel/types/export.ts`
- `exportConversations.ts` 不再从 `ExportDialog` 组件反向引用类型
- `exportConversations.ts` 新增下载 helper
- `ExportDialog.tsx` 仍保留，但已改成引用新的导出类型定义

注意：

- 现在 `ExportDialog` 更像兼容性残留组件，而不是 Threads 主路径组件
- 后续可以决定是保留备用，还是在确认无调用点后移除

#### E. 批量删除

当前已新增前端 helper：

- `storageService.deleteConversations(ids: number[])`

实现方式：

- 复用现有单条 `DELETE_CONVERSATION` offscreen 请求
- 前端顺序调用每个 id
- 完成后统一发一次 `VESTI_DATA_UPDATED`

当前 delete panel 也已经按 Data 危险区语义实现：

- 展示选中数量
- 输入框要求键入 `DELETE`
- 满足条件后才允许 `Confirm delete`

#### F. 文档门禁同步

`ui_refactor` 两份文档已补了这轮 batch mode 基线：

- 手工验收新增：
  - 批量模式可见性
  - selected 不再复用 expanded
  - `Select All` 只作用于当前过滤结果集
  - Data 风格批量导出
  - `DELETE` 强确认删除
- debugging playbook 新增：
  - “Only one card looks entered after Select”
  - “Select All grabs the wrong threads”
  - “Batch export no longer matches Data language”
  - “Batch delete is too easy to trigger”

---

## 4. 当前验证状态

这组**本地未提交**改动之后，已执行并通过：

```powershell
pnpm -C frontend build
```

当前构建结论：

- `plasmo build` 成功
- 没有出现类型错误或打包错误

还没完成的验证：

- 真实 sidepanel 手工 smoke
- 批量模式下小窗口 / 长列表 / filter 变化后的视觉与交互检查

---

## 5. 已知风险 / 未完成点

### 5.1 最重要的工程风险

当前工作树还没 commit，也没 push。

这意味着：

- 现在的“批量选择增强”只存在于本地工作区
- 如果直接切分支或 reset，很容易丢掉这批工作

### 5.2 分支管理风险

当前开发仍停留在已经 merge 的 `docs/documents-governance-cleanup` 分支上。

风险：

- 后续继续在这条分支提交，会让新的 PR 基线不干净
- 更安全的做法是：保存当前脏改动后，基于最新 `origin/main` 开新分支继续

### 5.3 功能层面的当前注意点

1. `ExportDialog.tsx` 仍然存在，但 Timeline 主路径已不再依赖它  
2. 批量删除当前只是“前端 helper 顺序删除”，不是专门的 batch RPC  
3. 还没做手工 smoke，所以虽然 build 过了，但以下仍需验证：
   - 所有卡片是否都正确进入可勾选态
   - tray 展开后底部留白是否足够
   - 搜索 / filter 变化后 prune 行为是否直观
   - 批量模式下 Reader 是否完全不会被误触发

---

## 6. 下一位接手的建议顺序

建议严格按这个顺序继续：

### Step 1. 先保护当前工作树

先不要切到别的任务。

优先做：

1. 检查当前改动是否需要继续补手工 smoke
2. 确认无误后，把这轮改动切 commit

### Step 2. 再处理分支基线

因为 `#48` 已 merge，推荐后续这样整理：

1. 基于最新 `origin/main` 开新分支
2. 把这轮批量选择 commit 带过去
3. 在新分支上继续 polish 或开新 PR

### Step 3. 手工 smoke 的最小必查项

至少验证：

1. 从任意 card overflow 点 `Select`
   - 当前过滤结果集中的所有卡片都出现圆形勾选框
2. 选中卡片
   - 不再像 hover 展开
   - 不会点进 Reader
3. `Select All`
   - 只作用于当前过滤结果
4. 改搜索 / 改 filter
   - 已选项会按当前可见结果自动 prune
5. `Export`
   - 只显示 `JSON / TXT / MD`
   - 导出成功后反馈正确
6. `Delete`
   - 必须输入 `DELETE`
   - 删除成功后退出批量模式并清空选中

---

## 7. 关键文件锚点

接手时优先看这些文件：

### 7.1 Threads 批量选择主线

- `frontend/src/sidepanel/pages/TimelinePage.tsx`
- `frontend/src/sidepanel/hooks/useBatchSelection.ts`
- `frontend/src/sidepanel/components/BatchActionBar.tsx`
- `frontend/src/sidepanel/components/ConversationCard.tsx`
- `frontend/src/sidepanel/containers/ConversationList.tsx`

### 7.2 导出 / 删除配套

- `frontend/src/sidepanel/utils/exportConversations.ts`
- `frontend/src/sidepanel/types/export.ts`
- `frontend/src/lib/services/storageService.ts`
- `frontend/src/sidepanel/components/ExportDialog.tsx`

### 7.3 UI 回归门禁

- `documents/ui_refactor/ui_refactor_manual_sampling_and_acceptance.md`
- `documents/ui_refactor/ui_refactor_debugging_playbook.md`

---

## 8. 给下一位 Codex 的一句话任务定义

> 在 `PR #48` 已 merge 的基线上，整理并继续推进当前本地未提交的 Threads 批量选择增强工作，先保护并提交这批本地改动，再基于最新 `main` 迁移到新的干净分支，完成手工 smoke 和后续 UI polish。
