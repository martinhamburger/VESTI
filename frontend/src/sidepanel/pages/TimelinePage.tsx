import { SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Conversation,
  ConversationMatchSummary,
  DashboardStats,
  ExportFormat,
  Platform,
} from "~lib/types";
import {
  deleteConversations,
  getDashboardStats,
} from "~lib/services/storageService";
import { PLATFORM_TONE } from "../components/platformTone";
import { ThreadsFilterDisclosure } from "../components/ThreadsFilterDisclosure";
import { ConversationList } from "../containers/ConversationList";
import { SearchLineIcon } from "../components/ThreadSearchIcons";
import {
  DATE_PRESET_OPTIONS,
  PLATFORM_OPTIONS,
  type DatePreset,
} from "../types/timelineFilters";
import type { ThreadsEvent, ThreadsSearchSession } from "../types/threadsSearch";
import { useBatchSelection } from "../hooks/useBatchSelection";
import { BatchActionBar } from "../components/BatchActionBar";
import {
  downloadConversationExport,
  exportConversations,
} from "../utils/exportConversations";
import type { ConversationExportContentMode } from "../types/export";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getBatchListBottomInset(mode: "inactive" | "selecting" | "export_panel" | "delete_panel", hasFeedback: boolean): number {
  if (mode === "inactive") {
    return 16;
  }

  if (mode === "selecting") {
    return hasFeedback ? 104 : 68;
  }

  if (mode === "export_panel") {
    return 308;
  }

  return 248;
}

interface TimelinePageProps {
  session: ThreadsSearchSession;
  dispatch: (event: ThreadsEvent) => void;
  onSelectConversation: (conversation: Conversation) => void;
  refreshToken: number;
}

function toggleSetMember<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
    return next;
  }
  next.add(value);
  return next;
}

function getDatePresetSummary(datePreset: DatePreset): string {
  return (
    DATE_PRESET_OPTIONS.find((preset) => preset.id === datePreset)?.label ??
    "Started any time"
  );
}

function getSourceSummary(selectedPlatforms: Set<Platform>): string {
  const selected = PLATFORM_OPTIONS.filter((platform) =>
    selectedPlatforms.has(platform)
  );

  if (selected.length === 0) {
    return "All sources";
  }

  if (selected.length <= 2) {
    return selected.join(", ");
  }

  return `${selected[0]} +${selected.length - 1}`;
}

export function TimelinePage({
  session,
  dispatch,
  onSelectConversation,
  refreshToken,
}: TimelinePageProps) {
  const {
    headerMode,
    query,
    datePreset,
    selectedPlatforms,
    resultSummaryMap,
    anchorConversationId,
  } = session;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [visibleConversations, setVisibleConversations] = useState<Conversation[]>([]);
  const [exportMode, setExportMode] =
    useState<ConversationExportContentMode>("full");
  const [batchActionKey, setBatchActionKey] = useState<string | null>(null);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
  const [batchFeedback, setBatchFeedback] = useState<{
    message: string;
    tone: "default" | "warning" | "error";
    title?: string;
    detail?: string;
    hint?: string;
  } | null>(null);
  const suppressNextReaderOpenRef = useRef(false);
  const suppressNextReaderOpenTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    return () => {
      if (suppressNextReaderOpenTimerRef.current !== null) {
        window.clearTimeout(suppressNextReaderOpenTimerRef.current);
      }
    };
  }, []);

  const firstCapturedTodayCount = stats?.firstCapturedTodayCount ?? 0;
  const platformDistribution = stats?.platformDistribution ?? null;
  const dateSummary = getDatePresetSummary(datePreset);
  const sourceSummary = getSourceSummary(selectedPlatforms);
  const handleAnchorConsumed = useCallback(() => {
    dispatch({ type: "ANCHOR_CONSUMED" });
  }, [dispatch]);
  const handleResultSummaryMapChange = useCallback(
    (next: Record<number, ConversationMatchSummary>) => {
      dispatch({
        type: "BODY_SEARCH_RESOLVED",
        summaries: Object.values(next),
        hasResults: Object.keys(next).length > 0,
      });
    },
    [dispatch]
  );
  const getConversationId = useCallback((conversation: Conversation) => conversation.id, []);

  // Batch selection
  const {
    mode: batchMode,
    selectedIds,
    selectedCount,
    isBatchMode,
    isAllSelected,
    totalCount,
    toggleSelection,
    selectAll,
    clearSelection,
    enterBatchMode,
    openExportPanel,
    openDeletePanel,
    closePanel,
    exitBatchMode,
  } = useBatchSelection({
    items: visibleConversations,
    getId: getConversationId,
  });
  const selectedConversations = visibleConversations.filter((conversation) =>
    selectedIds.has(conversation.id)
  );
  const activeBatchMode = batchMode === "inactive" ? "selecting" : batchMode;
  const listBottomInset = getBatchListBottomInset(
    batchMode,
    Boolean(batchFeedback)
  );

  const handleClearSelection = useCallback(() => {
    setDeleteConfirmValue("");
    clearSelection();
  }, [clearSelection]);

  const handleExitBatchMode = useCallback(() => {
    setDeleteConfirmValue("");
    setBatchActionKey(null);
    setBatchFeedback(null);
    exitBatchMode();
  }, [exitBatchMode]);

  const handleToggleExportPanel = useCallback(() => {
    setDeleteConfirmValue("");
    setBatchFeedback(null);
    if (batchMode === "export_panel") {
      closePanel();
      return;
    }
    openExportPanel();
  }, [batchMode, closePanel, openExportPanel]);

  const handleToggleDeletePanel = useCallback(() => {
    setBatchFeedback(null);
    if (batchMode === "delete_panel") {
      setDeleteConfirmValue("");
      closePanel();
      return;
    }
    setDeleteConfirmValue("");
    openDeletePanel();
  }, [batchMode, closePanel, openDeletePanel]);

  const handleClosePanel = useCallback(() => {
    setDeleteConfirmValue("");
    closePanel();
  }, [closePanel]);

  const handleChooseExportFormat = useCallback(
    async (format: ExportFormat) => {
      if (selectedConversations.length === 0) return;
      setBatchActionKey(`export-${format}`);
      setBatchFeedback(null);
      try {
        const result = await exportConversations(selectedConversations, {
          contentMode: exportMode,
          format,
        });
        downloadConversationExport(result);
        closePanel();
        if (result.notice?.title || result.notice?.detail || result.notice?.hint) {
          setBatchFeedback({
            message: result.notice.message,
            tone: result.notice.tone,
            title: result.notice.title,
            detail: result.notice.detail,
            technicalSummary: result.notice.technicalSummary,
            hint: result.notice.hint
              ? `${result.notice.hint} Saved as ${result.filename}.`
              : `Saved as ${result.filename}.`,
          });
        } else {
          setBatchFeedback({
            message: result.notice
              ? `${result.notice.message} Saved as ${result.filename}.`
              : `Exported ${result.filename}`,
            tone: result.notice?.tone ?? "default",
          });
        }
      } catch (error) {
        setBatchFeedback({
          message: getErrorMessage(error),
          tone: "error",
        });
      } finally {
        setBatchActionKey(null);
      }
    },
    [closePanel, exportMode, selectedConversations]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirmValue !== "DELETE" || selectedConversations.length === 0) {
      return;
    }

    setBatchActionKey("delete");
    setBatchFeedback(null);
    try {
      await deleteConversations(selectedConversations.map((conversation) => conversation.id));
      setDeleteConfirmValue("");
      handleExitBatchMode();
    } catch (error) {
      setBatchFeedback({
        message: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setBatchActionKey(null);
    }
  }, [
    deleteConfirmValue,
    handleExitBatchMode,
    selectedConversations,
  ]);

  const handleOpenSearch = () => {
    dispatch({ type: "HEADER_MODE_CHANGED", headerMode: "search" });
  };

  const handleToggleFilter = () => {
    dispatch({
      type: "HEADER_MODE_CHANGED",
      headerMode: headerMode === "filter" ? "default" : "filter",
    });
  };

  const handleCancelSearch = () => {
    dispatch({ type: "QUERY_CLEARED" });
    dispatch({ type: "HEADER_MODE_CHANGED", headerMode: "default" });
  };

  const armSuppressNextReaderOpen = useCallback(() => {
    suppressNextReaderOpenRef.current = true;
    if (suppressNextReaderOpenTimerRef.current !== null) {
      window.clearTimeout(suppressNextReaderOpenTimerRef.current);
    }
    suppressNextReaderOpenTimerRef.current = window.setTimeout(() => {
      suppressNextReaderOpenRef.current = false;
      suppressNextReaderOpenTimerRef.current = null;
    }, 0);
  }, []);

  const consumeSuppressNextReaderOpen = useCallback(() => {
    if (!suppressNextReaderOpenRef.current) {
      return false;
    }
    suppressNextReaderOpenRef.current = false;
    if (suppressNextReaderOpenTimerRef.current !== null) {
      window.clearTimeout(suppressNextReaderOpenTimerRef.current);
      suppressNextReaderOpenTimerRef.current = null;
    }
    return true;
  }, []);

  const handleConversationSelect = useCallback(
    (conversation: Conversation) => {
      if (consumeSuppressNextReaderOpen()) {
        return;
      }
      onSelectConversation(conversation);
    },
    [consumeSuppressNextReaderOpen, onSelectConversation]
  );

  const handleSelectFromMenu = (id: number) => {
    setDeleteConfirmValue("");
    setBatchFeedback(null);
    armSuppressNextReaderOpen();
    enterBatchMode(id);
  };

  return (
    <div className="flex h-full flex-col bg-bg-app">
      {headerMode === "search" ? (
        <header className="vesti-page-header gap-2">
          <div className="threads-search-surface flex h-8 flex-1 items-center gap-2 rounded-lg px-3">
            <SearchLineIcon className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                dispatch({ type: "QUERY_CHANGED", query: nextQuery });
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  handleCancelSearch();
                }
              }}
              placeholder="Search conversations"
              className="h-full w-full bg-transparent text-vesti-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>
          <button
            type="button"
            onClick={handleCancelSearch}
            className="rounded-sm px-1 py-1 text-vesti-sm font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Cancel
          </button>
        </header>
      ) : (
        <header className="vesti-page-header justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="vesti-page-title text-text-primary">Threads</h1>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-vesti-xs font-medium text-success/90">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {firstCapturedTodayCount} first captured today
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Search conversations"
              onClick={handleOpenSearch}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-bg-secondary hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <SearchLineIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Filter conversations"
              onClick={handleToggleFilter}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                headerMode === "filter"
                  ? "bg-bg-secondary text-text-primary"
                  : "text-text-tertiary hover:bg-bg-secondary hover:text-text-secondary"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>

          </div>
        </header>
      )}

      {headerMode === "filter" && (
        <div className="shrink-0 border-b border-border-subtle bg-bg-secondary/30 px-4 py-2.5">
          <div className="grid gap-2">
            <ThreadsFilterDisclosure
              title="Started"
              summary={dateSummary}
              isActive={datePreset !== "all_time"}
            >
              <div className="flex flex-wrap gap-1">
                {DATE_PRESET_OPTIONS.map((preset) => {
                  const isActive = datePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "FILTER_CHANGED",
                          datePreset: preset.id,
                          selectedPlatforms,
                        })
                      }
                      className={`rounded-full border px-2.5 py-[3px] text-[11px] font-medium leading-4 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                        isActive
                          ? "border-border-default bg-bg-primary text-text-primary"
                          : "border-border-subtle text-text-tertiary hover:text-text-secondary"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </ThreadsFilterDisclosure>

            <ThreadsFilterDisclosure
              title="Source"
              summary={sourceSummary}
              isActive={selectedPlatforms.size > 0}
            >
              <div className="flex flex-wrap gap-1">
                {PLATFORM_OPTIONS.map((platform) => {
                  const tone = PLATFORM_TONE[platform];
                  const isActive = selectedPlatforms.has(platform);
                  const hasData =
                    platformDistribution === null
                      ? true
                      : platformDistribution[platform] > 0;

                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => {
                        dispatch({
                          type: "FILTER_CHANGED",
                          datePreset,
                          selectedPlatforms: toggleSetMember(selectedPlatforms, platform),
                        });
                      }}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold leading-4 tracking-[0.01em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                        isActive
                          ? `${tone.bg} ${tone.border} ${tone.text}`
                          : `border-border-subtle bg-transparent text-text-tertiary hover:bg-bg-primary hover:text-text-secondary ${!hasData ? "opacity-45" : ""}`
                      }`}
                    >
                      <span className="h-1 w-1 rounded-full bg-current" />
                      {platform}
                    </button>
                  );
                })}
              </div>
            </ThreadsFilterDisclosure>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ConversationList
          searchQuery={query}
          datePreset={datePreset}
          selectedPlatforms={selectedPlatforms}
          onSelect={handleConversationSelect}
          refreshToken={refreshToken}
          resultSummaryMap={resultSummaryMap}
          anchorConversationId={anchorConversationId}
          onAnchorConsumed={handleAnchorConsumed}
          onResultSummaryMapChange={handleResultSummaryMapChange}
          onBodySearchStarted={() => dispatch({ type: "BODY_SEARCH_STARTED" })}
          // Batch selection
          isBatchMode={isBatchMode}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          onSelectFromMenu={handleSelectFromMenu}
          onFilteredConversationsChange={setVisibleConversations}
          bottomInsetPx={listBottomInset}
        />

        {/* Batch action bar */}
        {isBatchMode && (
          <BatchActionBar
            mode={activeBatchMode}
            exportMode={exportMode}
            selectedCount={selectedCount}
            totalCount={totalCount}
            actionKey={batchActionKey}
            deleteConfirmValue={deleteConfirmValue}
            feedback={batchFeedback}
            onDeleteConfirmValueChange={setDeleteConfirmValue}
            onExportModeChange={setExportMode}
            onSelectAll={isAllSelected ? handleClearSelection : selectAll}
            onClearSelection={handleClearSelection}
            onToggleExportPanel={handleToggleExportPanel}
            onToggleDeletePanel={handleToggleDeletePanel}
            onClosePanel={handleClosePanel}
            onChooseExportFormat={handleChooseExportFormat}
            onConfirmDelete={handleConfirmDelete}
            onExit={handleExitBatchMode}
          />
        )}
      </div>
    </div>
  );
}
