---
name: vesti-markdown-writing
description: README/Markdown 排版与编码 SOP（保留原文、结构化分段、徽章/表格规范、UTF-8 BOM）
---

# Vesti Markdown Writing Skill

## 适用范围

用于 README / Docs 的排版与编码规范执行，强调不改写原文，只做结构化排版。

## 必须遵守（Do）

- 原文不删改、不改写，保持语义与用词完全一致
- 必须保留段落与空行，避免压缩成单段
- H2 使用 Emoji；H3 简洁、不要加粗
- 徽章必须使用 `style=flat-square` 且按指定色值
- Tech Stack 必须用 HTML 表格
- 所有中文文档输出为 UTF-8 BOM（Windows 兼容）

## 禁止项（Don’t）

- 禁止合并段落导致“挤在一起”
- 禁止随意换字、删句或改写原文
- 禁止使用默认亮色徽章或非指定配色
- 禁止用无序列表替代要求的 HTML 表格

## 校验清单

- README 渲染后段落层级清晰、无挤压
- BOM 生效（Windows/IDE 打开无 ??? 乱码）
- 徽章样式与色值正确
- Tech Stack 表格已插入且对齐清晰
