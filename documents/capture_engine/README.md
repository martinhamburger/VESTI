# Capture Engine Documentation Package

Status: Active canonical documentation tree for capture, parser, and conversation archival work  
Audience: Parser maintainers, runtime engineers, QA, release owners, reader/export pipeline contributors

## Purpose

`documents/capture_engine/` 是 capture engine 的唯一 current source of truth。

本目录负责：
- capture / parser / observer / pipeline 的工程边界
- DOM discovery、boundary inference、platform normalization、shared extraction 的规范
- capture 到 reader / export / compression / search 的信息保真目标
- 采样、调试、验收与 release gate 的统一操作规则

本目录不负责：
- web dashboard 产品化规格
- 全局 UI / IA / component system 契约
- 带日期的 handoff 快照

## Canonical Docs

- `capture_engine_engineering_spec.md`
  - 主规格。定义 capture engine 的目标、非协商原则、目标内容包 contract 与推荐分层架构。
- `capture_engine_current_architecture.md`
  - 当前实现诊断。解释哪些边界已经合理，哪些 parser 仍然偏 ad hoc，以及离目标架构还有多远。
- `capture_engine_operational_playbook.md`
  - 操作文档。统一 DOM 采样模板、fault taxonomy、QA matrix、证据包与 release gate。

## Recommended Reading Order

1. `capture_engine_engineering_spec.md`
2. `capture_engine_current_architecture.md`
3. `capture_engine_operational_playbook.md`

## Historical Migration Note

旧版 `v1_2_*`、`v1_3_*`、`v1_4_*`、`v1_5_*` spec、legacy playbook、manual sampling checklist 与 execution log 现已转为 maintainer-local archive。

这些材料不再作为 GitHub 公开仓库的一部分同步，也不再作为当前实现决策的 source of truth。

如果确实需要追溯历史上下文，请从 maintainer-local archive 查阅原始材料，并把仍然 durable 的结论回写到当前 canonical docs，而不是重新依赖历史 payload。
