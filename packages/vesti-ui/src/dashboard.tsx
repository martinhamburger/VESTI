"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Database, Settings, X } from "lucide-react";
import { LibraryTab } from "./tabs/library-tab";
import { ExploreTab } from "./tabs/explore-tab";
import { NetworkTab } from "./tabs/network-tab";
import { LibraryDataProvider } from "./contexts/library-data";
import { DataManagementPanel } from "./components/DataManagementPanel";
import type { StorageApi } from "./types";

type Tab = "library" | "explore" | "network";
type DrawerView = "settings" | "data";

type DashboardProps = {
  storage: StorageApi;
  logoSrc: string;
  logoAlt?: string;
  rootClassName?: string;
};

export function VestiDashboard({
  storage,
  logoSrc,
  logoAlt = "Vesti",
  rootClassName,
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

  return (
    <LibraryDataProvider storage={storage}>
      <div className={`${rootClassName ?? ""} relative h-screen flex flex-col`}>
        {/* Global Nav (56px) */}
        <header className="h-14 bg-bg-tertiary border-b border-border-subtle px-6 flex items-center justify-between">
          {/* Left - Logo */}
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt={logoAlt} className="w-7 h-7" />
            <h1 className="text-base font-[family-name:var(--font-lora)] font-semibold text-text-primary">
              Vesti
            </h1>
          </div>

          <div className="flex-1" />

          {/* Right - Actions */}
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setSettingsOpen((open) => !open)}
              className="inline-flex items-center gap-1 p-1.5 rounded-lg hover:bg-bg-surface-card transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center text-white text-sm font-sans">
                U
              </div>
              <ChevronDown
                strokeWidth={1.75}
                className="w-4 h-4 text-text-secondary"
              />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-border-subtle bg-bg-primary shadow-[0_8px_24px_rgba(0,0,0,0.08)] py-1 z-50">
                <button
                  type="button"
                  onClick={() => openDrawer("settings")}
                  className="w-full px-3 py-2 text-left text-[13px] font-sans text-text-primary hover:bg-bg-surface-card transition-colors inline-flex items-center gap-2"
                >
                  <Settings strokeWidth={1.6} className="w-4 h-4" />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => openDrawer("data")}
                  className="w-full px-3 py-2 text-left text-[13px] font-sans text-text-primary hover:bg-bg-surface-card transition-colors inline-flex items-center gap-2"
                >
                  <Database strokeWidth={1.6} className="w-4 h-4" />
                  <span>Data Operations</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Tab Bar */}
        <div className="bg-bg-tertiary border-b border-border-subtle px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("library")}
              className={`px-4 py-2.5 text-sm font-sans font-medium transition-all relative ${
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
              onClick={() => setActiveTab("explore")}
              className={`px-4 py-2.5 text-sm font-sans font-medium transition-all relative ${
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
              onClick={() => setActiveTab("network")}
              className={`px-4 py-2.5 text-sm font-sans font-medium transition-all relative ${
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

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "library" && (
            <LibraryTab
              storage={storage}
              openConversationId={openConversationId}
              onConversationOpened={() => setOpenConversationId(null)}
            />
          )}
          {activeTab === "explore" && (
            <ExploreTab
              storage={storage}
              onOpenConversation={handleOpenConversation}
            />
          )}
          {activeTab === "network" && (
            <NetworkTab storage={storage} onSelectConversation={handleOpenConversation} />
          )}
        </div>

        {drawerOpen && (
          <>
            <button
              type="button"
              aria-label="Close drawer backdrop"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-black/20 z-40"
            />
            <aside className="absolute right-0 top-0 h-full w-[420px] max-w-[90vw] bg-bg-primary border-l border-border-subtle shadow-[0_0_24px_rgba(0,0,0,0.12)] z-50 flex flex-col">
              <div className="h-14 px-4 border-b border-border-subtle flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-sm font-sans text-text-primary">
                  {drawerView === "settings" ? (
                    <Settings strokeWidth={1.6} className="w-4 h-4" />
                  ) : (
                    <Database strokeWidth={1.6} className="w-4 h-4" />
                  )}
                  <span>
                    {drawerView === "settings" ? "Settings" : "Data Operations"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-surface-card transition-colors"
                >
                  <X strokeWidth={1.8} className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {drawerView === "settings" ? (
                  <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
                    <label className="block text-[12px] font-sans text-text-secondary mb-2">
                      ModelScope Key
                    </label>
                    <input
                      type="password"
                      value={modelscopeKey}
                      onChange={(event) => setModelscopeKey(event.target.value)}
                      placeholder="Paste your ModelScope key"
                      disabled={!settingsAvailable}
                      className="w-full px-3 py-2 rounded-md border border-border-default bg-bg-primary text-sm font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary disabled:opacity-60"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <button
                        onClick={handleSaveModelscopeKey}
                        className="px-3 py-1.5 rounded-md bg-accent-primary text-white text-xs font-sans font-medium hover:bg-accent-primary-hover transition-colors"
                      >
                        Save
                      </button>
                      <span className="text-[11px] font-sans text-text-tertiary text-right">
                        {settingsAvailable
                          ? settingsStatus === "saved"
                            ? "Saved locally"
                            : settingsStatus === "error"
                              ? "Save failed"
                              : "Stored in chrome.storage.local"
                          : "Available in extension only"}
                      </span>
                    </div>
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
