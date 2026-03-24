# Documents Archive

Status: Active archive index
Audience: Maintainers, release owners, engineers performing historical lookup

## Purpose

`documents/archive/` 用于保留仍有追溯价值、但不再是当前 source of truth 的文档。

归档内容包括：
- 退役的 root-level planning notes
- 历史阶段 brief / execution log / checklist
- 被 canonical 子系统目录替代的旧 spec
- 仍有参考价值的 cheat sheet 与 legacy playbook

## Rules

- archive 只负责保留历史，不负责当前实现决策
- 文档迁入 archive 后，活入口必须由 canonical 目录或 `documents/README.md` 承担
- 历史文件尽量保留原文件名，方便追溯

## Structure

### `legacy_root/`

历史上曾放在 `documents/` 根目录、现在不应继续停留在根目录的资料。

### `candidate_drafts/`

候选方案、探索稿、未成为 canonical entrypoint 的设计备选。

### `capture_engine/`

capture engine 历史资料。

推荐子目录：
- `superseded_specs/`
- `legacy_playbooks/`
- `execution_logs/`
- `sampling_checklists/`

### `reader_pipeline/`

reader pipeline 历史资料。

推荐子目录：
- `superseded_specs/`
- `legacy_playbooks/`
- `reference_cheat_sheets/`

## How To Use Archive Material

适用场景：
- 追溯旧决策的来源
- 理解系统演进路径
- 对照 canonical 文档收口前后的差异

不适用场景：
- 直接回答“当前规格是什么”
- 作为当前实现的默认入口
