# Reader Pipeline Refactor Tasks

Status: Active task ledger  
Audience: Reader maintainers, export/compression owners, web contributors

## Goal

把 reader pipeline 从“各 consumer 各自有一套时间和结构逻辑”的状态，
推进到共享 conversation package 与统一时间语义的状态。

## Track 1. Shared Timestamp Helpers

- 所有 consumer 统一复用 `originAt / captureFreshnessAt / recordModifiedAt`
- timeline / list / weekly chronology 统一按 `originAt`
- 卡片副文案统一按 `captureFreshnessAt`

## Track 2. Reader and Web Parity

- sidepanel reader header 与 web reader header 对齐
- web library 列表时间口径与 sidepanel 对齐
- 清理 prototype 中的硬编码日期与旧类型漂移
- web 不再继续维持纯文本 reader；必须复用同一套 rich renderer contract

## Track 3. Export and Compression Alignment

- JSON / MD / TXT 输出新时间字段与新文案
- compression / summary / weekly prompt 全部接入 `originAt`
- 不再让 `updated_at` 继续充当线程起点

## Track 3.1 Export As First Package-Aware Consumer

- export 最先完整消费 `semantic_ast_v2 / citations[] / artifacts[]`
- 导出标题依赖 app-shell metadata，而不是正文最大标题
- MD / TXT 为每条消息单独输出 `Sources` 与 `Artifacts` 区
- JSON 原样带出 message package，不再只做 AST 扩展

## Track 4. Structure Fidelity Expansion

- AST consumer 为 attachment / artifact / citation 预留一致渲染策略
- export consumer 为这些结构预留明确表达方式
- insights/search 逐步从 text-centric 迈向 package-centric

## Track 4.1 Reader Contract Expansion

- `semantic_ast_v2`
  - 表格列对齐
  - 单元格内 math/code/inline emphasis
- `citations[]`
  - message-level `Sources` disclosure
- `artifacts[]`
  - message-level `Artifacts` disclosure / 占位卡

## Track 5. Insights / Compression Compatibility Phase

- 在真正 package-aware 之前，显式记录 text-centric 依赖点
- `content_text` 被收紧为 canonical plain text 后，重新评估：
  - sentence splitting
  - transcript compaction
  - reusable artifact heuristics
  - summary prompt grounding
- 不把 `citations[] / artifacts[]` 强行塞进 prompt，先定义影响边界

## Current Slice Recommendation

当前建议顺序：

1. 统一 helper 与 schema / 类型
2. `reader / web / export`
3. `citations[] / artifacts[] / semantic_ast_v2` 的 renderer contract
4. `insights / compression` 兼容阶段
