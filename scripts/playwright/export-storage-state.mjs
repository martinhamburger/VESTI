import { chromium } from "@playwright/test";
import {
  LOGIN_TARGETS,
  STORAGE_STATE_DIR,
  USER_DATA_DIR,
  ensurePlaywrightDirs,
  resolveBrowserExecutable,
} from "./shared.mjs";

ensurePlaywrightDirs();
const executablePath = resolveBrowserExecutable();

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: true,
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
  executablePath: executablePath ?? undefined,
});

for (const target of LOGIN_TARGETS) {
  const page = await context.newPage();
  await page.goto(target.url, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.close().catch(() => {});
}

const statePath = `${STORAGE_STATE_DIR}\\all-sites.json`;
await context.storageState({ path: statePath });
await context.close();

console.log(`Saved combined storage state: ${statePath}`);
if (executablePath) {
  console.log(`Browser executable: ${executablePath}`);
}
