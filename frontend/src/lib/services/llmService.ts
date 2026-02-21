import type {
  Conversation,
  LlmConfig,
  Message,
  ThinkHandlingPolicy,
} from "../types";
import { logger } from "../utils/logger";
import {
  getEffectiveModelId,
  getLlmAccessMode,
  getProxyRouteUrl,
} from "./llmConfig";

const SYSTEM_PROMPT = "You are a careful technical summarization assistant.";
const STRICT_JSON_SYSTEM_PROMPT =
  "Output must be a valid JSON object only. Do not include Markdown, code fences, or explanatory text outside JSON.";

export type ModelScopeMode = "plain_text" | "json_mode" | "prompt_json";
export type InferenceRoute = "proxy" | "modelscope";
export type StreamExecutionStage =
  | "stable_non_stream"
  | "candidate_stream"
  | "fallback_non_stream";

interface StreamDecision {
  stage: StreamExecutionStage;
  reason: string;
}

export interface CallModelScopeOptions {
  responseFormat?: "json_object";
  systemPrompt?: string;
  stream?: boolean;
}

export interface ModelScopeCallResult {
  content: string;
  mode: ModelScopeMode;
  streamStage: StreamExecutionStage;
  streamReason: string;
}

export interface InferenceCallResult extends ModelScopeCallResult {
  rawContent: string;
  route: InferenceRoute;
  streamRequested: boolean;
}

type ModelScopeMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ModelScopeResponse = {
  choices?: Array<{
    message?: { content?: unknown; reasoning_content?: unknown };
    delta?: { content?: unknown; reasoning_content?: unknown };
  }>;
};

function ensureModelScopeConfig(config: LlmConfig): void {
  if (!config.baseUrl) {
    throw new Error("LLM_CONFIG_MISSING:BASE_URL");
  }
  if (!config.apiKey) {
    throw new Error("LLM_CONFIG_MISSING:API_KEY");
  }
  if (!getEffectiveModelId(config)) {
    throw new Error("LLM_CONFIG_MISSING:MODEL_ID");
  }
}

function ensureProxyConfig(config: LlmConfig): void {
  if (!config.proxyBaseUrl?.trim() && !config.proxyUrl?.trim()) {
    throw new Error("LLM_CONFIG_MISSING:PROXY_BASE_URL");
  }
  if (!getEffectiveModelId(config)) {
    throw new Error("LLM_CONFIG_MISSING:MODEL_ID");
  }
}

function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          const value = (item as { text?: unknown }).text;
          return typeof value === "string" ? value : "";
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("");
  }
  return "";
}

function extractContent(data: ModelScopeResponse): string {
  const choice = data.choices?.[0];
  const direct = toText(choice?.message?.content);
  if (direct.trim()) {
    return direct.trim();
  }
  const delta = toText(choice?.delta?.content);
  if (delta.trim()) {
    return delta.trim();
  }
  return "";
}

function hasReasoningContent(data: ModelScopeResponse): boolean {
  const choice = data.choices?.[0];
  const messageReasoning = toText(choice?.message?.reasoning_content);
  if (messageReasoning.trim()) {
    return true;
  }
  const deltaReasoning = toText(choice?.delta?.reasoning_content);
  return deltaReasoning.trim().length > 0;
}

async function parseError(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function buildPayload(
  config: LlmConfig,
  messages: ModelScopeMessage[],
  responseFormat?: "json_object",
  streamDecision: StreamDecision = {
    stage: "stable_non_stream",
    reason: "not_requested",
  }
): Record<string, unknown> {
  if (streamDecision.stage === "fallback_non_stream") {
    logger.warn("llm", "Stream requested but downgraded to stable non-stream path", {
      streamMode: config.streamMode,
      reasoningPolicy: config.reasoningPolicy,
      streamReason: streamDecision.reason,
    });
  }

  const payload: Record<string, unknown> = {
    model: getEffectiveModelId(config),
    enable_thinking: false,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    messages,
  };

  // P1.5 hook: reserved for future stream/reasoning branch. Stable path keeps non-stream.
  if (streamDecision.stage === "candidate_stream") {
    payload.stream = false;
    logger.info("llm", "Stream candidate path captured by P1.5 hook", {
      streamReason: streamDecision.reason,
    });
  }

  if (responseFormat) {
    payload.response_format = { type: responseFormat };
  }

  return payload;
}

async function requestModelScope(
  config: LlmConfig,
  messages: ModelScopeMessage[],
  responseFormat?: "json_object",
  streamDecision: StreamDecision = {
    stage: "stable_non_stream",
    reason: "not_requested",
  }
): Promise<Response> {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const payload = buildPayload(config, messages, responseFormat, streamDecision);

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

async function requestProxyService(
  config: LlmConfig,
  messages: ModelScopeMessage[],
  responseFormat?: "json_object",
  streamDecision: StreamDecision = {
    stage: "stable_non_stream",
    reason: "not_requested",
  }
): Promise<Response> {
  const url = getProxyRouteUrl(config, "chat");
  const serviceToken = (config.proxyServiceToken || "").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (serviceToken) {
    headers["x-vesti-service-token"] = serviceToken;
  }

  const payload = buildPayload(config, messages, responseFormat, streamDecision);

  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

async function callProvider(
  config: LlmConfig,
  prompt: string,
  options: CallModelScopeOptions,
  route: InferenceRoute
): Promise<ModelScopeCallResult> {
  const baseSystemPrompt = options.systemPrompt ?? SYSTEM_PROMPT;
  const streamRequested = options.stream === true;
  const streamDecision = resolveStreamDecision(config, streamRequested);
  const requester =
    route === "proxy" ? requestProxyService : requestModelScope;

  const request = (
    messages: ModelScopeMessage[],
    responseFormat?: "json_object"
  ) => requester(config, messages, responseFormat, streamDecision);

  const baseMessages: ModelScopeMessage[] = [
    { role: "system", content: baseSystemPrompt },
    { role: "user", content: prompt },
  ];

  if (options.responseFormat === "json_object") {
    let shouldPromptJsonFallback = false;
    const jsonResponse = await request(baseMessages, "json_object");
    if (jsonResponse.ok) {
      const data = (await jsonResponse.json()) as ModelScopeResponse;
      const jsonModeContent = extractContent(data);
      if (jsonModeContent.trim()) {
        return {
          content: jsonModeContent,
          mode: "json_mode",
          streamStage: streamDecision.stage,
          streamReason: streamDecision.reason,
        };
      }

      shouldPromptJsonFallback = true;
      logger.warn("llm", `${route} JSON mode returned empty content, fallback to prompt_json`, {
        hasReasoningContent: hasReasoningContent(data),
      });
    } else {
      const jsonErrorText = await parseError(jsonResponse);
      const shouldFallback =
        [400, 404, 415, 422].includes(jsonResponse.status) ||
        /response_format|json_object|unsupported/i.test(jsonErrorText);

      if (!shouldFallback) {
        logger.error(
          "llm",
          `${route} JSON request failed: ${jsonResponse.status}`,
          new Error(jsonErrorText)
        );
        throw new Error(`LLM_REQUEST_FAILED:${jsonResponse.status}`);
      }

      shouldPromptJsonFallback = true;
      logger.warn("llm", `${route} JSON mode unsupported, fallback to prompt_json`, {
        status: jsonResponse.status,
      });
    }

    if (shouldPromptJsonFallback) {
      const promptJsonMessages: ModelScopeMessage[] = [
        { role: "system", content: `${baseSystemPrompt}\n${STRICT_JSON_SYSTEM_PROMPT}` },
        { role: "user", content: prompt },
      ];
      const promptJsonResponse = await request(promptJsonMessages);
      if (!promptJsonResponse.ok) {
        const promptJsonErrorText = await parseError(promptJsonResponse);
        logger.error(
          "llm",
          `${route} prompt_json request failed: ${promptJsonResponse.status}`,
          new Error(promptJsonErrorText)
        );
        throw new Error(`LLM_REQUEST_FAILED:${promptJsonResponse.status}`);
      }

      const promptJsonData = (await promptJsonResponse.json()) as ModelScopeResponse;
      return {
        content: extractContent(promptJsonData),
        mode: "prompt_json",
        streamStage: streamDecision.stage,
        streamReason: streamDecision.reason,
      };
    }
  }

  const response = await request(baseMessages);
  if (!response.ok) {
    const errorText = await parseError(response);
    logger.error("llm", `${route} request failed: ${response.status}`, new Error(errorText));
    throw new Error(`LLM_REQUEST_FAILED:${response.status}`);
  }

  const data = (await response.json()) as ModelScopeResponse;
  return {
    content: extractContent(data),
    mode: "plain_text",
    streamStage: streamDecision.stage,
    streamReason: streamDecision.reason,
  };
}

function resolveStreamDecision(
  config: LlmConfig,
  streamRequested: boolean
): StreamDecision {
  if (!streamRequested) {
    return { stage: "stable_non_stream", reason: "not_requested" };
  }

  if (config.streamMode !== "on") {
    return { stage: "fallback_non_stream", reason: "stream_mode_off" };
  }

  if (config.reasoningPolicy === "off") {
    return { stage: "fallback_non_stream", reason: "reasoning_policy_off" };
  }

  // RC2 keeps stream disabled by default and routes candidates through stable path.
  return { stage: "candidate_stream", reason: "reserved_for_future_rollout" };
}

function normalizeThinkHandlingPolicy(
  policy: ThinkHandlingPolicy | undefined
): ThinkHandlingPolicy {
  if (policy === "keep_debug" || policy === "keep_raw") {
    return policy;
  }
  return "strip";
}

export function stripThinkBlocks(text: string): string {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function applyThinkPolicy(text: string, policy: ThinkHandlingPolicy): string {
  if (policy === "keep_raw") {
    return text.trim();
  }
  return stripThinkBlocks(text);
}

export function resolveLlmRoute(config: LlmConfig): InferenceRoute {
  return getLlmAccessMode(config) === "demo_proxy" ? "proxy" : "modelscope";
}

export async function callProxyService(
  config: LlmConfig,
  prompt: string,
  options: CallModelScopeOptions = {}
): Promise<ModelScopeCallResult> {
  ensureProxyConfig(config);
  return callProvider(config, prompt, options, "proxy");
}

export async function callModelScope(
  config: LlmConfig,
  prompt: string,
  options: CallModelScopeOptions = {}
): Promise<ModelScopeCallResult> {
  ensureModelScopeConfig(config);
  return callProvider(config, prompt, options, "modelscope");
}

export async function callInference(
  config: LlmConfig,
  prompt: string,
  options: CallModelScopeOptions = {}
): Promise<InferenceCallResult> {
  const route = resolveLlmRoute(config);
  const result =
    route === "proxy"
      ? await callProxyService(config, prompt, options)
      : await callModelScope(config, prompt, options);

  const policy = normalizeThinkHandlingPolicy(config.thinkHandlingPolicy);
  const rawContent = result.content;
  const content = applyThinkPolicy(rawContent, policy);

  if (policy === "keep_debug" && content !== rawContent) {
    logger.info("llm", "Think blocks stripped for user-visible output", {
      route,
      modelId: getEffectiveModelId(config),
    });
  }

  return {
    ...result,
    content: content || rawContent,
    rawContent,
    route,
    streamRequested: options.stream === true,
  };
}

function buildConversationLines(messages: Message[]): string {
  return messages
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "AI";
      return `[${role}] ${msg.content_text}`;
    })
    .join("\n");
}

function buildWeeklyLines(conversations: Conversation[]): string {
  return conversations
    .map((conversation, index) => {
      return `${index + 1}. [${conversation.platform}] ${conversation.title} - ${conversation.snippet}`;
    })
    .join("\n");
}

export function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[...truncated...]`;
}

export function sanitizeSummaryText(text: string): string {
  const noThink = stripThinkBlocks(text);
  return noThink
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```[\w-]*\n?/g, "").replace(/```/g, "")
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildSummaryPrompt(messages: Message[], lang: "zh" | "en" = "zh"): string {
  const conversation = buildConversationLines(messages);

  if (lang === "zh") {
    return `请基于以下对话生成中文总结。\n要求：\n1) 输出严格为纯文本，不要使用 Markdown 语法（不要 *, #, -, 代码块）。\n2) 输出 3-6 条简洁句子，每条单独换行。\n3) 聚焦技术决策、调试结论与可执行行动。\n\n对话内容：\n${conversation}`;
  }

  return `Summarize the conversation in plain text.\nRequirements:\n1) No Markdown syntax (no *, #, -, or code fences).\n2) 3-6 concise lines, one sentence per line.\n3) Focus on technical decisions, debugging findings, and action items.\n\nConversation:\n${conversation}`;
}

export function buildWeeklyPrompt(
  conversations: Conversation[],
  lang: "zh" | "en" = "zh"
): string {
  const items = buildWeeklyLines(conversations);

  if (lang === "zh") {
    return `请基于以下会话生成中文周报。\n要求：\n1) 输出严格为纯文本，不要使用 Markdown 语法（不要 *, #, -, 代码块）。\n2) 内容分为主题、关键进展与后续行动。\n3) 每条信息单独换行，保持简洁。\n\n本周会话：\n${items}`;
  }

  return `Write a weekly report in plain text.\nRequirements:\n1) No Markdown syntax (no *, #, -, or code fences).\n2) Cover themes, progress, and next actions.\n3) Keep concise lines.\n\nWeekly conversations:\n${items}`;
}

export function buildWeeklySourceHash(
  conversations: Conversation[],
  rangeStart: number,
  rangeEnd: number
): string {
  const payload = conversations
    .map((conversation) => `${conversation.id}:${conversation.updated_at}`)
    .join("|");
  return `${rangeStart}-${rangeEnd}-${payload}`;
}
