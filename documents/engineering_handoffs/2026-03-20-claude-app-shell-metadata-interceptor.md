# 2026-03-20 Claude App Shell Metadata Interceptor

## Summary

- `claude.txt` 证明当前 Claude 标题误捕获不是正文 parser 精度问题，而是 app shell 与 content payload 未分层。
- 正文中的 Markdown `<h1>` 之所以能劫持标题，是因为当前链路仍允许 generic `h1 / largest-text` 搜索在 app shell selector 之前运行。

## Diagnosis

- Claude 页面至少存在三类高语义权重文本：
  - 顶部 app header title
  - 左侧 active sidebar title
  - 正文 message stream 中的结构化 `<h1>`
- 这三者在视觉层都可能看起来“像标题”，但只有前两者属于 conversation metadata。
- 因此 conversation title 的提取必须成为一个独立 stage，而不是 message parser 的附属逻辑。

## Required Governance

- 增加 `App Shell Interceptor`
  - title
  - session identity
  - page-level status
- 该 stage 必须在 message stream parsing 前执行。
- generic `h1 / largest-text` 只能作为 app-shell selector 失效后的最终 fallback。

## Consequence

- 只要不前置 app shell interception，后续即使 AST、citation、artifact 全部做对，conversation metadata 仍可能被正文 payload 越权覆盖。
