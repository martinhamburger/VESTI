import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  DRAFT_EXPORT_E1_HANDOFF_STRUCTURE_PLANNER_PROMPT,
  DRAFT_EXPORT_E2_HANDOFF_EVIDENCE_COMPACTOR_PROMPT,
  DRAFT_EXPORT_E3_HANDOFF_COMPOSER_FROM_EVIDENCE_PROMPT,
} from "../frontend/src/lib/prompts/export";
import {
  buildHandoffExportDataset,
  buildHeuristicAnnotationEnvelope,
  COMPACT_HEADINGS,
  composeCompactFromEvidence,
  mockHandoffEvidence,
  mockHandoffPlanning,
  toPlannerSignals,
  validateCompactMarkdown,
  validateE1Output,
  validateE2Output,
  type PrototypeValidationResult,
} from "../frontend/src/lib/prompts/export/distillPrototype";
import type {
  CompactComposerInput,
  ExportPlannerPromptPayload,
  HandoffEvidenceCompactorPromptPayload,
  HandoffEvidenceSkeleton,
  HandoffPlanningNotes,
  PromptVersion,
  RepairInput,
} from "../frontend/src/lib/prompts/types";
import type { ExportPromptProfile } from "../frontend/src/lib/services/llmModelProfile";
import type { Message } from "../frontend/src/lib/types";

type RunMode = "mock" | "live";

type Cli = {
  mode: RunMode;
  caseFilter: string;
  limit: number;
  profile: ExportPromptProfile;
};

type ExportCase = {
  id: string;
  type: "export";
  mode: "compact" | "summary";
  locale?: "zh" | "en";
  title?: string;
  platform?: string;
  created_at?: number;
  messages: Array<{
    role: "user" | "ai";
    content: string;
    timestamp: number;
  }>;
  gold?: {
    required_facts?: string[];
    forbidden_facts?: string[];
    reference?: string;
  };
};

type LiveConfig = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
};

type DistillCaseReport = {
  caseId: string;
  mode: RunMode;
  profile: string;
  e1Valid: boolean;
  e2Valid: boolean;
  e3Valid: boolean;
  repairUsed: boolean;
  missingRequiredFacts: string[];
  triggeredForbiddenFacts: string[];
  unresolvedPresent: boolean;
  outputDir: string;
};

function validationErrors<T>(result: PrototypeValidationResult<T>): string[] {
  if (result.ok) return [];
  return (result as { ok: false; errors: string[] }).errors;
}

const args = process.argv.slice(2);
const cli: Cli = {
  mode: (args.find((arg) => arg.startsWith("--mode="))?.split("=")[1] as RunMode) || "mock",
  caseFilter: args.find((arg) => arg.startsWith("--case="))?.split("=")[1] || "",
  limit: Number(args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || "0"),
  profile:
    (args.find((arg) => arg.startsWith("--profile="))?.split("=")[1] as ExportPromptProfile) ||
    "kimi_handoff_rich",
};

function rootDir(): string {
  if (process.env.VESTI_ROOT) return path.resolve(process.env.VESTI_ROOT);
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "frontend", "package.json"))) return cwd;
  const parent = path.resolve(cwd, "..");
  if (fs.existsSync(path.join(parent, "frontend", "package.json"))) return parent;
  throw new Error("Cannot detect workspace root. Set VESTI_ROOT.");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "")) as T;
}

function listCompactExportCases(root: string): ExportCase[] {
  const dir = path.join(root, "eval", "gold", "export");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => readJson<ExportCase>(path.join(dir, name)))
    .filter((item) => item.type === "export" && item.mode === "compact");
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 12): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function clipText(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function toPromptMessages(source: ExportCase): Message[] {
  return source.messages.map((message, index) => ({
    id: index + 1,
    conversation_id: 1,
    role: message.role,
    content_text: message.content,
    created_at: message.timestamp,
  }));
}

function buildPlannerPayload(
  source: ExportCase,
  messages: Message[],
  profile: ExportPromptProfile
): ExportPlannerPromptPayload {
  const envelope = buildHeuristicAnnotationEnvelope({
    conversationId: source.id,
    platform: source.platform,
    messages,
  });
  const { messageSignals, conversationSignals } = toPlannerSignals(envelope);
  return {
    datasetId: source.id,
    conversationTitle: source.title,
    conversationPlatform: source.platform,
    conversationOriginAt: source.created_at,
    messages,
    locale: source.locale ?? "en",
    profile,
    messageSignals,
    conversationSignals,
  };
}

function buildDataset(
  source: ExportCase,
  messages: Message[]
) {
  const annotations = buildHeuristicAnnotationEnvelope({
    conversationId: source.id,
    platform: source.platform,
    messages,
  });
  return buildHandoffExportDataset({
    conversationId: source.id,
    locale: source.locale ?? "en",
    platform: source.platform,
    title: source.title,
    originAt: source.created_at,
    capturedAt: source.messages.at(-1)?.timestamp ?? source.created_at,
    messages,
    annotations,
  });
}

function buildCompactInput(
  evidence: HandoffEvidenceSkeleton,
  source: ExportCase,
  profile: ExportPromptProfile
): CompactComposerInput {
  return {
    schemaVersion: "v1",
    mode: "handoff",
    profile,
    locale: source.locale ?? "en",
    evidence,
    expectedHeadings: [...COMPACT_HEADINGS],
  };
}

function buildRepairPrompt(input: RepairInput, evidenceInput: CompactComposerInput): {
  system: string;
  user: string;
} {
  return {
    system:
      "You are a conservative compact-markdown repair step. Repair one failed output so it satisfies the exact headings contract. Do not invent new facts. Output markdown only.",
    user: `Repair this failed compact markdown output.

Invalid reasons:
${input.invalidReasons.map((item) => `- ${item}`).join("\n")}

Expected headings:
${input.expectedHeadings.join("\n")}

Evidence object:
${JSON.stringify(evidenceInput.evidence, null, 2)}

Failed output:
${input.failedOutput}

Repair requirements:
1) Keep the exact headings.
2) Compose only from the supplied evidence object.
3) If evidence is sparse, keep the heading and use a conservative placeholder.
4) Do not reopen upstream stages or invent facts.
5) Output markdown only.`,
  };
}

function evaluateFacts(source: ExportCase, output: string) {
  const normalizedOutput = normalizeText(output);
  const requiredFacts = source.gold?.required_facts ?? [];
  const forbiddenFacts = source.gold?.forbidden_facts ?? [];
  const missingRequiredFacts = requiredFacts.filter(
    (fact) => !normalizedOutput.includes(normalizeText(fact))
  );
  const triggeredForbiddenFacts = forbiddenFacts.filter((fact) =>
    normalizedOutput.includes(normalizeText(fact))
  );
  return { missingRequiredFacts, triggeredForbiddenFacts };
}

function unresolvedPresent(markdown: string): boolean {
  const headingIndex = markdown.indexOf("## Unresolved");
  if (headingIndex === -1) return false;
  const section = markdown.slice(headingIndex + "## Unresolved".length).trim();
  return /- /.test(section);
}

async function callOpenAiCompatible(
  config: LiveConfig,
  system: string,
  user: string
): Promise<string> {
  const response = await fetch(
    `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`openai-compatible call failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("openai-compatible call returned empty content");
  }
  return content;
}

async function runLiveJsonStage<TResult, TPayload>(params: {
  config: LiveConfig;
  prompt: PromptVersion<TPayload>;
  payload: TPayload;
  validator: (raw: string) => PrototypeValidationResult<TResult>;
}): Promise<{ value: TResult; raw: string; usedFallback: boolean }> {
  const mainRaw = await callOpenAiCompatible(
    params.config,
    params.prompt.system,
    params.prompt.userTemplate(params.payload)
  );
  const mainValidated = params.validator(mainRaw);
  if (mainValidated.ok) {
    return { value: mainValidated.value, raw: mainRaw, usedFallback: false };
  }

  const fallbackRaw = await callOpenAiCompatible(
    params.config,
    params.prompt.fallbackSystem ?? params.prompt.system,
    params.prompt.fallbackTemplate(params.payload)
  );
  const fallbackValidated = params.validator(fallbackRaw);
  if (!fallbackValidated.ok) {
    throw new Error(
      `stage failed after fallback: ${validationErrors(fallbackValidated).join("; ")}`
    );
  }
  return { value: fallbackValidated.value, raw: fallbackRaw, usedFallback: true };
}

async function runLiveMarkdownStage(params: {
  config: LiveConfig;
  prompt: PromptVersion<CompactComposerInput>;
  payload: CompactComposerInput;
  repairInput: RepairInput;
}): Promise<{ markdown: string; repairUsed: boolean }> {
  const mainRaw = await callOpenAiCompatible(
    params.config,
    params.prompt.system,
    params.prompt.userTemplate(params.payload)
  );
  const mainValidated = validateCompactMarkdown(mainRaw);
  if (mainValidated.ok) {
    return { markdown: mainRaw, repairUsed: false };
  }

  const repairPrompt = buildRepairPrompt(params.repairInput, params.payload);
  const repaired = await callOpenAiCompatible(
    params.config,
    repairPrompt.system,
    repairPrompt.user
  );
  const repairValidated = validateCompactMarkdown(repaired);
  if (!repairValidated.ok) {
    throw new Error(`repair failed: ${validationErrors(repairValidated).join("; ")}`);
  }
  return { markdown: repaired, repairUsed: true };
}

function makeLiveConfig(): LiveConfig {
  const apiKey = process.env.VESTI_EVAL_API_KEY || "";
  const modelId = process.env.VESTI_EVAL_MODEL_ID || "";
  if (!apiKey || !modelId) {
    throw new Error("live mode requires VESTI_EVAL_API_KEY and VESTI_EVAL_MODEL_ID");
  }
  return {
    baseUrl:
      process.env.VESTI_EVAL_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey,
    modelId,
  };
}

async function runCase(
  root: string,
  source: ExportCase,
  config?: LiveConfig
): Promise<DistillCaseReport> {
  const messages = toPromptMessages(source);
  const dataset = buildDataset(source, messages);
  const plannerPayload = buildPlannerPayload(source, messages, cli.profile);

  let planningNotes: HandoffPlanningNotes;
  let rawPlanning = "";
  if (cli.mode === "mock") {
    planningNotes = mockHandoffPlanning(dataset);
    rawPlanning = JSON.stringify(planningNotes, null, 2);
  } else {
    const result = await runLiveJsonStage({
      config: config!,
      prompt: DRAFT_EXPORT_E1_HANDOFF_STRUCTURE_PLANNER_PROMPT,
      payload: plannerPayload,
      validator: (raw) => validateE1Output(raw, "handoff"),
    });
    planningNotes = result.value as HandoffPlanningNotes;
    rawPlanning = result.raw;
  }

  const evidencePayload: HandoffEvidenceCompactorPromptPayload = {
    dataset,
    planningNotes,
  };

  let evidence: HandoffEvidenceSkeleton;
  let rawEvidence = "";
  if (cli.mode === "mock") {
    evidence = mockHandoffEvidence(dataset, planningNotes);
    rawEvidence = JSON.stringify(evidence, null, 2);
  } else {
    const result = await runLiveJsonStage({
      config: config!,
      prompt: DRAFT_EXPORT_E2_HANDOFF_EVIDENCE_COMPACTOR_PROMPT,
      payload: evidencePayload,
      validator: (raw) => validateE2Output(raw, "handoff"),
    });
    evidence = result.value;
    rawEvidence = result.raw;
  }

  const compactInput = buildCompactInput(evidence, source, cli.profile);
  const repairInput: RepairInput = {
    schemaVersion: "v1",
    mode: "handoff",
    profile: cli.profile,
    failedOutput: "",
    invalidReasons: [],
    expectedHeadings: [...COMPACT_HEADINGS],
    upstreamArtifactId: `${source.id}:e2`,
  };

  let finalMarkdown = "";
  let repairUsed = false;
  if (cli.mode === "mock") {
    finalMarkdown = composeCompactFromEvidence(compactInput);
  } else {
    const preview = await callOpenAiCompatible(
      config!,
      DRAFT_EXPORT_E3_HANDOFF_COMPOSER_FROM_EVIDENCE_PROMPT.system,
      DRAFT_EXPORT_E3_HANDOFF_COMPOSER_FROM_EVIDENCE_PROMPT.userTemplate(compactInput)
    );
      const previewValidated = validateCompactMarkdown(preview);
      if (previewValidated.ok) {
        finalMarkdown = preview;
      } else {
        repairInput.failedOutput = preview;
        repairInput.invalidReasons = validationErrors(previewValidated);
        const repairPrompt = buildRepairPrompt(repairInput, compactInput);
        const repaired = await callOpenAiCompatible(
          config!,
          repairPrompt.system,
        repairPrompt.user
        );
        const repairedValidated = validateCompactMarkdown(repaired);
        if (!repairedValidated.ok) {
          throw new Error(`E3 repair failed: ${validationErrors(repairedValidated).join("; ")}`);
        }
        finalMarkdown = repaired;
        repairUsed = true;
    }
  }

  const e1Validated = validateE1Output(rawPlanning, "handoff");
  const e2Validated = validateE2Output(rawEvidence, "handoff");
  const e3Validated = validateCompactMarkdown(finalMarkdown);
  if (!e1Validated.ok) {
    throw new Error(`E1 validation failed after stage completion: ${validationErrors(e1Validated).join("; ")}`);
  }
  if (!e2Validated.ok) {
    throw new Error(`E2 validation failed after stage completion: ${validationErrors(e2Validated).join("; ")}`);
  }
  if (!e3Validated.ok) {
    throw new Error(`E3 validation failed after stage completion: ${validationErrors(e3Validated).join("; ")}`);
  }

  const factEval = evaluateFacts(source, finalMarkdown);
  const outputDir = path.join(
    root,
    ".tmp",
    "distill",
    source.id,
    `${Date.now()}-${cli.mode}`
  );
  ensureDir(outputDir);

  fs.writeFileSync(path.join(outputDir, "e1-planning.json"), `${rawPlanning}\n`, "utf-8");
  fs.writeFileSync(path.join(outputDir, "e2-evidence.json"), `${rawEvidence}\n`, "utf-8");
  fs.writeFileSync(path.join(outputDir, "final.md"), `${finalMarkdown}\n`, "utf-8");

  const report: DistillCaseReport = {
    caseId: source.id,
    mode: cli.mode,
    profile: cli.profile,
    e1Valid: true,
    e2Valid: true,
    e3Valid: true,
    repairUsed,
    missingRequiredFacts: factEval.missingRequiredFacts,
    triggeredForbiddenFacts: factEval.triggeredForbiddenFacts,
    unresolvedPresent: unresolvedPresent(finalMarkdown),
    outputDir,
  };

  fs.writeFileSync(
    path.join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf-8"
  );

  return report;
}

async function main() {
  const root = rootDir();
  const config = cli.mode === "live" ? makeLiveConfig() : undefined;
  let cases = listCompactExportCases(root);

  if (cli.caseFilter) {
    const filter = normalizeText(cli.caseFilter);
    cases = cases.filter((item) => normalizeText(item.id).includes(filter));
  }
  if (cli.limit > 0) {
    cases = cases.slice(0, cli.limit);
  }
  if (cases.length === 0) {
    throw new Error("No compact export cases matched the provided filters.");
  }

  const reports: DistillCaseReport[] = [];
  for (const source of cases) {
    const report = await runCase(root, source, config);
    reports.push(report);
    console.log(
      `[distill:handoff] ${source.id} e1=${report.e1Valid ? "ok" : "fail"} e2=${report.e2Valid ? "ok" : "fail"} e3=${report.e3Valid ? "ok" : "fail"} repair=${report.repairUsed ? "yes" : "no"} missing=${report.missingRequiredFacts.length} forbidden=${report.triggeredForbiddenFacts.length}`
    );
    console.log(`[distill:handoff] output=${report.outputDir}`);
  }

  const hasFailure = reports.some(
    (report) =>
      report.missingRequiredFacts.length > 0 ||
      report.triggeredForbiddenFacts.length > 0 ||
      !report.unresolvedPresent
  );

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[distill:handoff] failed", error);
  process.exitCode = 1;
});
