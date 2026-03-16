import {
  CheckSquare,
  Download,
  Loader2,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ExportFormat } from "~lib/types";
import type { BatchSelectionMode } from "../hooks/useBatchSelection";

type BatchActionMode = Exclude<BatchSelectionMode, "inactive">;

interface BatchFeedback {
  message: string;
  tone: "default" | "error";
}

interface BatchActionBarProps {
  mode: BatchActionMode;
  selectedCount: number;
  totalCount: number;
  actionKey: string | null;
  deleteConfirmValue: string;
  feedback?: BatchFeedback | null;
  onDeleteConfirmValueChange: (value: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onToggleExportPanel: () => void;
  onToggleDeletePanel: () => void;
  onClosePanel: () => void;
  onChooseExportFormat: (format: ExportFormat) => void;
  onConfirmDelete: () => void;
  onExit: () => void;
}

const EXPORT_OPTIONS: Array<{
  format: ExportFormat;
  name: string;
  description: string;
}> = [
  {
    format: "json",
    name: "JSON",
    description: "Structured full export for local backup and reprocessing",
  },
  {
    format: "txt",
    name: "TXT",
    description: "Human-readable plain text export",
  },
  {
    format: "md",
    name: "MD",
    description: "Markdown export for notes and writing tools",
  },
];

export function BatchActionBar({
  mode,
  selectedCount,
  totalCount,
  actionKey,
  deleteConfirmValue,
  feedback = null,
  onDeleteConfirmValueChange,
  onSelectAll,
  onClearSelection,
  onToggleExportPanel,
  onToggleDeletePanel,
  onClosePanel,
  onChooseExportFormat,
  onConfirmDelete,
  onExit,
}: BatchActionBarProps) {
  const isAllSelected = selectedCount === totalCount && totalCount > 0;
  const hasSelection = selectedCount > 0;
  const deleteBusy = actionKey === "delete";
  const showingExportPanel = mode === "export_panel";
  const showingDeletePanel = mode === "delete_panel";

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3">
      {showingExportPanel && (
        <div className="mb-2 rounded-xl border border-border-subtle bg-bg-primary/95 p-3 shadow-paper backdrop-blur-sm">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-text-primary">
                Export {selectedCount} selected thread{selectedCount === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-[11px] text-text-secondary">
                Choose the same full-export format set used in Data.
              </p>
            </div>
            <button
              type="button"
              onClick={onClosePanel}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <p className="data-subgroup-label">Export format</p>
          <div className="data-export-list">
            {EXPORT_OPTIONS.map((option) => {
              const busy = actionKey === `export-${option.format}`;
              return (
                <div className="data-export-item" key={option.format}>
                  <div className="data-export-info">
                    <p className="data-export-name">{option.name}</p>
                    <p className="data-export-desc">{option.description}</p>
                  </div>
                  <button
                    type="button"
                    className="data-export-btn"
                    disabled={Boolean(actionKey) || !hasSelection}
                    onClick={() => onChooseExportFormat(option.format)}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
                    ) : (
                      <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                    )}
                    Export
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showingDeletePanel && (
        <div className="mb-2 rounded-xl border border-border-subtle bg-bg-primary/95 p-3 shadow-paper backdrop-blur-sm">
          <div className="data-danger-zone">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="data-danger-head">
                  <TriangleAlert className="h-4 w-4" strokeWidth={1.8} />
                  <span>Delete selected threads</span>
                </div>
                <p className="data-danger-desc mb-0">
                  This will remove {selectedCount} selected thread
                  {selectedCount === 1 ? "" : "s"} and their messages from local storage.
                  Type <span className="font-semibold text-danger">DELETE</span> to
                  continue.
                </p>
              </div>
              <button
                type="button"
                onClick={onClosePanel}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              Confirmation
            </label>
            <input
              type="text"
              value={deleteConfirmValue}
              placeholder="Type DELETE"
              onChange={(event) => onDeleteConfirmValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onClosePanel();
                }
                if (event.key === "Enter" && deleteConfirmValue === "DELETE") {
                  event.preventDefault();
                  onConfirmDelete();
                }
              }}
              className="mt-1.5 h-9 w-full rounded-md border border-border-default bg-bg-primary px-3 text-vesti-sm text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-border-focus"
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClosePanel}
                className="data-export-btn"
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="data-danger-btn"
                disabled={deleteConfirmValue !== "DELETE" || deleteBusy || !hasSelection}
                onClick={onConfirmDelete}
              >
                {deleteBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                )}
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border-subtle bg-bg-primary/95 px-3 py-[7px] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={isAllSelected ? onClearSelection : onSelectAll}
              className="flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {isAllSelected ? (
                <CheckSquare className="h-4 w-4 text-accent-primary" strokeWidth={1.5} />
              ) : (
                <Square className="h-4 w-4" strokeWidth={1.5} />
              )}
              {isAllSelected ? "Deselect All" : "Select All"}
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-md bg-bg-secondary px-[7px] py-0.5 text-xs font-medium text-text-tertiary">
                {selectedCount}
              </span>
              <span className="truncate text-[11px] text-text-tertiary">
                of {totalCount} in current results
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleExportPanel}
              disabled={!hasSelection || Boolean(actionKey)}
              className="data-export-btn"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
              Export
            </button>
            <button
              type="button"
              onClick={onToggleDeletePanel}
              disabled={!hasSelection || Boolean(actionKey)}
              className="data-danger-btn"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              Delete
            </button>
            <button
              type="button"
              onClick={onExit}
              disabled={Boolean(actionKey)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text-secondary disabled:opacity-45"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <p className={`mt-2 data-feedback-row ${feedback.tone === "error" ? "is-error" : ""}`}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
