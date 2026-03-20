import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import {
  SAMPLE_DIR,
  USER_DATA_DIR,
  ensurePlaywrightDirs,
  getArg,
  hasFlag,
  resolveBrowserExecutable,
  timestampTag,
} from "./shared.mjs";

const url = getArg("--url");
if (!url) {
  console.error("Usage: pnpm pw:sample -- --url <target-url> [--name sample-name] [--headless]");
  process.exit(1);
}

const name = getArg("--name", "sample");
const headless = hasFlag("--headless");

ensurePlaywrightDirs();
const executablePath = resolveBrowserExecutable();

const sampleTag = `${timestampTag()}-${name}`;
const sampleRoot = resolve(SAMPLE_DIR, sampleTag);
mkdirSync(sampleRoot, { recursive: true });

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless,
  viewport: { width: 1440, height: 1200 },
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
  executablePath: executablePath ?? undefined,
});

const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const summary = await page.evaluate(() => ({
  href: window.location.href,
  title: document.title,
  messageRoots: document.querySelectorAll("[data-message-id]").length,
  assistantRoots: document.querySelectorAll(
    '[data-message-author-role="assistant"]',
  ).length,
  citationPills: document.querySelectorAll(
    '[data-testid="webpage-citation-pill"]',
  ).length,
  thinkingNodes: document.querySelectorAll(
    '[data-testid*="thinking"], [data-testid*="reasoning"], [data-testid*="thought"]',
  ).length,
}));

const html = await page.content();

await page.screenshot({
  path: resolve(sampleRoot, "page.png"),
  fullPage: true,
}).catch(() => {});

writeFileSync(resolve(sampleRoot, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
writeFileSync(resolve(sampleRoot, "page.html"), html, "utf8");

await context.close();

console.log(`Saved DOM sample under: ${sampleRoot}`);
if (executablePath) {
  console.log(`Browser executable: ${executablePath}`);
}
