# 2026-03-20 Citation Governance Unification

## Summary

- Network-search citation pills are no longer treated as reader-tail text.
- This line adopts `clean body + structured sources` as the canonical policy.

## Policy

- `ChatGPT`
  - extract `webpage-citation-pill` into structured message citations
  - remove citation pill text from message body before `content_text` / AST extraction
- `Qwen / Doubao`
  - remove search-card / reference-count style UI noise from body
  - do not persist citation metadata in this round
- `Reader`
  - render sources in a dedicated folded `Sources` section, not inline with正文
- `Export`
  - JSON carries citations as message metadata
  - MD / TXT append a dedicated `Sources` section per message when present

## Deferred

- Citation metadata extraction for Claude / Gemini / DeepSeek / Kimi / Yuanbao
- Search / compression consumption of `citations[]`
- Repair migration for historically polluted message bodies
