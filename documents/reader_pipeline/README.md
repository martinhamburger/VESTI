# Reader Pipeline Documentation Package

Status: Active canonical documentation tree for reader, export, compression, insights, and schema-consumer evolution  
Audience: Reader maintainers, data pipeline engineers, web/dashboard contributors, QA

## Purpose

`documents/reader_pipeline/` 是 reader / data-pipeline 方向的 current source of truth。
它负责回答：

- capture 持久化结果进入 reader / export / compression / insights / web 之后的消费规范
- conversation package 与时间语义
- reader / data schema 的演进边界
- 迁移、验收、回归操作口径

它不负责：

- 原始 DOM discovery 和 parser normalization 细节
- capture governance 模式本身
- dated handoff 快照

## Canonical Docs

- `reader_pipeline_engineering_spec.md`
  - 主规格。定义 reader pipeline 的目标、共享 content package、统一时间语义和各消费端规则
- `reader_pipeline_current_architecture.md`
  - 只读诊断。解释当前 reader / export / compression / insights / web 链路哪些边界已经合理，哪些地方仍在漂移
- `reader_pipeline_operational_playbook.md`
  - 操作文档。统一迁移验证、reader fidelity 检查、导出检查、时间语义回归和 release gate

## Recommended Reading Order

1. `reader_pipeline_engineering_spec.md`
2. `reader_pipeline_current_architecture.md`
3. `reader_pipeline_operational_playbook.md`

## Historical Migration Note

旧版 `v1_6_*` spec、manual sampling 与 AST cheat sheet 现已转为 maintainer-local archive。

这些材料不再作为 GitHub 公开仓库的一部分同步，也不再作为当前实现决策的 source of truth。

若需要历史追溯，请从 maintainer-local archive 查阅原始材料，并将仍然 durable 的规则吸收到当前 canonical docs，而不是继续引用历史 payload。
