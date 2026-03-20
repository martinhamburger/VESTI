# 2026-03-20 Rich Structure Contract Synthesis

## Scope

- `table.txt`
- `search.txt`

## Table Findings

- Claude：标准原生 `<table>`
- Qwen：标准 `<table>`，但有更深包裹、列对齐与单元格内 KaTeX
- Doubao：伪表格，需要 platform-local normalization
- ChatGPT：表格中 KaTeX 渲染层会制造文本重影

## Contract Consequence

- 现有 `headers: string[] + rows: string[][]` 不足以表达跨平台真实结构。
- 下一阶段必须升级为 `semantic_ast_v2`：
  - `AstTableNodeV2`
  - `columns[]` with alignment
  - `rows[]`
  - `cells[]` with inline-rich children

## Math Findings

- KaTeX / MathML 渲染层会污染 `innerText / textContent`
- 语义 truth source 必须来自：
  - `annotation[encoding="application/x-tex"]`
  - MathML / vendor semantic attributes

## Citation Findings

- citation pill 是 inline component，不是块级 thinking
- 必须对正文根做 clone，再物理剔除 citation node
- `label / href` 都必须微观清洗

## Contract Consequence

- `citations[]` 必须成为 message sidecar
- citation 不进入正文 AST 主干
- reader / web / export 必须用独立 `Sources` 区表达 citation
