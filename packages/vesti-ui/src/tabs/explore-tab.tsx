
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  CheckSquare,
  ChevronRight,
  Clipboard,
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
  ExploreAskOptions,
  ExploreContextCandidate,
  ExploreInspectMeta,
  ExploreMessage,
  ExploreMode,
  ExploreRouteDecision,
  ExploreSearchScope,
  ExploreSearchScopeMode,
  ExploreSession,
  ExploreToolCall,
  ExploreToolName,
  StorageApi,
  UiThemeMode,
} from "../types";

const MODE_STAGES: Record<ExploreMode, string[]> = {
  ask: [
    "Understanding the request...",
    "Choosing the best route...",
    "Gathering evidence...",
    "Drafting the answer...",
  ],
  search: [
    "Rewriting the query...",
    "Retrieving indexed evidence...",
    "Drafting the answer...",
  ],
};

const STARTER_DECKS: StarterDeck[] = [
  {
    eyebrow: "Start with a task",
    title: "Explore your library with a lighter touch.",
    description:
      "Ask a focused question, then let Explore search, summarize, and stitch together the minimal context needed.",
    privacyTip:
      "Keep prompts narrow. Ask for themes, decisions, or one time window instead of raw transcripts.",
    capabilityHint:
      "Summaries, weekly digests, and source-grounded answers are all available here.",
    prompts: [
      {
        title: "Summarize this week",
        prompt: "Summarize what I worked on this week and highlight the main decisions.",
        detail:
          "Great for rolling up a recent batch of conversations into a concise review.",
      },
      {
        title: "Find the decision trail",
        prompt:
          "Show the conversations that explain how we reached the final decision.",
        detail:
          "Use this when you want the context behind a conclusion, not just the conclusion.",
      },
      {
        title: "Group related threads",
        prompt:
          "Group the most related conversations about this topic and explain why they belong together.",
        detail:
          "Useful for clustering a topic without exposing the full raw conversation history.",
      },
      {
        title: "Build a quick brief",
        prompt:
          "Create a short brief from the most relevant conversations and keep it source-grounded.",
        detail: "A compact starting point when you want a clean handoff or a summary note.",
      },
    ],
  },
  {
    eyebrow: "Private by default",
    title: "Ask for the shape of the work, not the whole transcript.",
    description:
      "Explore is most useful when it compresses a library into a narrow, trustworthy answer you can inspect.",
    privacyTip:
      "Favor descriptors like themes, blockers, or outcomes. Avoid asking for everything at once.",
    capabilityHint:
      "You can search across all conversations or a selected subset, then refine sources afterward.",
    prompts: [
      {
        title: "What changed?",
        prompt: "What changed across my conversations over the last week?",
        detail:
          "A safe way to surface progress without pulling in more than you need.",
      },
      {
        title: "Cluster the blockers",
        prompt: "Cluster the repeated blockers or open questions across my conversations.",
        detail:
          "Helps reveal recurring pain points and where the discussion kept circling back.",
      },
      {
        title: "Trace one topic",
        prompt: "Trace the main discussion around privacy or search and summarize the arc.",
        detail:
          "Good for following a single thread through multiple conversations.",
      },
      {
        title: "Surface next steps",
        prompt: "Surface the next actions implied by the most relevant conversations.",
        detail:
          "Turns scattered discussion into a practical follow-up list.",
      },
    ],
  },
  {
    eyebrow: "Work in layers",
    title: "Start broad, then narrow to the sources that matter.",
    description:
      "Use a starter prompt to get a compact answer, then inspect the source conversations if you need verification.",
    privacyTip:
      "Short prompts usually reveal less than a fully detailed request, which helps keep exploration focused.",
    capabilityHint:
      "Ask for weekly summaries, cross-conversation themes, or a source list you can inspect manually.",
    prompts: [
      {
        title: "Weekly recap",
        prompt: "Give me a compact weekly recap with the main themes and follow-ups.",
        detail:
          "Designed for a weekly digest that stays concise but still useful.",
      },
      {
        title: "Theme map",
        prompt:
          "Map the main themes across my conversations about architecture and tooling.",
        detail:
          "Useful when the goal is to understand the library at a higher level first.",
      },
      {
        title: "Evidence first",
        prompt:
          "List the most relevant conversations for this topic and summarize each one briefly.",
        detail:
          "A good bridge between search and review when you want a source-backed answer.",
      },
      {
        title: "Decision summary",
        prompt: "Summarize the decision and the evidence that led to it.",
        detail:
          "Short, inspectable, and suitable for quick handoff notes.",
      },
    ],
  },
];

function rotateArray<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const normalized = ((offset % items.length) + items.length) % items.length;
  if (normalized === 0) return items;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function getStarterDeck(seed: number): StarterDeck {
  return STARTER_DECKS[((seed % STARTER_DECKS.length) + STARTER_DECKS.length) % STARTER_DECKS.length];
}

function normalizeStarterSeed(text: string, max = 44): string {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}...`;
}

function extractConversationCue(conversation: Conversation): string {
  const title = normalizeStarterSeed(conversation.title || "");
  if (title && title.toLowerCase() !== "untitled") {
    return title;
  }

  return normalizeStarterSeed(conversation.snippet || "");
}

function buildLibraryStarterPrompts(
  conversations: Conversation[],
  fallbackPrompts: StarterPromptCard[],
  revision: number
): StarterPromptCard[] {
  const rotatedConversations = rotateArray(conversations, revision);
  const prompts: StarterPromptCard[] = [];
  const seen = new Set<string>();

  for (const conversation of rotatedConversations) {
    const cue = extractConversationCue(conversation);
    if (!cue) continue;

    const key = cue.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    prompts.push({
      title: `Continue "${cue}"`,
      prompt: `Continue "${cue}" and search the related context before summarizing the key points.`,
      detail:
        "Built from recent library cues using only lightweight title and snippet context.",
    });

    if (prompts.length >= 2) {
      break;
    }
  }

  for (const fallback of fallbackPrompts) {
    prompts.push(fallback);
    if (prompts.length >= 4) {
      break;
    }
  }

  return prompts;
}

type ExploreTabProps = {
  storage: StorageApi;
  themeMode?: UiThemeMode;
  onOpenConversation?: (conversationId: number) => void;
};

type DrawerTab = "overview" | "trace" | "sources" | "evidence_brief";
type SelectionSaveStatus = "idle" | "saving" | "saved" | "error";
type StarterDeckStatus = "loading" | "ready";

interface StarterPromptCard {
  title: string;
  prompt: string;
  detail: string;
}

interface StarterDeck {
  eyebrow: string;
  title: string;
  description: string;
  privacyTip: string;
  capabilityHint: string;
  prompts: StarterPromptCard[];
}

const TOOL_LABELS: Record<ExploreToolName, string> = {
  intent_router: "Intent Router",
  time_scope_resolver: "Time Scope Resolver",
  weekly_summary_tool: "Weekly Summary Tool",
  query_planner: "Query Rewrite",
  search_rag: "Semantic Search",
  summary_tool: "Summary Tool",
  context_compiler: "Evidence Brief Builder",
  answer_synthesizer: "Answer Synthesizer",
};

const TOOL_EXPLANATIONS: Record<ExploreToolName, string> = {
  intent_router:
    "Uses the model to decide what the user is asking for, which route to run, and whether a time window is required.",
  time_scope_resolver:
    "Turns phrases like 'this week' into a concrete date range so the answer is auditable.",
  weekly_summary_tool:
    "Finds the conversations in that period, then reuses or generates a week-level digest.",
  query_planner:
    "Rewrites the request into a standalone retrieval query so follow-up questions stay grounded.",
  search_rag:
    "Searches the knowledge base by semantic similarity to retrieve the most relevant conversations.",
  summary_tool:
    "Fills in missing conversation summaries so multi-source answers are easier to synthesize and inspect.",
  context_compiler:
    "Builds the evidence brief and source set shown in the drawer.",
  answer_synthesizer:
    "Produces the final answer from the collected evidence and tells the user where to inspect the result.",
};

const INTENT_LABELS: Record<ExploreRouteDecision["intent"], string> = {
  fact_lookup: "Fact Lookup",
  cross_conversation_summary: "Cross-Conversation Summary",
  weekly_review: "Weekly Review",
  timeline: "Timeline",
  clarification_needed: "Clarification Needed",
};

const PATH_LABELS: Record<ExploreRouteDecision["preferredPath"], string> = {
  rag: "RAG Search",
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

function getInspectMeta(message?: ExploreMessage | null): ExploreInspectMeta | undefined {
  return message?.inspectMeta ?? message?.agentMeta;
}

function getRouteDecision(meta?: ExploreInspectMeta): ExploreRouteDecision | undefined {
  return meta?.routeDecision ?? meta?.plan;
}

function getIntentLabel(routeDecision?: ExploreRouteDecision): string {
  if (!routeDecision) return "Unknown";
  return INTENT_LABELS[routeDecision.intent];
}

function getPathLabel(routeDecision?: ExploreRouteDecision): string {
  if (!routeDecision) return "Unknown";
  return PATH_LABELS[routeDecision.preferredPath];
}

function getResolvedTimeScopeLabel(routeDecision?: ExploreRouteDecision): string | null {
  if (routeDecision?.resolvedTimeScope) {
    return `${routeDecision.resolvedTimeScope.label} (${routeDecision.resolvedTimeScope.startDate} to ${routeDecision.resolvedTimeScope.endDate})`;
  }
  if (routeDecision?.requestedTimeScope?.label) {
    return routeDecision.requestedTimeScope.label;
  }
  if (
    routeDecision?.requestedTimeScope?.preset &&
    routeDecision.requestedTimeScope.preset !== "none"
  ) {
    return routeDecision.requestedTimeScope.preset.replace(/_/g, " ");
  }
  return null;
}

function isTimeScopedPlan(routeDecision?: ExploreRouteDecision): boolean {
  return routeDecision?.preferredPath === "weekly_summary";
}

function getSourceBadgeLabel(
  candidateOrSource: Pick<ExploreContextCandidate, "similarity" | "matchType">,
  routeDecision?: ExploreRouteDecision
): string {
  if (candidateOrSource.matchType === "time_scope" || isTimeScopedPlan(routeDecision)) {
    return "In range";
  }
  return `${candidateOrSource.similarity}%`;
}

function getEvidenceBriefText(meta?: ExploreInspectMeta): string {
  return meta?.evidenceBrief ?? meta?.contextDraft ?? "";
}

function getRouteLabel(meta?: ExploreInspectMeta): string {
  return meta?.routeSummary?.routeLabel || getPathLabel(getRouteDecision(meta));
}

function getEvidenceCountLabel(message: ExploreMessage, meta?: ExploreInspectMeta): string {
  const count =
    meta?.routeSummary?.evidenceCount ??
    meta?.retrievalMeta?.selectedWindowIds.length ??
    meta?.contextCandidates?.length ??
    message.sources?.length ??
    0;
  const routeDecision = getRouteDecision(meta);
  if (routeDecision?.preferredPath === "weekly_summary") {
    return `${count} sources`;
  }
  return `${count} evidence`;
}

export function ExploreTab({
  storage,
  themeMode = "light",
  onOpenConversation,
}: ExploreTabProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mode, setMode] = useState<ExploreMode>("search");
  const [sessions, setSessions] = useState<ExploreSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExploreMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const justCreatedSessionRef = useRef<string | null>(null);
  const starterDeckTimerRef = useRef<number | null>(null);

  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegeneratingSources, setIsRegeneratingSources] = useState(false);
  const [searchStageIndex, setSearchStageIndex] = useState(0);
  const [submitMode, setSubmitMode] = useState<ExploreMode>("search");
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
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const [evidenceBrief, setEvidenceBrief] = useState("");
  const [selectedContextConversationIds, setSelectedContextConversationIds] = useState<
    number[]
  >([]);
  const [selectionSaveStatus, setSelectionSaveStatus] = useState<SelectionSaveStatus>("idle");
  const [drawerNotice, setDrawerNotice] = useState<string | null>(null);
  const [starterDeckRevision, setStarterDeckRevision] = useState(0);
  const [starterDeckStatus, setStarterDeckStatus] = useState<StarterDeckStatus>("loading");
  const [starterCards, setStarterCards] = useState<StarterPromptCard[]>([]);

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
  const drawerInspectMeta = getInspectMeta(drawerMessage);
  const drawerPlan = getRouteDecision(drawerInspectMeta);
  const drawerCandidates = drawerInspectMeta?.contextCandidates ?? [];
  const drawerToolCalls = drawerInspectMeta?.toolCalls ?? [];
  const starterDeck = useMemo(
    () => getStarterDeck(starterDeckRevision),
    [starterDeckRevision]
  );
  const starterPrompts = useMemo(
    () => rotateArray(starterDeck.prompts, starterDeckRevision),
    [starterDeck.prompts, starterDeckRevision]
  );
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
    if (currentSessionId) {
      setStarterDeckStatus("ready");
      return;
    }

    setStarterDeckStatus("loading");
    if (starterDeckTimerRef.current !== null) {
      window.clearTimeout(starterDeckTimerRef.current);
    }
    let cancelled = false;

    const minDelay = new Promise<void>((resolve) => {
      starterDeckTimerRef.current = window.setTimeout(() => {
        starterDeckTimerRef.current = null;
        resolve();
      }, 320);
    });

    void (async () => {
      let nextCards = starterPrompts;
      try {
        const conversations = await storage.getConversations();
        nextCards = buildLibraryStarterPrompts(conversations, starterPrompts, starterDeckRevision);
      } catch {
        nextCards = starterPrompts;
      }

      await minDelay;
      if (cancelled) return;
      setStarterCards(nextCards);
      setStarterDeckStatus("ready");
    })();

    return () => {
      cancelled = true;
      if (starterDeckTimerRef.current !== null) {
        window.clearTimeout(starterDeckTimerRef.current);
        starterDeckTimerRef.current = null;
      }
    };
  }, [currentSessionId, starterDeckRevision, starterPrompts, storage.getConversations]);

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
    const inspectQuery = getInspectMeta(message)?.query?.trim();
    if (inspectQuery) {
      return inspectQuery;
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
    setStarterDeckRevision((prev) => prev + 1);
    setStarterDeckStatus("loading");
  };

  const openDrawer = (message: ExploreMessage, tab: DrawerTab) => {
    setDrawerMessageId(message.id);
    setDrawerTab(tab);
    setDrawerNotice(null);
    setSelectionSaveStatus("idle");
    const inspectMeta = getInspectMeta(message);
    const nextBrief = getEvidenceBriefText(inspectMeta);
    const candidates = inspectMeta?.contextCandidates ?? [];
    const selectedFromMessage = inspectMeta?.selectedContextConversationIds ?? [];
    const selected =
      selectedFromMessage.length > 0
        ? selectedFromMessage
        : candidates.map((candidate) => candidate.conversationId);
    setEvidenceBrief(nextBrief);
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
        inspectMeta: result.inspect ?? result.agent,
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

  const handleSaveEvidenceSelection = async () => {
    if (!drawerMessage) return;
    const inspectMeta = getInspectMeta(drawerMessage);
    if (!inspectMeta) return;

    const normalizedIds = selectedContextConversationIds.filter((id) =>
      drawerCandidates.some((candidate) => candidate.conversationId === id)
    );

    setSelectionSaveStatus("saving");
    setDrawerNotice(null);
    try {
      if (storage.updateExploreMessageEvidence) {
        await storage.updateExploreMessageEvidence(
          drawerMessage.id,
          normalizedIds,
          evidenceBrief
        );
      }

      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== drawerMessage.id) return message;
          return {
            ...message,
            inspectMeta: {
              ...inspectMeta,
              evidenceBrief,
              contextDraft: evidenceBrief,
              selectedContextConversationIds: normalizedIds,
            },
          };
        })
      );

      setSelectionSaveStatus("saved");
      setDrawerNotice(
        storage.updateExploreMessageEvidence
          ? "Source selection saved."
          : "Saved locally for this view (storage adapter unavailable)."
      );
    } catch (err) {
      console.error("[Explore] Failed to save evidence selection:", err);
      setSelectionSaveStatus("error");
      setDrawerNotice((err as Error)?.message ?? "Failed to save source selection.");
    }
  };

  const handleCopyEvidenceBrief = async () => {
    if (!evidenceBrief.trim()) return;
    try {
      await navigator.clipboard.writeText(evidenceBrief);
      setDrawerNotice("Copied to clipboard.");
    } catch {
      setDrawerNotice("Clipboard is unavailable in this environment.");
    }
  };

  const handleStartChatWithBrief = () => {
    handleNewChat();
    setInputValue(evidenceBrief);
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
      if (storage.updateExploreMessageEvidence) {
        await storage.updateExploreMessageEvidence(
          drawerMessage.id,
          normalizedIds,
          evidenceBrief
        );
      }

      const drawerMode = getInspectMeta(drawerMessage)?.mode ?? mode;

      await storage.askKnowledgeBase(
        query,
        currentSessionId,
        Math.max(normalizedIds.length, 1),
        drawerMode,
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

      const inspectMeta = getInspectMeta(message);
      const hasSources = message.sources && message.sources.length > 0;
      const toolCalls = inspectMeta?.toolCalls ?? [];
      const routeDecision = getRouteDecision(inspectMeta);
      const routeSummary = inspectMeta?.routeSummary;
      const scopeSummary = routeSummary?.scopeLabel ?? getSearchScopeSummary(inspectMeta?.searchScope);
      const timeScopeLabel =
        routeSummary?.timeScopeLabel ?? getResolvedTimeScopeLabel(routeDecision);
      const hasInspect = Boolean(inspectMeta || toolCalls.length || routeSummary);

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

                {!isUser && hasInspect && (
                  <div className="mt-3 rounded-lg border border-border-subtle bg-bg-surface-card px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-sans text-text-tertiary">
                          Route: {getRouteLabel(inspectMeta)}
                        </p>
                        <p className="text-[11px] font-sans text-text-tertiary">
                          Evidence: {getEvidenceCountLabel(message, inspectMeta)}
                        </p>
                        <p className="text-[11px] font-sans text-text-tertiary">
                          Scope: {scopeSummary}
                        </p>
                        <p className="text-[11px] font-sans text-text-tertiary">
                          LLM calls: {routeSummary?.llmCalls ?? inspectMeta?.retrievalMeta?.llmCalls ?? 0}
                        </p>
                        {timeScopeLabel && (
                          <p className="text-[11px] font-sans text-text-tertiary">
                            Time: {timeScopeLabel}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => openDrawer(message, "overview")}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1 text-xs font-sans text-text-secondary hover:bg-bg-primary hover:text-text-primary"
                      >
                        <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Inspect
                      </button>
                    </div>
                    {toolCalls.length > 0 && (
                      <p className="mt-2 text-[11px] font-sans text-text-tertiary">
                        {summarizeToolCalls(toolCalls)}
                      </p>
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
                              {getSourceBadgeLabel(source, routeDecision)}
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

  const renderEmptyState = () => {
    const loadingStarterDeck = starterDeckStatus === "loading";
    const visibleStarterCards = starterCards.length > 0 ? starterCards : starterPrompts;
    const cardCount = loadingStarterDeck ? 4 : visibleStarterCards.length;

    return (
      <div className="flex flex-1 items-start px-4 py-6 md:px-6 md:py-8">
        <div className="w-full space-y-4">
          <section className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-bg-tertiary shadow-[0_18px_70px_rgba(0,0,0,0.08)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.16),transparent_24%)]" />
            <div className="relative p-5 md:p-8">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0 lg:pr-10">
                  <p className="text-[10px] font-sans uppercase tracking-[0.4em] text-text-tertiary">
                    {starterDeck.eyebrow}
                  </p>
                  <h1 className="mt-3 text-3xl font-[family-name:var(--font-lora)] font-normal leading-tight text-text-primary md:text-[40px]">
                    {starterDeck.title}
                  </h1>
                  <p className="mt-3 max-w-[920px] text-sm leading-6 text-text-secondary md:text-[15px]">
                    {starterDeck.description}
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 justify-self-start rounded-full border border-border-subtle bg-bg-primary/80 px-3 py-1.5 text-xs font-sans text-text-secondary shadow-sm backdrop-blur lg:justify-self-end">
                  {loadingStarterDeck ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-primary" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-accent-primary" />
                  )}
                  <span>{loadingStarterDeck ? "Loading starter ideas" : "Starter deck ready"}</span>
                </div>
              </div>

              <div className="mt-6">
                <div className="rounded-[24px] border border-border-subtle bg-bg-primary/90 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.05)] backdrop-blur">
                  <div className="relative overflow-hidden rounded-[22px] border border-border-default bg-bg-primary">
                    <textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask your knowledge base, summarize a week, or trace a decision trail..."
                      rows={5}
                      className="min-h-[168px] w-full resize-none bg-transparent px-5 py-5 pr-24 text-base font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none"
                    />
                    <div className="absolute bottom-4 right-4">
                      <button
                        onClick={handleSubmit}
                        disabled={!inputValue.trim() || isSubmitting}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent-primary px-4 py-2 text-xs font-sans font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-sans uppercase tracking-wider text-text-tertiary">
                  Starter prompts
                </p>
                <p className="mt-1 text-sm font-sans text-text-secondary">
                  Choose one to populate the composer, then edit it before sending.
                </p>
              </div>
              <p className="text-xs font-sans text-text-tertiary">
                {loadingStarterDeck ? "Refreshing suggestions..." : "Cards update on every new chat."}
              </p>
            </div>

            {loadingStarterDeck ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: cardCount }).map((_, index) => (
                  <div
                    key={`starter-skeleton-${index}`}
                    className="h-full rounded-[24px] border border-border-subtle bg-bg-surface-card p-4"
                  >
                    <div className="h-9 w-9 animate-pulse rounded-xl bg-bg-secondary" />
                    <div className="mt-5 h-5 w-4/5 animate-pulse rounded-full bg-bg-secondary" />
                    <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-bg-secondary" />
                    <div className="mt-2 h-4 w-11/12 animate-pulse rounded-full bg-bg-secondary" />
                    <div className="mt-4 h-3 w-2/3 animate-pulse rounded-full bg-bg-secondary" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {visibleStarterCards.map((card, index) => (
                  <button
                    key={`${card.title}-${index}`}
                    type="button"
                    onClick={() => {
                      setInputValue(card.prompt);
                      setError(null);
                      textareaRef.current?.focus();
                    }}
                    className="group flex h-full flex-col rounded-[24px] border border-border-subtle bg-bg-surface-card p-4 text-left font-sans shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-primary/30 hover:bg-bg-surface-card-hover hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <span className="text-[11px] font-sans uppercase tracking-wider text-text-tertiary">
                        Fill composer
                      </span>
                    </div>
                    <p className="mt-5 text-[15px] font-sans font-medium text-text-primary">{card.title}</p>
                    <p className="mt-2 text-sm font-sans leading-6 text-text-secondary">{card.detail}</p>
                    <p className="mt-4 text-xs font-sans text-text-tertiary">{card.prompt}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

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
                onClick={() => setMode("search")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  mode === "search"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setMode("ask")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  mode === "ask"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Ask
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
        {!(messages.length === 0 && !currentSessionId) && (
          <div className="border-t border-border-subtle p-4">
            <div className="mx-auto max-w-3xl">
              <div className="relative flex items-end gap-2 rounded-lg border border-border-default bg-bg-primary transition-all focus-within:border-accent-primary focus-within:ring-2 focus-within:ring-accent-primary/20">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    mode === "ask"
                      ? "Ask with smart routing for weekly summaries, clarifications, or synthesis..."
                      : "Search your library with evidence-first retrieval..."
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
                  {mode === "ask"
                    ? "Ask uses intent routing for weekly summaries, clarifications, and source-grounded synthesis."
                    : "Search goes straight to retrieval and keeps the answer evidence-first and predictable."}
                </p>
                <p className="mt-1">
                  Current scope: {getSearchScopeSummary(activeSearchScope)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {drawerMessage && (
        <aside className="absolute bottom-0 right-0 top-0 z-20 flex w-[390px] flex-col border-l border-border-subtle bg-bg-primary shadow-[0_0_24px_rgba(0,0,0,0.12)]">
          <div className="flex h-12 items-center justify-between border-b border-border-subtle px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Wrench className="h-4 w-4 text-text-secondary" strokeWidth={1.7} />
              <p className="truncate text-sm font-sans text-text-primary">Inspect Answer</p>
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
                onClick={() => setDrawerTab("overview")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  drawerTab === "overview"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setDrawerTab("trace")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  drawerTab === "trace"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Trace
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
                onClick={() => setDrawerTab("evidence_brief")}
                className={`rounded px-2.5 py-1 text-xs font-sans transition-colors ${
                  drawerTab === "evidence_brief"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Evidence Brief
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {drawerTab === "overview" ? (
              <div className="space-y-4">
                {drawerInspectMeta ? (
                  <>
                    <div className="rounded-lg border border-border-subtle bg-bg-surface-card p-3">
                      <p className="mb-1 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                        Answer Route
                      </p>
                      <div className="space-y-1.5 text-sm font-sans text-text-primary">
                        <p>Mode: {drawerInspectMeta.mode === "ask" ? "Ask" : "Search"}</p>
                        <p>Route: {getRouteLabel(drawerInspectMeta)}</p>
                        {drawerPlan && <p>Intent: {getIntentLabel(drawerPlan)}</p>}
                        <p>Scope: {drawerInspectMeta.routeSummary?.scopeLabel ?? "All conversations"}</p>
                        <p>
                          Evidence: {drawerInspectMeta.routeSummary?.evidenceCount ?? drawerCandidates.length}
                        </p>
                        <p>LLM calls: {drawerInspectMeta.routeSummary?.llmCalls ?? 0}</p>
                        {getResolvedTimeScopeLabel(drawerPlan) && (
                          <p>Time scope: {getResolvedTimeScopeLabel(drawerPlan)}</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border-subtle bg-bg-surface-card p-3">
                      <p className="mb-1 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                        Why Vesti Chose This Path
                      </p>
                      <p className="text-sm font-sans text-text-primary">
                        {drawerPlan?.reason ||
                          "This answer used the shortest evidence path that could stay source-grounded."}
                      </p>
                      {drawerPlan?.clarifyingQuestion && (
                        <p className="mt-2 text-xs font-sans text-text-secondary">
                          Clarification prompt: {drawerPlan.clarifyingQuestion}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-border-subtle bg-bg-surface-card p-3">
                      <p className="mb-1 text-xs font-sans uppercase tracking-wider text-text-tertiary">
                        Evidence Coverage
                      </p>
                      <p className="text-sm font-sans text-text-primary">
                        {drawerCandidates.length > 0
                          ? `This answer considered ${drawerCandidates.length} candidate source${
                              drawerCandidates.length === 1 ? "" : "s"
                            } and currently keeps ${selectedContextConversationIds.length} selected for inspection.`
                          : "No candidate sources were preserved for this answer."}
                      </p>
                      {drawerInspectMeta.retrievalMeta && (
                        <p className="mt-2 text-xs font-sans text-text-secondary">
                          Retrieval route: {drawerInspectMeta.retrievalMeta.route}. Selected windows:{" "}
                          {drawerInspectMeta.retrievalMeta.selectedWindowIds.length}.
                        </p>
                      )}
                    </div>

                    <p className="text-[11px] font-sans text-text-tertiary">
                      Open Trace for step-by-step execution details, Sources to tune the evidence set,
                      or Evidence Brief for the reusable source-grounded brief.
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-sans text-text-tertiary">
                    No inspect metadata was recorded for this answer.
                  </p>
                )}
              </div>
            ) : drawerTab === "trace" ? (
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
                    Scope: {drawerInspectMeta?.routeSummary?.scopeLabel ?? getSearchScopeSummary(drawerInspectMeta?.searchScope)}
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
                      selectionSaveStatus === "error" ? "text-danger" : "text-text-secondary"
                    }`}
                  >
                    {drawerNotice}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveEvidenceSelection}
                    disabled={selectionSaveStatus === "saving"}
                    className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-sans text-white transition-colors hover:bg-accent-primary/90 disabled:opacity-50"
                  >
                    {selectionSaveStatus === "saving" ? "Saving..." : "Save Source Set"}
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
                    onClick={() => setDrawerTab("evidence_brief")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-sans text-text-secondary hover:bg-bg-surface-card"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Open Brief
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
                    Evidence Brief
                  </p>
                  <textarea
                    value={evidenceBrief}
                    readOnly
                    rows={14}
                    className="w-full resize-y rounded-lg border border-border-default bg-bg-primary p-3 text-sm font-sans text-text-primary focus:outline-none"
                  />
                </div>

                {drawerNotice && (
                  <p
                    className={`text-xs font-sans ${
                      selectionSaveStatus === "error" ? "text-danger" : "text-text-secondary"
                    }`}
                  >
                    {drawerNotice}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleCopyEvidenceBrief}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-sans text-text-secondary hover:bg-bg-surface-card"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <button
                    onClick={handleStartChatWithBrief}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-sans text-text-secondary hover:bg-bg-surface-card"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Start New Chat From Brief
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
                  Search, preview, and pick the conversations this answer is allowed to use.
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
