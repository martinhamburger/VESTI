# 2026-03-07 `v1.2.0-rc.7` Yuanbao + Web Dashboard 交付 Handoff

## 0. 交付摘要
本轮工作已经把 `Yuanbao` 命名统一、Kimi/Yuanbao 捕获修复、web dashboard 主题同步、Kimi 徽标对比度修复，以及 web 暗夜模式剩余白块补丁落到同一条发布线上。

当前代码状态：
1. 工作分支：`fix/yuanbao-web-theme-rc7`
2. 分支已推远端：`origin/fix/yuanbao-web-theme-rc7`
3. 基线：已 rebase 到最新 `origin/main`（`01385e7`）之上
4. 当前 HEAD：`e64c3cb128b06ae8093c3a1a7b18f1aa232cec05`
5. 相对 `origin/main`：ahead `4` commits，behind `0`
6. 工作树状态：clean
7. 版本号已提升到：`1.2.0-rc.7`

当前这条线适合直接继续做：
- PR 创建 / reviewer 沟通
- 手工 smoke 验收
- RC tag / GitHub Release 文案整理
- 如有必要，继续做 web dashboard 细节 polish

---

## 1. 本轮已完成内容

### 1.1 Capture / Runtime
1. canonical platform value 已从 `YUANBAO` 收敛为 `Yuanbao`
2. 保留 legacy 兼容读取，避免旧本地数据和旧字符串失效
3. Dexie schema 已补迁移，持久化 `platform` 会向 `Yuanbao` 归一
4. Kimi parser 已切到真实 DOM，修复：
   - `holding / no_transient` 冷启动无快照
   - `chat-header` 标题污染
   - `Final Only` 正文提取
5. Yuanbao parser 已切到 `hyc-*` 真实 DOM，修复：
   - 旧 `ds-message` 假设失效
   - `CoT + Final` 单条合并
   - 检索 doc title 噪音排除

### 1.2 Web Dashboard / `@vesti/ui`
1. web dashboard 与 dock 已共享 `vesti_ui_settings.themeMode`
2. web 右上角头像 `Settings` 抽屉已增加显式 `Appearance` 区块
3. web 主题切换已可写回 storage，并能响应 dock 端主题切换
4. Kimi web 徽标已做主题特例：
   - light: 黑字
   - dark: 白字
5. web badge 系统与 dock / Threads 视觉已明确解耦：
   - 共享平台 identity / label / theme state
   - 不共享 badge rendering algorithm
6. follow-up 暗夜补丁已完成：
   - `Network` 选中的 `All` 不再是白 pill
   - `Explore` 左侧 `New Chat` 不再是白块

### 1.3 文档与版本
1. `frontend/package.json` 已更新为 `1.2.0-rc.7`
2. `CHANGELOG.md` 已新增 `1.2.0-rc.7` 版本块
3. capture phase3 文档已补充 Kimi / Yuanbao 对齐说明
4. UI refactor spec 已补充：
   - web / dock badge split
   - dashboard theme sync
   - Kimi badge override

---

## 2. 当前提交序列
按时间顺序：
1. `1934f21` `fix(capture): normalize Yuanbao identity and harden parsers`
2. `aa32330` `fix(dashboard): sync web theme with dock settings`
3. `4aab7b5` `chore(release): prepare v1.2.0-rc.7`
4. `e64c3cb` `fix(dashboard): correct dark-mode contrast in network and explore`

说明：
- 第 4 个 commit 是对第 2 个 commit 的 follow-up patch，属于同一 PR / 同一 RC 发布线，不建议拆新 PR。

---

## 3. 关键文件锚点
下一位接手时，优先看这些文件：

### 3.1 Platform / capture / storage
- `frontend/src/lib/types/index.ts`
- `frontend/src/lib/platform.ts`
- `frontend/src/lib/db/schema.ts`
- `frontend/src/lib/db/repository.ts`
- `frontend/src/background/index.ts`
- `frontend/src/lib/capture/transient-store.ts`
- `frontend/src/contents/capsule-ui.ts`
- `frontend/src/contents/yuanbao.ts`
- `frontend/src/lib/core/parser/kimi/KimiParser.ts`
- `frontend/src/lib/core/parser/yuanbao/YuanbaoParser.ts`

### 3.2 Theme / dashboard / web ui
- `frontend/src/lib/services/uiSettingsService.ts`
- `frontend/src/dashboard.tsx`
- `frontend/src/sidepanel/index.tsx`
- `frontend/src/sidepanel/pages/SettingsPage.tsx`
- `packages/vesti-ui/src/dashboard.tsx`
- `packages/vesti-ui/src/constants/platform.ts`
- `packages/vesti-ui/src/tabs/library-tab.tsx`
- `packages/vesti-ui/src/tabs/network-tab.tsx`
- `packages/vesti-ui/src/tabs/explore-tab.tsx`
- `packages/vesti-ui/src/types.ts`

### 3.3 Docs / release
- `CHANGELOG.md`
- `documents/capture_engine/v1_3_platform_expansion_spec.md`
- `documents/capture_engine/v1_3_phase3_execution_log.md`
- `documents/capture_engine/v1_3_phase3_manual_sampling_checklist.md`
- `documents/ui_refactor/v1_4_ui_refactor_component_system_spec.md`

---

## 4. 已执行验证
本轮在当前分支上已执行并通过：

```powershell
pnpm -C packages/vesti-ui build
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend build
```

这些验证是在包含 follow-up patch `e64c3cb` 之后再次执行的，不是旧结果复用。

---

## 5. 当前未完成 / 下一步建议

### 5.1 P0：创建并推进 PR
建议直接使用当前分支开 PR，不要拆第二个 PR。

建议标题：
`fix: finalize Yuanbao/web dashboard rc.7 follow-up patches`

PR 核心点：
1. `Yuanbao` canonical rename + migration/compat
2. Kimi / Yuanbao parser repair
3. web dashboard theme sync + Appearance drawer
4. web dark-mode contrast follow-up patch
5. release prep for `v1.2.0-rc.7`

### 5.2 P0：补手工 smoke
建议最少手工验证以下路径：
1. Kimi manual capture：
   - `/chat/<id>` 有稳定 URL ID 时可 transient + archive
   - 标题不污染 messages
2. Yuanbao deepsearch：
   - user 取自 `.hyc-content-text`
   - AI 为 `CoT + Final` 单条合并
   - doc title 不进正文
3. web dashboard theme sync：
   - dock 改主题，web 已打开页面无需刷新即可同步
   - web 改主题，dock 保持打开时也同步
4. web 暗夜视觉：
   - `Network > All` 不再发白
   - `Explore` 左侧 `New Chat` 不再发白
   - Kimi badge light/dark 字色符合预期

### 5.3 P1：决定 RC tag / release 节奏
当前版本已经收敛到 `1.2.0-rc.7`，下一位接手者需要确认：
1. 先走 PR review，再打 `v1.2.0-rc.7` annotated tag
2. 还是只保留分支和 PR，等更多修复并入后再统一打 tag

如果要发 RC，需保证：
- `frontend/package.json` 当前版本与 tag 完全一致
- GitHub Release 文案同步引用本轮 4 个 commit

---

## 6. 风险与注意事项
1. 本轮已经把分支 rebase 到新 `origin/main`；继续工作时不要再回到旧本地 `main` 上提交。
2. `packages/vesti-ui/src/dashboard.tsx` 是最近最容易冲突的文件，因为远端也刚改过 dashboard open-tab 逻辑。
3. 不要把 web dashboard badge 再改回 dock 那套 soft token pill；当前产品决策是 split by surface。
4. 不要改 `frontend/src/style.css` 的全局 `accent-primary` dark token 来修这类白块；这会影响更大范围 CTA 语义。
5. `documents/prompt_engineering/*` 在 PowerShell 里可能显示乱码；这是控制台编码问题，不代表文件内容损坏。

---

## 7. 新 Codex 窗口的推荐起手式
新窗口接手时建议先跑：

```powershell
git switch fix/yuanbao-web-theme-rc7
git fetch origin
pnpm -C packages/vesti-ui build
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend build
```

然后优先做：
1. 检查 PR 是否已创建
2. 如果未创建，直接基于当前分支开 PR
3. 如果已创建，补一条 reviewer-facing update comment，说明 follow-up patch `e64c3cb`
4. 之后再做手工 smoke 和 release/tag 决策

---

## 8. 推荐给下一位 Codex 的一句话任务定义
> 基于 `fix/yuanbao-web-theme-rc7` 分支，继续完成 `v1.2.0-rc.7` 的 PR 推进、手工 smoke、必要的微小 UI/capture 回归修复，以及最终的 RC tag / GitHub Release 准备，不要重新拆分发布线。
