# Reader Pipeline Documentation Package

Status: Active canonical documentation tree for reader pipeline and schema evolution work  
Audience: Reader maintainers, data pipeline engineers, QA

## Purpose

`documents/reader_pipeline/` is the source of truth for reader/data-pipeline evolution that sits between capture output and reader/rendered consumption.

It owns:
- schema and migration specs
- pipeline dual-track contracts
- fallback/performance rules
- reader pipeline acceptance guidance
- AST probe quick-reference material

It does not own:
- raw parser DOM normalization
- web dashboard product specs
- historical handoff snapshots

## Current source-of-truth docs

- `v1_6_data_pipeline_dual_track_spec.md`
- `v1_6_schema_v5_migration_spec.md`
- `v1_6_performance_fallback_spec.md`
- `v1_6_manual_sampling_and_acceptance.md`
- `v1_6_ast_probe_cheat_sheet.md`
