
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  CheckSquare,
  ChevronRight,
  Clipboard,
  Download,
  FileText,
  Filter,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  RotateCcw,
  Search,
  Send,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type {
  Conversation,
  ExploreAgentPlan,
  ExploreAskOptions,
  ExploreContextCandidate,
  ExploreMessage,
  ExploreMode,
  ExploreSearchScope,
  ExploreSearchScopeMode,
  ExploreSession,
  ExploreToolCall,
  ExploreToolName,
  StorageApi,
  UiThemeMode,
} from "../types";

const MODE_STAGES: Record<ExploreMode, string[]> = {
  agent: [
    "Planning with model...",
    "Resolving scope and route...",
    "Collecting evidence...",
    "Compiling context draft...",
    "Synthesizing answer...",
  ],
  classic: ["Understanding query...", "Searching conversations...", "Synthesizing answer..."],
};

const sampleQuestions = [
  "What did I do this week?",
  "What React performance optimization techniques have I discussed?",
  "Summarize all conversations about database architecture",
  "Find all discussions involving TypeScript type system",
];

type ExploreTabProps = {
  storage: StorageApi;
  themeMode?: UiThemeMode;
  onOpenConversation?: (conversationId: number) => void;
};

type DrawerTab = "plan" | "tool_calls" | "sources" | "context_draft";
type ContextSaveStatus = "idle" | "saving" | "saved" | "error";

const TOOL_LABELS: Record<ExploreToolName, string> = {
  intent_planner: "Intent Planner",
  time_scope_resolver: "Time Scope Resolver",
  weekly_summary_tool: "Weekly Summary Tool",
  query_planner: "Query Planner (Legacy)",
  search_rag: "Semantic Search",
  summary_tool: "Summary Tool",
  context_compiler: "Context Compiler",
  answer_synthesizer: "Answer Synthesizer",
};

const TOOL_EXPLANATIONS: Record<ExploreToolName, string> = {
  intent_planner:
    "Uses the model to decide what the user is asking for, which route to run, and whether a time window is required.",
  time_scope_resolver:
    "Turns phrases like 'this week' into a concrete date range so the answer is auditable.",
  weekly_summary_tool:
    "Finds the conversations in that period, then reuses or generates a week-level digest.",
  query_planner:
    "Legacy fixed planning step from the earlier Explore pipeline.",
  search_rag:
    "Searches the knowledge base by semantic similarity to retrieve the most relevant conversations.",
  summary_tool:
    "Fills in missing conversation summaries so multi-source answers are easier to synthesize and inspect.",
  context_compiler:
    "Builds the editable context draft and source set shown in the drawer.",
  answer_synthesizer:
    "Produces the final answer from the collected evidence and tells the user where to inspect the result.",
};

const INTENT_LABELS: Record<ExploreAgentPlan["intent"], string> = {
  fact_lookup: "Fact Lookup",
  cross_conversation_summary: "Cross-Conversation Summary",
  weekly_review: "Weekly Review",
  timeline: "Timeline",
  clarification_needed: "Clarification Needed",
};

const PATH_LABELS: Record<ExploreAgentPlan["preferredPath"], string> = {
  rag: "Semantic Search",
  weekly_summary: "Weekly Summary",
  clarify: "Clarify First",
};

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function groupSessionsByTime(sessions: ExploreSession[]): {
  today: ExploreSession[];
  yesterday: ExploreSession[];
  earlier: ExploreSession[];
} {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  return sessions.reduce(
    (groups, session) => {
      if (session.updatedAt >= startOfToday) {
        groups.today.push(session);
      } else if (session.updatedAt >= startOfYesterday) {
        groups.yesterday.push(session);
      } else {
        groups.earlier.push(session);
      }
      return groups;
    },
    { today: [], yesterday: [], earlier: [] } as {
      today: ExploreSession[];
      yesterday: ExploreSession[];
      earlier: ExploreSession[];
    }
  );
}

function summarizeToolCalls(toolCalls: ExploreToolCall[]): string {
  if (!toolCalls.length) return "No tool calls";
  const failed = toolCalls.filter((toolCall) => toolCall.status === "failed").length;
  const totalMs = toolCalls.reduce((sum, toolCall) => sum + (toolCall.durationMs || 0), 0);
  if (failed > 0) {
    return `${toolCalls.length} steps · ${failed} failed · ${(totalMs / 1000).toFixed(1)}s`;
  }
  return `${toolCalls.length} steps · ${(totalMs / 1000).toFixed(1)}s`;
}

function buildSearchScope(
  mode: ExploreSearchScopeMode,
  conversationIds: number[]
): ExploreSearchScope {
  if (mode === "selected" && conversationIds.length > 0) {
    return {
      mode: "selected",
      conversationIds,
    };
  }

  return { mode: "all" };
}

function getSearchScopeSummary(searchScope?: ExploreSearchScope): string {
  if (searchScope?.mode === "selected") {
    const count = searchScope.conversationIds?.length ?? 0;
    return count > 0 ? `${count} selected` : "Selected";
  }
  return "All conversations";
}

function getIntentLabel(plan?: ExploreAgentPlan): string {
  if (!plan) return "Unknown";
  return INTENT_LABELS[plan.intent];
}

function getPathLabel(plan?: ExploreAgentPlan): string {
  if (!plan) return "Unknown";
  return PATH_LABELS[plan.preferredPath];
}

function getResolvedTimeScopeLabel(plan?: ExploreAgentPlan): string | null {
  if (plan?.resolvedTimeScope) {
    return `${plan.resolvedTimeScope.label} (${plan.resolvedTimeScope.startDate} to ${plan.resolvedTimeScope.endDate})`;
  }
  if (plan?.requestedTimeScope?.label) {
    return plan.requestedTimeScope.label;
  }
  if (
    plan?.requestedTimeScope?.preset &&
    plan.requestedTimeScope.preset !== "none"
  ) {
    return plan.requestedTimeScope.preset.replaceAll("_", " ");
  }
  return null;
}

function isTimeScopedPlan(plan?: ExploreAgentPlan): boolean {
  return plan?.preferredPath === "weekly_summary";
}

function getSourceBadgeLabel(
  candidateOrSource: Pick<ExploreContextCandidate, "similarity" | "matchType">,
  plan?: ExploreAgentPlan
): string {
  if (candidateOrSource.matchType === "time_scope" || isTimeScopedPlan(plan)) {
    return "In range";
  }
  return `${candidateOrSource.similarity}%`;
}

function triggerTxtDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExploreTab({
  storage,
  themeMode = "light",
  onOpenConversation,
}: ExploreTabProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mode, setMode] = useState<ExploreMode>("agent");
  const [sessions, setSessions] = useState<ExploreSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExploreMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const justCreatedSessionRef = useRef<string | null>(null);

  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegeneratingSources, setIsRegeneratingSources] = useState(false);
  const [searchStageIndex, setSearchStageIndex] = useState(0);
  const [submitMode, setSubmitMode] = useState<ExploreMode>("agent");
  const [searchScopeMode, setSearchScopeMode] = useState<ExploreSearchScopeMode>("all");
  const [selectedScopeConversationIds, setSelectedScopeConversationIds] = useState<number[]>([]);
  const [scopeChooserOpen, setScopeChooserOpen] = useState(false);
  const [scopeSearchQuery, setScopeSearchQuery] = useState("");
  const [scopeResults, setScopeResults] = useState<Conversation[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ExploreSession | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [drawerMessageId, setDrawerMessageId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("tool_calls");
  const [contextDraft, setContextDraft] = useState("");
  const [selectedContextConversationIds, setSelectedContextConversationIds] = useState<
    number[]
  >([]);
  const [contextSaveStatus, setContextSaveStatus] = useState<ContextSaveStatus>("idle");
  const [drawerNotice, setDrawerNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const groupedSessions = useMemo(() => groupSessionsByTime(sessions), [sessions]);
  const activeSearchScope = useMemo(
    () => buildSearchScope(searchScopeMode, selectedScopeConversationIds),
    [searchScopeMode, selectedScopeConversationIds]
  );
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const drawerMessage = messages.find((message) => message.id === drawerMessageId) ?? null;
  const drawerPlan = drawerMessage?.agentMeta?.plan;
  const drawerCandidates = drawerMessage?.agentMeta?.contextCandidates ?? [];
  const drawerToolCalls = drawerMessage?.agentMeta?.toolCalls ?? [];

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      if (justCreatedSessionRef.current === currentSessionId) {
        justCreatedSessionRef.current = null;
        return;
      }
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (renameTarget && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameTarget]);

  useEffect(() => {
    if (!isSubmitting) {
      setSearchStageIndex(0);
      return;
    }
    const stages = MODE_STAGES[submitMode];
    const timer = setInterval(() => {
      setSearchStageIndex((prev) => (prev + 1) % stages.length);
    }, 900);
    return () => clearInterval(timer);
  }, [isSubmitting, submitMode]);

  useEffect(() => {
    if (!scopeChooserOpen) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setScopeLoading(true);
        setScopeError(null);
        try {
          const data = await storage.getConversations({
            search: scopeSearchQuery.trim() || undefined,
          });
          if (cancelled) return;
          setScopeResults(data.slice(0, 80));
        } catch (err) {
          if (cancelled) return;
          console.error("[Explore] Failed to load scope conversations:", err);
          setScopeError((err as Error)?.message ?? "Failed to load conversations.");
        } finally {
          if (!cancelled) {
            setScopeLoading(false);
          }
        }
      })();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scopeChooserOpen, scopeSearchQuery, storage]);

  const loadSessions = async () => {
    if (!storage.listExploreSessions) return;
    setSessionsLoading(true);
    try {
      const data = await storage.listExploreSessions(50);
      setSessions(data);
    } catch (err) {
      console.error("[Explore] Failed to load sessions:", err);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadMessages = async (sessionId: string) => {
    if (!storage.getExploreMessages) return;
    setMessagesLoading(true);
    try {
      const data = await storage.getExploreMessages(sessionId);
      setMessages(data || []);
    } catch (err) {
      console.error("[Explore] Failed to load messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  };

  const toggleScopeConversation = (conversationId: number) => {
    setSelectedScopeConversationIds((prev) => {
      if (prev.includes(conversationId)) {
        return prev.filter((id) => id !== conversationId);
      }
      return [...prev, conversationId];
    });
  };

  const applySelectedScope = () => {
    if (selectedScopeConversationIds.length > 0) {
      setSearchScopeMode("selected");
    } else {
      setSearchScopeMode("all");
    }
    setScopeChooserOpen(false);
  };

  const resetSearchScope = () => {
    setSearchScopeMode("all");
    setSelectedScopeConversationIds([]);
    setScopeChooserOpen(false);
  };

  const getAssistantQuery = (message: ExploreMessage): string => {
    const agentQuery = message.agentMeta?.query?.trim();
    if (agentQuery) {
      return agentQuery;
    }

    const index = messages.findIndex((item) => item.id === message.id);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = messages[cursor];
      if (candidate.role === "user" && candidate.content.trim()) {
        return candidate.content.trim();
      }
    }

    return "";
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInputValue("");
    setError(null);
    setDrawerMessageId(null);
    setDrawerNotice(null);
  };

  const openDrawer = (message: ExploreMessage, tab: DrawerTab) => {
    setDrawerMessageId(message.id);
    setDrawerTab(tab);
    setDrawerNotice(null);
    setContextSaveStatus("idle");
    const nextDraft = message.agentMeta?.contextDraft ?? "";
    const candidates = message.agentMeta?.contextCandidates ?? [];
    const selectedFromMessage = message.agentMeta?.selectedContextConversationIds ?? [];
    const selected =
      selectedFromMessage.length > 0
        ? selectedFromMessage
        : candidates.map((candidate) => candidate.conversationId);
    setContextDraft(nextDraft);
    setSelectedContextConversationIds(selected);
  };

  const handleSubmit = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSubmitting) return;

    if (!storage.askKnowledgeBase) {
      setError("Explore is unavailable in the current environment.");
      return;
    }

    if (searchScopeMode === "selected" && selectedScopeConversationIds.length === 0) {
      setError("Choose at least one conversation before using Selected scope.");
      setScopeChooserOpen(true);
      return;
    }

    setSubmitMode(mode);
    setIsSubmitting(true);
    setError(null);
    const requestOptions: ExploreAskOptions = {
      searchScope: activeSearchScope,
    };
    const requestLimit =
      activeSearchScope.mode === "selected"
        ? Math.max(5, activeSearchScope.conversationIds?.length ?? 0)
        : 5;

    const optimisticUserMessage: ExploreMessage = {
      id: generateId(),
      sessionId: currentSessionId || "temp",
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUserMessage]);
    setInputValue("");

    try {
      const result = await storage.askKnowledgeBase(
        trimmed,
        currentSessionId || undefined,
        requestLimit,
        mode,
        requestOptions
      );

      if (!currentSessionId) {
        justCreatedSessionRef.current = result.sessionId;
        setCurrentSessionId(result.sessionId);
      }

      const aiMessage: ExploreMessage = {
        id: generateId(),
        sessionId: result.sessionId,
        role: "assistant",
        content: result.answer,
        sources: result.sources,
        agentMeta: result.agent,
        timestamp: Date.now(),
      };

      if (!currentSessionId) {
        setMessages([optimisticUserMessage, aiMessage]);
      } else {
        setMessages((prev) => [...prev, aiMessage]);
      }

      await loadSessions();
    } catch (err) {
      console.error("[Explore] Submit error:", err);
      setError((err as Error)?.message ?? "Failed to retrieve answer.");
      setMessages((prev) => prev.filter((message) => message.id !== optimisticUserMessage.id));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!storage.deleteExploreSession) return;
    if (!confirm("Delete this conversation?")) return;

    try {
      await storage.deleteExploreSession(sessionId);
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
      await loadSessions();
    } catch (err) {
      console.error("[Explore] Failed to delete session:", err);
    }
  };

  const handleStartRename = (session: ExploreSession, event: React.MouseEvent) => {
    event.stopPropagation();
    setRenameTarget(session);
    setRenameValue(session.title);
  };

  const handleSubmitRename = async () => {
    if (!renameTarget || !storage.renameExploreSession) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renameTarget.title) {
      setRenameTarget(null);
      return;
    }

    try {
      await storage.renameExploreSession(renameTarget.id, trimmed);
      await loadSessions();
      setRenameTarget(null);
    } catch (err) {
      console.error("[Explore] Failed to rename session:", err);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const toggleContextSelection = (conversationId: number) => {
    setSelectedContextConversationIds((prev) => {
      if (prev.includes(conversationId)) {
        return prev.filter((id) => id !== conversationId);
      }
      return [...prev, conversationId];
    });
  };

  const handleSaveContextDraft = async () => {
    if (!drawerMessage) return;
    const agentMeta = drawerMessage.agentMeta;
    if (!agentMeta) return;

    const normalizedIds = selectedContextConversationIds.filter((id) =>
      drawerCandidates.some((candidate) => candidate.conversationId === id)
    );

    setContextSaveStatus("saving");
    setDrawerNotice(null);
    try {
      if (storage.updateExploreMessageContext) {
        await storage.updateExploreMessageContext(
          drawerMessage.id,
          contextDraft,
          normalizedIds
        );
      }

      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== drawerMessage.id) return message;
          return {
            ...message,
            agentMeta: {
              ...agentMeta,
              contextDraft,
              selectedContextConversationIds: normalizedIds,
            },
          };
        })
      );

      setContextSaveStatus("saved");
      setDrawerNotice(
        storage.updateExploreMessageContext
          ? "Context draft saved."
          : "Saved locally for this view (storage adapter unavailable)."
      );
    } catch (err) {
      console.error("[Explore] Failed to save context draft:", err);
      setContextSaveStatus("error");
      setDrawerNotice((err as Error)?.message ?? "Failed to save context draft.");
    }
  };

  const handleCopyContextDraft = async () => {
    if (!contextDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(contextDraft);
      setDrawerNotice("Copied to clipboard.");
    } catch {
      setDrawerNotice("Clipboard is unavailable in this environment.");
    }
  };

  const handleDownloadContextDraft = () => {
    if (!contextDraft.trim()) return;
    const filename = `explore-context-${Date.now()}.txt`;
    triggerTxtDownload(contextDraft, filename);
    setDrawerNotice(`Downloaded ${filename}.`);
  };

  const handleStartChatWithContext = () => {
    handleNewChat();
    setInputValue(contextDraft);
    setDrawerNotice(null);
    textareaRef.current?.focus();
  };

  const handleRegenerateWithSelectedSources = async () => {
    if (!drawerMessage || !currentSessionId || !storage.askKnowledgeBase) return;

    const normalizedIds = selectedContextConversationIds.filter((id) =>
      drawerCandidates.some((candidate) => candidate.conversationId === id)
    );

    if (normalizedIds.length === 0) {
      setDrawerNotice("Select at least one source before regenerating.");
      return;
    }

    const query = getAssistantQuery(drawerMessage);
    if (!query) {
      setDrawerNotice("Could not determine the query for this answer.");
      return;
    }

    setIsRegeneratingSources(true);
    setDrawerNotice(null);

    try {
      if (storage.updateExploreMessageContext) {
        await storage.updateExploreMessageContext(
          drawerMessage.id,
          contextDraft,
          normalizedIds
        );
      }

      await storage.askKnowledgeBase(
        query,
        currentSessionId,
        Math.max(normalizedIds.length, 1),
        "agent",
        {
          searchScope: {
            mode: "selected",
            conversationIds: normalizedIds,
          },
        }
      );

      setDrawerMessageId(null);
      await loadMessages(currentSessionId);
      await loadSessions();
      setDrawerNotice(
        `Regenerated as a new turn using ${normalizedIds.length} selected source${
          normalizedIds.length === 1 ? "" : "s"
        }.`
      );
    } catch (err) {
      console.error("[Explore] Failed to regenerate from selected sources:", err);
      setDrawerNotice((err as Error)?.message ?? "Failed to regenerate answer.");
    } finally {
      setIsRegeneratingSources(false);
    }
  };

  const renderSessionItem = (session: ExploreSession) => {
    const isActive = session.id === currentSessionId;
    const isRenaming = renameTarget?.id === session.id;

    return (
      <div
        key={session.id}
        onClick={() => setCurrentSessionId(session.id)}
        className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
          isActive ? "bg-bg-surface-card-active" : "cursor-pointer hover:bg-bg-surface-card"
        }`}
      >
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSubmitRename();
                  if (event.key === "Escape") setRenameTarget(null);
                }}
                onBlur={handleSubmitRename}
                className="flex-1 rounded border border-border-default bg-bg-primary px-2 py-1 text-sm font-sans text-text-primary focus:border-accent-primary focus:outline-none"
              />
            </div>
          ) : (
            <>
              <p className="truncate text-sm font-sans text-text-primary">{session.title || "Untitled"}</p>
              <p className="truncate text-xs font-sans text-text-tertiary">
                {session.preview || "No messages"}
              </p>
            </>
          )}
        </div>

        {!isRenaming && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(event) => handleStartRename(session, event)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-surface-card hover:text-text-primary"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={(event) => handleDeleteSession(session.id, event)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-surface-card hover:text-[#B42318]"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderToolCallItem = (toolCall: ExploreToolCall, index: number) => {
    const statusTone =
      toolCall.status === "failed"
        ? "text-danger"
        : toolCall.status === "completed"
          ? "text-success"
          : "text-text-tertiary";
    const description = toolCall.description || TOOL_EXPLANATIONS[toolCall.name];

    return (
      <div key={toolCall.id} className="rounded-lg border border-border-subtle bg-bg-surface-card p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[13px] font-medium text-text-primary">
            {index + 1}. {TOOL_LABELS[toolCall.name]}
          </p>
          <span className={`text-[11px] font-sans uppercase ${statusTone}`}>
            {toolCall.status}
          </span>
        </div>
        <p className="mb-2 text-[11px] font-sans text-text-tertiary">
          {(toolCall.durationMs / 1000).toFixed(2)}s
        </p>
        {description && (
          <p className="mb-2 text-xs font-sans text-text-secondary">{description}</p>
        )}
        {toolCall.inputSummary && (
          <p className="mb-1 text-xs font-sans text-text-secondary">
            <span className="font-medium text-text-primary">Input:</span> {toolCall.inputSummary}
          </p>
        )}
        {toolCall.outputSummary && (
          <p className="text-xs font-sans text-text-secondary">
            <span className="font-medium text-text-primary">Output:</span> {toolCall.outputSummary}
          </p>
        )}
        {toolCall.error && (
          <p className="mt-1 text-xs font-sans text-danger">
            <span className="font-medium">Error:</span> {toolCall.error}
          </p>
        )}
      </div>
    );
  };

  const renderMessage = useCallback(
    (message: ExploreMessage) => {
      const isUser = message.role === "user";
      const html = isUser
        ? null
        : DOMPurify.sanitize(marked.parse(message.content, { gfm: true, breaks: false }) as string);

      const hasSources = message.sources && message.sources.length > 0;
      const toolCalls = message.agentMeta?.toolCalls ?? [];
      const hasToolCalls = message.agentMeta?.mode === "agent" && toolCalls.length > 0;
      const scopeSummary = getSearchScopeSummary(message.agentMeta?.searchScope);
      const plan = message.agentMeta?.plan;
      const timeScopeLabel = getResolvedTimeScopeLabel(plan);

      return (
        <div key={message.id} className={`py-4 ${isUser ? "bg-bg-tertiary/50" : ""}`}>
          <div className="mx-auto max-w-3xl px-4">
            <div className="flex gap-4">
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  isUser
                    ? "bg-accent-primary text-white"
                    : "border border-border-subtle bg-bg-surface-card"
                }`}
              >
                {isUser ? (
                  <span className="text-sm font-sans font-medium">U</span>
                ) : (
                  <span className="text-sm">V</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-sans text-text-tertiary">{isUser ? "You" : "Vesti"}</p>

                {isUser ? (
                  <p className="whitespace-pre-wrap text-base font-sans text-text-primary">
                    {message.content}
                  </p>
                ) : (
                  <div
                    className="prose prose-slate max-w-none prose-p:leading-relaxed prose-p:text-text-primary prose-li:leading-relaxed prose-li:text-text-primary"
                    dangerouslySetInnerHTML={{ __html: html || "" }}
                  />
                )}

                {!isUser && hasToolCalls && (
                  <div className="mt-3 rounded-lg border border-border-subtle bg-bg-surface-card px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        {plan && (
                          <button
                            onClick={() => openDrawer(message, "plan")}
                            className="inline-flex items-center gap-1.5 text-xs font-sans text-text-secondary hover:text-text-primary"
                          >
                            <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Plan
                          </button>
                        )}
                        <button
                          onClick={() => openDrawer(message, "tool_calls")}
                          className="inline-flex items-center gap-1.5 text-xs font-sans text-text-secondary hover:text-text-primary"
                        >
                          <Wrench className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Tool Calls
                        </button>
                      </div>
                      <p className="text-xs font-sans text-text-tertiary">
                        {summarizeToolCalls(toolCalls)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {plan && (
                        <>
                          <p className="text-[11px] font-sans text-text-tertiary">
                            Intent: {getIntentLabel(plan)}
                          </p>
                          <p className="text-[11px] font-sans text-text-tertiary">
                            Route: {getPathLabel(plan)}
                          </p>
                        </>
                      )}
                      {timeScopeLabel && (
                        <p className="text-[11px] font-sans text-text-tertiary">
                          Time: {timeScopeLabel}
                        </p>
                      )}
                      <p className="text-[11px] font-sans text-text-tertiary">
                        Scope: {scopeSummary}
                      </p>
                      <button
                        onClick={() => openDrawer(message, "sources")}
                        className="inline-flex items-center gap-1.5 text-xs font-sans text-text-secondary hover:text-text-primary"
                      >
                        <Filter className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Source Controls
                      </button>
                    </div>
                    {message.agentMeta?.contextDraft && (
                      <button
                        onClick={() => openDrawer(message, "context_draft")}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-sans text-accent-primary hover:text-accent-primary/80"
                      >
                        <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Open Context Draft
                      </button>
                    )}
                  </div>
                )}

                {!isUser && (
                  <div className="mt-4 border-t border-border-subtle pt-4">
                    <p className="mb-2 text-[11px] font-sans uppercase tracking-wider text-text-tertiary">
                      Sources
                    </p>
                    {hasSources ? (
                      <div className="flex flex-wrap gap-2">
                        {message.sources!.map((source) => (
                          <button
                            key={source.id}
                            onClick={() => onOpenConversation?.(source.id)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-bg-surface-card px-2.5 py-1 text-xs font-sans text-text-secondary transition-colors hover:bg-bg-surface-card-hover"
                          >
                            <span className="max-w-[120px] truncate">{source.title}</span>
                            <span className="text-accent-primary">
                              {getSourceBadgeLabel(source, plan)}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-sans italic text-text-tertiary">
                        No relevant conversations found
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    },
    [onOpenConversation]
  );

  const renderEmptyState = () => (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-2xl text-center">
        <h1 className="mb-4 text-[32px] font-serif font-normal text-text-primary">
          What do you want to explore?
        </h1>
        <p className="mb-8 font-sans text-text-secondary">
          Ask questions about your conversation history
        </p>

        <div className="mx-auto max-w-lg space-y-3 text-left">
          {sampleQuestions.map((question) => (
            <button
              key={question}
              onClick={() => {
                setInputValue(question);
                textareaRef.current?.focus();
              }}
              className="w-full rounded-lg bg-bg-surface-card px-4 py-3 text-left text-[14px] font-sans text-text-secondary transition-all hover:bg-bg-surface-card-hover hover:text-text-primary"
            >
              <div className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-accent-primary" />
                {question}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full">
      <div
        className={`border-r border-border-subtle bg-bg-tertiary transition-all duration-200 ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border-subtle p-3">
            <button
              onClick={handleNewChat}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                themeMode === "dark"
                  ? "bg-bg-secondary text-text-primary hover:bg-bg-surface-card-hover"
                  : "bg-accent-primary text-white hover:bg-accent-primary/90"
              }`}
            >
              <MessageSquarePlus className="h-4 w-4" strokeWidth={1.5} />
              <span className="text-sm font-sans font-medium">New Chat</span>
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-2">
            {sessionsLoading ? (
              <div className="py-4 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-accent-primary" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-4 text-center text-xs font-sans text-text-tertiary">
                No conversations yet
              </div>
            ) : (
              <>
                {groupedSessions.today.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-sans uppercase tracking-wider text-text-tertiary">
                      Today
                    </p>
                    <div className="space-y-0.5">{groupedSessions.today.map(renderSessionItem)}</div>
                  </div>
                )}
                {groupedSessions.yesterday.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-sans uppercase tracking-wider text-text-tertiary">
                      Yesterday
                    </p>
                    <div className="space-y-0.5">
                      {groupedSessions.yesterday.map(renderSessionItem)}
                    </div>
                  </div>
                )}
                {groupedSessions.earlier.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-sans uppercase tracking-wider text-text-tertiary">
                      Earlier
                    </p>
                    <div className="space-y-0.5">{groupedSessions.earlier.map(renderSessionItem)}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`flex min-w-0 flex-1 flex-col bg-bg-primary ${drawerMessage ? "pr-[390px]" : ""}`}>
        <div className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-bg-surface-card hover:text-text-primary"
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
            {currentSession && (
              <h2 className="max-w-[200px] truncate text-sm font-sans text-text-primary">
                {currentSession.title}
              </h2>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border-subtle bg-bg-surface-card p-0.5">
              <button
                onClick={() => setMode("agent")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  mode === "agent"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Agent
              </button>
              <button
                onClick={() => setMode("classic")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  mode === "classic"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Classic
              </button>
            </div>
            <div className="inline-flex rounded-md border border-border-subtle bg-bg-surface-card p-0.5">
              <button
                onClick={() => setSearchScopeMode("all")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  activeSearchScope.mode === "all"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                All
              </button>
              <button
                onClick={() => {
                  if (selectedScopeConversationIds.length === 0) {
                    setScopeChooserOpen(true);
                  } else {
                    setSearchScopeMode("selected");
                  }
                }}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  activeSearchScope.mode === "selected"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Selected
              </button>
            </div>
            <button
              onClick={() => setScopeChooserOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface-card px-3 py-1.5 text-xs font-sans text-text-secondary transition-colors hover:bg-bg-surface-card-hover hover:text-text-primary"
            >
              <Filter className="h-3.5 w-3.5" strokeWidth={1.7} />
              {getSearchScopeSummary(activeSearchScope)}
            </button>
            {currentSessionId && (
              <button
                onClick={handleNewChat}
                className="rounded-lg bg-bg-surface-card px-3 py-1.5 text-sm font-sans text-text-primary transition-colors hover:bg-bg-surface-card-hover"
              >
                New Chat
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !currentSessionId ? (
            renderEmptyState()
          ) : messagesLoading && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-accent-primary" />
            </div>
          ) : (
            <>
              {messages.map(renderMessage)}

              {isSubmitting && (
                <div className="py-4">
                  <div className="mx-auto max-w-3xl px-4">
                    <div className="flex gap-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-bg-surface-card">
                        <span className="text-sm">V</span>
                      </div>
                      <div className="flex-1">
                        <p className="mb-1 text-xs font-sans text-text-tertiary">Vesti</p>
                        <div className="flex items-center gap-2 text-text-primary">
                          <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
                          <span className="text-sm font-sans">
                            {MODE_STAGES[submitMode][searchStageIndex]}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="py-4">
                  <div className="mx-auto max-w-3xl px-4">
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-sans text-red-700">{error}</p>
                      <button
                        onClick={() => setError(null)}
                        className="mt-2 text-xs font-sans text-red-600 hover:text-red-800"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        <div className="border-t border-border-subtle p-4">
          <div className="mx-auto max-w-3xl">
            <div className="relative flex items-end gap-2 rounded-lg border border-border-default bg-bg-primary transition-all focus-within:border-accent-primary focus-within:ring-2 focus-within:ring-accent-primary/20">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === "agent"
                    ? "Ask your knowledge base (Agent mode)..."
                    : "Ask your knowledge base (Classic mode)..."
                }
                rows={1}
                className="max-h-32 flex-1 resize-none bg-transparent px-4 py-3 text-base font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none"
                style={{ minHeight: "48px" }}
              />
              <div className="p-2">
                <button
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isSubmitting}
                  className="rounded-md bg-accent-primary p-2 text-white transition-all hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>
            <div className="mt-2 text-center text-xs font-sans text-text-tertiary">
              <p>
                {mode === "agent"
                  ? "Agent mode shows the planner route, tool calls, source controls, and editable context drafts."
                  : "Classic mode searches your history and returns concise source-grounded answers."}
              </p>
              <p className="mt-1">Current scope: {getSearchScopeSummary(activeSearchScope)}</p>
            </div>
          </div>
        </div>
      </div>

      {drawerMessage && (
        <aside className="absolute bottom-0 right-0 top-0 z-20 flex w-[390px] flex-col border-l border-border-subtle bg-bg-primary shadow-[0_0_24px_rgba(0,0,0,0.12)]">
          <div className="flex h-12 items-center justify-between border-b border-border-subtle px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Wrench className="h-4 w-4 text-text-secondary" strokeWidth={1.7} />
              <p className="truncate text-sm font-sans text-text-primary">Execution Details</p>
            </div>
            <button
              onClick={() => setDrawerMessageId(null)}
              className="rounded-md p-1 text-text-tertiary hover:bg-bg-surface-card hover:text-text-primary"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="border-b border-border-subtle px-3 py-2">
            <div className="inline-flex rounded-md border border-border-subtle bg-bg-surface-card p-0.5">
              <button
                onClick={() => setDrawerTab("plan")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  drawerTab === "plan"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Plan
              </button>
              <button
                onClick={() => setDrawerTab("tool_calls")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  drawerTab === "tool_calls"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Tool Calls
              </button>
              <button
                onClick={() => setDrawerTab("sources")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  drawerTab === "sources"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Sources
              </button>
              <button
                onClick={() => setDrawerTab("context_draft")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  drawerTab === "context_draft"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Context Draft
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {drawerTab === "plan" ? (
              <div className="space-y-4">
                {drawerPlan ? (
                  <>
                    <div className="rounded-lg border border-border-subtle bg-bg-surface-card p-3">
                      <p className="mb-1 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                        Planner Decision
                      </p>
                      <div className="space-y-1.5 text-sm font-sans text-text-primary">
                        <p>Intent: {getIntentLabel(drawerPlan)}</p>
                        <p>Route: {getPathLabel(drawerPlan)}</p>
                        <p>Source limit: {drawerPlan.sourceLimit}</p>
                        <p>Summary target: {drawerPlan.summaryTargetCount}</p>
                        {getResolvedTimeScopeLabel(drawerPlan) && (
                          <p>Time scope: {getResolvedTimeScopeLabel(drawerPlan)}</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border-subtle bg-bg-surface-card p-3">
                      <p className="mb-1 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                        Why This Route
                      </p>
                      <p className="text-sm font-sans text-text-primary">
                        {drawerPlan.reason}
                      </p>
                      {drawerPlan.answerGoal && (
                        <p className="mt-2 text-xs font-sans text-text-secondary">
                          Goal: {drawerPlan.answerGoal}
                        </p>
                      )}
                      {drawerPlan.clarifyingQuestion && (
                        <p className="mt-2 text-xs font-sans text-text-secondary">
                          Clarification: {drawerPlan.clarifyingQuestion}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-border-subtle bg-bg-surface-card p-3">
                      <p className="mb-2 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                        Planned Tools
                      </p>
                      <div className="space-y-2">
                        {(drawerPlan.toolPlan ?? []).map((toolName, index) => (
                          <div key={`${toolName}-${index}`} className="rounded-md bg-bg-primary p-2">
                            <p className="text-sm font-sans text-text-primary">
                              {index + 1}. {TOOL_LABELS[toolName]}
                            </p>
                            <p className="mt-1 text-xs font-sans text-text-secondary">
                              {TOOL_EXPLANATIONS[toolName]}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-[11px] font-sans text-text-tertiary">
                      The planner chooses the high-level route with the model. Tool execution stays
                      bounded and inspectable in the app.
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-sans text-text-tertiary">
                    No planner metadata was recorded for this answer.
                  </p>
                )}
              </div>
            ) : drawerTab === "tool_calls" ? (
              <div className="space-y-3">
                {drawerToolCalls.length > 0 ? (
                  drawerToolCalls.map(renderToolCallItem)
                ) : (
                  <p className="text-sm font-sans text-text-tertiary">
                    No tool calls were recorded for this answer.
                  </p>
                )}
              </div>
            ) : drawerTab === "sources" ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border-subtle bg-bg-surface-card p-3">
                  <p className="mb-1 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                    Active Query
                  </p>
                  <p className="text-sm font-sans text-text-primary">
                    {getAssistantQuery(drawerMessage) || "Unavailable"}
                  </p>
                  <p className="mt-2 text-xs font-sans text-text-tertiary">
                    Scope: {getSearchScopeSummary(drawerMessage.agentMeta?.searchScope)}
                  </p>
                  {getResolvedTimeScopeLabel(drawerPlan) && (
                    <p className="mt-1 text-xs font-sans text-text-tertiary">
                      Time scope: {getResolvedTimeScopeLabel(drawerPlan)}
                    </p>
                  )}
                  <p className="mt-1 text-xs font-sans text-text-tertiary">
                    Selected sources: {selectedContextConversationIds.length} / {drawerCandidates.length}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                    Candidate Sources
                  </p>
                  {drawerCandidates.length > 0 ? (
                    <div className="space-y-2">
                      {drawerCandidates.map((candidate) => {
                        const selected = selectedContextConversationIds.includes(
                          candidate.conversationId
                        );
                        return (
                          <div
                            key={candidate.conversationId}
                            className="rounded-lg border border-border-subtle bg-bg-surface-card p-2.5"
                          >
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <button
                                onClick={() => toggleContextSelection(candidate.conversationId)}
                                className="inline-flex items-center gap-1.5 text-left text-xs font-sans text-text-secondary hover:text-text-primary"
                              >
                                {selected ? (
                                  <CheckSquare className="h-3.5 w-3.5 text-accent-primary" />
                                ) : (
                                  <Square className="h-3.5 w-3.5" />
                                )}
                                <span className="line-clamp-2">{candidate.title}</span>
                              </button>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-sans text-accent-primary">
                                  {getSourceBadgeLabel(candidate, drawerPlan)}
                                </span>
                                <button
                                  onClick={() => onOpenConversation?.(candidate.conversationId)}
                                  className="text-[11px] font-sans text-text-secondary hover:text-text-primary"
                                >
                                  Open
                                </button>
                              </div>
                            </div>
                            {candidate.summarySnippet && (
                              <p className="mb-1 text-xs font-sans text-text-secondary">
                                {candidate.summarySnippet}
                              </p>
                            )}
                            {candidate.selectionReason && (
                              <p className="mb-1 text-[11px] font-sans text-text-tertiary">
                                {candidate.selectionReason}
                              </p>
                            )}
                            {candidate.excerpt && (
                              <p className="text-[11px] font-sans text-text-tertiary">
                                {candidate.excerpt}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm font-sans text-text-tertiary">
                      No context candidates for this answer.
                    </p>
                  )}
                </div>

                {drawerNotice && (
                  <p
                    className={`text-xs font-sans ${
                      contextSaveStatus === "error" ? "text-danger" : "text-text-secondary"
                    }`}
                  >
                    {drawerNotice}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveContextDraft}
                    disabled={contextSaveStatus === "saving"}
                    className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-sans text-white transition-colors hover:bg-accent-primary/90 disabled:opacity-50"
                  >
                    {contextSaveStatus === "saving" ? "Saving..." : "Save Selection"}
                  </button>
                  <button
                    onClick={handleRegenerateWithSelectedSources}
                    disabled={isRegeneratingSources}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-sans text-text-secondary hover:bg-bg-surface-card disabled:opacity-50"
                  >
                    {isRegeneratingSources ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Regenerate Answer
                  </button>
                  <button
                    onClick={() => setDrawerTab("context_draft")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-sans text-text-secondary hover:bg-bg-surface-card"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Open Draft
                  </button>
                </div>

                <p className="text-[11px] font-sans text-text-tertiary">
                  Regeneration appends a new turn using only the selected conversations.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                    Draft (Editable)
                  </p>
                  <textarea
                    value={contextDraft}
                    onChange={(event) => {
                      setContextDraft(event.target.value);
                      setContextSaveStatus("idle");
                    }}
                    rows={14}
                    className="w-full resize-y rounded-lg border border-border-default bg-bg-primary p-3 text-sm font-sans text-text-primary focus:border-accent-primary focus:outline-none"
                  />
                </div>

                {drawerNotice && (
                  <p
                    className={`text-xs font-sans ${
                      contextSaveStatus === "error" ? "text-danger" : "text-text-secondary"
                    }`}
                  >
                    {drawerNotice}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveContextDraft}
                    disabled={contextSaveStatus === "saving"}
                    className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-sans text-white transition-colors hover:bg-accent-primary/90 disabled:opacity-50"
                  >
                    {contextSaveStatus === "saving" ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={handleCopyContextDraft}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-sans text-text-secondary hover:bg-bg-surface-card"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <button
                    onClick={handleDownloadContextDraft}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-sans text-text-secondary hover:bg-bg-surface-card"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download TXT
                  </button>
                  <button
                    onClick={handleStartChatWithContext}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-sans text-text-secondary hover:bg-bg-surface-card"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    New Chat (Prefill)
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {scopeChooserOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="flex h-[min(720px,90vh)] w-full max-w-3xl flex-col rounded-2xl border border-border-subtle bg-bg-primary shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div>
                <p className="text-sm font-sans font-medium text-text-primary">
                  Choose Conversations
                </p>
                <p className="mt-1 text-xs font-sans text-text-tertiary">
                  Search, preview, and pick the conversations the agent is allowed to use.
                </p>
              </div>
              <button
                onClick={() => setScopeChooserOpen(false)}
                className="rounded-md p-1 text-text-tertiary hover:bg-bg-surface-card hover:text-text-primary"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="border-b border-border-subtle px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[260px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <input
                    value={scopeSearchQuery}
                    onChange={(event) => setScopeSearchQuery(event.target.value)}
                    placeholder="Search by title or snippet..."
                    className="w-full rounded-lg border border-border-default bg-bg-primary py-2 pl-9 pr-3 text-sm font-sans text-text-primary focus:border-accent-primary focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => {
                    setSearchScopeMode("selected");
                    applySelectedScope();
                  }}
                  className="rounded-md bg-accent-primary px-3 py-2 text-xs font-sans text-white transition-colors hover:bg-accent-primary/90"
                >
                  Apply Selected
                </button>
                <button
                  onClick={resetSearchScope}
                  className="rounded-md border border-border-default px-3 py-2 text-xs font-sans text-text-secondary hover:bg-bg-surface-card"
                >
                  Use All
                </button>
              </div>
              <p className="mt-2 text-xs font-sans text-text-tertiary">
                {selectedScopeConversationIds.length} conversation
                {selectedScopeConversationIds.length === 1 ? "" : "s"} selected
              </p>
              {scopeError && <p className="mt-2 text-xs font-sans text-danger">{scopeError}</p>}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {scopeLoading ? (
                <div className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-accent-primary" />
                </div>
              ) : scopeResults.length === 0 ? (
                <div className="py-10 text-center text-sm font-sans text-text-tertiary">
                  No conversations match this search.
                </div>
              ) : (
                <div className="space-y-2">
                  {scopeResults.map((conversation) => {
                    const selected = selectedScopeConversationIds.includes(conversation.id);
                    return (
                      <div
                        key={conversation.id}
                        className="rounded-xl border border-border-subtle bg-bg-surface-card p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            onClick={() => toggleScopeConversation(conversation.id)}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          >
                            {selected ? (
                              <CheckSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-primary" />
                            ) : (
                              <Square className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-tertiary" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-sans text-text-primary">
                                {conversation.title}
                              </p>
                              <p className="mt-1 text-xs font-sans text-text-tertiary">
                                {conversation.platform} · {new Date(conversation.updated_at).toLocaleDateString()}
                              </p>
                              <p className="mt-2 line-clamp-2 text-xs font-sans text-text-secondary">
                                {conversation.snippet || "No preview available"}
                              </p>
                            </div>
                          </button>
                          <button
                            onClick={() => onOpenConversation?.(conversation.id)}
                            className="text-xs font-sans text-text-secondary hover:text-text-primary"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
