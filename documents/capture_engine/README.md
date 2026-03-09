# Capture Engine Documentation Package

Status: Active canonical documentation tree for capture, parser, and semantic extraction work  
Audience: Parser maintainers, runtime engineers, QA, release owners

## Purpose

`documents/capture_engine/` is the source of truth for capture/parser engineering work.

It owns:
- platform parser strategy
- DOM boundary and normalization rules
- shared semantic extraction guidance
- capture debugging and acceptance guidance
- parser/runtime-adjacent hardening retrospectives and refactor roadmaps

It does not own:
- web dashboard productization specs
- global UI/IA/component contracts
- dated delivery snapshots

## Current source-of-truth docs

- `v1_2_capture_governance_spec.md`
- `v1_3_platform_expansion_spec.md`
- `capture_debugging_playbook.md`
- `manual_sampling_and_acceptance.md`
- `v1_4_capture_engine_hardening_retrospective.md`
- `v1_5_capture_engine_refactor_roadmap.md`

## Supplemental legacy material

- `parser_debug_playbook_legacy.md`
  - parser-only legacy troubleshooting supplement preserved for traceability and older debugging flows

## Recommended reading order

1. `v1_2_capture_governance_spec.md`
2. `v1_3_platform_expansion_spec.md`
3. `capture_debugging_playbook.md`
4. `manual_sampling_and_acceptance.md`
5. hardening retrospective / refactor roadmap docs
