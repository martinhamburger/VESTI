"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UiThemeMode } from "../../types";
import { buildFixedAnchorLayout } from "./network-layout";
import type { GraphNode, NetworkData } from "./temporal-graph-utils";
import {
  GRAPH_FONT_FAMILY,
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
  onNodeClick?: (nodeId: number) => void;
}

interface RenderNode extends GraphNode {
  x: number;
  y: number;
}

function getGraphCenterY(height: number) {
  return height / 2 + 8;
}

export function TemporalGraph({
  data,
  currentDay,
  height,
  themeMode = "light",
  scrubbing = false,
  resetToken = 0,
  onNodeClick,
}: TemporalGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const currentDayRef = useRef(currentDay);
  const activeNodesRef = useRef<RenderNode[]>([]);
  const layoutRef = useRef<ReturnType<typeof buildFixedAnchorLayout>>(new Map());
  const [width, setWidth] = useState(0);

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

      const age = currentDayRef.current - node.timelineDay;
      const enterProgress = Math.max(0, Math.min(1, age / 0.8));
      const renderNode: RenderNode = {
        ...node,
        x: centerX + (anchor.anchorX - centerX) * enterProgress,
        y: centerY + (anchor.anchorY - centerY) * enterProgress,
      };

      renderedNodes.push(renderNode);
      renderedNodesById.set(node.id, renderNode);
    }

    activeNodesRef.current = renderedNodes;

    for (const edge of data.edges) {
      const source = renderedNodesById.get(edge.source);
      const target = renderedNodesById.get(edge.target);
      if (!source || !target) continue;

      const alpha = getEdgeAlpha(edge, source, target, currentDayRef.current);
      if (alpha <= 0.01) continue;

      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.strokeStyle = getGraphEdgeStroke(themeMode, alpha);
      context.lineWidth = edge.weight * 1.8;
      context.stroke();
    }

    for (const node of renderedNodes) {
      const alpha = getNodeAlpha(node, currentDayRef.current);
      if (alpha <= 0.01) continue;

      const age = currentDayRef.current - node.timelineDay;
      if (age >= 0 && age < 0.8) {
        const birthProgress = Math.max(0, Math.min(1, age / 0.8));
        const ringOneOpacity = (1 - birthProgress) * 0.15;
        const ringTwoOpacity = (1 - birthProgress) * 0.1;

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
      context.fillStyle = hexToRgba(node.color, alpha * 0.9);
      context.fill();
      context.strokeStyle = hexToRgba(node.color, Math.min(1, alpha * 1.4));
      context.lineWidth = 1;
      context.stroke();

      if (alpha > 0.3) {
        const labelAlpha = Math.min(1, (alpha - 0.3) / 0.25);
        context.font = `11px ${GRAPH_FONT_FAMILY}`;
        context.textAlign = "center";
        context.fillStyle = getGraphLabelFill(themeMode, labelAlpha);
        context.fillText(truncateLabel(node.label, 18), node.x, node.y + node.radius + 13);
      }
    }
  }, [data.edges, data.nodes, height, themeMode, width]);

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
      return;
    }

    layoutRef.current = buildFixedAnchorLayout(data.nodes, data.edges, width, height);
    draw();
  }, [data.edges, data.nodes, draw, height, width]);

  useEffect(() => {
    currentDayRef.current = currentDay;
    draw();
  }, [currentDay, draw, resetToken, scrubbing]);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onNodeClick) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hitNode = hitTestNode(activeNodesRef.current, x, y, currentDayRef.current);
      if (hitNode) {
        onNodeClick(hitNode.id);
      }
    },
    [onNodeClick]
  );

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onClick={handleCanvasClick}
      />
    </div>
  );
}
