import type { UiSettings, UiThemeMode } from "~lib/types";

const UI_SETTINGS_KEY = "vesti_ui_settings";

export const DEFAULT_UI_SETTINGS: UiSettings = {
  themeMode: "light",
};

function resolveStorageArea(): chrome.storage.StorageArea | null {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  return chrome.storage.local;
}

function normalizeThemeMode(value: unknown): UiThemeMode {
  return value === "dark" ? "dark" : "light";
}

function normalizeUiSettings(value: unknown): UiSettings {
  const draft =
    value && typeof value === "object"
      ? (value as Partial<UiSettings>)
      : DEFAULT_UI_SETTINGS;

  return {
    themeMode: normalizeThemeMode(draft.themeMode),
  };
}

function applyStorageWrite(
  storage: chrome.storage.StorageArea,
  payload: UiSettings
): Promise<void> {
  return new Promise((resolve, reject) => {
    storage.set({ [UI_SETTINGS_KEY]: payload }, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export function applyUiTheme(themeMode: UiThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", themeMode === "dark");
  root.style.colorScheme = themeMode;
}

export async function getUiSettings(): Promise<UiSettings> {
  const storage = resolveStorageArea();
  if (!storage) return DEFAULT_UI_SETTINGS;

  return new Promise((resolve, reject) => {
    storage.get([UI_SETTINGS_KEY], (result) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(normalizeUiSettings(result?.[UI_SETTINGS_KEY]));
    });
  });
}

export async function setUiThemeMode(themeMode: UiThemeMode): Promise<UiSettings> {
  const next = normalizeUiSettings({
    ...DEFAULT_UI_SETTINGS,
    themeMode,
  });
  const storage = resolveStorageArea();
  if (!storage) return next;
  await applyStorageWrite(storage, next);
  return next;
}

export async function initializeUiTheme(): Promise<UiThemeMode> {
  const settings = await getUiSettings();
  applyUiTheme(settings.themeMode);
  return settings.themeMode;
}

