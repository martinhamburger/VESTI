# 2026-03-20 ChatGPT Thinking Boundary Repair

## Summary

- ChatGPT `thinking / 已思考` UI is treated as message-internal visual noise for this round.
- It must not split one `data-message-id` assistant root into multiple logical messages.
- No reasoning metadata is persisted in schema, reader, export, or storage during this fix.

## Implementation Policy

- `data-message-id + data-message-author-role` is the highest-priority ChatGPT message boundary.
- Selector candidates and copy-action-derived candidates are collapsed to the nearest hard boundary root before parsing.
- If hard roots exist, each hard root can yield at most one logical message.
- Visible thinking controls such as `已思考 22s`, `Thought for 39s`, `Show more`, and `Done` are stripped as UI noise.

## Verification Focus

- One assistant hard root yields at most one parsed assistant message.
- Final answer text remains continuous and complete.
- Thinking controls do not appear in `content_text`.
- Expanded thinking UI does not create a second assistant reply.

## Deferred

- Persisting thinking duration.
- Persisting expanded reasoning content.
- Extending the same hard-boundary policy to Qwen / Gemini / DeepSeek.
