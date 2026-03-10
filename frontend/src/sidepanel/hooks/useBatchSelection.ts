import { useState, useCallback } from "react";

interface UseBatchSelectionOptions<T> {
  items: T[];
  getId: (item: T) => number;
  maxSelection?: number;
}

export function useBatchSelection<T>(options: UseBatchSelectionOptions<T>) {
  const { items, getId, maxSelection = 20 } = options;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchMode, setIsBatchMode] = useState(false);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < maxSelection) {
        next.add(id);
      }
      return next;
    });
  }, [maxSelection]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.slice(0, maxSelection).map(getId)));
  }, [items, getId, maxSelection]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const enterBatchMode = useCallback(() => setIsBatchMode(true), []);

  const exitBatchMode = useCallback(() => {
    setIsBatchMode(false);
    clearSelection();
  }, [clearSelection]);

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds]
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isBatchMode,
    toggleSelection,
    selectAll,
    clearSelection,
    enterBatchMode,
    exitBatchMode,
    isSelected,
  };
}
