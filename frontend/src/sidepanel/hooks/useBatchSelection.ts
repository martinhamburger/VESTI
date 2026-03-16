import { useCallback, useEffect, useMemo, useState } from "react";

export type BatchSelectionMode =
  | "inactive"
  | "selecting"
  | "export_panel"
  | "delete_panel";

interface UseBatchSelectionOptions<T> {
  items: T[];
  getId: (item: T) => number;
}

export function useBatchSelection<T>(options: UseBatchSelectionOptions<T>) {
  const { items, getId } = options;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<BatchSelectionMode>("inactive");
  const itemIds = useMemo(() => items.map(getId), [items, getId]);

  useEffect(() => {
    const visibleIds = new Set(itemIds);
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [itemIds]);

  useEffect(() => {
    if (itemIds.length > 0) return;
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
    setMode((prev) => (prev === "inactive" ? prev : "inactive"));
  }, [itemIds.length]);

  useEffect(() => {
    if (selectedIds.size > 0) return;
    setMode((prev) =>
      prev === "export_panel" || prev === "delete_panel" ? "selecting" : prev
    );
  }, [selectedIds.size]);

  const toggleSelection = useCallback((id: number) => {
    setMode((prev) => {
      if (prev === "inactive") return "selecting";
      if (prev === "export_panel" || prev === "delete_panel") return "selecting";
      return prev;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setMode("selecting");
    setSelectedIds(new Set(itemIds));
  }, [itemIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setMode((prev) => (prev === "inactive" ? prev : "selecting"));
  }, []);

  const enterBatchMode = useCallback((initialId?: number) => {
    setMode("selecting");
    if (typeof initialId !== "number") return;
    setSelectedIds((prev) => {
      if (prev.has(initialId)) return prev;
      const next = new Set(prev);
      next.add(initialId);
      return next;
    });
  }, []);

  const openExportPanel = useCallback(() => {
    setMode((prev) => (prev === "inactive" || selectedIds.size === 0 ? prev : "export_panel"));
  }, [selectedIds.size]);

  const openDeletePanel = useCallback(() => {
    setMode((prev) => (prev === "inactive" || selectedIds.size === 0 ? prev : "delete_panel"));
  }, [selectedIds.size]);

  const closePanel = useCallback(() => {
    setMode((prev) => (prev === "inactive" ? prev : "selecting"));
  }, []);

  const exitBatchMode = useCallback(() => {
    setMode("inactive");
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds]
  );

  const isBatchMode = mode !== "inactive";
  const isAllSelected = itemIds.length > 0 && selectedIds.size === itemIds.length;

  return {
    mode,
    selectedIds,
    selectedCount: selectedIds.size,
    isBatchMode,
    isAllSelected,
    totalCount: itemIds.length,
    toggleSelection,
    selectAll,
    clearSelection,
    enterBatchMode,
    openExportPanel,
    openDeletePanel,
    closePanel,
    exitBatchMode,
    isSelected,
  };
}
