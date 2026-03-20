# 2026-03-20 Five-Platform DOM Sampling Handoff

## Summary

- Playwright profile sampling completed for:
  - Yuanbao
  - Kimi
  - Doubao
  - Qwen
  - DeepSeek
- Live post-fix re-sampling was re-run for:
  - Qwen
  - Yuanbao

## Current DOM Anchors

### Qwen

- message root:
  - `[data-testid="message-block-container"]`
- role root:
  - `[data-testid="send_message"]`
  - `[data-testid="receive_message"]`
- content root:
  - `[data-testid="message_text_content"]`
  - `.qwen-markdown`
- noise:
  - `.response-message-footer`
  - `.qwen-chat-package-comp-new-action-control`
  - `.qwen-markdown-table-header`
  - input-area controls

### Yuanbao

- message root:
  - `.agent-chat__bubble`
- role root:
  - `.agent-chat__bubble--human`
  - `.agent-chat__bubble--ai`
- content root:
  - `.agent-chat__speech-text`
  - `.hyc-content-md`
  - `.hyc-common-markdown`
- noise:
  - `.agent-chat__conv--ai__toolbar`
  - `.agent-chat__conv--human__toolbar`
  - deepsearch docs counters / search headers
  - download CTA
  - input chrome
- artifact-presence signals:
  - `#yuanbao-canvas-container`
  - `.hyc-card-box-process-list`
  - `.agent-dialogue__content-split-pane__code`

### Doubao

- current live DOM still aligns with:
  - `[data-testid="message-block-container"]`
  - `[data-testid="receive_message"]`
  - `.flow-markdown-body`
  - `.collapse-wrapper`

### Kimi

- current live DOM still aligns with:
  - `.segment-container`
  - `.segment-content-box`
  - `.markdown-container`
- sample confirms current header/actions exclusions remain necessary.

### DeepSeek

- current live DOM still aligns with:
  - `.ds-message`
  - `.ds-markdown`
- outer page chrome remains heavy, but message shell itself is still recoverable.

## Sample Artifact Paths

- `.playwright-auth/samples/20260320-194526-yuanbao-complex`
- `.playwright-auth/samples/20260320-194545-kimi-complex`
- `.playwright-auth/samples/20260320-194607-doubao-complex`
- `.playwright-auth/samples/20260320-194627-qwen-complex`
- `.playwright-auth/samples/20260320-194649-deepseek-complex`
- `.playwright-auth/samples/20260320-200707-qwen-post-fix`
- `.playwright-auth/samples/20260320-200733-yuanbao-post-fix`
