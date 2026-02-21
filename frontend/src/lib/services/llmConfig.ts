import type {
  LlmAccessMode,
  LlmConfig,
  ThinkHandlingPolicy,
} from "../types";

export const MODELSCOPE_BASE_URL = "https://api-inference.modelscope.cn/v1/";
export const DEFAULT_PROXY_BASE_URL = "https://vesti-proxy.vercel.app/api";
export const DEFAULT_PROXY_URL = `${DEFAULT_PROXY_BASE_URL}/chat`;
export const DEFAULT_PROXY_EMBEDDINGS_URL = `${DEFAULT_PROXY_BASE_URL}/embeddings`;
export const DEFAULT_STABLE_MODEL = "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B";
export const DEFAULT_BACKUP_MODEL = "Qwen/Qwen3-14B";

export type ProxyRoute = "chat" | "embeddings";

function normalizeMode(mode: LlmAccessMode | undefined): LlmAccessMode {
  return mode === "custom_byok" ? "custom_byok" : "demo_proxy";
}

function normalizeThinkPolicy(
  policy: ThinkHandlingPolicy | undefined
): ThinkHandlingPolicy {
  if (policy === "keep_debug" || policy === "keep_raw") {
    return policy;
  }
  return "strip";
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeProxyBaseCandidate(value: string | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname
      .replace(/\/+$/, "")
      .replace(/\/(chat|embeddings)$/i, "");
    return trimSlashes(`${parsed.origin}${parsed.pathname}`);
  } catch {
    return trimSlashes(raw).replace(/\/(chat|embeddings)$/i, "");
  }
}

function resolveProxyBaseUrl(
  settings: Pick<LlmConfig, "proxyBaseUrl" | "proxyUrl">
): string {
  const explicit = normalizeProxyBaseCandidate(settings.proxyBaseUrl);
  if (explicit) return explicit;

  const legacy = normalizeProxyBaseCandidate(settings.proxyUrl);
  if (legacy) return legacy;

  return DEFAULT_PROXY_BASE_URL;
}

function buildProxyRouteUrl(baseUrl: string, route: ProxyRoute): string {
  return `${trimSlashes(baseUrl)}/${route}`;
}

export function getProxyBaseUrl(settings: Pick<LlmConfig, "proxyBaseUrl" | "proxyUrl">): string {
  return resolveProxyBaseUrl(settings);
}

export function getProxyRouteUrl(
  settings: Pick<LlmConfig, "proxyBaseUrl" | "proxyUrl">,
  route: ProxyRoute
): string {
  const baseUrl = getProxyBaseUrl(settings);
  return buildProxyRouteUrl(baseUrl, route);
}

export function needsProxySettingsBackfill(
  settings: Pick<LlmConfig, "proxyBaseUrl" | "proxyUrl">
): boolean {
  const normalizedBase = getProxyBaseUrl(settings);
  const normalizedChat = getProxyRouteUrl(settings, "chat");
  const rawBase = (settings.proxyBaseUrl || "").trim();
  const rawChat = (settings.proxyUrl || "").trim();

  return rawBase !== normalizedBase || rawChat !== normalizedChat;
}

export function buildDefaultLlmSettings(now = Date.now()): LlmConfig {
  return {
    provider: "modelscope",
    baseUrl: MODELSCOPE_BASE_URL,
    apiKey: "",
    modelId: DEFAULT_STABLE_MODEL,
    temperature: 0.3,
    maxTokens: 800,
    updatedAt: now,
    mode: "demo_proxy",
    proxyBaseUrl: DEFAULT_PROXY_BASE_URL,
    proxyUrl: DEFAULT_PROXY_URL,
    proxyServiceToken: "",
    gatewayLock: "modelscope",
    customModelId: DEFAULT_STABLE_MODEL,
    streamMode: "off",
    reasoningPolicy: "off",
    capabilitySource: "model_id_heuristic",
    thinkHandlingPolicy: "strip",
  };
}

export function normalizeLlmSettings(
  settings: LlmConfig | null | undefined
): LlmConfig {
  const fallback = buildDefaultLlmSettings();
  if (!settings) {
    return fallback;
  }

  const mode = normalizeMode(settings.mode);
  const modelId = (settings.modelId || "").trim() || DEFAULT_STABLE_MODEL;
  const customModelId =
    (settings.customModelId || "").trim() || modelId || DEFAULT_STABLE_MODEL;
  const proxyBaseUrl = getProxyBaseUrl(settings);
  const proxyUrl = getProxyRouteUrl({ proxyBaseUrl, proxyUrl: settings.proxyUrl }, "chat");
  const proxyServiceToken = (settings.proxyServiceToken || "").trim();

  if (mode === "demo_proxy") {
    return {
      ...fallback,
      ...settings,
      provider: "modelscope",
      baseUrl: MODELSCOPE_BASE_URL,
      modelId: DEFAULT_STABLE_MODEL,
      mode,
      proxyBaseUrl,
      proxyUrl,
      proxyServiceToken,
      gatewayLock: "modelscope",
      customModelId: DEFAULT_STABLE_MODEL,
      streamMode: settings.streamMode === "on" ? "on" : "off",
      reasoningPolicy:
        settings.reasoningPolicy === "auto" || settings.reasoningPolicy === "force"
          ? settings.reasoningPolicy
          : "off",
      capabilitySource:
        settings.capabilitySource === "provider_catalog"
          ? "provider_catalog"
          : "model_id_heuristic",
      thinkHandlingPolicy: normalizeThinkPolicy(settings.thinkHandlingPolicy),
    };
  }

  return {
    ...fallback,
    ...settings,
    provider: "modelscope",
    baseUrl: MODELSCOPE_BASE_URL,
    modelId,
    mode,
    proxyBaseUrl,
    proxyUrl,
    proxyServiceToken,
    gatewayLock: "modelscope",
    customModelId,
    streamMode: settings.streamMode === "on" ? "on" : "off",
    reasoningPolicy:
      settings.reasoningPolicy === "auto" || settings.reasoningPolicy === "force"
        ? settings.reasoningPolicy
        : "off",
    capabilitySource:
      settings.capabilitySource === "provider_catalog"
        ? "provider_catalog"
        : "model_id_heuristic",
    thinkHandlingPolicy: normalizeThinkPolicy(settings.thinkHandlingPolicy),
  };
}

export function getLlmAccessMode(settings: LlmConfig): LlmAccessMode {
  return normalizeMode(settings.mode);
}

export function getEffectiveModelId(settings: LlmConfig): string {
  return (settings.customModelId || settings.modelId || DEFAULT_STABLE_MODEL).trim();
}
