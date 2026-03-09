# Engineering Handoffs Index

Status: Active historical handoff directory  
Audience: Maintainers, release owners, engineers reconstructing prior decisions

## Purpose

`documents/engineering_handoffs/` stores dated handoff notes, branch snapshots, rollout memos, and release-transition context.

This directory is important historical evidence, but it is not the canonical entrypoint for current subsystem specs.

## What belongs here

- dated branch handoffs
- release-transition notes
- implementation snapshots taken at a specific moment in time
- historical architecture memos that have not yet been promoted into canonical subsystem docs

## What does not belong here

- the current source of truth for capture/parser specs
- the current source of truth for web dashboard engineering
- long-lived UI/component contracts

## How to read handoff docs

Use a handoff to understand:
- what changed at a specific time
- why a branch or release was structured a certain way
- what evidence existed during that release window

Then consult canonical directories such as:
- `documents/capture_engine/`
- `documents/web_dashboard/`
- `documents/ui_refactor/`

## Notes

Historical handoff files are preserved in place.
When a handoff becomes durable guidance, that guidance should be rewritten into a canonical directory rather than treating the handoff itself as the active spec.
