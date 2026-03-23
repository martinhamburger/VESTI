# Engineering Handoffs

Status: Historical timeline index
Audience: Maintainers, reviewers, engineers reconstructing dated decisions

## Purpose

`documents/engineering_handoffs/` is a historical timeline, not the canonical source of truth for current subsystem behavior.

Use this directory to answer date-bound questions such as:
- what changed in a specific release window
- which decision boundary existed at that time
- where the durable outcome was later promoted

## Public document types

The public handoff surface now keeps only three document shapes:

1. `Public thin handoff`
2. `Shipped State`
3. `Next Slice / Closure Audit`

## Placement rules

- If a note is a historical handoff, write it directly as a thin handoff.
- If a note becomes durable engineering guidance, rewrite it into the relevant canonical directory.
- If a note is maintainer-only, machine-specific, or operationally sensitive, keep the full original in `documents/_local/engineering_handoffs/` instead of the public tree.

## Reading order

1. Start with the canonical subsystem docs in `capture_engine/`, `reader_pipeline/`, `web_dashboard/`, `ui_refactor/`, or `prompt_engineering/`.
2. Use a handoff only when you need dated context or a release-window decision boundary.
3. If a handoff lists `Local original`, that full version is maintainer-local and not part of the public repo surface.

## Current compression policy

- Pre-`2026-03-09` handoffs are intentionally condensed to thin public shells.
- A small number of later heavy memos are also condensed when their durable guidance already lives elsewhere.
- File paths stay stable so existing references from `CHANGELOG`, archive docs, and subsystem READMEs continue to resolve.
