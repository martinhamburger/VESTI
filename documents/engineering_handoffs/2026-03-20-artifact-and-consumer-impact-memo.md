# 2026-03-20 Artifact And Consumer Impact Memo

## Scope

- `artifact.txt`
- current reader / web / export / insights / compression consumers

## Artifact Diagnosis

- Claude Artifact 已经不是普通消息正文的一部分。
- 它是独立的小型应用 DOM，具有：
  - render dimensions
  - own rich HTML tree
  - own plain-text / markdown / normalized-html candidates

## Required Capture Contract

- Artifact 必须作为 message sidecar object，而不是 AST 正文节点。
- 推荐字段：
  - `kind`
  - `label?`
  - `captureMode`
  - `renderDimensions?`
  - `plainText?`
  - `markdownSnapshot?`
  - `normalizedHtmlSnapshot?`

## Snapshot Policy

- `normalized_html_snapshot` 只对 rich-structure message / artifact-bearing message 持久化
- 不做全量消息快照

## Consumer Impact

- `reader / web / export`
  - 必须最先升级为 package-aware consumer
  - 否则 artifact / citation 只能继续退化为正文尾巴或彻底消失
- `insights / compression`
  - 当前仍高度依赖 `content_text`
  - 在下一实现阶段前，只能记录影响边界，不应假设已经具备 package-aware 输入

## Rollout Decision

- `reader + web + export` 先吃 package
- `insights + compression` 后吃 package
