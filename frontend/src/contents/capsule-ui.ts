import type { PlasmoCSConfig } from "plasmo";
import { sendRequest } from "../lib/messaging/runtime";
import {
  DEFAULT_CAPSULE_SETTINGS,
  getCapsuleSettingsForHost,
  updateCapsuleSettingsForHost,
  type CapsuleAnchor,
  type CapsuleSettings,
  type CapsuleViewMode,
} from "../lib/services/capsuleSettingsService";
import type { ActiveCaptureStatus, Platform } from "../lib/types";
import { LOGO_BASE64 } from "../lib/ui/logo";
import { logger } from "../lib/utils/logger";

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*",
    "https://www.doubao.com/*",
    "https://chat.qwen.ai/*",
  ],
  run_at: "document_idle",
  all_frames: false,
};

type CapsuleRuntimeState =
  | "idle"
  | "mirroring"
  | "holding"
  | "ready_to_archive"
  | "archiving"
  | "saved"
  | "error";

type DragSource = "collapsed" | "expanded";

interface DragSession {
  active: boolean;
  pointerId: number | null;
  source: DragSource | null;
  canDrag: boolean;
  startedWithModifier: boolean;
  dragging: boolean;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
}

const CAPSULE_ROOT_ID = "vesti-capsule-root";
const CAPSULE_Z_INDEX = 2147483646;
const POLL_INTERVAL_MS = 3000;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];
const DRAG_THRESHOLD_PX = 5;
const VIEWPORT_MARGIN = 8;
const COLLAPSED_SIZE = 43.2;
const LOGO_SIZE = 21.6;
const PRIMARY_ROLLOUT_HOSTS = new Set([
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "gemini.google.com",
  "chat.deepseek.com",
  "chat.qwen.ai",
  "www.doubao.com",
]);

const PLATFORM_BY_HOST: Record<string, Platform> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "chat.deepseek.com": "DeepSeek",
  "chat.qwen.ai": "Qwen",
  "www.doubao.com": "Doubao",
};

const PLATFORM_COLOR: Record<Platform, string> = {
  ChatGPT: "#10a37f",
  Claude: "#d97706",
  Gemini: "#2563eb",
  DeepSeek: "#4f46e5",
  Qwen: "#0f766e",
  Doubao: "#db2777",
};

const ERROR_MESSAGE_MAP: Record<string, string> = {
  ARCHIVE_MODE_DISABLED: "Archive is disabled in mirror mode.",
  ACTIVE_TAB_UNSUPPORTED: "Current tab host is unsupported.",
  ACTIVE_TAB_UNAVAILABLE: "Active tab is unavailable.",
  TRANSIENT_NOT_FOUND: "No thread snapshot available yet.",
  missing_conversation_id: "Waiting for stable conversation URL.",
  empty_payload: "No parsed messages available to archive.",
  storage_limit_blocked: "Storage is full. Export or clean up first.",
  persist_failed: "Archive failed during persistence.",
  FORCE_ARCHIVE_FAILED: "Archive action failed. Retry.",
  content_unreachable: "Capture context is temporarily unreachable.",
};

const SHADOW_STYLE = `
:host {
  all: initial;
}

.capsule-shell {
  position: fixed;
  pointer-events: auto;
  touch-action: none;
  z-index: ${CAPSULE_Z_INDEX};
  font-family: "Segoe UI", "PingFang SC", sans-serif;
  color: #0f172a;
}

.capsule-shell.is-dragging,
.capsule-shell.is-dragging * {
  cursor: grabbing !important;
  user-select: none;
}

.capsule-collapsed {
  width: ${COLLAPSED_SIZE}px;
  height: ${COLLAPSED_SIZE}px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 9999px;
  background: #ffffff;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.16), 0 4px 10px rgba(15, 23, 42, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 120ms ease, box-shadow 120ms ease;
  cursor: pointer;
  padding: 0;
}

.capsule-collapsed:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.2), 0 5px 12px rgba(15, 23, 42, 0.14);
}

.capsule-collapsed:active {
  transform: scale(0.97);
}

.capsule-logo {
  width: ${LOGO_SIZE}px;
  height: ${LOGO_SIZE}px;
  object-fit: contain;
  -webkit-user-drag: none;
  user-select: none;
}

.capsule-panel {
  width: 292px;
  box-sizing: border-box;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.18), 0 4px 14px rgba(15, 23, 42, 0.12);
  padding: 10px;
}

.capsule-shell[data-view="collapsed"] .capsule-panel {
  display: none;
}

.capsule-shell[data-view="expanded"] .capsule-collapsed {
  display: none;
}

.capsule-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.capsule-drag-handle {
  cursor: grab;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.capsule-title {
  font-size: 13px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.capsule-platform {
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
  color: #ffffff;
  padding: 4px 8px;
  border-radius: 9999px;
}

.capsule-collapse-btn {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
}

.capsule-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.capsule-status-badge {
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  padding: 5px 8px;
  border-radius: 9999px;
  border: 1px solid transparent;
}

.capsule-status-badge[data-state="idle"] {
  color: #475569;
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.capsule-status-badge[data-state="mirroring"] {
  color: #065f46;
  background: #d1fae5;
  border-color: #a7f3d0;
}

.capsule-status-badge[data-state="holding"] {
  color: #92400e;
  background: #fef3c7;
  border-color: #fde68a;
}

.capsule-status-badge[data-state="ready_to_archive"] {
  color: #1d4ed8;
  background: #dbeafe;
  border-color: #bfdbfe;
}

.capsule-status-badge[data-state="archiving"] {
  color: #312e81;
  background: #e0e7ff;
  border-color: #c7d2fe;
}

.capsule-status-badge[data-state="saved"] {
  color: #166534;
  background: #dcfce7;
  border-color: #bbf7d0;
}

.capsule-status-badge[data-state="error"] {
  color: #991b1b;
  background: #fee2e2;
  border-color: #fecaca;
}

.capsule-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

.capsule-metric {
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 10px;
  background: #f8fafc;
  padding: 6px 8px;
  display: grid;
  gap: 4px;
}

.capsule-metric-label {
  font-size: 11px;
  line-height: 1;
  color: #475569;
}

.capsule-metric-value {
  font-size: 14px;
  line-height: 1.1;
  font-weight: 700;
  color: #0f172a;
}

.capsule-reason {
  min-height: 16px;
  font-size: 12px;
  line-height: 1.3;
  color: #475569;
  margin-bottom: 8px;
}

.capsule-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.capsule-action-btn {
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  cursor: pointer;
  background: #f8fafc;
  color: #0f172a;
}

.capsule-action-btn:hover:enabled {
  background: #f1f5f9;
}

.capsule-action-btn:disabled {
  cursor: not-allowed;
  color: #94a3b8;
  background: #f8fafc;
}

.capsule-action-btn.is-primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.capsule-action-btn.is-primary:hover:enabled {
  background: #1d4ed8;
}

.fallback-shell .capsule-collapsed {
  cursor: pointer;
}
`;

const clamp = (value: number, min: number, max: number): number => {
  const normalizedMax = Math.max(min, max);
  return Math.min(Math.max(value, min), normalizedMax);
};

const normalizeHost = (host: string): string =>
  String(host ?? "")
    .trim()
    .toLowerCase();

const resolvePlatform = (host: string): Platform | undefined => {
  const normalizedHost = normalizeHost(host);
  return PLATFORM_BY_HOST[normalizedHost];
};

const resolveReasonMessage = (errorCode?: string | null): string | null => {
  if (!errorCode) return null;
  const direct = ERROR_MESSAGE_MAP[errorCode];
  if (direct) return direct;
  const normalizedKey = Object.keys(ERROR_MESSAGE_MAP).find((key) =>
    errorCode.includes(key)
  );
  return normalizedKey ? ERROR_MESSAGE_MAP[normalizedKey] : errorCode;
};

const labelForState = (state: CapsuleRuntimeState): string => {
  switch (state) {
    case "idle":
      return "Unavailable";
    case "mirroring":
      return "Mirroring";
    case "holding":
      return "Held";
    case "ready_to_archive":
      return "Ready";
    case "archiving":
      return "Archiving...";
    case "saved":
      return "Saved";
    case "error":
      return "Action failed";
  }
};

const openSidepanel = async (): Promise<boolean> => {
  if (!chrome?.runtime?.sendMessage) return false;

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "OPEN_SIDEPANEL", source: "capsule-ui" },
      () => {
        const lastError = chrome.runtime.lastError;
        resolve(!lastError);
      }
    );
  });
};

const getRetryDelay = (failureCount: number): number => {
  if (failureCount <= 0) return POLL_INTERVAL_MS;
  if (failureCount <= RETRY_BACKOFF_MS.length) {
    return RETRY_BACKOFF_MS[failureCount - 1];
  }
  return POLL_INTERVAL_MS;
};

const mount = async () => {
  if (window.top !== window.self) return;
  if (document.getElementById(CAPSULE_ROOT_ID)) return;

  const hostname = normalizeHost(window.location.hostname);
  const isPrimaryRolloutHost = PRIMARY_ROLLOUT_HOSTS.has(hostname);

  let settings: CapsuleSettings = DEFAULT_CAPSULE_SETTINGS;
  try {
    settings = await getCapsuleSettingsForHost(hostname);
  } catch (error) {
    logger.warn("content", "Failed to load capsule settings, fallback to defaults", {
      host: hostname,
      error: (error as Error).message,
    });
  }

  if (!settings.enabled || settings.hiddenHosts.includes(hostname)) {
    logger.info("content", "Capsule hidden by settings", { host: hostname });
    return;
  }

  const host = document.createElement("div");
  host.id = CAPSULE_ROOT_ID;
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = String(CAPSULE_Z_INDEX);
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styleNode = document.createElement("style");
  styleNode.textContent = SHADOW_STYLE;
  shadow.appendChild(styleNode);

  const shell = document.createElement("div");
  shell.className = isPrimaryRolloutHost ? "capsule-shell" : "capsule-shell fallback-shell";
  shell.dataset.view = "collapsed";
  shell.dataset.state = "idle";
  shadow.appendChild(shell);

  const collapsedButton = document.createElement("button");
  collapsedButton.type = "button";
  collapsedButton.className = "capsule-collapsed";
  collapsedButton.setAttribute("aria-label", "Vesti capsule");
  collapsedButton.title = isPrimaryRolloutHost
    ? "Open Vesti capsule"
    : "Open Vesti Dock";
  const logo = document.createElement("img");
  logo.className = "capsule-logo";
  logo.src = LOGO_BASE64;
  logo.alt = "Vesti";
  logo.draggable = false;
  collapsedButton.appendChild(logo);
  shell.appendChild(collapsedButton);

  const panel = document.createElement("section");
  panel.className = "capsule-panel";
  panel.hidden = true;

  const header = document.createElement("div");
  header.className = "capsule-header";

  const dragHandle = document.createElement("div");
  dragHandle.className = "capsule-drag-handle";
  dragHandle.setAttribute("role", "presentation");

  const title = document.createElement("span");
  title.className = "capsule-title";
  title.textContent = "Vesti Capsule";

  const platformBadge = document.createElement("span");
  platformBadge.className = "capsule-platform";
  platformBadge.textContent = resolvePlatform(hostname) ?? "Unknown";
  const initialPlatform = resolvePlatform(hostname);
  platformBadge.style.backgroundColor = initialPlatform
    ? PLATFORM_COLOR[initialPlatform]
    : "#475569";

  dragHandle.appendChild(title);
  dragHandle.appendChild(platformBadge);

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "capsule-collapse-btn";
  collapseBtn.textContent = "Collapse";

  header.appendChild(dragHandle);
  header.appendChild(collapseBtn);

  const statusRow = document.createElement("div");
  statusRow.className = "capsule-status-row";

  const statusBadge = document.createElement("span");
  statusBadge.className = "capsule-status-badge";
  statusBadge.dataset.state = "idle";
  statusBadge.textContent = "Unavailable";

  const statusHost = document.createElement("span");
  statusHost.className = "capsule-metric-label";
  statusHost.textContent = hostname;

  statusRow.appendChild(statusBadge);
  statusRow.appendChild(statusHost);

  const metrics = document.createElement("div");
  metrics.className = "capsule-metrics";

  const messagesMetric = document.createElement("div");
  messagesMetric.className = "capsule-metric";
  const messagesLabel = document.createElement("span");
  messagesLabel.className = "capsule-metric-label";
  messagesLabel.textContent = "Messages";
  const messagesValue = document.createElement("span");
  messagesValue.className = "capsule-metric-value";
  messagesValue.textContent = "--";
  messagesMetric.appendChild(messagesLabel);
  messagesMetric.appendChild(messagesValue);

  const turnsMetric = document.createElement("div");
  turnsMetric.className = "capsule-metric";
  const turnsLabel = document.createElement("span");
  turnsLabel.className = "capsule-metric-label";
  turnsLabel.textContent = "Turns";
  const turnsValue = document.createElement("span");
  turnsValue.className = "capsule-metric-value";
  turnsValue.textContent = "--";
  turnsMetric.appendChild(turnsLabel);
  turnsMetric.appendChild(turnsValue);

  metrics.appendChild(messagesMetric);
  metrics.appendChild(turnsMetric);

  const reasonLine = document.createElement("div");
  reasonLine.className = "capsule-reason";
  reasonLine.textContent = "Waiting for status...";

  const actions = document.createElement("div");
  actions.className = "capsule-actions";

  const archiveBtn = document.createElement("button");
  archiveBtn.type = "button";
  archiveBtn.className = "capsule-action-btn is-primary";
  archiveBtn.textContent = "Archive now";

  const openDockBtn = document.createElement("button");
  openDockBtn.type = "button";
  openDockBtn.className = "capsule-action-btn";
  openDockBtn.textContent = "Open Dock";

  actions.appendChild(archiveBtn);
  actions.appendChild(openDockBtn);

  panel.appendChild(header);
  panel.appendChild(statusRow);
  panel.appendChild(metrics);
  panel.appendChild(reasonLine);
  panel.appendChild(actions);

  if (isPrimaryRolloutHost) {
    shell.appendChild(panel);
  }

  let viewMode: CapsuleViewMode = isPrimaryRolloutHost
    ? settings.defaultView
    : "collapsed";
  let runtimeStatus: ActiveCaptureStatus | null = null;
  let runtimeError: string | null = null;
  let uiState: CapsuleRuntimeState = "idle";
  let inFlightArchive = false;
  let savedUntil = 0;
  let pollTimer: number | null = null;
  let autoCollapseTimer: number | null = null;
  let failureCount = 0;
  let destroyed = false;
  let suppressCollapsedClick = false;

  const dragSession: DragSession = {
    active: false,
    pointerId: null,
    source: null,
    canDrag: false,
    startedWithModifier: false,
    dragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  };

  const getShellSize = () => {
    const rect = shell.getBoundingClientRect();
    return {
      width: Math.max(rect.width || 0, COLLAPSED_SIZE),
      height: Math.max(rect.height || 0, COLLAPSED_SIZE),
    };
  };

  const clampOffsetsToViewport = (
    anchor: CapsuleAnchor,
    offsetX: number,
    offsetY: number
  ) => {
    const { width, height } = getShellSize();
    const maxOffsetX = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxOffsetY = window.innerHeight - height - VIEWPORT_MARGIN;
    return {
      anchor,
      offsetX: clamp(offsetX, VIEWPORT_MARGIN, maxOffsetX),
      offsetY: clamp(offsetY, VIEWPORT_MARGIN, maxOffsetY),
    };
  };

  const applyAnchoredPosition = () => {
    const next = clampOffsetsToViewport(
      settings.anchor,
      settings.offsetX,
      settings.offsetY
    );
    settings = {
      ...settings,
      anchor: next.anchor,
      offsetX: next.offsetX,
      offsetY: next.offsetY,
    };

    shell.style.top = "auto";
    shell.style.bottom = `${settings.offsetY}px`;

    if (settings.anchor === "bottom_right") {
      shell.style.left = "auto";
      shell.style.right = `${settings.offsetX}px`;
      return;
    }

    shell.style.left = `${settings.offsetX}px`;
    shell.style.right = "auto";
  };

  const logAction = (
    action: "open_dock" | "archive_now" | "drag_end",
    ok: boolean,
    detail?: Record<string, unknown>
  ) => {
    const payload = {
      action,
      state: uiState,
      ok,
      ...detail,
    };
    if (ok) {
      logger.info("content", "Capsule action", payload);
    } else {
      logger.warn("content", "Capsule action failed", payload);
    }
  };

  const persistSettingsPatch = async (patch: Partial<CapsuleSettings>) => {
    try {
      settings = await updateCapsuleSettingsForHost(hostname, patch);
    } catch (error) {
      logger.warn("content", "Failed to persist capsule settings", {
        host: hostname,
        patch,
        error: (error as Error).message,
      });
    }
  };

  const deriveUiState = (): CapsuleRuntimeState => {
    if (inFlightArchive) return "archiving";
    if (savedUntil > Date.now()) return "saved";
    if (runtimeError) return "error";

    if (!runtimeStatus || !runtimeStatus.supported) {
      return "idle";
    }

    if (runtimeStatus.reason === "content_unreachable") {
      return "error";
    }

    if (runtimeStatus.mode === "mirror") {
      return "mirroring";
    }

    if (runtimeStatus.available) {
      return "ready_to_archive";
    }

    return "holding";
  };

  const buildReasonLine = () => {
    if (uiState === "error") {
      return resolveReasonMessage(runtimeError) ?? "Action failed";
    }

    switch (uiState) {
      case "idle":
        return "Open an active chat thread to continue.";
      case "mirroring":
        return "Mirror mode saves content automatically.";
      case "holding":
        return "Waiting for archivable thread snapshot.";
      case "ready_to_archive":
        return "Thread snapshot ready for manual archive.";
      case "archiving":
        return "Persisting snapshot...";
      case "saved":
        return "Archive completed.";
      default:
        return null;
    }
  };

  const renderCapsule = () => {
    if (destroyed) return;

    uiState = deriveUiState();
    shell.dataset.view = viewMode;
    shell.dataset.state = uiState;

    if (!isPrimaryRolloutHost) {
      shell.classList.add("fallback-shell");
      return;
    }

    panel.hidden = viewMode !== "expanded";
    collapsedButton.hidden = viewMode === "expanded";
    statusBadge.dataset.state = uiState;
    statusBadge.textContent = labelForState(uiState);

    const platform =
      runtimeStatus?.platform ?? resolvePlatform(hostname) ?? "ChatGPT";
    platformBadge.textContent = platform;
    platformBadge.style.backgroundColor = PLATFORM_COLOR[platform] ?? "#475569";

    messagesValue.textContent =
      typeof runtimeStatus?.messageCount === "number"
        ? String(runtimeStatus.messageCount)
        : "--";
    turnsValue.textContent =
      typeof runtimeStatus?.turnCount === "number"
        ? String(runtimeStatus.turnCount)
        : "--";

    archiveBtn.disabled = uiState !== "ready_to_archive";
    archiveBtn.textContent = uiState === "archiving" ? "Archiving..." : "Archive now";
    reasonLine.textContent = buildReasonLine() ?? "";
  };

  const syncPosition = () => {
    if (destroyed || dragSession.dragging) return;
    window.requestAnimationFrame(() => {
      if (destroyed || dragSession.dragging) return;
      applyAnchoredPosition();
    });
  };

  const setViewMode = (next: CapsuleViewMode, persist = true) => {
    if (!isPrimaryRolloutHost) return;
    if (viewMode === next) return;
    viewMode = next;
    renderCapsule();
    syncPosition();
    if (persist) {
      void persistSettingsPatch({ defaultView: next });
    }
  };

  const triggerOpenDock = async () => {
    const ok = await openSidepanel();
    logAction("open_dock", ok, { host: hostname });
  };

  const scheduleAutoCollapse = () => {
    if (autoCollapseTimer) {
      window.clearTimeout(autoCollapseTimer);
      autoCollapseTimer = null;
    }

    if (settings.autoCollapseMs <= 0) return;
    autoCollapseTimer = window.setTimeout(() => {
      if (destroyed) return;
      savedUntil = 0;
      setViewMode("collapsed", false);
      renderCapsule();
      syncPosition();
    }, settings.autoCollapseMs);
  };

  const scheduleNextPoll = (delay: number) => {
    if (!isPrimaryRolloutHost || destroyed) return;
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
    pollTimer = window.setTimeout(() => {
      void pollRuntimeStatus();
    }, delay);
  };

  const pollRuntimeStatus = async () => {
    if (!isPrimaryRolloutHost || destroyed) return;

    try {
      const status = await sendRequest<"GET_ACTIVE_CAPTURE_STATUS">(
        {
          type: "GET_ACTIVE_CAPTURE_STATUS",
          target: "background",
        },
        5000
      );

      runtimeStatus = status;
      runtimeError =
        status.reason === "content_unreachable" ? "content_unreachable" : null;
      failureCount = 0;
      renderCapsule();
      syncPosition();
      logger.info("content", "Capsule status", {
        host: hostname,
        platform: status.platform,
        mode: status.mode,
        state: deriveUiState(),
        supported: status.supported,
        available: status.available,
        paused: false,
        reason: status.reason,
        messageCount: status.messageCount,
        turnCount: status.turnCount,
        updatedAt: status.updatedAt,
      });

      scheduleNextPoll(POLL_INTERVAL_MS);
    } catch (error) {
      failureCount += 1;
      runtimeError = (error as Error).message || "ACTIVE_TAB_UNAVAILABLE";
      renderCapsule();
      scheduleNextPoll(getRetryDelay(failureCount));
      logger.warn("content", "Capsule status polling failed", {
        host: hostname,
        failureCount,
        error: runtimeError,
      });
    }
  };

  const handleArchiveNow = async () => {
    if (!isPrimaryRolloutHost || uiState !== "ready_to_archive") return;

    const startedAt = Date.now();
    inFlightArchive = true;
    runtimeError = null;
    renderCapsule();

    try {
      await sendRequest<"FORCE_ARCHIVE_TRANSIENT">(
        {
          type: "FORCE_ARCHIVE_TRANSIENT",
          target: "background",
        },
        10000
      );

      inFlightArchive = false;
      savedUntil = Date.now() + settings.autoCollapseMs;
      renderCapsule();
      scheduleAutoCollapse();
      logAction("archive_now", true, { durationMs: Date.now() - startedAt });
      void pollRuntimeStatus();
    } catch (error) {
      inFlightArchive = false;
      runtimeError = (error as Error).message || "FORCE_ARCHIVE_FAILED";
      renderCapsule();
      logAction("archive_now", false, {
        durationMs: Date.now() - startedAt,
        error: runtimeError,
      });
    }
  };

  const beginDrag = (event: PointerEvent, source: DragSource) => {
    if (!event.isPrimary || event.button !== 0 || dragSession.active) return;

    dragSession.active = true;
    dragSession.pointerId = event.pointerId;
    dragSession.source = source;
    dragSession.startedWithModifier = source === "collapsed" && event.altKey;
    dragSession.canDrag = true;
    dragSession.dragging = false;
    dragSession.startX = event.clientX;
    dragSession.startY = event.clientY;

    const rect = shell.getBoundingClientRect();
    dragSession.startLeft = rect.left;
    dragSession.startTop = rect.top;

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDrag = (event: PointerEvent) => {
    if (!dragSession.active || dragSession.pointerId !== event.pointerId) return;
    if (!dragSession.canDrag) return;

    const dx = event.clientX - dragSession.startX;
    const dy = event.clientY - dragSession.startY;

    if (!dragSession.dragging && Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
    if (!dragSession.dragging) {
      dragSession.dragging = true;
      shell.classList.add("is-dragging");
    }

    const { width, height } = getShellSize();
    const nextLeft = clamp(
      dragSession.startLeft + dx,
      VIEWPORT_MARGIN,
      window.innerWidth - width - VIEWPORT_MARGIN
    );
    const nextTop = clamp(
      dragSession.startTop + dy,
      VIEWPORT_MARGIN,
      window.innerHeight - height - VIEWPORT_MARGIN
    );

    shell.style.left = `${nextLeft}px`;
    shell.style.top = `${nextTop}px`;
    shell.style.right = "auto";
    shell.style.bottom = "auto";
    event.preventDefault();
  };

  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    if (!dragSession.active || dragSession.pointerId !== event.pointerId) return;

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    const completedDragging = dragSession.dragging;
    const startedWithModifier = dragSession.startedWithModifier;
    const source = dragSession.source;

    if (completedDragging) {
      const rect = shell.getBoundingClientRect();
      const anchor: CapsuleAnchor =
        rect.left + rect.width / 2 >= window.innerWidth / 2
          ? "bottom_right"
          : "bottom_left";

      const offsetXRaw =
        anchor === "bottom_right"
          ? window.innerWidth - rect.right
          : rect.left;
      const offsetYRaw = window.innerHeight - rect.bottom;
      const next = clampOffsetsToViewport(anchor, offsetXRaw, offsetYRaw);
      settings = {
        ...settings,
        anchor: next.anchor,
        offsetX: next.offsetX,
        offsetY: next.offsetY,
      };
      applyAnchoredPosition();
      void persistSettingsPatch({
        anchor: next.anchor,
        offsetX: next.offsetX,
        offsetY: next.offsetY,
      });
      logAction("drag_end", true, {
        anchor: next.anchor,
        offsetX: next.offsetX,
        offsetY: next.offsetY,
      });
      suppressCollapsedClick = true;
    } else if (source === "collapsed" && startedWithModifier && !cancelled) {
      suppressCollapsedClick = true;
    }

    dragSession.active = false;
    dragSession.pointerId = null;
    dragSession.source = null;
    dragSession.canDrag = false;
    dragSession.startedWithModifier = false;
    dragSession.dragging = false;
    shell.classList.remove("is-dragging");
  };

  const onResize = () => {
    syncPosition();
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (autoCollapseTimer) {
      window.clearTimeout(autoCollapseTimer);
      autoCollapseTimer = null;
    }
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pagehide", destroy);
    window.removeEventListener("beforeunload", destroy);
    host.remove();
  };

  collapsedButton.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (isPrimaryRolloutHost) {
      setViewMode("expanded");
      return;
    }
    void triggerOpenDock();
  });

  if (!isPrimaryRolloutHost) {
    collapsedButton.addEventListener("click", () => {
      void triggerOpenDock();
    });
  } else {
    collapsedButton.addEventListener("click", (event) => {
      if (suppressCollapsedClick) {
        suppressCollapsedClick = false;
        event.preventDefault();
        return;
      }
      setViewMode("expanded");
    });

    collapsedButton.addEventListener("pointerdown", (event) => {
      beginDrag(event, "collapsed");
    });
    collapsedButton.addEventListener("pointermove", (event) => {
      moveDrag(event);
    });
    collapsedButton.addEventListener("pointerup", (event) => {
      endDrag(event, false);
    });
    collapsedButton.addEventListener("pointercancel", (event) => {
      endDrag(event, true);
    });

    dragHandle.addEventListener("pointerdown", (event) => {
      beginDrag(event, "expanded");
    });
    dragHandle.addEventListener("pointermove", (event) => {
      moveDrag(event);
    });
    dragHandle.addEventListener("pointerup", (event) => {
      endDrag(event, false);
    });
    dragHandle.addEventListener("pointercancel", (event) => {
      endDrag(event, true);
    });

    collapseBtn.addEventListener("click", () => {
      setViewMode("collapsed");
    });
    archiveBtn.addEventListener("click", () => {
      void handleArchiveNow();
    });
    openDockBtn.addEventListener("click", () => {
      void triggerOpenDock();
    });
  }

  window.addEventListener("resize", onResize);
  window.addEventListener("pagehide", destroy);
  window.addEventListener("beforeunload", destroy);

  renderCapsule();
  syncPosition();

  if (isPrimaryRolloutHost) {
    void pollRuntimeStatus();
  } else {
    logger.info("content", "Capsule fallback mode enabled for host", {
      host: hostname,
      mode: "fallback_open_dock_only",
    });
  }
};

if (document.readyState === "loading") {
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      void mount();
    },
    { once: true }
  );
} else {
  void mount();
}
