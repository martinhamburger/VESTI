# Playwright DOM Sampling Bootstrap

## Current MCP Status

- Codex local config already has Playwright MCP enabled:
  - `C:\\Users\\苏祎成\\.codex\\config.toml`
  - `[mcp_servers.playwright]`
  - `command = "npx"`
  - `args = ["@playwright/mcp@latest"]`

This means repo work only needs to set up reusable Playwright auth and sampling scripts.

## The 8 Login Sites

1. ChatGPT: `https://chatgpt.com/`
2. Claude: `https://claude.ai/`
3. Gemini: `https://gemini.google.com/`
4. DeepSeek: `https://chat.deepseek.com/`
5. Qwen: `https://chat.qwen.ai/`
6. Doubao: `https://www.doubao.com/`
7. Kimi: `https://www.kimi.com/`
8. Yuanbao: `https://yuanbao.tencent.com/`

## Local Auth Flow

1. Install dependencies:
   - `pnpm install`
2. Launch auth bootstrap:
   - `pnpm pw:auth`
3. Manually complete login on all 8 tabs.
4. Close the browser window.
5. Export reusable storage state:
   - `pnpm pw:state`

Persistent browser data is stored under:

- `.playwright-auth/chromium-profile/`

Combined storage state is exported to:

- `.playwright-auth/storage/all-sites.json`

### Browser runtime

- Scripts now prefer a locally installed browser first.
- Current machine candidates:
  - Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  - Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
- If you want to override this, set:
  - `PW_BROWSER_PATH=<absolute-browser-path>`

Optional only:

- `pnpm exec playwright install chromium`

This is no longer required for the local bootstrap flow if system Chrome or Edge is available.

## DOM Sampling

Run a sample against any logged-in page:

- `pnpm pw:sample -- --url "https://chatgpt.com/c/..." --name chatgpt-citations`

Artifacts are written to:

- `.playwright-auth/samples/<timestamp>-<name>/summary.json`
- `.playwright-auth/samples/<timestamp>-<name>/page.html`
- `.playwright-auth/samples/<timestamp>-<name>/page.png`

## Notes

- The persistent profile is the primary auth source.
- `all-sites.json` is a portable backup, not the main live session.
- For high-friction sites with 2FA or risk control, prefer reusing the persistent profile instead of trying to replay login flows from scratch.
