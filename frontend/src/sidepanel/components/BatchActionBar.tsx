import { Square, CheckSquare, Download, X } from "lucide-react";

interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExport: () => void;
  onExit: () => void;
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onExport,
  onExit,
}: BatchActionBarProps) {
  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-border-subtle bg-bg-primary px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
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
          <span className="rounded-md bg-bg-secondary px-2 py-0.5 text-xs font-medium text-text-tertiary">
            {selectedCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            disabled={selectedCount === 0}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-accent-primary px-3 text-xs font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
            Export
          </button>
          <button
            onClick={onExit}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text-secondary"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
