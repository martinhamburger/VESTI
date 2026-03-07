"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Database, Moon, Settings, Sun, X } from "lucide-react";
import { DataManagementPanel } from "./components/DataManagementPanel";
import { LibraryDataProvider } from "./contexts/library-data";
import { ExploreTab } from "./tabs/explore-tab";
import { LibraryTab } from "./tabs/library-tab";
import { NetworkTab } from "./tabs/network-tab";
import type { StorageApi, UiThemeMode } from "./types";

type Tab = "library" | "explore" | "network";
type DrawerView = "settings" | "data";
type DashboardNavRequest = {
  tab?: unknown;
  requestedAt?: unknown;
};
type ThemeSyncStatus = "idle" | "syncing" | "error";

const DASHBOARD_NAV_REQUEST_KEY = "vesti_dashboard_open_tab";

type DashboardProps = {
  storage: StorageApi;
  logoSrc: string;
  logoAlt?: string;
  rootClassName?: string;
  themeMode?: UiThemeMode;
  onToggleTheme?: () => Promise<void> | void;
  themeSyncStatus?: ThemeSyncStatus;
  themeSyncMessage?: string | null;
};

export function VestiDashboard({
  storage,
  logoSrc,
  logoAlt = "Vesti",
  rootClassName,
  themeMode = "light",
  onToggleTheme,
  themeSyncStatus = "idle",
  themeSyncMessage = null,
}: DashboardProps) {
  const SETTINGS_KEY = "vesti_llm_settings";
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "library";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "explore" || tab === "network" || tab === "library") return tab;
    return "library";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<DrawerView>("settings");
  const [modelscopeKey, setModelscopeKey] = useState("");
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saved" | "error">(
    "idle"
  );
  const [settingsAvailable, setSettingsAvailable] = useState(true);
  const [openConversationId, setOpenConversationId] = useState<number | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;

    const applyNavRequest = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const tab = (raw as DashboardNavRequest).tab;
      if (tab === "library" || tab === "explore" || tab === "network") {
        setActiveTab(tab);
      }
    };

    chrome.storage.local.get(DASHBOARD_NAV_REQUEST_KEY, (result) => {
      applyNavRequest(result?.[DASHBOARD_NAV_REQUEST_KEY]);
    });

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] =
      (changes, areaName) => {
        if (areaName !== "local") return;
        const navRequest = changes[DASHBOARD_NAV_REQUEST_KEY];
        if (!navRequest) return;
        applyNavRequest(navRequest.newValue);
      };

    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen || drawerView !== "settings") {
      setSettingsStatus("idle");
      return;
    }
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      setSettingsAvailable(false);
      return;
    }
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      setSettingsAvailable(true);
      const settings = result?.[SETTINGS_KEY] as { apiKey?: string } | undefined;
      setModelscopeKey(settings?.apiKey ?? "");
    });
  }, [drawerOpen, drawerView]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current) return;
      if (userMenuRef.current.contains(event.target as Node)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [settingsOpen]);

  const handleSaveModelscopeKey = () => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      setSettingsAvailable(false);
      setSettingsStatus("error");
      return;
    }
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        setSettingsStatus("error");
        return;
      }
      const existing = (result?.[SETTINGS_KEY] as Record<string, unknown>) ?? {};
      const next = {
        ...existing,
        apiKey: modelscopeKey.trim(),
      };
      chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => {
        const saveErr = chrome.runtime?.lastError;
        if (saveErr) {
          setSettingsStatus("error");
          return;
        }
        setSettingsStatus("saved");
        setTimeout(() => setSettingsStatus("idle"), 1500);
      });
    });
  };

  const handleOpenConversation = (conversationId: number) => {
    setActiveTab("library");
    setOpenConversationId(conversationId);
  };

  const openDrawer = (view: DrawerView) => {
    setDrawerView(view);
    setDrawerOpen(true);
    setSettingsOpen(false);
  };

  const isDarkMode = themeMode === "dark";
  const isThemeSwitchDisabled = !onToggleTheme || themeSyncStatus === "syncing";
  const themeDescription = isDarkMode
    ? "Shared with dock appearance. Dark mode is active."
    : "Shared with dock appearance. Light mode is active.";
  const themeFeedback =
    themeSyncStatus === "syncing"
      ? "Syncing appearance..."
      : themeSyncMessage || "Changes here stay in sync with the dock settings panel.";

  return (
    <LibraryDataProvider storage={storage}>
      <div
        className={`${rootClassName ?? ""} relative flex h-screen flex-col bg-bg-primary text-text-primary`}
      >
        <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-bg-tertiary px-6">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt={logoAlt} className="h-7 w-7" />
            <h1 className="text-base font-[family-name:var(--font-lora)] font-semibold text-text-primary">
              Vesti
            </h1>
          </div>

          <div className="flex-1" />

          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="inline-flex items-center gap-1 rounded-lg p-1.5 transition-colors hover:bg-bg-surface-card"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-sm font-sans text-white">
                U
              </div>
              <ChevronDown strokeWidth={1.75} className="h-4 w-4 text-text-secondary" />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-border-subtle bg-bg-primary py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                <button
                  type="button"
                  onClick={() => openDrawer("settings")}
                  className="inline-flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-sans text-text-primary transition-colors hover:bg-bg-surface-card"
                >
                  <Settings strokeWidth={1.6} className="h-4 w-4" />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => openDrawer("data")}
                  className="inline-flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-sans text-text-primary transition-colors hover:bg-bg-surface-card"
                >
                  <Database strokeWidth={1.6} className="h-4 w-4" />
                  <span>Data Operations</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="border-b border-border-subtle bg-bg-tertiary px-6">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("library")}
              className={`relative px-4 py-2.5 text-sm font-sans font-medium transition-all ${
                activeTab === "library"
                  ? "text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Library
              {activeTab === "library" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("explore")}
              className={`relative px-4 py-2.5 text-sm font-sans font-medium transition-all ${
                activeTab === "explore"
                  ? "text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Explore
              {activeTab === "explore" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("network")}
              className={`relative px-4 py-2.5 text-sm font-sans font-medium transition-all ${
                activeTab === "network"
                  ? "text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Network
              {activeTab === "network" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === "library" && (
            <LibraryTab
              storage={storage}
              themeMode={themeMode}
              openConversationId={openConversationId}
              onConversationOpened={() => setOpenConversationId(null)}
            />
          )}
          {activeTab === "explore" && (
            <ExploreTab storage={storage} onOpenConversation={handleOpenConversation} />
          )}
          {activeTab === "network" && (
            <NetworkTab
              storage={storage}
              themeMode={themeMode}
              onSelectConversation={handleOpenConversation}
            />
          )}
        </div>

        {drawerOpen && (
          <>
            <button
              type="button"
              aria-label="Close drawer backdrop"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 z-40 bg-black/20"
            />
            <aside className="absolute right-0 top-0 z-50 flex h-full w-[420px] max-w-[90vw] flex-col border-l border-border-subtle bg-bg-primary shadow-[0_0_24px_rgba(0,0,0,0.12)]">
              <div className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
                <div className="inline-flex items-center gap-2 text-sm font-sans text-text-primary">
                  {drawerView === "settings" ? (
                    <Settings strokeWidth={1.6} className="h-4 w-4" />
                  ) : (
                    <Database strokeWidth={1.6} className="h-4 w-4" />
                  )}
                  <span>{drawerView === "settings" ? "Settings" : "Data Operations"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-md p-1 text-text-secondary transition-colors hover:bg-bg-surface-card hover:text-text-primary"
                >
                  <X strokeWidth={1.8} className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {drawerView === "settings" ? (
                  <div className="flex flex-col gap-4">
                    <section className="rounded-xl border border-border-subtle bg-bg-surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-bg-secondary text-text-secondary">
                            {isDarkMode ? (
                              <Moon className="h-4 w-4" strokeWidth={1.5} />
                            ) : (
                              <Sun className="h-4 w-4" strokeWidth={1.5} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-text-primary">Appearance</p>
                            <p className="mt-1 text-[11px] text-text-tertiary">{themeDescription}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isDarkMode}
                          onClick={() => {
                            if (!onToggleTheme) return;
                            void onToggleTheme();
                          }}
                          disabled={isThemeSwitchDisabled}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                            isDarkMode ? "bg-accent-primary" : "bg-bg-secondary"
                          } ${isThemeSwitchDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                        >
                          <span
                            className={`inline-block h-5 w-5 rounded-full border border-border-subtle bg-bg-primary shadow-sm transition-transform ${
                              isDarkMode ? "translate-x-5" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                      <p
                        className={`mt-3 text-[11px] ${
                          themeSyncStatus === "error" ? "text-danger" : "text-text-tertiary"
                        }`}
                      >
                        {themeFeedback}
                      </p>
                    </section>

                    <section className="rounded-xl border border-border-subtle bg-bg-surface p-4">
                      <div className="mb-3">
                        <p className="text-[13px] font-medium text-text-primary">Model / Integration</p>
                        <p className="mt-1 text-[11px] text-text-tertiary">
                          Manage dashboard-only integration keys.
                        </p>
                      </div>
                      <label className="mb-2 block text-[12px] font-sans text-text-secondary">
                        ModelScope Key
                      </label>
                      <input
                        type="password"
                        value={modelscopeKey}
                        onChange={(event) => setModelscopeKey(event.target.value)}
                        placeholder="Paste your ModelScope key"
                        disabled={!settingsAvailable}
                        className="w-full rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm font-sans text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 disabled:opacity-60"
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={handleSaveModelscopeKey}
                          className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-hover"
                        >
                          Save
                        </button>
                        <span className="text-right text-[11px] font-sans text-text-tertiary">
                          {settingsAvailable
                            ? settingsStatus === "saved"
                              ? "Saved locally"
                              : settingsStatus === "error"
                                ? "Save failed"
                                : "Stored in chrome.storage.local"
                            : "Available in extension only"}
                        </span>
                      </div>
                    </section>
                  </div>
                ) : (
                  <DataManagementPanel storage={storage} />
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </LibraryDataProvider>
  );
}
