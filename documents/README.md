# Documents Index

Status: Active documentation navigation entry
Audience: Engineers, QA, release owners, maintainers

## Purpose

这个 README 是仓库文档树的根索引。

当前文档结构遵循三层模型：
- `documents/` 根目录：仓库级政策与通用操作文档
- subsystem canonical directories：长期维护的工程规格、现状与运行契约
- local-only historical stores：不再公开同步到 GitHub 的私有 handoff / archive 材料

## Directory Map

### `capture_engine/`

负责 capture / parser / observer / pipeline / archival fidelity 相关文档。

Canonical examples:
- `capture_engine/README.md`
- `capture_engine/capture_engine_engineering_spec.md`
- `capture_engine/capture_engine_current_architecture.md`
- `capture_engine/capture_engine_operational_playbook.md`

### `reader_pipeline/`

负责 reader、export、compression、insights、schema-consumer contract 与时间语义相关文档。

Canonical examples:
- `reader_pipeline/README.md`
- `reader_pipeline/reader_pipeline_engineering_spec.md`
- `reader_pipeline/reader_pipeline_current_architecture.md`
- `reader_pipeline/reader_pipeline_operational_playbook.md`

### `ui_runtime/`

负责跨 sidepanel / web surface 的动态渲染治理、状态门控、过渡纪律与 entity-scoped UI state reset 规则。

Canonical examples:
- `ui_runtime/README.md`
- `ui_runtime/ui_runtime_dynamic_rendering_contract.md`
- `ui_runtime/ui_runtime_rendering_governance_checklist.md`

### `refactor_tasks/`

负责 active implementation backlog。
它不是 canonical spec source of truth，而是把跨子系统的实施任务集中在一起，方便按阶段推进。

Canonical examples:
- `refactor_tasks/README.md`
- `refactor_tasks/capture_engine_refactor_tasks.md`
- `refactor_tasks/reader_pipeline_refactor_tasks.md`
- `refactor_tasks/timestamp_semantics_rollout_tasks.md`
- `refactor_tasks/dynamic_rendering_refactor_tasks.md`

### `web_dashboard/`

负责 web dashboard / library / explore / network 的 web surface-specific 文档。
当问题上升到跨端动态渲染治理时，应以 `ui_runtime/` 为入口；`web_dashboard/` 只保留 web surface-specific contract。

### `ui_refactor/`

负责全局 UI / IA / component system / interaction architecture 文档。
动态渲染治理已迁到 `ui_runtime/`，这里继续保留全局交互与信息架构规则。

### `floating_capsule/`

负责 floating capsule 文档。

### `orchestration/`

负责 feature flag、runtime event 与 multi-agent orchestration 文档。

### `prompt_engineering/`

负责 prompt、proxy、model routing 与 prompt UI contract 文档。

### local-only historical stores

以下材料已经转为 maintainer-local，不再是 GitHub 公共文档树的一部分：

- `documents/engineering_handoffs/`：dated handoff history now private-only
- `documents/archive/`：archived documentation payload now private-only
- `documents/_local/`：maintainer-local originals and mirrors

## Root-Level Keepers

只有仓库级政策或工具文档应直接保留在 `documents/` 根目录。

当前保留：
- `README.md`
- `version_control_plan.md`
- `zip_deploy_guide.md`
- `engineering_data_management_v1_2.md`

## Placement Rules

新增文档时，优先按以下规则放置：

1. parser / DOM / capture / AST / normalization -> `capture_engine/`
2. reader / export / compression / insight / timeline / schema consumer -> `reader_pipeline/`
3. dynamic rendering / phase gating / loading-to-ready transition discipline / entity-scoped UI state reset -> `ui_runtime/`
4. cross-subsystem rollout backlog / implementation task ledger -> `refactor_tasks/`
5. web dashboard / library / explore / network surface-specific contract -> `web_dashboard/`
6. global UI / IA / component system -> `ui_refactor/`
7. prompt / proxy / model routing -> `prompt_engineering/`
8. repo-wide policy / deployment utility -> `documents/` root

不要再将 dated handoff、archive payload、prototype notes 写入公开 tracked docs tree。

## Recommended Reading Order

做当前工程工作时，推荐顺序是：

1. 子系统 README
2. 子系统 engineering spec / contract
3. 子系统 current architecture
4. 子系统 operational playbook / roadmap
5. 只有在维护者私有协作或历史追溯需要时，再看 local-only archive / handoff 材料

针对 capture engine：
1. `documents/capture_engine/README.md`
2. `documents/capture_engine/capture_engine_engineering_spec.md`
3. `documents/capture_engine/capture_engine_current_architecture.md`
4. `documents/capture_engine/capture_engine_operational_playbook.md`

针对 reader pipeline：
1. `documents/reader_pipeline/README.md`
2. `documents/reader_pipeline/reader_pipeline_engineering_spec.md`
3. `documents/reader_pipeline/reader_pipeline_current_architecture.md`
4. `documents/reader_pipeline/reader_pipeline_operational_playbook.md`

针对动态渲染治理：
1. `documents/ui_runtime/README.md`
2. `documents/ui_runtime/ui_runtime_dynamic_rendering_contract.md`
3. `documents/ui_runtime/ui_runtime_rendering_governance_checklist.md`
4. `documents/refactor_tasks/dynamic_rendering_refactor_tasks.md`

## Naming Guidance

推荐模式：
- canonical spec: `<topic>_engineering_spec.md`
- current baseline: `<topic>_current_architecture.md`
- runtime contract: `<topic>_contract.md`
- playbook: `<topic>_operational_playbook.md`
- roadmap: `<topic>_technical_roadmap.md`
- task ledger: `<topic>_refactor_tasks.md`

目标不是形式统一，而是让文档入口清晰、层次稳定、公开边界明确。
