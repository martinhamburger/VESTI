import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "..", "..");
export const PLAYWRIGHT_ROOT = resolve(REPO_ROOT, ".playwright-auth");
export const USER_DATA_DIR = resolve(PLAYWRIGHT_ROOT, "chromium-profile");
export const STORAGE_STATE_DIR = resolve(PLAYWRIGHT_ROOT, "storage");
export const SAMPLE_DIR = resolve(PLAYWRIGHT_ROOT, "samples");
const DEFAULT_BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Users\\苏祎成\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Users\\苏祎成\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe",
];

export const LOGIN_TARGETS = [
  { platform: "ChatGPT", url: "https://chatgpt.com/" },
  { platform: "Claude", url: "https://claude.ai/" },
  { platform: "Gemini", url: "https://gemini.google.com/" },
  { platform: "DeepSeek", url: "https://chat.deepseek.com/" },
  { platform: "Qwen", url: "https://chat.qwen.ai/" },
  { platform: "Doubao", url: "https://www.doubao.com/" },
  { platform: "Kimi", url: "https://www.kimi.com/" },
  { platform: "Yuanbao", url: "https://yuanbao.tencent.com/" },
];

export function ensurePlaywrightDirs() {
  mkdirSync(USER_DATA_DIR, { recursive: true });
  mkdirSync(STORAGE_STATE_DIR, { recursive: true });
  mkdirSync(SAMPLE_DIR, { recursive: true });
}

export function getArg(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] ?? fallback;
}

export function hasFlag(flag) {
  return process.argv.includes(flag);
}

export function timestampTag() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

export function resolveBrowserExecutable() {
  if (process.env.PW_BROWSER_PATH && existsSync(process.env.PW_BROWSER_PATH)) {
    return process.env.PW_BROWSER_PATH;
  }

  return DEFAULT_BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}
