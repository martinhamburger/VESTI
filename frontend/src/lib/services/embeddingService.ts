import type { LlmConfig } from "../types";
import { getLlmAccessMode, getProxyRouteUrl } from "./llmConfig";
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

function extractPayloadErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message.trim();
    }
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  return null;
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
    route === "direct"
      ? DASHSCOPE_EMBEDDINGS_URL
      : getProxyRouteUrl(config, "embeddings");

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

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  const requestId = response.headers.get("x-request-id") || undefined;
  const payload = await readResponseJson(response);

  if (!response.ok) {
    const upstreamMessage =
      extractPayloadErrorMessage(payload) ??
      `${route} embedding request failed with status ${response.status}`;

    if (route === "proxy" && response.status === 404) {
      throw createEmbeddingError(
        "PROXY_EMBEDDINGS_ROUTE_MISSING",
        "Proxy embeddings route missing: ensure /embeddings is deployed and reachable.",
        route,
        response.status,
        requestId
      );
    }
    if (route === "proxy" && (response.status === 401 || response.status === 403)) {
      throw createEmbeddingError(
        "PROXY_ACCESS_DENIED",
        "Proxy access denied for embeddings: check proxy token policy, allowed origin, or auth settings.",
        route,
        response.status,
        requestId
      );
    }
    if (route === "proxy" && response.status === 429) {
      throw createEmbeddingError(
        "PROXY_RATE_LIMITED",
        "Proxy embeddings rate-limited. Please retry in a moment.",
        route,
        response.status,
        requestId
      );
    }

    throw createEmbeddingError("EMBEDDING_REQUEST_FAILED", upstreamMessage, route, response.status, requestId);
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
  const mode = getLlmAccessMode(settings);
  const apiKey = (settings.apiKey || "").trim();

  if (mode === "demo_proxy") {
    const result = await requestEmbeddingsFromRoute(
      settings,
      "proxy",
      normalizeInput(text),
      { fallbackToProxyOnDirectAuthError: false }
    );
    const vector = result.vectors[0];
    if (!vector) {
      throw createEmbeddingError(
        "EMBEDDING_EMPTY_RESULT",
        "Embedding response contains no vectors."
      );
    }
    return new Float32Array(vector);
  }

  if (!apiKey) {
    throw createEmbeddingError(
      "EMBEDDING_API_KEY_MISSING",
      "BYOK mode requires an API Key for embeddings. Add API Key in settings.",
      "direct"
    );
  }

  const result = await requestEmbeddingsFromRoute(
    settings,
    "direct",
    normalizeInput(text),
    { fallbackToProxyOnDirectAuthError: false }
  );
  const vector = result.vectors[0];
  if (!vector) {
    throw createEmbeddingError(
      "EMBEDDING_EMPTY_RESULT",
      "Embedding response contains no vectors."
    );
  }
  return new Float32Array(vector);
}
