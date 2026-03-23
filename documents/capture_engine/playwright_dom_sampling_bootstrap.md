# Playwright DOM Sampling Bootstrap

Status: Public bootstrap summary  
Audience: Maintainers and operators collecting DOM evidence

## Purpose

This public document keeps only the reusable workflow needed to understand how DOM sampling fits into the repo.
Machine-specific auth layout, local config, and operator source paths are intentionally kept in the local-only copy:

- `documents/_local/capture_engine/playwright_dom_sampling_bootstrap.local.md`

## Supported Login Targets

1. ChatGPT
2. Claude
3. Gemini
4. DeepSeek
5. Qwen
6. Doubao
7. Kimi
8. Yuanbao

## Public Workflow

1. Install dependencies.
2. Run the auth bootstrap command.
3. Complete login manually on the required sites.
4. Export reusable state if the local workflow needs it.
5. Run the sampling command against the target conversation URL.
6. Register the resulting evidence through a stable case ID or local evidence handle.

## Public Contract

- auth reuse is part of the local operator workflow
- sampled HTML and screenshots are the evidence surface for parser work
- tracked docs should reference case IDs and logical handles, not raw local sample paths

## Notes

- A persistent local auth workspace may exist, but its layout is intentionally not mirrored into tracked docs.
- High-friction sites may still require manual operator confirmation even when local auth reuse exists.
- Public regression docs should point to case IDs and let the local source map resolve the concrete files.