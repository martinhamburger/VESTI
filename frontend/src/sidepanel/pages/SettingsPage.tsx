import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArrowRight,
  Eye,
  EyeOff,
  FolderGit2,
  Loader2,
  Moon,
  Sparkles,
  ShieldCheck,
  Sun,
} from "lucide-react";
import type {
  ActiveCaptureStatus,
  AsyncStatus,
  CaptureMode,
  CaptureSettings,
  LlmConfig,
  UiThemeMode,
} from "~lib/types";
import {
  DEFAULT_CAPTURE_SETTINGS,
  getCaptureSettings,
  setCaptureSettings,
} from "~lib/services/captureSettingsService";
import {
  DEFAULT_BACKUP_MODEL,
  DEFAULT_PROXY_BASE_URL,
  DEFAULT_PROXY_URL,
  DEFAULT_STABLE_MODEL,
  MODELSCOPE_BASE_URL,
  buildDefaultLlmSettings,
  getProxyRouteUrl,
  getLlmAccessMode,
  normalizeLlmSettings,
} from "~lib/services/llmConfig";
import {
  applyUiTheme,
  getUiSettings,
  setUiThemeMode,
} from "~lib/services/uiSettingsService";
import {
  forceArchiveTransient,
  getActiveCaptureStatus,
  getLlmSettings,
  setLlmSettings,
  testLlmConnection,
} from "~lib/services/storageService";
import { DisclosureSection } from "../components/DisclosureSection";

const MODEL_OPTIONS = [DEFAULT_STABLE_MODEL, DEFAULT_BACKUP_MODEL];
const MIN_TURNS_DEFAULT = DEFAULT_CAPTURE_SETTINGS.smartConfig.minTurns;

const CAPTURE_MODE_OPTIONS: Array<{ value: CaptureMode; label: string; description: string }> = [
  {
    value: "mirror",
    label: "Full Mirror",
    description: "Capture all parsed conversation updates.",
  },
  {
    value: "smart",
    label: "Smart Denoising",
    description: "Capture only when min-turn and keyword rules pass.",
  },
  {
    value: "manual",
    label: "Manual Archive",
    description: "Hold captures until you archive the active thread manually.",
  },
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseKeywordsInput(value: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const segment of value.split(",")) {
    const keyword = segment.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    result.push(keyword);
  }

  return result;
}

function formatCaptureStatusReason(reason?: ActiveCaptureStatus["reason"]): string {
  switch (reason) {
    case "ok":
      return "Ready";
    case "mode_mirror":
      return "Mirror mode does not need manual archive.";
    case "unsupported_tab":
      return "Open a ChatGPT, Claude, Gemini, DeepSeek, Doubao, or Qwen thread in the active tab.";
    case "no_transient":
      return "No active thread snapshot detected yet.";
    case "content_unreachable":
      return "Cannot reach page content script. Refresh the page and try again.";
    default:
      return "Status unavailable";
  }
}

function mapArchiveErrorMessage(error: unknown): string {
  const code = getErrorMessage(error);
  switch (code) {
    case "ARCHIVE_MODE_DISABLED":
      return "Manual archive is available only in Smart or Manual mode.";
    case "ACTIVE_TAB_UNSUPPORTED":
      return "Active tab is unsupported. Open ChatGPT, Claude, Gemini, DeepSeek, Doubao, or Qwen.";
    case "ACTIVE_TAB_UNAVAILABLE":
      return "No active tab found.";
    case "TRANSIENT_NOT_FOUND":
      return "No active thread snapshot found. Send one message and try again.";
    case "missing_conversation_id":
      return "Current URL has no stable conversation ID yet. Continue the thread and retry.";
    case "empty_payload":
      return "No parsed messages available to archive.";
    case "storage_limit_blocked":
      return "Storage hard limit reached. Export or clear data before archiving.";
    case "persist_failed":
      return "Archive write failed. Please retry.";
    case "FORCE_ARCHIVE_FAILED":
      return "Manual archive failed. Please retry.";
    default:
      return code;
  }
}

function formatStatusTimestamp(value?: number): string {
  if (!value) return "N/A";
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function resolveSettingsForMode(settings: LlmConfig): LlmConfig {
  const mode = getLlmAccessMode(settings);
  const next = normalizeLlmSettings({
    ...settings,
    baseUrl: MODELSCOPE_BASE_URL,
    gatewayLock: "modelscope",
    updatedAt: Date.now(),
  });

  if (mode === "demo_proxy") {
    return normalizeLlmSettings({
      ...next,
      mode,
      modelId: DEFAULT_STABLE_MODEL,
      proxyBaseUrl:
        (next.proxyBaseUrl || next.proxyUrl || "").trim() || DEFAULT_PROXY_BASE_URL,
      proxyUrl: DEFAULT_PROXY_URL,
      proxyServiceToken: (next.proxyServiceToken || "").trim(),
      thinkHandlingPolicy: next.thinkHandlingPolicy ?? "strip",
    });
  }

  const customModel = (next.customModelId || next.modelId || "").trim();
  return normalizeLlmSettings({
    ...next,
    mode,
    modelId: customModel || DEFAULT_STABLE_MODEL,
    customModelId: customModel || DEFAULT_STABLE_MODEL,
  });
}

interface SettingsPageProps {
  onNavigateToData?: () => void;
}

export function SettingsPage({ onNavigateToData }: SettingsPageProps) {
  const [llmSettings, setLlmSettingsState] = useState<LlmConfig>(
    buildDefaultLlmSettings()
  );
  const [captureSettings, setCaptureSettingsState] = useState<CaptureSettings>(
    DEFAULT_CAPTURE_SETTINGS
  );
  const [minTurnsInput, setMinTurnsInput] = useState(
    String(DEFAULT_CAPTURE_SETTINGS.smartConfig.minTurns)
  );
  const [blacklistInput, setBlacklistInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelStatus, setModelStatus] = useState<AsyncStatus>("idle");
  const [modelMessage, setModelMessage] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<AsyncStatus>("idle");
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [activeCaptureStatus, setActiveCaptureStatus] =
    useState<ActiveCaptureStatus | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<AsyncStatus>("idle");
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [archiveSummary, setArchiveSummary] = useState<{
    reason: string;
    messageCount: number;
    time: number;
  } | null>(null);
  const [themeMode, setThemeMode] = useState<UiThemeMode>("light");
  const [themeStatus, setThemeStatus] = useState<AsyncStatus>("idle");
  const [themeMessage, setThemeMessage] = useState<string | null>(null);

  const mode = getLlmAccessMode(llmSettings);
  const isCustomMode = mode === "custom_byok";
  const isSmartMode = captureSettings.mode === "smart";
  const isManualMode = captureSettings.mode === "manual";
  const demoProxyChatUrl = getProxyRouteUrl(llmSettings, "chat");
  const demoProxyEmbeddingsUrl = getProxyRouteUrl(llmSettings, "embeddings");
  const archiveMode = activeCaptureStatus?.mode;
  const canArchiveByMode = archiveMode === "smart" || archiveMode === "manual";
  const canArchiveNow =
    canArchiveByMode &&
    activeCaptureStatus?.supported === true &&
    activeCaptureStatus?.available === true &&
    activeCaptureStatus?.reason === "ok" &&
    archiveStatus !== "loading";

  const refreshActiveCaptureStatus = useCallback(async () => {
    try {
      const status = await getActiveCaptureStatus();
      setActiveCaptureStatus(status);
    } catch (error) {
      setActiveCaptureStatus((prev) => ({
        mode: prev?.mode ?? captureSettings.mode,
        supported: false,
        available: false,
        reason: "content_unreachable",
      }));
    }
  }, [captureSettings.mode]);

  useEffect(() => {
    getLlmSettings()
      .then((settings) => {
        if (settings) {
          setLlmSettingsState(normalizeLlmSettings(settings));
        } else {
          setLlmSettingsState(buildDefaultLlmSettings());
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getCaptureSettings()
      .then((settings) => {
        setCaptureSettingsState(settings);
        setMinTurnsInput(String(settings.smartConfig.minTurns));
        setBlacklistInput(settings.smartConfig.blacklistKeywords.join(", "));
      })
      .catch((error) => {
        setCaptureStatus("error");
        setCaptureMessage(getErrorMessage(error));
      });
  }, []);

  useEffect(() => {
    getUiSettings()
      .then((settings) => {
        setThemeMode(settings.themeMode);
        applyUiTheme(settings.themeMode);
      })
      .catch((error) => {
        setThemeStatus("error");
        setThemeMessage(getErrorMessage(error));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await refreshActiveCaptureStatus();
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [refreshActiveCaptureStatus]);

  const setMode = (custom: boolean) => {
    setLlmSettingsState((prev) =>
      resolveSettingsForMode({
        ...prev,
        mode: custom ? "custom_byok" : "demo_proxy",
      })
    );
    setModelMessage(null);
    setModelStatus("idle");
  };

  const handleSave = async () => {
    setModelStatus("loading");
    setModelMessage(null);

    try {
      const next = resolveSettingsForMode(llmSettings);
      if (getLlmAccessMode(next) === "custom_byok" && !next.apiKey.trim()) {
        setModelStatus("error");
        setModelMessage("API key is required in custom mode.");
        return;
      }

      await setLlmSettings(next);
      setLlmSettingsState(next);
      setModelStatus("ready");
      setModelMessage("Saved");
    } catch (error) {
      setModelStatus("error");
      setModelMessage(getErrorMessage(error));
    }
  };

  const handleTest = async () => {
    setModelStatus("loading");
    setModelMessage(null);

    try {
      const next = resolveSettingsForMode(llmSettings);
      if (getLlmAccessMode(next) === "custom_byok" && !next.apiKey.trim()) {
        setModelStatus("error");
        setModelMessage("API key is required in custom mode.");
        return;
      }

      await setLlmSettings(next);
      setLlmSettingsState(next);
      const result = await testLlmConnection();
      setModelStatus(result.ok ? "ready" : "error");
      setModelMessage(result.message || (result.ok ? "OK" : "Failed"));
    } catch (error) {
      setModelStatus("error");
      setModelMessage(getErrorMessage(error));
    }
  };

  const setCaptureMode = (nextMode: CaptureMode) => {
    setCaptureSettingsState((prev) => ({
      ...prev,
      mode: nextMode,
    }));
    setCaptureStatus("idle");
    setCaptureMessage(null);
  };

  const handleSaveCaptureSettings = async () => {
    setCaptureStatus("loading");
    setCaptureMessage(null);

    try {
      const draft: CaptureSettings = {
        ...captureSettings,
        smartConfig: {
          minTurns:
            minTurnsInput.trim().length === 0
              ? MIN_TURNS_DEFAULT
              : Number(minTurnsInput),
          blacklistKeywords: parseKeywordsInput(blacklistInput),
        },
      };

      await setCaptureSettings(draft);
      const normalized = await getCaptureSettings();
      setCaptureSettingsState(normalized);
      setMinTurnsInput(String(normalized.smartConfig.minTurns));
      setBlacklistInput(normalized.smartConfig.blacklistKeywords.join(", "));
      setCaptureStatus("ready");
      setCaptureMessage("Capture settings saved.");
      await refreshActiveCaptureStatus();
    } catch (error) {
      setCaptureStatus("error");
      setCaptureMessage(getErrorMessage(error));
    }
  };

  const handleArchiveActiveThread = async () => {
    setArchiveStatus("loading");
    setArchiveMessage(null);

    try {
      const result = await forceArchiveTransient();
      if (result.saved) {
        setArchiveStatus("ready");
        setArchiveSummary({
          reason: result.decision.reason,
          messageCount: result.decision.messageCount,
          time: Date.now(),
        });
        setArchiveMessage(
          `Saved (${result.decision.reason}) \u00b7 ${result.decision.messageCount} messages`
        );
      } else {
        setArchiveStatus("error");
        setArchiveMessage(mapArchiveErrorMessage(result.decision.reason));
      }
    } catch (error) {
      setArchiveStatus("error");
      setArchiveMessage(mapArchiveErrorMessage(error));
    } finally {
      await refreshActiveCaptureStatus();
    }
  };

  const handleToggleThemeMode = async () => {
    const previous = themeMode;
    const next: UiThemeMode = previous === "dark" ? "light" : "dark";

    setThemeMode(next);
    applyUiTheme(next);
    setThemeStatus("loading");
    setThemeMessage(null);

    try {
      const saved = await setUiThemeMode(next);
      setThemeMode(saved.themeMode);
      applyUiTheme(saved.themeMode);
      setThemeStatus("ready");
      setThemeMessage(
        saved.themeMode === "dark"
          ? "Dark mode enabled."
          : "Light mode enabled."
      );
    } catch (error) {
      setThemeMode(previous);
      applyUiTheme(previous);
      setThemeStatus("error");
      setThemeMessage(getErrorMessage(error));
    }
  };

  return (
    <div className="vesti-shell flex h-full flex-col overflow-y-auto vesti-scroll bg-bg-app">
      <header className="flex h-8 shrink-0 items-center px-4">
        <h1 className="vesti-page-title text-text-primary">Settings</h1>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <DisclosureSection
          title="Appearance"
          description="Switch between original light and minimalist dark theme presets."
          icon={themeMode === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        >
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-4 rounded-md border border-border-subtle bg-bg-surface-hover px-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-[15px] font-medium text-text-primary">
                  Dark Mode
                </span>
                <span className="mt-0.5 text-[13px] leading-[1.45] text-text-secondary">
                  Apply the minimalist dark palette to non-Threads surfaces.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={themeMode === "dark"}
                onClick={handleToggleThemeMode}
                data-state={themeMode === "dark" ? "checked" : "unchecked"}
                className="settings-switch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <span className="settings-switch-thumb" />
              </button>
            </div>

            {(themeStatus === "loading" || themeMessage) && (
              <p
                className={`text-[12px] ${
                  themeStatus === "error" ? "text-danger" : "text-text-secondary"
                }`}
              >
                {themeStatus === "loading" ? "Applying theme..." : themeMessage}
              </p>
            )}
          </div>
        </DisclosureSection>

        <DisclosureSection
          title="Model Access"
          description="Model scope mode and BYOK credentials."
          icon={<Sparkles className="h-4 w-4" strokeWidth={1.75} />}
        >
          <div className="card-shadow-warm rounded-card border border-border-subtle bg-bg-surface p-4">
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-4 rounded-md border border-border-subtle bg-bg-surface-hover px-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-medium text-text-primary">
                    Use Custom Configuration
                  </span>
                  <span className="mt-0.5 text-[13px] leading-[1.45] text-text-secondary">
                    {isCustomMode
                      ? "Custom BYOK mode: direct request to ModelScope."
                      : "Demo mode: proxy route with developer credentials."}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isCustomMode}
                  onClick={() => setMode(!isCustomMode)}
                  data-state={isCustomMode ? "checked" : "unchecked"}
                  className="settings-switch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <span className="settings-switch-thumb" />
                </button>
              </div>

              {!isCustomMode ? (
                <div className="grid gap-3 rounded-md border border-border-subtle bg-bg-surface-hover p-3">
                  <div className="inline-flex w-fit items-center rounded-md border border-border-subtle bg-bg-primary/70 px-2 py-0.5 text-[10px] font-semibold text-text-primary">
                    Demo Channel Active
                  </div>
                  <p className="text-[13px] leading-[1.45] text-text-secondary">
                    Primary model: {DEFAULT_STABLE_MODEL}
                  </p>
                  <p className="text-[13px] leading-[1.45] text-text-secondary">
                    Backup model: {DEFAULT_BACKUP_MODEL} (auto failover on timeout/429/5xx)
                  </p>
                  <div className="grid gap-1">
                    <label className="text-[11px] text-text-tertiary">
                      Proxy Base URL
                    </label>
                    <input
                      type="text"
                      value={llmSettings.proxyBaseUrl ?? DEFAULT_PROXY_BASE_URL}
                      onChange={(event) =>
                        setLlmSettingsState((prev) =>
                          normalizeLlmSettings({
                            ...prev,
                            proxyBaseUrl: event.target.value,
                          })
                        )
                      }
                      className="settings-input"
                      placeholder="http://127.0.0.1:3000/api"
                    />
                  </div>

                  <div className="grid gap-1">
                    <label className="text-[11px] text-text-tertiary">
                      Proxy Service Token (optional)
                    </label>
                    <input
                      type="password"
                      value={llmSettings.proxyServiceToken ?? ""}
                      onChange={(event) =>
                        setLlmSettingsState((prev) =>
                          normalizeLlmSettings({
                            ...prev,
                            proxyServiceToken: event.target.value,
                          })
                        )
                      }
                      className="settings-input"
                      placeholder="local-proxy-token"
                    />
                  </div>

                  <p className="text-[11px] text-text-tertiary">
                    Gateway locked to modelscope.cn | Chat: {demoProxyChatUrl}
                  </p>
                  <p className="text-[11px] text-text-tertiary">
                    Embeddings route: {demoProxyEmbeddingsUrl}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-md border border-text-primary bg-text-primary px-4 py-2 text-[13px] font-medium text-text-inverse transition-colors duration-200 hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleTest}
                      className="rounded-md border border-border-default bg-transparent px-4 py-2 text-[13px] font-medium text-text-primary transition-colors duration-200 hover:bg-bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Test Connection
                    </button>
                    {modelStatus === "loading" && (
                      <div className="flex items-center gap-1 text-[12px] text-text-tertiary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Working...
                      </div>
                    )}
                    {modelMessage && modelStatus !== "loading" && (
                      <span
                        className={`text-[12px] ${
                          modelStatus === "error" ? "text-danger" : "text-text-secondary"
                        }`}
                      >
                        {modelMessage}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 rounded-md border border-border-subtle bg-bg-surface-hover p-3 transition-all duration-200">
                  <div className="grid gap-1">
                    <label className="text-[11px] text-text-tertiary">Model</label>
                    <select
                      value={llmSettings.customModelId ?? llmSettings.modelId}
                      onChange={(event) =>
                        setLlmSettingsState((prev) =>
                          normalizeLlmSettings({
                            ...prev,
                            customModelId: event.target.value,
                            modelId: event.target.value,
                          })
                        )
                      }
                      className="settings-input"
                    >
                      {MODEL_OPTIONS.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-1">
                    <label className="text-[11px] text-text-tertiary">API Key</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={llmSettings.apiKey}
                        onChange={(event) =>
                          setLlmSettingsState((prev) => ({
                            ...prev,
                            apiKey: event.target.value,
                          }))
                        }
                        className="settings-input pr-9"
                        placeholder="ms-..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((prev) => !prev)}
                        className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-text-tertiary transition-colors duration-200 hover:bg-bg-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        aria-label="Toggle visibility"
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                        ) : (
                          <Eye className="h-4 w-4" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-text-tertiary">
                    Gateway locked to modelscope.cn | Route: Direct ({MODELSCOPE_BASE_URL})
                  </p>

                  <div className="mt-1 flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleTest}
                      className="rounded-md border border-border-default bg-transparent px-4 py-2 text-[13px] font-medium text-text-primary transition-colors duration-200 hover:bg-bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-md border border-text-primary bg-text-primary px-4 py-2 text-[13px] font-medium text-text-inverse transition-colors duration-200 hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Save
                    </button>
                    {modelStatus === "loading" && (
                      <div className="flex items-center gap-1 text-[12px] text-text-tertiary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Working...
                      </div>
                    )}
                    {modelMessage && modelStatus !== "loading" && (
                      <span
                        className={`text-[12px] ${
                          modelStatus === "error" ? "text-danger" : "text-text-secondary"
                        }`}
                      >
                        {modelMessage}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DisclosureSection>

        <DisclosureSection
          title="Capture Engine"
          description="Mode controls, active thread status, and archive operations."
          icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.75} />}
        >
          <div className="card-shadow-warm rounded-card border border-border-subtle bg-bg-surface p-4">
            <div className="grid gap-3">
              <div className="grid gap-2" role="radiogroup" aria-label="Capture Mode">
                {CAPTURE_MODE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-md border px-3 py-2 transition-colors duration-200 ${
                      captureSettings.mode === option.value
                        ? "border-text-primary bg-bg-primary/70"
                        : "border-border-subtle bg-bg-surface-hover hover:bg-bg-primary/65"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="capture-mode"
                        value={option.value}
                        checked={captureSettings.mode === option.value}
                        onChange={() => setCaptureMode(option.value)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-text-primary">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-[1.45] text-text-secondary">
                          {option.description}
                        </span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {isSmartMode && (
                <div className="grid gap-2 rounded-md border border-border-subtle bg-bg-surface-hover p-3">
                  <div className="grid gap-1">
                    <label className="text-[11px] text-text-tertiary">
                      Minimum turns (1-20)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={minTurnsInput}
                      onChange={(event) => setMinTurnsInput(event.target.value)}
                      className="settings-input"
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-[11px] text-text-tertiary">
                      Blacklist keywords (comma separated)
                    </label>
                    <input
                      type="text"
                      value={blacklistInput}
                      onChange={(event) => setBlacklistInput(event.target.value)}
                      className="settings-input"
                      placeholder="translation, draft"
                    />
                  </div>
                </div>
              )}

              {isManualMode && (
                <p className="rounded-md border border-border-subtle bg-bg-surface-hover px-3 py-2 text-[12px] leading-[1.45] text-text-secondary">
                  Manual mode blocks automatic capture writes. Use the archive action
                  below to persist the active thread snapshot.
                </p>
              )}

              <p className="text-[11px] text-text-tertiary">
                Capture now waits for a stable conversation URL ID before writing to
                local storage.
              </p>

              <div className="grid gap-1 rounded-md border border-border-subtle bg-bg-surface-hover px-3 py-2 text-[11px] text-text-secondary">
                <p>
                  Active thread status: {formatCaptureStatusReason(activeCaptureStatus?.reason)}
                </p>
                <p>
                  Snapshot:{" "}
                  {activeCaptureStatus?.available
                    ? `${activeCaptureStatus.messageCount ?? 0} messages \u00b7 ${
                        activeCaptureStatus.turnCount ?? 0
                      } turns (AI replies)`
                    : "Unavailable"}
                </p>
                <p>
                  Last update: {formatStatusTimestamp(activeCaptureStatus?.updatedAt)}
                </p>
                {activeCaptureStatus?.lastDecision && (
                  <p>
                    Last decision: {activeCaptureStatus.lastDecision.reason} {"\u00b7"}{" "}
                    {activeCaptureStatus.lastDecision.messageCount} messages
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-surface-hover p-3">
                <div>
                  <p className="text-[12px] font-medium text-text-primary">
                    Archive Active Thread Now
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-tertiary">
                    Manual archive is available in Smart/Manual mode with active
                    thread snapshot.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleArchiveActiveThread}
                  disabled={!canArchiveNow}
                  aria-disabled={!canArchiveNow}
                  className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 ${
                    canArchiveNow
                      ? "border-border-default bg-transparent text-text-primary hover:bg-bg-surface"
                      : "border-border-default bg-transparent text-text-tertiary opacity-60"
                  }`}
                >
                  {archiveStatus === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                  {archiveStatus === "loading"
                    ? "Archiving..."
                    : "Archive Active Thread Now"}
                </button>
              </div>

              {(archiveMessage || archiveSummary) && (
                <div className="rounded-md border border-border-subtle bg-bg-surface-hover px-3 py-2 text-[11px] text-text-secondary">
                  {archiveMessage && (
                    <p
                      className={
                        archiveStatus === "error" ? "text-danger" : "text-text-secondary"
                      }
                    >
                      {archiveMessage}
                    </p>
                  )}
                  {archiveSummary && (
                    <p className="mt-0.5 text-text-tertiary">
                      Saved at {formatStatusTimestamp(archiveSummary.time)} {"\u00b7"}{" "}
                      {archiveSummary.reason} {"\u00b7"} {archiveSummary.messageCount} messages
                    </p>
                  )}
                </div>
              )}

              <div className="mt-1 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleSaveCaptureSettings}
                  className="rounded-md border border-text-primary bg-text-primary px-4 py-2 text-[13px] font-medium text-text-inverse transition-colors duration-200 hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Save Capture Settings
                </button>
                {captureStatus === "loading" && (
                  <div className="flex items-center gap-1 text-[12px] text-text-tertiary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Working...
                  </div>
                )}
                {captureMessage && captureStatus !== "loading" && (
                  <span
                    className={`text-[12px] ${
                      captureStatus === "error" ? "text-danger" : "text-text-secondary"
                    }`}
                  >
                    {captureMessage}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DisclosureSection>

        <DisclosureSection
          title="Data Management"
          description="Navigate to storage tools, exports, and cleanup controls."
          icon={<FolderGit2 className="h-4 w-4" strokeWidth={1.75} />}
        >
          <div className="card-shadow-warm rounded-card border border-border-subtle bg-bg-surface p-4">
            <div className="rounded-md border border-border-subtle bg-bg-surface-hover p-3">
              <p className="text-[13px] font-medium text-text-primary">
                Data tools now live in a dedicated Data tab.
              </p>
              <p className="mt-1 text-[12px] leading-[1.45] text-text-secondary">
                Manage storage usage, export JSON/TXT/MD, and clear local data
                from the Dock Data button.
              </p>
              <button
                type="button"
                onClick={onNavigateToData}
                disabled={!onNavigateToData}
                className={`mt-3 inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                  onNavigateToData
                    ? "border-text-primary bg-text-primary text-text-inverse hover:bg-accent-primary-hover"
                    : "border-border-default bg-bg-surface text-text-tertiary"
                }`}
              >
                Open Data Management
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </DisclosureSection>
      </div>
    </div>
  );
}
