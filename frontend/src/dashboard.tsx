import "~style.css";

import { useCallback, useEffect, useState } from "react";
import { VestiDashboard as VestiDashboardShell } from "@vesti/ui";
import type { UiThemeMode } from "~lib/types";
import {
  applyUiTheme,
  getUiSettings,
  initializeUiTheme,
  setUiThemeMode,
  subscribeUiSettings,
} from "~lib/services/uiSettingsService";
import { LOGO_BASE64 } from "~lib/ui/logo";
import {
  getConversations,
  getTopics,
  runGardener,
  getRelatedConversations,
  getAllEdges,
  getMessages,
  updateConversation,
  updateConversationTitle,
  deleteConversation,
  renameFolderTag,
  moveFolderTag,
  removeFolderTag,
  askKnowledgeBase,
  createExploreSession,
  listExploreSessions,
  getExploreSession,
  getExploreMessages,
  deleteExploreSession,
  renameExploreSession,
  updateExploreMessageContext,
  getSummary,
  generateSummary,
  getNotes,
  saveNote,
  updateNote,
  deleteNote,
  getStorageUsage,
  exportData,
  clearAllData,
} from "~lib/services/storageService";

type ThemeSyncStatus = "idle" | "syncing" | "error";

void initializeUiTheme().catch(() => {
  // Keep default light theme tokens if initialization fails.
});

function getThemeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Theme update failed.";
}

export default function VestiDashboardPage() {
  const [themeMode, setThemeMode] = useState<UiThemeMode>(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });
  const [themeSyncStatus, setThemeSyncStatus] = useState<ThemeSyncStatus>("idle");
  const [themeSyncMessage, setThemeSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getUiSettings()
      .then((settings) => {
        if (cancelled) return;
        setThemeMode(settings.themeMode);
        applyUiTheme(settings.themeMode);
        setThemeSyncStatus("idle");
      })
      .catch((error) => {
        if (cancelled) return;
        setThemeSyncStatus("error");
        setThemeSyncMessage(getThemeErrorMessage(error));
      });

    const unsubscribe = subscribeUiSettings((settings) => {
      if (cancelled) return;
      setThemeMode(settings.themeMode);
      applyUiTheme(settings.themeMode);
      setThemeSyncStatus("idle");
      setThemeSyncMessage(null);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleToggleTheme = useCallback(async () => {
    const previous = themeMode;
    const next: UiThemeMode = previous === "dark" ? "light" : "dark";

    setThemeMode(next);
    applyUiTheme(next);
    setThemeSyncStatus("syncing");
    setThemeSyncMessage(null);

    try {
      const saved = await setUiThemeMode(next);
      setThemeMode(saved.themeMode);
      applyUiTheme(saved.themeMode);
      setThemeSyncStatus("idle");
      setThemeSyncMessage(null);
    } catch (error) {
      setThemeMode(previous);
      applyUiTheme(previous);
      setThemeSyncStatus("error");
      setThemeSyncMessage(getThemeErrorMessage(error));
    }
  }, [themeMode]);

  return (
    <VestiDashboardShell
      logoSrc={LOGO_BASE64}
      rootClassName="vesti-options"
      themeMode={themeMode}
      onToggleTheme={handleToggleTheme}
      themeSyncStatus={themeSyncStatus}
      themeSyncMessage={themeSyncMessage}
      storage={{
        getConversations,
        getTopics,
        runGardener,
        getRelatedConversations,
        getAllEdges,
        getMessages,
        updateConversation,
        updateConversationTitle,
        deleteConversation,
        renameFolderTag,
        moveFolderTag,
        removeFolderTag,
        askKnowledgeBase,
        createExploreSession,
        listExploreSessions,
        getExploreSession,
        getExploreMessages,
        deleteExploreSession,
        renameExploreSession,
        updateExploreMessageContext,
        getSummary,
        generateSummary,
        getNotes,
        saveNote,
        updateNote,
        deleteNote,
        getStorageUsage,
        exportData,
        clearAllData,
      }}
    />
  );
}
