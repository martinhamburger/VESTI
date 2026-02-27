import type { LlmConfig } from "../types";
import { getProxyRouteUrl } from "./llmConfig";
import { getLlmSettings } from "./llmSettingsService";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-v2";
const DASHSCOPE_EMBEDDINGS_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";

export type EmbeddingRoute = "direct" | "proxy";

export interface EmbeddingUsage {
  prompt_tokens?: number;
  total_tokens?: number;
}

export interface EmbeddingResult {
  route: EmbeddingRoute;
  model: string;
  vectors: number[][];
  usage?: EmbeddingUsage;
  requestId?: string;
}

export interface EmbeddingRequestOptions {
  model?: string;
  signal?: AbortSignal;
  fallbackToProxyOnDirectAuthError?: boolean;
}

interface OpenAiEmbeddingRow {
  index?: number;
  embedding?: unknown;
}

interface OpenAiEmbeddingResponse {
  model?: string;
  data?: OpenAiEmbeddingRow[];
  usage?: EmbeddingUsage;
}

interface EmbeddingServiceError extends Error {
  code: string;
  status?: number;
  route?: EmbeddingRoute;
  requestId?: string;
}

function createEmbeddingError(
  code: string,
  message: string,
  route?: EmbeddingRoute,
  status?: number,
  requestId?: string
): EmbeddingServiceError {
  const error = new Error(message) as EmbeddingServiceError;
  error.code = code;
  error.route = route;
  error.status = status;
  error.requestId = requestId;
  return error;
}

function normalizeInput(input: string | string[]): string[] {
  const list = Array.isArray(input) ? input : [input];
  return list
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string" && error.trim()) return error.trim();

  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message.trim();
    }
    if (typeof nested.code === "string" && nested.code.trim()) {
      return nested.code.trim();
    }
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  return null;
}

function resolveFailureCode(route: EmbeddingRoute, status: number): string {
  if (status === 401 || status === 403) {
    return route === "proxy"
      ? "EMBEDDING_PROXY_AUTH_FAILED"
      : "EMBEDDING_DIRECT_AUTH_FAILED";
  }
  if (route === "proxy" && status === 404) {
    return "EMBEDDING_CONFIG_MISSING";
  }
  if (status >= 500) {
    return "EMBEDDING_UPSTREAM_FAILED";
  }
  return "EMBEDDING_REQUEST_FAILED";
}

function buildFailureMessage(
  route: EmbeddingRoute,
  status: number,
  payload: unknown
): string {
  const detail =
    readErrorMessage(payload) || `${route} embedding request failed with status ${status}.`;
  const code = resolveFailureCode(route, status);

  if (code === "EMBEDDING_CONFIG_MISSING") {
    return `Proxy embedding route is unavailable: ${detail}`;
  }
  if (code === "EMBEDDING_DIRECT_AUTH_FAILED" || code === "EMBEDDING_PROXY_AUTH_FAILED") {
    return `${route} embedding authentication failed: ${detail}`;
  }
  if (code === "EMBEDDING_UPSTREAM_FAILED") {
    return `Embedding upstream error (${status}): ${detail}`;
  }
  return detail;
}

function parseEmbeddingResponse(
  payload: unknown,
  route: EmbeddingRoute,
  requestId?: string
): EmbeddingResult {
  const data = payload as OpenAiEmbeddingResponse;
  if (!Array.isArray(data?.data) || data.data.length === 0) {
    throw createEmbeddingError(
      "EMBEDDING_EMPTY_RESULT",
      "Embedding response contains no vectors.",
      route,
      undefined,
      requestId
    );
  }

  const vectors = [...data.data]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => row.embedding)
    .filter((embedding): embedding is number[] =>
      Array.isArray(embedding) && embedding.every((value) => typeof value === "number")
    );

  if (vectors.length === 0) {
    throw createEmbeddingError(
      "EMBEDDING_INVALID_VECTOR",
      "Embedding response does not include numeric vectors.",
      route,
      undefined,
      requestId
    );
  }

  return {
    route,
    model: data.model || DEFAULT_EMBEDDING_MODEL,
    vectors,
    usage: data.usage,
    requestId,
  };
}

async function requestEmbeddingsFromRoute(
  config: LlmConfig,
  route: EmbeddingRoute,
  input: string[],
  options: EmbeddingRequestOptions
): Promise<EmbeddingResult> {
  const model = (options.model || DEFAULT_EMBEDDING_MODEL).trim();
  const body = {
    model,
    input,
    encoding_format: "float",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const url =
    route === "direct" ? DASHSCOPE_EMBEDDINGS_URL : getProxyRouteUrl(config, "embeddings").trim();
  if (route === "proxy" && !url) {
    throw createEmbeddingError(
      "EMBEDDING_CONFIG_MISSING",
      "Missing proxy embeddings route configuration.",
      route
    );
  }

  if (route === "direct") {
    const apiKey = (config.apiKey || "").trim();
    if (!apiKey) {
      throw createEmbeddingError(
        "EMBEDDING_API_KEY_MISSING",
        "Missing API key for direct embedding route.",
        route
      );
    }
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    const serviceToken = (config.proxyServiceToken || "").trim();
    if (serviceToken) {
      headers["x-vesti-service-token"] = serviceToken;
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    const isConfigError = route === "proxy" && /invalid url/i.test(message);
    throw createEmbeddingError(
      isConfigError ? "EMBEDDING_CONFIG_MISSING" : "EMBEDDING_REQUEST_FAILED",
      isConfigError
        ? "Proxy embeddings route is invalid or missing."
        : `${route} embedding request failed: ${message}`,
      route
    );
  }

  const requestId = response.headers.get("x-request-id") || undefined;
  const payload = await readResponseJson(response);

  if (!response.ok) {
    const code = resolveFailureCode(route, response.status);
    const message = buildFailureMessage(route, response.status, payload);
    throw createEmbeddingError(
      code,
      message,
      route,
      response.status,
      requestId
    );
  }

  return parseEmbeddingResponse(payload, route, requestId);
}

function shouldFallbackToProxy(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as EmbeddingServiceError).status;
  return status === 401 || status === 403;
}

export async function requestEmbeddings(
  config: LlmConfig,
  input: string | string[],
  options: EmbeddingRequestOptions = {}
): Promise<EmbeddingResult> {
  const normalizedInput = normalizeInput(input);
  if (normalizedInput.length === 0) {
    throw createEmbeddingError(
      "EMBEDDING_INPUT_EMPTY",
      "Embedding input cannot be empty."
    );
  }

  const fallbackToProxyOnDirectAuthError =
    options.fallbackToProxyOnDirectAuthError !== false;
  const hasApiKey = (config.apiKey || "").trim().length > 0;

  if (hasApiKey) {
    try {
      return await requestEmbeddingsFromRoute(
        config,
        "direct",
        normalizedInput,
        options
      );
    } catch (error) {
      if (fallbackToProxyOnDirectAuthError && shouldFallbackToProxy(error)) {
        return requestEmbeddingsFromRoute(
          config,
          "proxy",
          normalizedInput,
          options
        );
      }
      throw error;
    }
  }

  return requestEmbeddingsFromRoute(config, "proxy", normalizedInput, options);
}

async function requireLlmSettings(): Promise<LlmConfig> {
  const settings = await getLlmSettings();
  if (!settings) {
    throw createEmbeddingError(
      "EMBEDDING_CONFIG_MISSING",
      "Missing LLM settings for embeddings."
    );
  }
  return settings;
}

export async function fetchEmbeddings(
  input: string | string[],
  options: EmbeddingRequestOptions = {}
): Promise<Float32Array[]> {
  const config = await requireLlmSettings();
  const normalizedInput = normalizeInput(input);
  if (normalizedInput.length === 0) {
    throw createEmbeddingError(
      "EMBEDDING_INPUT_EMPTY",
      "Embedding input cannot be empty."
    );
  }

  const result = await requestEmbeddings(config, normalizedInput, options);

  return result.vectors.map((vector) => new Float32Array(vector));
}

export async function embedText(text: string): Promise<Float32Array> {
  const settings = await requireLlmSettings();
  const result = await requestEmbeddings(settings, text, {
    fallbackToProxyOnDirectAuthError: true,
  });
  const vector = result.vectors[0];
  if (!vector) {
    throw createEmbeddingError(
      "EMBEDDING_EMPTY_RESULT",
      "Embedding response contains no vectors."
    );
  }
  return new Float32Array(vector);
}
