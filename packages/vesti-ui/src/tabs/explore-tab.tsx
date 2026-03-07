"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  ArrowRight,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Pencil,
  X,
  ChevronRight,
  MoreHorizontal,
  Send,
} from "lucide-react";
import type {
  ExploreSession,
  ExploreMessage,
  RelatedConversation,
  StorageApi,
  UiThemeMode,
} from "../types";

const SEARCH_STAGES = [
  "Understanding query...",
  "Searching conversations...",
  "Synthesizing answer...",
];

const sampleQuestions = [
  "What React performance optimization techniques have I discussed?",
  "Summarize all conversations about database architecture",
  "Find all discussions involving TypeScript type system",
];

type ExploreTabProps = {
  storage: StorageApi;
  themeMode?: UiThemeMode;
  onOpenConversation?: (conversationId: number) => void;
};

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
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

export function ExploreTab({
  storage,
  themeMode = "light",
  onOpenConversation,
}: ExploreTabProps) {
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<ExploreSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Current session state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExploreMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  // Ref to track if we just created this session (to avoid double loading)
  const justCreatedSessionRef = useRef<string | null>(null);

  // Input state
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchStageIndex, setSearchStageIndex] = useState(0);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ExploreSession | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Load messages when session changes
  useEffect(() => {
    if (currentSessionId) {
      // Skip loading if we just created this session (messages already in state)
      if (justCreatedSessionRef.current === currentSessionId) {
        justCreatedSessionRef.current = null;
        return;
      }
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus rename input
  useEffect(() => {
    if (renameTarget && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameTarget]);

  // Loading animation
  useEffect(() => {
    if (!isSubmitting) {
      setSearchStageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setSearchStageIndex((prev) => (prev + 1) % SEARCH_STAGES.length);
    }, 900);
    return () => clearInterval(timer);
  }, [isSubmitting]);

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

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInputValue("");
    setError(null);
  };

  const handleSubmit = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSubmitting) return;

    if (!storage.askKnowledgeBase) {
      setError("Explore is unavailable in the current environment.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Optimistically add user message
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
      const result = await storage.askKnowledgeBase(trimmed, currentSessionId || undefined, 5);

      // If this was a new session, update currentSessionId and mark as just created
      if (!currentSessionId) {
        justCreatedSessionRef.current = result.sessionId;
        setCurrentSessionId(result.sessionId);
        await loadSessions();
      }

      // Add AI response (for new session, this sets initial messages; for existing, appends)
      const aiMessage: ExploreMessage = {
        id: generateId(),
        sessionId: result.sessionId,
        role: "assistant",
        content: result.answer,
        sources: result.sources,
        timestamp: Date.now(),
      };
      
      if (!currentSessionId) {
        // New session: set both messages (avoid useEffect loading)
        setMessages([optimisticUserMessage, aiMessage]);
      } else {
        // Existing session: append AI message
        setMessages((prev) => [...prev, aiMessage]);
      }

      // Update sessions list to reflect new preview
      await loadSessions();
    } catch (err) {
      console.error("[Explore] Submit error:", err);
      setError((err as Error)?.message ?? "Failed to retrieve answer.");
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMessage.id));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleStartRename = (session: ExploreSession, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const groupedSessions = useMemo(() => groupSessionsByTime(sessions), [sessions]);
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  const renderSessionItem = (session: ExploreSession) => {
    const isActive = session.id === currentSessionId;
    const isRenaming = renameTarget?.id === session.id;

    return (
      <div
        key={session.id}
        onClick={() => setCurrentSessionId(session.id)}
        className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
          isActive
            ? "bg-bg-surface-card-active"
            : "hover:bg-bg-surface-card"
        }`}
      >
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitRename();
                  if (e.key === "Escape") setRenameTarget(null);
                }}
                onBlur={handleSubmitRename}
                className="flex-1 px-2 py-1 text-sm font-sans text-text-primary bg-bg-primary rounded border border-border-default focus:outline-none focus:border-accent-primary"
              />
            </div>
          ) : (
            <>
              <p className="text-sm font-sans text-text-primary truncate">
                {session.title || "Untitled"}
              </p>
              <p className="text-xs font-sans text-text-tertiary truncate">
                {session.preview || "No messages"}
              </p>
            </>
          )}
        </div>

        {!isRenaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => handleStartRename(session, e)}
              className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-surface-card"
              title="Rename"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={(e) => handleDeleteSession(session.id, e)}
              className="p-1 rounded text-text-tertiary hover:text-[#B42318] hover:bg-bg-surface-card"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderMessage = useCallback((message: ExploreMessage) => {
    const isUser = message.role === "user";
    const html = isUser
      ? null
      : DOMPurify.sanitize(marked.parse(message.content, { gfm: true, breaks: false }) as string);

    // AI 消息始终显示 Sources 区域（即使没有结果）
    const hasSources = message.sources && message.sources.length > 0;

    return (
      <div
        key={message.id}
        className={`py-4 ${isUser ? "bg-bg-tertiary/50" : ""}`}
      >
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-4">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isUser
                  ? "bg-accent-primary text-white"
                  : "bg-bg-surface-card border border-border-subtle"
              }`}
            >
              {isUser ? (
                <span className="text-sm font-sans font-medium">U</span>
              ) : (
                <span className="text-sm">✦</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-sans text-text-tertiary mb-1">
                {isUser ? "You" : "Vesti"}
              </p>

              {isUser ? (
                <p className="text-base font-sans text-text-primary whitespace-pre-wrap">
                  {message.content}
                </p>
              ) : (
                <div
                  className="prose prose-slate max-w-none prose-p:text-text-primary prose-li:text-text-primary prose-p:leading-relaxed prose-li:leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: html || "" }}
                />
              )}

              {!isUser && (
                <div className="mt-4 pt-4 border-t border-border-subtle">
                  <p className="text-[11px] font-sans text-text-tertiary uppercase tracking-wider mb-2">
                    Sources
                  </p>
                  {hasSources ? (
                    <div className="flex flex-wrap gap-2">
                      {message.sources!.map((source) => (
                        <button
                          key={source.id}
                          onClick={() => onOpenConversation?.(source.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-surface-card hover:bg-bg-surface-card-hover text-xs font-sans text-text-secondary transition-colors"
                        >
                          <span className="truncate max-w-[120px]">
                            {source.title}
                          </span>
                          <span className="text-accent-primary">
                            {source.similarity}%
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-sans text-text-tertiary italic">
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
  }, [onOpenConversation]);

  const renderEmptyState = () => (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-[32px] font-serif font-normal text-text-primary mb-4">
          What do you want to explore?
        </h1>
        <p className="text-text-secondary font-sans mb-8">
          Ask questions about your conversation history
        </p>

        <div className="space-y-3 text-left max-w-lg mx-auto">
          {sampleQuestions.map((q) => (
            <button
              key={q}
              onClick={() => {
                setInputValue(q);
                textareaRef.current?.focus();
              }}
              className="w-full text-left px-4 py-3 rounded-lg bg-bg-surface-card hover:bg-bg-surface-card-hover text-[14px] font-sans text-text-secondary hover:text-text-primary transition-all"
            >
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-accent-primary" />
                {q}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div
        className={`border-r border-border-subtle bg-bg-tertiary transition-all duration-200 ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="p-3 border-b border-border-subtle">
            <button
              onClick={handleNewChat}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                themeMode === "dark"
                  ? "bg-bg-secondary text-text-primary hover:bg-bg-surface-card-hover"
                  : "bg-accent-primary text-white hover:bg-accent-primary/90"
              }`}
            >
              <MessageSquarePlus className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-sm font-sans font-medium">New Chat</span>
            </button>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {sessionsLoading ? (
              <div className="text-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-accent-primary mx-auto" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-4 text-xs font-sans text-text-tertiary">
                No conversations yet
              </div>
            ) : (
              <>
                {groupedSessions.today.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-sans text-text-tertiary uppercase tracking-wider">
                      Today
                    </p>
                    <div className="space-y-0.5">
                      {groupedSessions.today.map(renderSessionItem)}
                    </div>
                  </div>
                )}
                {groupedSessions.yesterday.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-sans text-text-tertiary uppercase tracking-wider">
                      Yesterday
                    </p>
                    <div className="space-y-0.5">
                      {groupedSessions.yesterday.map(renderSessionItem)}
                    </div>
                  </div>
                )}
                {groupedSessions.earlier.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[10px] font-sans text-text-tertiary uppercase tracking-wider">
                      Earlier
                    </p>
                    <div className="space-y-0.5">
                      {groupedSessions.earlier.map(renderSessionItem)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
        {/* Header */}
        <div className="h-12 border-b border-border-subtle flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface-card transition-colors"
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <PanelLeftOpen className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
            {currentSession && (
              <h2 className="text-sm font-sans text-text-primary truncate max-w-[200px]">
                {currentSession.title}
              </h2>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentSessionId && (
              <button
                onClick={handleNewChat}
                className="px-3 py-1.5 rounded-lg bg-bg-surface-card hover:bg-bg-surface-card-hover text-sm font-sans text-text-primary transition-colors"
              >
                New Chat
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !currentSessionId ? (
            renderEmptyState()
          ) : (
            <>
              {messagesLoading && messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
                </div>
              ) : (
                <>
                  {messages.map(renderMessage)}

                  {/* Loading indicator for AI response */}
                  {isSubmitting && (
                    <div className="py-4">
                      <div className="max-w-3xl mx-auto px-4">
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-bg-surface-card border border-border-subtle flex items-center justify-center">
                            <span className="text-sm">✦</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-sans text-text-tertiary mb-1">
                              Vesti
                            </p>
                            <div className="flex items-center gap-2 text-text-primary">
                              <Loader2 className="w-4 h-4 animate-spin text-accent-primary" />
                              <span className="text-sm font-sans">
                                {SEARCH_STAGES[searchStageIndex]}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {error && (
                    <div className="py-4">
                      <div className="max-w-3xl mx-auto px-4">
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
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border-subtle p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 rounded-lg border border-border-default bg-bg-primary focus-within:border-accent-primary focus-within:ring-2 focus-within:ring-accent-primary/20 transition-all">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your knowledge base..."
                rows={1}
                className="flex-1 px-4 py-3 max-h-32 resize-none bg-transparent text-base font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none"
                style={{ minHeight: "48px" }}
              />
              <div className="p-2">
                <button
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isSubmitting}
                  className="p-2 rounded-md bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs font-sans text-text-tertiary text-center">
              Vesti will search your conversation history and provide answers with sources
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
