"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { X, ArrowRight, ChevronDown } from "lucide-react";
import type { Platform, StorageApi, UiThemeMode } from "../types";
import { useLibraryData } from "../contexts/library-data";
import * as echarts from "echarts";
import {
  getPlatformBadgeStyle,
  PLATFORM_FILTER_OPTIONS,
  getPlatformHex,
  getPlatformLabel,
} from "../constants/platform";

interface Node {
  id: number;
  x: number;
  y: number;
  r: number;
  color: string;
  label: string;
  platform: Platform;
  topicName?: string;
  isStarred?: boolean;
  created_at: number;
}

interface Edge {
  source: number;
  target: number;
  weight: number;
}

const NOW = Date.now();
const DAY = 86_400_000;

const mockNodes: Node[] = [
  { id: 1, x: 0, y: 0, r: 20, color: "#F7D8BA", label: "React 虚拟列表优化", platform: "Claude", created_at: NOW - 90 * DAY },
  { id: 2, x: 0, y: 0, r: 18, color: "#F7D8BA", label: "TypeScript 重构实践", platform: "Claude", created_at: NOW - 80 * DAY },
  { id: 3, x: 0, y: 0, r: 16, color: "#F3F4F6", label: "Chrome Extension MV3", platform: "ChatGPT", created_at: NOW - 72 * DAY },
  { id: 4, x: 0, y: 0, r: 22, color: "#F3F4F6", label: "Plasmo 框架搭建", platform: "ChatGPT", created_at: NOW - 65 * DAY },
  { id: 5, x: 0, y: 0, r: 16, color: "#F3F4F6", label: "IndexedDB 性能优化", platform: "ChatGPT", created_at: NOW - 55 * DAY },
  { id: 6, x: 0, y: 0, r: 20, color: "#172554", label: "PostgreSQL 查询调优", platform: "DeepSeek", created_at: NOW - 50 * DAY },
  { id: 7, x: 0, y: 0, r: 18, color: "#172554", label: "Docker Compose 编排", platform: "DeepSeek", created_at: NOW - 42 * DAY },
  { id: 8, x: 0, y: 0, r: 16, color: "#172554", label: "Redis 缓存策略", platform: "DeepSeek", created_at: NOW - 35 * DAY },
  { id: 9, x: 0, y: 0, r: 22, color: "#3A62D9", label: "AI Papers 2024", platform: "Gemini", created_at: NOW - 28 * DAY },
  { id: 10, x: 0, y: 0, r: 20, color: "#3A62D9", label: "RAG 检索增强", platform: "Gemini", created_at: NOW - 20 * DAY },
  { id: 11, x: 0, y: 0, r: 18, color: "#F7D8BA", label: "Tailwind 设计系统", platform: "Claude", created_at: NOW - 12 * DAY },
  { id: 12, x: 0, y: 0, r: 16, color: "#3A62D9", label: "向量数据库选型", platform: "Gemini", created_at: NOW - 5 * DAY },
];

mockNodes.forEach((node) => {
  node.color = getPlatformHex(node.platform);
});

const mockEdges: Edge[] = [
  { source: 1, target: 2, weight: 0.82 },
  { source: 1, target: 3, weight: 0.75 },
  { source: 3, target: 4, weight: 0.91 },
  { source: 4, target: 5, weight: 0.78 },
  { source: 2, target: 11, weight: 0.72 },
  { source: 1, target: 11, weight: 0.68 },
  { source: 6, target: 7, weight: 0.85 },
  { source: 7, target: 8, weight: 0.79 },
  { source: 6, target: 8, weight: 0.71 },
  { source: 9, target: 10, weight: 0.88 },
  { source: 10, target: 12, weight: 0.83 },
  { source: 9, target: 12, weight: 0.76 },
  { source: 5, target: 6, weight: 0.38 },
  { source: 10, target: 1, weight: 0.35 },
  { source: 4, target: 12, weight: 0.41 },
];

interface NetworkTabProps {
  storage: StorageApi;
  themeMode?: UiThemeMode;
  onSelectConversation?: (id: number) => void;
}

export function NetworkTab({
  storage,
  themeMode = "light",
  onSelectConversation,
}: NetworkTabProps) {
  const { conversations, topics } = useLibraryData();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "all">("all");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [apiEdges, setApiEdges] = useState<Edge[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const platforms: (Platform | "all")[] = ["all", ...PLATFORM_FILTER_OPTIONS];
  const useRealGraph = conversations.length >= 3;

  const topicMap = useMemo(() => {
    const map = new Map<number, string>();
    const walk = (items: typeof topics) => {
      items.forEach((topic) => {
        map.set(topic.id, topic.name);
        if (topic.children) walk(topic.children);
      });
    };
    walk(topics);
    return map;
  }, [topics]);

  const baseNodes = useMemo<Node[]>(() => {
    if (!useRealGraph) return mockNodes;
    return conversations.slice(0, 30).map((conv) => ({
      id: conv.id,
      x: 0,
      y: 0,
      r: conv.is_starred ? 24 : 16,
      color: getPlatformHex(conv.platform),
      label: conv.title || "Untitled",
      platform: conv.platform,
      topicName: conv.topic_id ? topicMap.get(conv.topic_id) : undefined,
      isStarred: conv.is_starred,
      created_at: conv.created_at,
    }));
  }, [conversations, topicMap, useRealGraph]);

  const baseNodeIds = useMemo(() => baseNodes.map((node) => node.id), [baseNodes]);

  useEffect(() => {
    let cancelled = false;

    if (!storage.getAllEdges || !useRealGraph || baseNodeIds.length === 0) {
      setApiEdges([]);
      setGraphLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setGraphLoading(true);
    storage
      .getAllEdges({ threshold: 0.4, conversationIds: baseNodeIds })
      .then((edges) => {
        if (!cancelled) {
          setApiEdges(edges ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[Network] getAllEdges error:", err);
          setApiEdges([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGraphLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [baseNodeIds, storage, useRealGraph]);

  const visibleNodes = useMemo(() => {
    if (selectedPlatform === "all") return baseNodes;
    return baseNodes.filter((node) => node.platform === selectedPlatform);
  }, [baseNodes, selectedPlatform]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes]
  );

  const baseEdges = useMemo<Edge[]>(() => {
    return useRealGraph ? apiEdges.filter((edge) => edge.weight >= 0.4) : mockEdges;
  }, [apiEdges, useRealGraph]);

  const visibleEdges = useMemo(
    () =>
      baseEdges.filter(
        (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
      ),
    [baseEdges, visibleNodeIds]
  );

  useEffect(() => {
    if (!selectedNode) return;
    const next = baseNodes.find((node) => node.id === selectedNode.id);
    if (!next || !visibleNodeIds.has(next.id)) {
      setSelectedNode(null);
      return;
    }
    setSelectedNode(next);
  }, [baseNodes, selectedNode, visibleNodeIds]);

  const handleNodeClick = useCallback(
    (nodeId: number) => {
      const node = visibleNodes.find((n) => n.id === nodeId);
      if (node) setSelectedNode(node);
    },
    [visibleNodes]
  );

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, {
        renderer: "svg",
      });
    }

    const chart = chartInstance.current;

    const echartsNodes: echarts.GraphSeriesOption["data"] = visibleNodes.map((node) => ({
      id: String(node.id),
      name: node.label,
      symbolSize: node.r * 2,
      itemStyle: {
        color: node.color,
        borderColor: "#FFFFFF",
        borderWidth: 2,
      },
      label: { show: false },
      emphasis: {
        label: {
          show: true,
          position: "bottom" as const,
          fontSize: 11,
          color: "#6B6B6B",
          fontFamily: "Nunito Sans, sans-serif",
          formatter: (params: { name: string }) =>
            params.name.length > 16 ? params.name.slice(0, 16) + "…" : params.name,
        },
        itemStyle: {
          borderColor: "#3266AD",
          borderWidth: 3,
        },
      },
    }));

    const echartsEdges: echarts.GraphSeriesOption["edges"] = visibleEdges
      .filter((edge) => edge.weight >= 0.4)
      .map((edge) => ({
        source: String(edge.source),
        target: String(edge.target),
        lineStyle: {
          width: edge.weight * 2,
          color: "#C8C4BC",
          opacity: 0.3 + edge.weight * 0.4,
          curveness: 0,
        },
        emphasis: {
          lineStyle: {
            color: "#3266AD",
            opacity: 0.9,
            width: edge.weight * 3,
          },
        },
      }));

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      series: [
        {
          type: "graph",
          layout: "force",
          animation: true,
          animationDuration: 1200,
          animationEasingUpdate: "quinticInOut",
          data: echartsNodes,
          edges: echartsEdges,
          force: {
            repulsion: 300,
            gravity: 0.1,
            edgeLength: [80, 200],
            layoutAnimation: true,
          },
          roam: true,
          focusNodeAdjacency: true,
          lineStyle: {
            color: "#C8C4BC",
            curveness: 0,
          },
          emphasis: {
            focus: "adjacency",
          },
        },
      ],
    };

    chart.setOption(option);

    chart.off("click");
    chart.on("click", (params) => {
      if (params.dataType === "node") {
        handleNodeClick(Number((params.data as { id: string }).id));
      }
    });

    return () => {
      chart.off("click");
    };
  }, [visibleNodes, visibleEdges, handleNodeClick]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-10 bg-bg-tertiary border-b border-border-subtle px-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          {platforms.map((platform) => (
            <button
              key={platform}
              onClick={() => setSelectedPlatform(platform)}
              className={`px-3 py-1 rounded-full text-[11px] font-sans font-medium transition-all ${
                selectedPlatform === platform
                  ? platform === "all"
                    ? themeMode === "dark"
                      ? "bg-bg-secondary text-text-primary"
                      : "bg-accent-primary text-white"
                    : "text-white"
                  : "bg-bg-surface-card text-text-secondary hover:bg-bg-surface-card-hover"
              }`}
              style={
                selectedPlatform === platform && platform !== "all"
                  ? getPlatformBadgeStyle(platform, themeMode)
                  : {}
              }
            >
              {platform === "all" ? "All" : getPlatformLabel(platform)}
            </button>
          ))}
        </div>

        <button className="ml-auto px-3 py-1 rounded-md bg-bg-surface-card hover:bg-bg-surface-card-hover text-[11px] font-sans text-text-secondary transition-all flex items-center gap-1.5">
          <span>Time Range</span>
          <ChevronDown strokeWidth={1.5} className="w-3 h-3" />
        </button>

        <button className="px-3 py-1 rounded-md bg-bg-surface-card hover:bg-bg-surface-card-hover text-[11px] font-sans text-text-secondary transition-all">
          Reset View
        </button>
      </div>

      {/* Graph Area */}
      <div className="flex-1 relative bg-bg-tertiary overflow-hidden">
        {graphLoading && (
          <div className="absolute top-3 left-3 text-[11px] font-sans text-text-tertiary">
            Building graph...
          </div>
        )}
        <div
          ref={chartRef}
          className="absolute inset-0"
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {selectedNode && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setSelectedNode(null)}
          />
          <div
            className="fixed top-0 right-0 bottom-0 w-80 bg-bg-primary shadow-2xl z-50 overflow-y-auto transition-transform duration-200"
            style={{ transform: "translateX(0)" }}
          >
            <div className="p-4">
              <button
                onClick={() => setSelectedNode(null)}
                className="flex items-center gap-2 text-sm font-sans text-text-secondary hover:text-text-primary mb-4 transition-colors"
              >
                <X strokeWidth={1.5} className="w-4 h-4" />
                <span>Close</span>
              </button>

              <h2 className="text-lg font-serif font-normal text-text-primary mb-3">
                {selectedNode.label}
              </h2>

              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded-md text-[11px] font-sans font-medium leading-none"
                  style={getPlatformBadgeStyle(selectedNode.platform, themeMode)}
                >
                  {getPlatformLabel(selectedNode.platform)}
                </span>
                <span className="text-xs font-sans text-text-tertiary">2yr ago</span>
                {selectedNode.topicName && (
                  <span className="text-xs font-sans text-text-tertiary">
                    · {selectedNode.topicName}
                  </span>
                )}
                {selectedNode.isStarred && (
                  <span className="text-xs font-sans text-text-tertiary">· Starred</span>
                )}
              </div>

              <div className="mb-6 p-3 rounded-lg bg-bg-surface-card">
                <div className="flex items-center gap-2 text-sm font-sans text-text-primary mb-2">
                  <span>✓ Analyzed</span>
                </div>
                <p className="text-xs font-sans text-text-secondary">
                  Discussion about {selectedNode.label.toLowerCase()} covering implementation strategies, best practices, and common patterns.
                </p>
              </div>

              <button
                onClick={() => {
                  if (onSelectConversation && selectedNode) {
                    onSelectConversation(selectedNode.id);
                  }
                  setSelectedNode(null);
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-sm font-sans font-medium transition-all flex items-center justify-center gap-2"
              >
                <span>View in Library</span>
                <ArrowRight strokeWidth={1.5} className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
