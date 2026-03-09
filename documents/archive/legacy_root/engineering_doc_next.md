# Vesti MVP 下一阶段工程安排（Plasmo 集成版）

版本：v0.1
时间表达：Day 0 / Day 1 / Day 2（相对时间）
范围声明：Local-First；仅 ChatGPT + Claude 捕获；Gemini / DeepSeek 仅 UI 占位

---

## 1) 当前状态快照（Status Snapshot）
- OK 前端 UI 稳定、样式锁定
- OK ChatGPT 选择器验证：`[data-testid^="conversation-turn"]`
- OK Claude 选择器验证：`[data-testid*="message"]`
- TODO 待完成：Parser 更新、Plasmo 集成、真实数据链路、LLM Insights 接入

---

## 2) MVP 范围与非目标
**Must**
- ChatGPT/Claude 捕获 → IndexedDB → UI 展示
- ModelScope 摘要/周报（Insights + 设置）

**Won’t**
- Gemini / DeepSeek 后端捕获
- 云端同步 / 多设备
- i18n

---

## 3) 路线图（Day 0–Day 2）

### Day 0（选择器落地 + Parser 更新）
**任务**
- 更新 ChatGPT / Claude Parser 的选择器映射表
- 增加 fallback selector（可选）

**验收**
- Console 输出解析到的消息数量与文本片段

### Day 1（Plasmo 集成 + 数据链路打通）
**任务**
- 迁移 `v0-core-engine/src` → `Plasmo/src/lib`
- 新建 `src/contents/chatgpt.ts` / `src/contents/claude.ts`
- Background + Offscreen 接入
- UI 替换 `mockService` → `storageService`

**验收**
- Timeline 显示真实会话卡片

### Day 2（LLM Insights + 验收）
**任务**
- Settings 页面：ModelScope 配置存储
- Insights 页面：摘要 / 周报生成 + 缓存展示

**验收**
- 端到端链路可用（见验收标准）

---

## 4) 实施映射表（目录与文件）
- `v0-core-engine/src/background/router.ts` → `Plasmo/src/background/index.ts`
- `v0-core-engine/src/offscreen/index.ts` → `Plasmo/src/offscreen/index.ts`
- `v0-core-engine/src/core/*` → `Plasmo/src/lib/core/*`
- `v0-core-engine/src/db/*` → `Plasmo/src/lib/db/*`
- `mockService` → `storageService`（前端所有调用点）

---

## 5) 验收标准（Acceptance Criteria）
- ChatGPT / Claude 页面触发后 **会话数与消息数正确增长**
- Timeline / Reader / Dashboard 能读到真实数据
- 去重与增量更新生效（会话数不重复）
- Insights 页面能生成摘要与周报并缓存

---

## 6) 风险与应对
- 选择器失效 → 主/备选策略 + 快速修复流程
- Offscreen 生命周期 → `ensureOffscreenExists()` 先行检查
- 流式输出误捕获 → debounce 时间可调
- IndexedDB 并发写入 → message_count 对比增量

---

## 7) 关键命令清单
- `npm install` / `pnpm install`
- `npm run dev`
- `npm run typecheck`（若有）

**浏览器侧验证步骤**
- ChatGPT：打开任意对话页 → Console 运行选择器测试
- Claude：打开任意对话页 → Console 运行选择器测试

---

## 8) 测试用例与场景
- **Parser**：选中对话、解析消息文本片段
- **Capture**：新增消息后 message_count 增长
- **UI**：Timeline 显示真实会话；Reader 显示真实消息
- **Insights**：无 API Key → 提示；有 Key → 可生成

---

## 9) 备注
- 所有安排以 Local-First 原则为底线
- Gemini / DeepSeek 继续保持 UI 占位，后端接入后置

---

## 10) 版本治理与发布流程（自 v1.0.0 起）

- 后续开发统一使用分支流：`feature/*`、`fix/*`、`docs/*`、`chore/*`，禁止直接在 `main` 开发。
- 发布流程与命名规范以 `documents/version_control_plan.md` 为唯一准则。
- 每次发布前必须同步完成两件事：
  - 更新 `CHANGELOG.md`（整理 `Unreleased` -> 目标版本）
  - 对齐 `frontend/package.json` 的 `version` 与目标 Git tag
- 发布标签统一使用 annotated tag（`git tag -a`），禁止覆盖已发布 tag。
- 交付包归档到 `release/`，建议命名 `Vesti_MVP_vX.Y.Z.zip`。
