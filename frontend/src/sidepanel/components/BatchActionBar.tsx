import {
  Check,
  CheckSquare,
  Copy,
  Download,
  Loader2,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type {
  ConversationExportContentMode,
  ConversationExportFormat,
} from "../types/export";
import type { BatchSelectionMode } from "../hooks/useBatchSelection";

type BatchActionMode = Exclude<BatchSelectionMode, "inactive">;

interface BatchFeedback {
  message: string;
  tone: "default" | "warning" | "error";
  title?: string;
  detail?: string;
  hint?: string;
}

interface BatchActionBarProps {
  mode: BatchActionMode;
  exportMode: ConversationExportContentMode;
  selectedExportFormat: ConversationExportFormat;
  selectedCount: number;
  totalCount: number;
  actionKey: string | null;
  deleteConfirmValue: string;
  clipboardAvailable: boolean;
  copyJustSucceeded: boolean;
  feedback?: BatchFeedback | null;
  onDeleteConfirmValueChange: (value: string) => void;
  onExportModeChange: (mode: ConversationExportContentMode) => void;
  onExportFormatChange: (format: ConversationExportFormat) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onToggleExportPanel: () => void;
  onToggleDeletePanel: () => void;
  onClosePanel: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onConfirmDelete: () => void;
  onExit: () => void;
}

const EXPORT_OPTIONS: Array<{
  format: ConversationExportFormat;
  name: string;
  description: string;
}> = [
  {
    format: "md",
    name: "Markdown",
    description: "Markdown export for notes, docs, and writing tools",
  },
  {
    format: "txt",
    name: "Text",
    description: "Plain text export for quick reading and copy/paste",
  },
  {
    format: "json",
    name: "JSON",
    description: "Structured export for backup, review, and reprocessing",
  },
];

const EXPORT_MODE_OPTIONS: Array<{
  mode: ConversationExportContentMode;
  label: string;
  description: string;
}> = [
  {
    mode: "full",
    label: "Full",
    description: "Keep the complete thread transcript locally.",
  },
  {
    mode: "compact",
    label: "Compact",
    description:
      "Distilled handoff for the next agent. Tries current LLM settings first, then local fallback.",
  },
  {
    mode: "summary",
    label: "Summary",
    description:
      "Human note format. Tries current LLM settings first, then local fallback.",
  },
];

export function BatchActionBar({
  mode,
  exportMode,
  selectedExportFormat,
  selectedCount,
  totalCount,
  actionKey,
  deleteConfirmValue,
  clipboardAvailable,
  copyJustSucceeded,
  feedback = null,
  onDeleteConfirmValueChange,
  onExportModeChange,
  onExportFormatChange,
  onSelectAll,
  onClearSelection,
  onToggleExportPanel,
  onToggleDeletePanel,
  onClosePanel,
  onDownload,
  onCopy,
  onConfirmDelete,
  onExit,
}: BatchActionBarProps) {
  const isAllSelected = selectedCount === totalCount && totalCount > 0;
  const hasSelection = selectedCount > 0;
  const deleteBusy = actionKey === "delete";
  const showingExportPanel = mode === "export_panel";
  const showingDeletePanel = mode === "delete_panel";
  const selectedMode =
    EXPORT_MODE_OPTIONS.find((option) => option.mode === exportMode) ||
    EXPORT_MODE_OPTIONS[0];
  const selectedFormat =
    EXPORT_OPTIONS.find((option) => option.format === selectedExportFormat) ||
    EXPORT_OPTIONS[0];
  const feedbackClassName =
    feedback?.tone === "error"
      ? "is-error"
      : feedback?.tone === "warning"
        ? "is-warning"
        : "";
  const toolbarActionBaseClassName =
    "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-45";
  const toolbarNeutralActionClassName = `${toolbarActionBaseClassName} text-text-secondary hover:bg-bg-secondary hover:text-text-primary`;
  const toolbarDeleteActionClassName = `${toolbarActionBaseClassName} text-danger hover:bg-bg-secondary`;
  const toolbarSelectActionClassName = `${toolbarNeutralActionClassName} px-1.5`;
  const hasStructuredFeedback = Boolean(
    feedback?.title || feedback?.detail || feedback?.hint
  );
  const downloadBusy = actionKey === `download-${selectedExportFormat}`;
  const copyBusy = actionKey === `copy-${selectedExportFormat}`;
  const exportActionsDisabled = Boolean(actionKey) || !hasSelection;
  const copyDisabled = exportActionsDisabled || !clipboardAvailable;
  const copyButtonClassName = [
    "data-export-action-btn",
    exportMode !== "full" ? "is-ai-ready" : "",
    copyJustSucceeded ? "is-success" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const copyButtonLabel = copyBusy
    ? "Generating"
    : copyJustSucceeded
      ? "Copied"
      : clipboardAvailable
        ? "Copy"
        : "Copy unavailable";
  const copyButtonIcon = copyBusy ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
  ) : copyJustSucceeded ? (
    <Check className="h-3.5 w-3.5" strokeWidth={1.8} />
  ) : (
    <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
  );

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3">
      {showingExportPanel ? (
        <div className="rounded-xl border border-border-subtle bg-bg-primary/95 p-3 shadow-paper backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-text-primary">
                Export {selectedCount} selected thread{selectedCount === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-[11px] text-text-secondary">
                Keep Data-style format rows and choose the export density here.
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

          <p className="mt-3 data-subgroup-label">Export mode</p>
          <div className="rounded-lg bg-bg-secondary p-1">
            <div className="grid grid-cols-3 gap-1">
              {EXPORT_MODE_OPTIONS.map((option) => {
                const active = exportMode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => onExportModeChange(option.mode)}
                    className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                      active
                        ? "bg-bg-primary text-text-primary shadow-sm"
                        : "text-text-secondary hover:bg-bg-primary/70 hover:text-text-primary"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-[1.45] text-text-secondary">
            {selectedMode.description}
          </p>

          <p className="mt-3 data-subgroup-label">Export format</p>
          <div className="data-format-selector">
            {EXPORT_OPTIONS.map((option) => {
              const active = selectedExportFormat === option.format;
              return (
                <button
                  key={option.format}
                  type="button"
                  onClick={() => onExportFormatChange(option.format)}
                  disabled={Boolean(actionKey)}
                  className={`data-format-option ${active ? "is-selected" : ""}`}
                >
                  <span className="data-format-option-name">{option.name}</span>
                  <span className="data-format-option-desc">{option.description}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-[1.45] text-text-secondary">
            Current format: {selectedFormat.name}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="data-export-action-btn"
              disabled={exportActionsDisabled}
              onClick={onDownload}
            >
              {downloadBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
              ) : (
                <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
              )}
              {downloadBusy ? "Generating" : "Download"}
            </button>
            <button
              type="button"
              className={copyButtonClassName}
              disabled={copyDisabled}
              onClick={onCopy}
            >
              {copyButtonIcon}
              {copyButtonLabel}
            </button>
          </div>

          {feedback &&
            (hasStructuredFeedback ? (
              <div className={`mt-3 data-feedback-callout ${feedbackClassName}`}>
                <div className="data-feedback-callout-head">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                  <p className="data-feedback-title">{feedback.title || feedback.message}</p>
                </div>
                {feedback.detail && <p className="data-feedback-detail">{feedback.detail}</p>}
                {feedback.hint && <p className="data-feedback-hint">{feedback.hint}</p>}
              </div>
            ) : (
              <p className={`mt-3 data-feedback-row ${feedbackClassName}`}>{feedback.message}</p>
            ))}
        </div>
      ) : showingDeletePanel ? (
        <div className="rounded-xl border border-border-subtle bg-bg-primary/95 p-3 shadow-paper backdrop-blur-sm">
          <div className="data-danger-zone">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="data-danger-head">
                  <TriangleAlert className="h-4 w-4" strokeWidth={1.8} />
                  <span>Delete {selectedCount} selected thread{selectedCount === 1 ? "" : "s"}</span>
                </div>
                <p className="data-danger-desc mb-0">
                  This will remove {selectedCount} selected thread
                  {selectedCount === 1 ? "" : "s"} and their messages from local
                  storage. Type <span className="font-semibold text-danger">DELETE</span>{" "}
                  to continue.
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

          {feedback &&
            (hasStructuredFeedback ? (
              <div className={`mt-3 data-feedback-callout ${feedbackClassName}`}>
                <div className="data-feedback-callout-head">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                  <p className="data-feedback-title">{feedback.title || feedback.message}</p>
                </div>
                {feedback.detail && <p className="data-feedback-detail">{feedback.detail}</p>}
                {feedback.hint && <p className="data-feedback-hint">{feedback.hint}</p>}
              </div>
            ) : (
              <p className={`mt-3 data-feedback-row ${feedbackClassName}`}>{feedback.message}</p>
            ))}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/95 px-2 py-2 shadow-paper backdrop-blur-sm">
            <div className="flex items-center gap-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={isAllSelected ? onClearSelection : onSelectAll}
                  className={`${toolbarSelectActionClassName} min-w-0`}
                >
                  {isAllSelected ? (
                    <CheckSquare className="h-4 w-4 text-accent-primary" strokeWidth={1.5} />
                  ) : (
                    <Square className="h-4 w-4" strokeWidth={1.5} />
                  )}
                  {isAllSelected ? "Deselect All" : "Select All"}
                </button>
                <p className="min-w-0 truncate text-[11px] leading-4 text-text-tertiary">
                  <span className="font-semibold text-text-secondary">{selectedCount}</span>{" "}
                  selected &middot; {totalCount} in current results
                </p>
              </div>

              <div className="flex-1" />

              <div className="ml-2 flex shrink-0 items-center gap-2 pl-2">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-px rounded-full bg-border-subtle"
                />
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={onToggleExportPanel}
                    disabled={!hasSelection || Boolean(actionKey)}
                    className={toolbarNeutralActionClassName}
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={onToggleDeletePanel}
                    disabled={!hasSelection || Boolean(actionKey)}
                    className={toolbarDeleteActionClassName}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={onExit}
                    disabled={Boolean(actionKey)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {feedback &&
            (hasStructuredFeedback ? (
              <div className={`mt-2 data-feedback-callout ${feedbackClassName}`}>
                <div className="data-feedback-callout-head">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                  <p className="data-feedback-title">{feedback.title || feedback.message}</p>
                </div>
                {feedback.detail && <p className="data-feedback-detail">{feedback.detail}</p>}
                {feedback.hint && <p className="data-feedback-hint">{feedback.hint}</p>}
              </div>
            ) : (
              <p className={`mt-2 data-feedback-row ${feedbackClassName}`}>{feedback.message}</p>
            ))}
        </>
      )}
    </div>
  );
}
