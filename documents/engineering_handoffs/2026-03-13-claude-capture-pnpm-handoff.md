# 2026-03-13 交接：Claude 捕获稳健性 + pnpm workspace 收口

## 背景与目标
- 收口捕获门槛：URL 会话 id 稳定 + 非生成中
- Claude 正文解析优先与净化
- pnpm workspace + 单一锁文件落地

## 变更摘要
### 代码
- capturePipeline：会话 id 为空或生成中直接跳过捕获，并记录轻量日志。
- ClaudeParser：优先解析 `.standard-markdown` / `.progressive-markdown`，新增正文净化与噪声过滤，AST 基于净化快照，避免空引用。

### 工程与依赖
- 新增 `pnpm-workspace.yaml`，统一 workspace 定义。
- 仅保留根目录 `pnpm-lock.yaml`，删除所有 `package-lock.json` 与子目录 `pnpm-lock.yaml`。
- `frontend` 的 `prebuild` 改为根目录安装，并去掉 `--ignore-scripts`。

### 文档
- `documents/version_control_plan.md`：新增 pnpm 规则、更新检查清单与日期。
- `documents/engineering_handoffs/build_cross_platform_checklist.md`：锁文件与构建命令收口。
- `README.md`：构建命令更新为 `pnpm -C frontend ...`。
- 新增备忘录：`2026-03-13-pnpm-build-scripts-warning-memo.md`。

## 构建与验证
- `pnpm install --no-frozen-lockfile` + `pnpm install --frozen-lockfile` 通过（pnpm v10.29.2）。
- `pnpm rebuild` 已执行。
- `pnpm -C frontend build` 成功（Plasmo）。
- `pnpm -C vesti-web build` 成功（Next.js）。
- 扩展产物路径：`frontend/build/chrome-mv3-prod`。
- `pnpm approve-builds` 显示无待批准项。

## 已知警告与风险
- `svgo` peer mismatch：`htmlnano` 期望 `svgo@^3`，实际为 `2.8.x`（由 parcel/svgr 链路带入）。当前构建通过，但属于潜在兼容风险。
- 若再次引入 `--ignore-scripts`，会恢复 build scripts 忽略提示。
- 根 `package.json` 仍保留 `workspaces` 字段（pnpm 实际读取 `pnpm-workspace.yaml`，可选清理）。

## 建议后续
- 评估是否升级 parcel/htmlnano/svgo 或添加 peer ignore 规则以消除警告。
- 如需严格安全控制，维护 `pnpm approve-builds` 的放行清单。

## 关键文件
- `frontend/src/lib/core/pipeline/capturePipeline.ts`
- `frontend/src/lib/core/parser/claude/ClaudeParser.ts`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `documents/version_control_plan.md`
- `documents/engineering_handoffs/build_cross_platform_checklist.md`
- `README.md`
- `documents/engineering_handoffs/2026-03-13-pnpm-build-scripts-warning-memo.md`
