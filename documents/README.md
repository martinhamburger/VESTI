# Documents Index

Status: Active documentation navigation entry  
Audience: Engineers, QA, release owners, maintainers

## Purpose

This file is the root index for the repository documentation tree.

The repository documentation now follows a three-layer model:
- `documents/` root for repository-wide policy and utility docs
- subsystem canonical directories for long-lived engineering specs
- `documents/archive/` for historical snapshots, drafts, and retired stage material

This root README answers four questions quickly:
1. where a topic should be documented
2. which directory is the source of truth for that topic
3. how to distinguish canonical docs from handoffs and archived material
4. how release versions differ from documentation phases

## Version governance for docs

Documentation must not reuse product release tags as its primary naming system.

### Release versions

Release versions remain:
- `vX.Y.Z`
- `vX.Y.Z-rc.N`

These are the only authoritative product release identifiers.
They must stay aligned with:
- Git tags
- `frontend/package.json`
- `CHANGELOG.md`

### Canonical document naming

Canonical engineering docs should prefer topic-based names such as:
- `<topic>_engineering_spec.md`
- `<topic>_current_architecture.md`
- `<topic>_technical_roadmap.md`
- `<topic>_repairs.md`

Version or phase information should live in document metadata, for example:
- `Status`
- `Version`
- `Phase`
- `Last Updated`

### Legacy version-prefixed docs

Existing version-prefixed files such as `v1_4_*`, `v1_5_*`, and `v1_8_*` remain valid historical and operational material.
They are not being batch-renamed in this cleanup.
However, new canonical docs should not continue that pattern unless there is a strong reason.

## Directory map

### `capture_engine/`
Owns capture/parser/runtime-adjacent documentation.

Use this for:
- parser strategy
- DOM extraction and normalization
- semantic extraction and AST concerns
- capture debugging playbooks
- capture sampling and acceptance
- parser/runtime refactor roadmaps

Canonical examples:
- `capture_engine/v1_2_capture_governance_spec.md`
- `capture_engine/v1_3_platform_expansion_spec.md`
- `capture_engine/v1_4_capture_engine_hardening_retrospective.md`
- `capture_engine/v1_5_capture_engine_refactor_roadmap.md`

### `web_dashboard/`
Owns web dashboard engineering and technical specifications.

Use this for:
- dashboard / library / explore / network engineering boundaries
- current web architecture and data/message flow
- web-view-specific repair records
- forward roadmap for web surfaces

Canonical examples:
- `web_dashboard/web_dashboard_engineering_spec.md`
- `web_dashboard/web_dashboard_current_architecture.md`
- `web_dashboard/web_dashboard_rc8_repairs.md`
- `web_dashboard/web_dashboard_technical_roadmap.md`

### `ui_refactor/`
Owns global UI, IA, and component-system specifications.

Use this for:
- sidepanel IA and route contracts
- component-system and token contracts
- UI sampling / acceptance rules
- cross-surface UI refactor specs

### `reader_pipeline/`
Owns reader/data-pipeline docs related to schema, fallback, migration, and pipeline evolution.

### `floating_capsule/`
Owns floating capsule specs, state-machine contracts, and acceptance guidance.

### `orchestration/`
Owns feature-flag, runtime event, and multi-agent orchestration design.

### `prompt_engineering/`
Owns prompt, model-routing, proxy-contract, and prompt-UI interaction docs.

### `engineering_handoffs/`
Owns dated delivery snapshots and handoff context.

Important rule:
- this directory is valuable historical evidence
- it is not the preferred place to discover current canonical specifications
- when a handoff grows into long-lived guidance, that guidance should be promoted into a canonical directory above

### `archive/`
Owns retired root documents, candidate drafts, and legacy stage material.

Important rule:
- archive preserves history
- archive is not source of truth for current implementation decisions
- documents move here instead of being hard-deleted during structure cleanup

## Root-level standalone files

Only repository-wide policy or utility docs should remain directly under `documents/`.

Current root-level keepers:
- `README.md`
- `version_control_plan.md`
- `zip_deploy_guide.md`
- `engineering_data_management_v1_2.md`

`engineering_data_management_v1_2.md` is currently treated as a transitional canonical document.
If data-management documentation grows further, it should move into a dedicated subsystem directory in a later cleanup.

## Placement rules

When adding a new document, use these rules:

1. Parser / DOM / capture / AST / normalization -> `capture_engine/`
2. Web dashboard / Library / Explore / Network / dashboard runtime contract -> `web_dashboard/`
3. Global UI / IA / component system / interaction contract -> `ui_refactor/`
4. Prompt / proxy / model routing / prompt UI contract -> `prompt_engineering/`
5. Dated delivery snapshot or branch handoff -> `engineering_handoffs/`
6. Historical draft, superseded note, or retired stage brief -> `archive/`
7. Repository-wide policy or deployment utility -> `documents/` root

## Reading order

For current product engineering work, the recommended order is:
1. subsystem canonical directory README (if present)
2. subsystem engineering spec
3. subsystem current architecture / contract docs
4. subsystem repair or roadmap docs
5. only then consult dated handoffs for historical context
6. consult archive only when historical reconstruction is required

## Current canonical entrypoints

- Capture / parser work: `documents/capture_engine/`
- Web dashboard work: `documents/web_dashboard/`
- UI refactor work: `documents/ui_refactor/`
- Prompt / proxy work: `documents/prompt_engineering/`
- Runtime orchestration work: `documents/orchestration/`

## Naming guidance

Use these patterns when possible:
- canonical spec: `<topic>_engineering_spec.md`
- current baseline: `<topic>_current_architecture.md`
- repair ledger: `<topic>_<release>_repairs.md` or `<topic>_repairs.md`
- roadmap: `<topic>_technical_roadmap.md`
- dated handoff: `YYYY-MM-DD-<topic>-handoff.md`
- archived historical file: preserve original filename when possible

The goal is not rigid uniformity; the goal is discoverability.

---

# 文档索引（中文版）

状态：当前有效的文档导航入口  
受众：工程师、QA、发布负责人、维护者

## 目的

本文件是仓库文档树的根索引。

当前仓库文档采用三层结构：
- `documents/` 根目录：仓库级政策与工具型文档
- 各子系统 canonical 目录：长期维护的主规格目录
- `documents/archive/`：历史快照、草稿与已退役阶段材料

这个根 README 主要回答四个问题：
1. 某个主题应该写到哪里
2. 哪个目录是该主题的 source of truth
3. 如何区分 canonical 文档、handoff 和 archive 材料
4. 如何区分 release 版本号与文档阶段号

## 文档版本治理

文档命名不应再把产品 release tag 当作主要命名体系。

### 发布版本

发布版本继续使用：
- `vX.Y.Z`
- `vX.Y.Z-rc.N`

它们是唯一权威的产品发布标识，必须与以下内容保持一致：
- Git tag
- `frontend/package.json`
- `CHANGELOG.md`

### Canonical 文档命名

Canonical 工程文档优先采用主题名命名，例如：
- `<topic>_engineering_spec.md`
- `<topic>_current_architecture.md`
- `<topic>_technical_roadmap.md`
- `<topic>_repairs.md`

版本或阶段信息应写在正文元信息中，例如：
- `Status`
- `Version`
- `Phase`
- `Last Updated`

### 旧版带版本前缀文档

现有带版本前缀的文件，例如 `v1_4_*`、`v1_5_*`、`v1_8_*`，仍然是有效的历史/运行资料。
本轮不会批量改名。
但除非有充分理由，新的 canonical 文档不应继续扩散这一命名模式。

## 目录地图

### `capture_engine/`
负责 capture / parser / runtime 邻接层文档。

适用范围：
- parser 策略
- DOM 提取与结构归一化
- semantic extraction 与 AST 相关问题
- capture 调试 playbook
- capture 手测与验收规范
- parser/runtime 重构路线图

Canonical 示例：
- `capture_engine/v1_2_capture_governance_spec.md`
- `capture_engine/v1_3_platform_expansion_spec.md`
- `capture_engine/v1_4_capture_engine_hardening_retrospective.md`
- `capture_engine/v1_5_capture_engine_refactor_roadmap.md`

### `web_dashboard/`
负责 web dashboard 的工程与技术规格。

适用范围：
- dashboard / library / explore / network 的工程边界
- 当前 web 架构与数据/消息流
- web 视图特有的修复记录
- web surfaces 的前向路线图

Canonical 示例：
- `web_dashboard/web_dashboard_engineering_spec.md`
- `web_dashboard/web_dashboard_current_architecture.md`
- `web_dashboard/web_dashboard_rc8_repairs.md`
- `web_dashboard/web_dashboard_technical_roadmap.md`

### `ui_refactor/`
负责全局 UI、信息架构与组件系统规格。

适用范围：
- sidepanel IA 与 route contract
- 组件系统与 token contract
- UI 手测 / 验收规则
- 跨界面的 UI 重构规格

### `reader_pipeline/`
负责 reader/data-pipeline 相关的 schema、fallback、migration 与 pipeline 演进文档。

### `floating_capsule/`
负责 floating capsule 的规格、状态机契约与验收指引。

### `orchestration/`
负责 feature flag、runtime event 与 multi-agent orchestration 设计。

### `prompt_engineering/`
负责 prompt、model routing、proxy contract 与 prompt-UI interaction 文档。

### `engineering_handoffs/`
负责带日期的交付快照与 handoff 上下文。

重要规则：
- 该目录是重要的历史证据
- 它不是发现当前 canonical 规格的首选入口
- 当某份 handoff 演变成长期有效的知识时，应将其提升并重写到上面的 canonical 目录中

### `archive/`
负责已退役的根目录文档、候选草稿与历史阶段材料。

重要规则：
- archive 用于保留历史
- archive 不是当前实现决策的 source of truth
- 结构收口时，文档优先迁入这里，而不是直接硬删除

## 根目录独立文档

只有仓库级政策或工具型文档应直接保留在 `documents/` 根目录下。

当前根目录保留文件：
- `README.md`
- `version_control_plan.md`
- `zip_deploy_guide.md`
- `engineering_data_management_v1_2.md`

`engineering_data_management_v1_2.md` 当前被视为一份 transitional canonical 文档。
如果后续数据治理文档继续增长，应在下一轮清理中迁入专门的子系统目录。

## 放置规则

新增文档时，使用以下规则：

1. Parser / DOM / capture / AST / normalization -> `capture_engine/`
2. Web dashboard / Library / Explore / Network / dashboard runtime contract -> `web_dashboard/`
3. 全局 UI / IA / component system / interaction contract -> `ui_refactor/`
4. Prompt / proxy / model routing / prompt UI contract -> `prompt_engineering/`
5. 带日期的交付快照或分支 handoff -> `engineering_handoffs/`
6. 历史草稿、被替代说明或已退役阶段 brief -> `archive/`
7. 仓库级政策或部署工具文档 -> `documents/` root

## 推荐阅读顺序

进行当前产品工程工作时，推荐按以下顺序阅读：
1. 子系统 canonical 目录 README（如果存在）
2. 子系统 engineering spec
3. 子系统 current architecture / contract 文档
4. 子系统 repairs 或 roadmap 文档
5. 最后再查 dated handoff 获取历史上下文
6. 只有在需要追溯历史时才查 archive

## 当前 canonical 入口

- Capture / parser 工作：`documents/capture_engine/`
- Web dashboard 工作：`documents/web_dashboard/`
- UI refactor 工作：`documents/ui_refactor/`
- Prompt / proxy 工作：`documents/prompt_engineering/`
- Runtime orchestration 工作：`documents/orchestration/`

## 命名指引

尽量采用以下模式：
- canonical spec：`<topic>_engineering_spec.md`
- current baseline：`<topic>_current_architecture.md`
- repair ledger：`<topic>_<release>_repairs.md` 或 `<topic>_repairs.md`
- roadmap：`<topic>_technical_roadmap.md`
- dated handoff：`YYYY-MM-DD-<topic>-handoff.md`
- archived historical file：尽可能保留原始文件名

目标不是追求僵硬统一，而是提高可发现性。
