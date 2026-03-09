# Prompt Engineering Documentation Package

Status: Active canonical documentation tree for prompt, proxy, and prompt-UI interaction work  
Audience: Prompt engineers, frontend engineers, release owners

## Purpose

`documents/prompt_engineering/` is the source of truth for prompt-as-code contracts, prompt schema safety, model/proxy routing notes, and prompt-linked UI engineering guidance.

It owns:
- prompt-as-code contracts
- prompt schema drift gates
- model and proxy interface notes
- prompt skill docs that are still operational references
- prompt/UI interaction guidance

It does not own:
- parser normalization strategy
- dashboard runtime contracts
- dated handoff snapshots unless directly promoted here

## Current source-of-truth docs

- `v1_7_prompt_as_code_contract.md`
- `v1_7_prompt_schema_drift_gate.md`
- `embedding_proxy_contract_v2_0.md`
- `insights_prompt_ui_engineering.md`
- `model_settings.md`

## Supporting operational docs

Skill docs such as `thread-summary-skill.md`, `weekly-digest-skill.md`, `synthesis_skill.md`, and `compaction-skill.md` remain valid operational references under this directory.
