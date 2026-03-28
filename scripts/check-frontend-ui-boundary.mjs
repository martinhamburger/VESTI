import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const scopedDirs = [
  path.join(repoRoot, "frontend", "src", "lib", "prompts"),
  path.join(repoRoot, "frontend", "src", "lib", "services"),
  path.join(repoRoot, "frontend", "src", "lib", "utils"),
];

const importPattern = /from\s+["']@vesti\/ui["']|import\s+["']@vesti\/ui["']/;

function* walk(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }

    if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

const violations = [];

for (const scopedDir of scopedDirs) {
  for (const filePath of walk(scopedDir)) {
    const contents = readFileSync(filePath, "utf8");
    if (importPattern.test(contents)) {
      violations.push(path.relative(repoRoot, filePath));
    }
  }
}

if (violations.length > 0) {
  console.error("[ui-boundary] frontend non-UI modules must not import @vesti/ui directly:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("[ui-boundary] OK");
