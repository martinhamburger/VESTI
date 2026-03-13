import { SlidersHorizontal, ListChecks } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  Conversation,
  ConversationMatchSummary,
  DashboardStats,
} from "~lib/types";
import { getDashboardStats } from "~lib/services/storageService";
import { PLATFORM_TONE } from "../components/platformTone";
import { ConversationList } from "../containers/ConversationList";
import { SearchLineIcon } from "../components/ThreadSearchIcons";
import { DATE_PRESET_OPTIONS, PLATFORM_OPTIONS } from "../types/timelineFilters";
import type { ThreadsEvent, ThreadsSearchSession } from "../types/threadsSearch";
import { useBatchSelection } from "../hooks/useBatchSelection";
import { BatchActionBar } from "../components/BatchActionBar";
import { ExportDialog, type ExportConfig, type ExportResult } from "../components/ExportDialog";
import { exportConversations } from "../utils/exportConversations";

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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

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

  const todayCount = stats?.todayCount ?? 0;
  const platformDistribution = stats?.platformDistribution ?? null;
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

  // Batch selection
  const {
    selectedIds,
    selectedCount,
    isBatchMode,
    toggleSelection,
    selectAll,
    clearSelection,
    enterBatchMode,
    exitBatchMode,
  } = useBatchSelection({
    items: conversations,
    getId: (c) => c.id,
    maxSelection: 20,
  });

  const handleExport = async (config: ExportConfig): Promise<ExportResult> => {
    const selectedConversations = conversations.filter((c) => selectedIds.has(c.id));
    return exportConversations(selectedConversations, config);
  };

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

  return (
    <div className={`flex h-full flex-col bg-bg-app ${isBatchMode ? "pb-[60px]" : ""}`}>
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
          <div className="flex items-center gap-3">
            <h1 className="vesti-page-title text-text-primary">Threads</h1>
            <span className="inline-flex items-center gap-1.5 text-vesti-xs font-medium text-success/90">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {todayCount} captured today
            </span>
          </div>
          <div className="flex items-center gap-0.5">
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
            {/* Select button - toggle batch mode like filter */}
            <button
              type="button"
              aria-label={isBatchMode ? "Exit selection" : "Select conversations"}
              onClick={() => {
                if (isBatchMode) {
                  exitBatchMode();
                } else {
                  enterBatchMode();
                }
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                isBatchMode
                  ? "bg-bg-secondary text-accent-primary"
                  : "text-text-tertiary hover:bg-bg-secondary hover:text-text-secondary"
              }`}
            >
              <ListChecks className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </header>
      )}

      {headerMode === "filter" && (
        <div className="shrink-0 border-b border-border-subtle bg-bg-secondary/40 px-4 py-3">
          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-text-secondary">
              Date
            </h3>
            <div className="flex flex-wrap gap-1.5">
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
                    className={`rounded-full border px-3 py-1 text-vesti-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
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
          </section>

          <section className="mt-3 border-t border-border-subtle pt-3">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-text-secondary">
              Source
            </h3>
            <div className="flex flex-wrap gap-1.5">
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
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-vesti-xs font-semibold tracking-[0.02em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                      isActive
                        ? `${tone.bg} ${tone.border} ${tone.text}`
                        : `border-border-subtle bg-transparent text-text-tertiary hover:bg-bg-primary hover:text-text-secondary ${!hasData ? "opacity-45" : ""}`
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {platform}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ConversationList
          searchQuery={query}
          datePreset={datePreset}
          selectedPlatforms={selectedPlatforms}
          onSelect={onSelectConversation}
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
          onConversationsLoaded={setConversations}
        />

        {/* Batch action bar */}
        {isBatchMode && (
          <BatchActionBar
            selectedCount={selectedCount}
            totalCount={conversations.length}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onExport={() => setIsExportDialogOpen(true)}
            onExit={exitBatchMode}
          />
        )}
      </div>

      {/* Export dialog */}
      <ExportDialog
        open={isExportDialogOpen}
        conversations={conversations.filter((c) => selectedIds.has(c.id))}
        onClose={() => setIsExportDialogOpen(false)}
        onExport={handleExport}
      />
    </div>
  );
}

