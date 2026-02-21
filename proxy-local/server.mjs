import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const MODELSCOPE_API_KEY = (process.env.MODELSCOPE_API_KEY || "").trim();
const VESTI_SERVICE_TOKEN = (process.env.VESTI_SERVICE_TOKEN || "").trim();
const ALLOWED_ORIGIN_RULES = (process.env.VESTI_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const CHAT_PRIMARY_MODEL =
  (process.env.VESTI_CHAT_PRIMARY_MODEL || "").trim() ||
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B";
const CHAT_BACKUP_MODEL =
  (process.env.VESTI_CHAT_BACKUP_MODEL || "").trim() || "Qwen/Qwen3-14B";

const EMBEDDING_MODEL =
  (process.env.VESTI_EMBEDDING_MODEL || "").trim() || "text-embedding-v2";
const EMBED_BATCH_MAX = Number.parseInt(
  process.env.VESTI_EMBED_BATCH_MAX || "32",
  10
);
const EMBED_TEXT_MAX_CHARS = Number.parseInt(
  process.env.VESTI_EMBED_TEXT_MAX_CHARS || "8000",
  10
);
const UPSTREAM_TIMEOUT_MS = Number.parseInt(
  process.env.VESTI_UPSTREAM_TIMEOUT_MS || "20000",
  10
);

const CHAT_UPSTREAM_URL = "https://api-inference.modelscope.cn/v1/chat/completions";
const EMBEDDINGS_UPSTREAM_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";

const ALLOWED_CHAT_ROLES = new Set(["system", "user", "assistant"]);

function nowMs() {
  return Date.now();
}

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}

function originMatchesRule(origin, rule) {
  if (rule === "*") return true;
  if (rule === "chrome-extension://*") {
    return origin.startsWith("chrome-extension://");
  }
  if (rule.endsWith("*")) {
    return origin.startsWith(rule.slice(0, -1));
  }
  return origin === rule;
}

function resolveAllowedOrigin(origin) {
  if (!origin) return null;
  for (const rule of ALLOWED_ORIGIN_RULES) {
    if (originMatchesRule(origin, rule)) {
      return rule === "*" ? "*" : origin;
    }
  }
  return null;
}

function setCommonHeaders(res, requestId) {
  res.setHeader("x-request-id", requestId);
  res.setHeader("cache-control", "no-store");
}

function setCorsHeaders(res, origin, allowedOrigin) {
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-vesti-service-token"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "x-request-id, x-proxy-model-used, x-proxy-attempt"
  );
}

function writeJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) {
      throw new Error("REQUEST_BODY_TOO_LARGE");
    }
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("upstream_timeout"), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildErrorPayload(code, message, requestId, extras = {}) {
  return {
    error: {
      code,
      message,
      requestId,
      ...extras,
    },
  };
}

function clampMaxTokens(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 800;
  }
  return Math.max(1, Math.min(Math.floor(value), 800));
}

function sanitizeChatPayload(body) {
  const requestedModel = typeof body.model === "string" ? body.model.trim() : "";
  const model =
    requestedModel === CHAT_PRIMARY_MODEL || requestedModel === CHAT_BACKUP_MODEL
      ? requestedModel
      : CHAT_PRIMARY_MODEL;

  const messages = Array.isArray(body.messages)
    ? body.messages
        .filter(
          (item) =>
            item &&
            typeof item === "object" &&
            ALLOWED_CHAT_ROLES.has(item.role) &&
            item.content !== undefined
        )
        .map((item) => ({
          role: item.role,
          content: item.content,
        }))
    : [];

  const payload = {
    model,
    enable_thinking: false,
    temperature:
      typeof body.temperature === "number" && Number.isFinite(body.temperature)
        ? body.temperature
        : 0.3,
    max_tokens: clampMaxTokens(body.max_tokens),
    messages,
  };

  if (
    body.response_format &&
    typeof body.response_format === "object" &&
    body.response_format.type === "json_object"
  ) {
    payload.response_format = { type: "json_object" };
  }

  return payload;
}

async function handleChat(req, res, requestId, origin, allowedOrigin) {
  if (!MODELSCOPE_API_KEY) {
    writeJson(
      res,
      500,
      buildErrorPayload(
        "PROXY_API_KEY_MISSING",
        "MODELSCOPE_API_KEY is not configured.",
        requestId
      )
    );
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    writeJson(
      res,
      400,
      buildErrorPayload("INVALID_JSON", "Request body must be valid JSON.", requestId)
    );
    return;
  }

  const payload = sanitizeChatPayload(body);
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    writeJson(
      res,
      400,
      buildErrorPayload("INVALID_MESSAGES", "Payload must include messages.", requestId)
    );
    return;
  }

  const startedAt = nowMs();
  const attempts = [
    { model: payload.model, attempt: 1 },
    { model: payload.model === CHAT_PRIMARY_MODEL ? CHAT_BACKUP_MODEL : CHAT_PRIMARY_MODEL, attempt: 2 },
  ];

  let finalStatus = 502;
  let finalBody = "";
  let finalModel = attempts[0].model;
  let finalAttempt = 1;

  for (const step of attempts) {
    const chatPayload = { ...payload, model: step.model };

    try {
      const upstream = await fetchWithTimeout(
        CHAT_UPSTREAM_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MODELSCOPE_API_KEY}`,
          },
          body: JSON.stringify(chatPayload),
        },
        UPSTREAM_TIMEOUT_MS
      );

      finalStatus = upstream.status;
      finalBody = await upstream.text();
      finalModel = step.model;
      finalAttempt = step.attempt;

      if (!shouldRetryStatus(upstream.status) || step.attempt === 2) {
        break;
      }
    } catch (error) {
      finalStatus = 502;
      finalBody = JSON.stringify(
        buildErrorPayload(
          "UPSTREAM_NETWORK_ERROR",
          "Failed to reach chat upstream.",
          requestId,
          { cause: String(error) }
        )
      );
      finalModel = step.model;
      finalAttempt = step.attempt;

      if (step.attempt === 2) {
        break;
      }
    }
  }

  res.statusCode = finalStatus;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("x-proxy-model-used", finalModel);
  res.setHeader("x-proxy-attempt", String(finalAttempt));
  setCommonHeaders(res, requestId);
  setCorsHeaders(res, origin, allowedOrigin);
  res.end(finalBody);

  console.info(
    JSON.stringify({
      route: "/api/chat",
      requestId,
      origin: origin || null,
      upstreamStatus: finalStatus,
      model: finalModel,
      attempt: finalAttempt,
      latencyMs: nowMs() - startedAt,
    })
  );
}

function normalizeEmbeddingInput(body) {
  if (Array.isArray(body.input)) {
    return body.input.filter((item) => typeof item === "string").map((item) => item.trim());
  }
  if (typeof body.input === "string") {
    return [body.input.trim()];
  }
  return [];
}

async function handleEmbeddings(req, res, requestId, origin, allowedOrigin) {
  if (!MODELSCOPE_API_KEY) {
    writeJson(
      res,
      500,
      buildErrorPayload(
        "PROXY_API_KEY_MISSING",
        "MODELSCOPE_API_KEY is not configured.",
        requestId
      )
    );
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    writeJson(
      res,
      400,
      buildErrorPayload("INVALID_JSON", "Request body must be valid JSON.", requestId)
    );
    return;
  }

  const input = normalizeEmbeddingInput(body).filter((text) => text.length > 0);
  if (input.length === 0) {
    writeJson(
      res,
      400,
      buildErrorPayload("INVALID_INPUT", "Embedding input cannot be empty.", requestId)
    );
    return;
  }
  if (input.length > EMBED_BATCH_MAX) {
    writeJson(
      res,
      413,
      buildErrorPayload(
        "BATCH_TOO_LARGE",
        `Batch size exceeds ${EMBED_BATCH_MAX}.`,
        requestId
      )
    );
    return;
  }
  if (input.some((text) => text.length > EMBED_TEXT_MAX_CHARS)) {
    writeJson(
      res,
      422,
      buildErrorPayload(
        "TEXT_TOO_LONG",
        `Single text exceeds ${EMBED_TEXT_MAX_CHARS} characters.`,
        requestId
      )
    );
    return;
  }

  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : EMBEDDING_MODEL;

  const payload = {
    model,
    input,
    encoding_format: "float",
  };

  const startedAt = nowMs();
  try {
    const upstream = await fetchWithTimeout(
      EMBEDDINGS_UPSTREAM_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MODELSCOPE_API_KEY}`,
        },
        body: JSON.stringify(payload),
      },
      UPSTREAM_TIMEOUT_MS
    );

    const responseText = await upstream.text();
    setCommonHeaders(res, requestId);
    setCorsHeaders(res, origin, allowedOrigin);

    if (!upstream.ok) {
      const detail = responseText.slice(0, 1200);
      writeJson(
        res,
        upstream.status,
        buildErrorPayload(
          "UPSTREAM_EMBEDDING_ERROR",
          "Embedding upstream request failed.",
          requestId,
          {
            upstreamStatus: upstream.status,
            detail,
          }
        )
      );
    } else {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(responseText);
    }

    console.info(
      JSON.stringify({
        route: "/api/embeddings",
        requestId,
        origin: origin || null,
        batchSize: input.length,
        model,
        upstreamStatus: upstream.status,
        latencyMs: nowMs() - startedAt,
      })
    );
  } catch (error) {
    setCommonHeaders(res, requestId);
    setCorsHeaders(res, origin, allowedOrigin);
    writeJson(
      res,
      502,
      buildErrorPayload(
        "UPSTREAM_NETWORK_ERROR",
        "Failed to reach embeddings upstream.",
        requestId,
        { cause: String(error) }
      )
    );
  }
}

const server = createServer(async (req, res) => {
  const requestId = randomUUID();
  const method = req.method || "GET";
  const path = trimTrailingSlashes((req.url || "").split("?")[0] || "");
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const allowedOrigin = resolveAllowedOrigin(origin);

  setCommonHeaders(res, requestId);
  setCorsHeaders(res, origin, allowedOrigin);

  if (origin && !allowedOrigin) {
    writeJson(
      res,
      403,
      buildErrorPayload("ORIGIN_FORBIDDEN", "Origin is not allowed.", requestId)
    );
    return;
  }

  if (method === "OPTIONS" && (path === "/api/chat" || path === "/api/embeddings")) {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (method !== "POST") {
    writeJson(
      res,
      405,
      buildErrorPayload("METHOD_NOT_ALLOWED", "Only POST and OPTIONS are supported.", requestId)
    );
    return;
  }

  if (!VESTI_SERVICE_TOKEN) {
    writeJson(
      res,
      500,
      buildErrorPayload(
        "SERVICE_TOKEN_NOT_CONFIGURED",
        "VESTI_SERVICE_TOKEN is not configured.",
        requestId
      )
    );
    return;
  }

  const providedToken = (req.headers["x-vesti-service-token"] || "").toString().trim();
  if (!providedToken || providedToken !== VESTI_SERVICE_TOKEN) {
    writeJson(
      res,
      401,
      buildErrorPayload("UNAUTHORIZED", "Missing or invalid service token.", requestId)
    );
    return;
  }

  if (path === "/api/chat") {
    await handleChat(req, res, requestId, origin, allowedOrigin);
    return;
  }

  if (path === "/api/embeddings") {
    await handleEmbeddings(req, res, requestId, origin, allowedOrigin);
    return;
  }

  writeJson(
    res,
    404,
    buildErrorPayload("NOT_FOUND", "Route not found.", requestId)
  );
});

server.listen(PORT, () => {
  console.info(
    `[vesti-local-proxy] listening on http://127.0.0.1:${PORT} (allowed origins: ${ALLOWED_ORIGIN_RULES.join(", ") || "none"})`
  );
});
