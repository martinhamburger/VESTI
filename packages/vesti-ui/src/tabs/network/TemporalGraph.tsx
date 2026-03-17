"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UiThemeMode } from "../../types";
import { buildFixedAnchorLayout } from "./network-layout";
import type { GraphNode, NetworkData } from "./temporal-graph-utils";
import {
  GRAPH_FONT_FAMILY,
  clamp,
  getEdgeAlpha,
  getGraphEdgeStroke,
  getGraphLabelFill,
  getNodeAlpha,
  hexToRgba,
  hitTestNode,
  truncateLabel,
} from "./temporal-graph-utils";

interface TemporalGraphProps {
  data: NetworkData;
  currentDay: number;
  height: number;
  themeMode?: UiThemeMode;
  scrubbing?: boolean;
  resetToken?: number;
  selectedNodeId?: number | null;
  highlightedNodeIds?: number[];
  onNodeClick?: (nodeId: number) => void;
  onBackgroundClick?: () => void;
}

interface RenderNode extends GraphNode {
  x: number;
  y: number;
}

interface PanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const PAN_PADDING = 18;
const DRAG_THRESHOLD = 5;

function getGraphCenterY(height: number) {
  return height / 2 + 8;
}

function createPanBounds() {
  return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
}

function getCenteredPan(bounds: PanBounds) {
  return {
    x: clamp((bounds.minX + bounds.maxX) / 2, bounds.minX, bounds.maxX),
    y: clamp((bounds.minY + bounds.maxY) / 2, bounds.minY, bounds.maxY),
  };
}

function buildPanBounds(
  layout: ReturnType<typeof buildFixedAnchorLayout>,
  width: number,
  height: number
): PanBounds {
  if (layout.size === 0) return createPanBounds();

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  layout.forEach((anchor) => {
    minX = Math.min(minX, anchor.anchorX - anchor.horizontalFootprint);
    maxX = Math.max(maxX, anchor.anchorX + anchor.horizontalFootprint);
    minY = Math.min(minY, anchor.anchorY - anchor.collisionRadius);
    maxY = Math.max(maxY, anchor.anchorY + anchor.verticalFootprint);
  });

  const horizontalRange = maxX - minX;
  const verticalRange = maxY - minY;

  const minPanX =
    horizontalRange + PAN_PADDING * 2 <= width
      ? (width - (minX + maxX)) / 2
      : width - PAN_PADDING - maxX;
  const maxPanX =
    horizontalRange + PAN_PADDING * 2 <= width
      ? (width - (minX + maxX)) / 2
      : PAN_PADDING - minX;

  const minPanY =
    verticalRange + PAN_PADDING * 2 <= height
      ? (height - (minY + maxY)) / 2
      : height - PAN_PADDING - maxY;
  const maxPanY =
    verticalRange + PAN_PADDING * 2 <= height
      ? (height - (minY + maxY)) / 2
      : PAN_PADDING - minY;

  return {
    minX: Math.min(minPanX, maxPanX),
    maxX: Math.max(minPanX, maxPanX),
    minY: Math.min(minPanY, maxPanY),
    maxY: Math.max(minPanY, maxPanY),
  };
}

export function TemporalGraph({
  data,
  currentDay,
  height,
  themeMode = "light",
  scrubbing = false,
  resetToken = 0,
  selectedNodeId = null,
  highlightedNodeIds,
  onNodeClick,
  onBackgroundClick,
}: TemporalGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const currentDayRef = useRef(currentDay);
  const activeNodesRef = useRef<RenderNode[]>([]);
  const layoutRef = useRef<ReturnType<typeof buildFixedAnchorLayout>>(new Map());
  const panRef = useRef({ x: 0, y: 0 });
  const panBoundsRef = useRef<PanBounds>(createPanBounds());
  const pointerStateRef = useRef<{
    pointerId: number | null;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  }>({
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
    moved: false,
  });
  const [width, setWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const highlightedNodeIdSet = useMemo(
    () => new Set(highlightedNodeIds ?? []),
    [highlightedNodeIds]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = getGraphCenterY(height);
    const renderedNodes: RenderNode[] = [];
    const renderedNodesById = new Map<number, RenderNode>();

    for (const node of data.nodes) {
      if (node.timelineDay > currentDayRef.current) continue;
      const anchor = layoutRef.current.get(node.id);
      if (!anchor) continue;

      const targetX = anchor.anchorX + panRef.current.x;
      const targetY = anchor.anchorY + panRef.current.y;
      const age = currentDayRef.current - node.timelineDay;
      const enterProgress = Math.max(0, Math.min(1, age / 0.8));
      const renderNode: RenderNode = {
        ...node,
        x: centerX + (targetX - centerX) * enterProgress,
        y: centerY + (targetY - centerY) * enterProgress,
      };

      renderedNodes.push(renderNode);
      renderedNodesById.set(node.id, renderNode);
    }

    activeNodesRef.current = renderedNodes;

    const hasSelection = selectedNodeId !== null;

    for (const edge of data.edges) {
      const source = renderedNodesById.get(edge.source);
      const target = renderedNodesById.get(edge.target);
      if (!source || !target) continue;

      let alpha = getEdgeAlpha(edge, source, target, currentDayRef.current);
      if (alpha <= 0.01) continue;

      const isHighlightedEdge =
        selectedNodeId !== null &&
        (edge.source === selectedNodeId || edge.target === selectedNodeId);

      if (hasSelection && !isHighlightedEdge) {
        alpha *= 0.16;
      }

      if (alpha <= 0.01) continue;

      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.strokeStyle = getGraphEdgeStroke(themeMode, isHighlightedEdge ? alpha * 1.12 : alpha);
      context.lineWidth = edge.weight * (isHighlightedEdge ? 2.3 : 1.8);
      context.stroke();
    }

    for (const node of renderedNodes) {
      let alpha = getNodeAlpha(node, currentDayRef.current);
      if (alpha <= 0.01) continue;

      const isSelected = node.id === selectedNodeId;
      const isNeighbor = highlightedNodeIdSet.has(node.id);
      if (hasSelection && !isSelected && !isNeighbor) {
        alpha *= 0.22;
      }

      const age = currentDayRef.current - node.timelineDay;
      if (age >= 0 && age < 0.8) {
        const birthProgress = Math.max(0, Math.min(1, age / 0.8));
        const ringOneOpacity = (1 - birthProgress) * 0.15 * (hasSelection && !isSelected && !isNeighbor ? 0.28 : 1);
        const ringTwoOpacity = (1 - birthProgress) * 0.1 * (hasSelection && !isSelected && !isNeighbor ? 0.28 : 1);

        context.beginPath();
        context.arc(node.x, node.y, node.radius + birthProgress * 18, 0, Math.PI * 2);
        context.fillStyle = hexToRgba(node.color, ringOneOpacity);
        context.fill();

        context.beginPath();
        context.arc(node.x, node.y, node.radius + birthProgress * 10, 0, Math.PI * 2);
        context.fillStyle = hexToRgba(node.color, ringTwoOpacity);
        context.fill();
      }

      context.beginPath();
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      context.fillStyle = hexToRgba(node.color, alpha * (isSelected ? 1 : 0.9));
      context.fill();
      context.strokeStyle = isSelected
        ? themeMode === "dark"
          ? "rgba(229, 227, 219, 0.95)"
          : "rgba(26, 26, 26, 0.92)"
        : hexToRgba(node.color, Math.min(1, alpha * 1.35));
      context.lineWidth = isSelected ? 2.2 : 1;
      context.stroke();

      if (alpha > 0.3 || isSelected || isNeighbor) {
        const labelAlpha = isSelected
          ? 1
          : isNeighbor
            ? Math.max(0.62, Math.min(1, (alpha - 0.2) / 0.28))
            : Math.min(1, (alpha - 0.3) / 0.25);
        context.font = `11px ${GRAPH_FONT_FAMILY}`;
        context.textAlign = "center";
        context.fillStyle = getGraphLabelFill(themeMode, labelAlpha);
        context.fillText(truncateLabel(node.label, 18), node.x, node.y + node.radius + 13);
      }
    }
  }, [data.edges, data.nodes, height, highlightedNodeIdSet, selectedNodeId, themeMode, width]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? wrapper.clientWidth;
      setWidth(nextWidth);
    });

    observer.observe(wrapper);
    setWidth(wrapper.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (width <= 0) {
      layoutRef.current = new Map();
      activeNodesRef.current = [];
      panBoundsRef.current = createPanBounds();
      panRef.current = { x: 0, y: 0 };
      return;
    }

    const layout = buildFixedAnchorLayout(data.nodes, data.edges, width, height);
    layoutRef.current = layout;
    const panBounds = buildPanBounds(layout, width, height);
    panBoundsRef.current = panBounds;
    panRef.current = getCenteredPan(panBounds);
    draw();
  }, [data.edges, data.nodes, draw, height, width]);

  useEffect(() => {
    currentDayRef.current = currentDay;
    draw();
  }, [currentDay, draw, resetToken, scrubbing, selectedNodeId, highlightedNodeIdSet]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    pointerStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerStateRef.current.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - pointerStateRef.current.startClientX;
      const deltaY = event.clientY - pointerStateRef.current.startClientY;

      if (
        !pointerStateRef.current.moved &&
        Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD
      ) {
        pointerStateRef.current.moved = true;
        setIsDragging(true);
      }

      if (!pointerStateRef.current.moved) return;

      panRef.current = {
        x: clamp(
          pointerStateRef.current.startPanX + deltaX,
          panBoundsRef.current.minX,
          panBoundsRef.current.maxX
        ),
        y: clamp(
          pointerStateRef.current.startPanY + deltaY,
          panBoundsRef.current.minY,
          panBoundsRef.current.maxY
        ),
      };
      draw();
    },
    [draw]
  );

  const releasePointer = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerStateRef.current.pointerId !== event.pointerId) return;

      const wasDragging = pointerStateRef.current.moved;
      pointerStateRef.current.pointerId = null;
      pointerStateRef.current.moved = false;
      setIsDragging(false);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (wasDragging) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hitNode = hitTestNode(activeNodesRef.current, x, y, currentDayRef.current);
      if (hitNode) {
        onNodeClick?.(hitNode.id);
      } else {
        onBackgroundClick?.();
      }
    },
    [onBackgroundClick, onNodeClick]
  );

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      />
    </div>
  );
}
