import { chromium } from "@playwright/test";
import {
  LOGIN_TARGETS,
  USER_DATA_DIR,
  ensurePlaywrightDirs,
  resolveBrowserExecutable,
} from "./shared.mjs";

ensurePlaywrightDirs();
const executablePath = resolveBrowserExecutable();

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  viewport: null,
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
  executablePath: executablePath ?? undefined,
});

const pages = context.pages();
const introPage = pages[0] ?? (await context.newPage());
await introPage.setContent(`
  <html>
    <body style="font-family: sans-serif; padding: 24px; line-height: 1.6;">
      <h1>Vesti Playwright Auth Bootstrap</h1>
      <p>请在新打开的标签页中完成登录。完成后直接关闭整个浏览器窗口，登录态会保存在本地 profile 中。</p>
      <ol>
        ${LOGIN_TARGETS.map(
          (target) => `<li><strong>${target.platform}</strong>: ${target.url}</li>`,
        ).join("")}
      </ol>
    </body>
  </html>
`);

for (const target of LOGIN_TARGETS) {
  const page = await context.newPage();
  await page.goto(target.url, { waitUntil: "domcontentloaded" }).catch(() => {});
}

console.log("Playwright auth bootstrap is ready.");
if (executablePath) {
  console.log(`Browser executable: ${executablePath}`);
}
console.log(`Persistent profile: ${USER_DATA_DIR}`);
console.log("Log into these 8 sites, then close the browser window:");
for (const target of LOGIN_TARGETS) {
  console.log(`- ${target.platform}: ${target.url}`);
}

await new Promise((resolve) => {
  context.on("close", resolve);
});

console.log("Browser closed. Persistent login profile saved.");
