import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  BookOpen,
  List,
  Star,
  ChevronUp,
  Check,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { Conversation, GardenerResult, Platform, Topic } from "~lib/types";
import { getConversations, getTopics, runGardener } from "~lib/services/storageService";
import { MOCK_NOTES } from "../mock-data";

const platformColors: Record<Platform, string> = {
  ChatGPT: "#1A1A1A",
  Claude: "#1A1A1A",
  Gemini: "#FFFFFF",
  DeepSeek: "#FFFFFF",
  Qwen: "#0F2B5B",
  Doubao: "#7A2E0B",
};

const platformBackgrounds: Record<Platform, string> = {
  ChatGPT: "#F3F4F6",
  Claude: "#F7D8BA",
  Gemini: "#3A62D9",
  DeepSeek: "#172554",
  Qwen: "#E3F2FF",
  Doubao: "#FCE7D6",
};

type ViewMode = "conversations" | "notes";

export function LibraryTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("conversations");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [gardenerExpanded, setGardenerExpanded] = useState(false);
  const [gardenerResults, setGardenerResults] = useState<Record<number, GardenerResult>>({});
  const [gardenerRunningId, setGardenerRunningId] = useState<number | null>(null);
  const [gardenerError, setGardenerError] = useState<string | null>(null);

  // Note editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState<"saved" | "unsaved">("saved");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const loadLibraryData = useCallback(async () => {
    try {
      const [topicData, conversationData] = await Promise.all([
        getTopics(),
        getConversations(),
      ]);
      setTopics(topicData);
      setConversations(conversationData);
    } catch (error) {
      console.error("[dashboard] Failed to load library data", error);
    }
  }, []);

  useEffect(() => {
    void loadLibraryData();
  }, [loadLibraryData]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    const handler = (message: unknown) => {
      if (
        typeof message === "object" &&
        message &&
        (message as { type?: string }).type === "VESTI_DATA_UPDATED"
      ) {
        void loadLibraryData();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [loadLibraryData]);

  // Auto-save note with debounce
  useEffect(() => {
    if (viewMode !== "notes" || !selectedNoteId) return;
    if (!noteContent && !noteTitle) return;
    setNoteSaveStatus("unsaved");
    const timer = setTimeout(() => {
      console.log("[dashboard] Note saved:", { title: noteTitle, content: noteContent });
      setNoteSaveStatus("saved");
    }, 800);
    return () => clearTimeout(timer);
  }, [noteContent, noteTitle, viewMode, selectedNoteId]);

  // Load selected note
  useEffect(() => {
    if (viewMode === "notes" && selectedNoteId) {
      const note = MOCK_NOTES.find((n) => n.id === selectedNoteId);
      if (note) {
        setNoteTitle(note.title);
        setNoteContent(note.content);
      }
    }
  }, [selectedNoteId, viewMode]);

  // Initialize selections when data arrives
  useEffect(() => {
    if (topics.length > 0 && selectedTopicId === null) {
      setSelectedTopicId(topics[0].id);
    }
    if (topics.length > 0 && selectedTopicId !== null) {
      const exists = findTopicById(topics, selectedTopicId);
      if (!exists) {
        setSelectedTopicId(topics[0].id);
      }
    }
  }, [topics, selectedTopicId]);

  useEffect(() => {
    if (conversations.length > 0 && selectedConversationId === null) {
      setSelectedConversationId(conversations[0].id);
    }
    if (conversations.length > 0 && selectedConversationId !== null) {
      const exists = conversations.some((c) => c.id === selectedConversationId);
      if (!exists) {
        setSelectedConversationId(conversations[0].id);
      }
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    setGardenerError(null);
  }, [selectedConversationId]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [noteContent]);

  // Focus title input when editing
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const selectedNote = MOCK_NOTES.find((n) => n.id === selectedNoteId);
  const activeGardener =
    selectedConversationId !== null ? gardenerResults[selectedConversationId] : undefined;
  const activeTags =
    activeGardener?.tags && activeGardener.tags.length > 0
      ? activeGardener.tags
      : selectedConversation?.tags ?? [];
  const activeTopicName =
    activeGardener?.matchedTopic?.name ??
    activeGardener?.createdTopic?.name ??
    (selectedConversation?.topic_id
      ? findTopicById(topics, selectedConversation.topic_id)?.name
      : undefined);
  const hasAnalysis = Boolean(activeTags.length > 0 || activeTopicName);
  const gardenerSteps = activeGardener?.steps ?? [];

  const filteredConversations = selectedTopicId
    ? conversations.filter((c) => {
        const topic = findTopicById(topics, selectedTopicId);
        if (!topic) return false;
        const topicIds = collectTopicIds(topic);
        return c.topic_id !== null && topicIds.includes(c.topic_id);
      })
    : conversations;

  function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  function renderGardenerStepIcon(status: "pending" | "running" | "completed") {
    if (status === "completed") {
      return <Check strokeWidth={1.5} className="w-4 h-4 text-success" />;
    }
    if (status === "running") {
      return <Clock strokeWidth={1.5} className="w-4 h-4 text-text-tertiary" />;
    }
    return <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-text-tertiary" />;
  }

  function findTopicById(nodes: Topic[], id: number): Topic | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children && node.children.length > 0) {
        const match = findTopicById(node.children, id);
        if (match) return match;
      }
    }
    return null;
  }

  function collectTopicIds(topic: Topic): number[] {
    const ids = [topic.id];
    if (topic.children) {
      topic.children.forEach((child) => {
        ids.push(...collectTopicIds(child));
      });
    }
    return ids;
  }

  const renderTopicItem = (topic: Topic, level: number = 0) => {
    const isSelected = selectedTopicId === topic.id;
    const hasChildren = topic.children && topic.children.length > 0;

    return (
      <div key={topic.id}>
        <button
          onClick={() => {
            setSelectedTopicId(topic.id);
            setViewMode("conversations");
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-200 relative ${
            isSelected && viewMode === "conversations"
              ? "bg-bg-surface-card-hover"
              : "hover:bg-bg-surface-card"
          }`}
          style={{ paddingLeft: `${12 + level * 16}px` }}
        >
          {isSelected && viewMode === "conversations" && (
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-primary" />
          )}
          {hasChildren && (
            <span className="flex-shrink-0">
              <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-text-primary" />
            </span>
          )}
          <span className="flex-1 text-sm font-sans font-normal text-text-primary">
            {topic.name}
          </span>
          <span className="text-xs font-sans text-text-tertiary">{topic.count ?? 0}</span>
        </button>
      </div>
    );
  };

  const handleRunGardener = async (conversationId: number) => {
    setSelectedConversationId(conversationId);
    setViewMode("conversations");
    setGardenerExpanded(true);
    setGardenerError(null);
    setGardenerRunningId(conversationId);
    try {
      const result = await runGardener(conversationId);
      setGardenerResults((prev) => ({ ...prev, [conversationId]: result.result }));
      await loadLibraryData();
    } catch (error) {
      console.error("[dashboard] Gardener failed", error);
      setGardenerError((error as Error)?.message ?? "Failed to run Gardener.");
    } finally {
      setGardenerRunningId(null);
    }
  };

  const switchToConversation = (conversationId: number) => {
    setViewMode("conversations");
    setSelectedConversationId(conversationId);
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      setSelectedTopicId(conversation.topic_id);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left Column - Sidebar (200px) */}
      <aside className="w-[200px] bg-bg-secondary flex flex-col">
        <div className="flex-1 overflow-y-auto pt-4">{topics.map((topic) => renderTopicItem(topic))}</div>

        <div className="border-t border-border-subtle">
          <button
            onClick={() => {
              setViewMode("conversations");
              setSelectedTopicId(null);
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 transition-colors relative ${
              viewMode === "conversations" && !selectedTopicId
                ? "bg-bg-surface-card-hover"
                : "hover:bg-bg-surface-card"
            }`}
          >
            {viewMode === "conversations" && !selectedTopicId && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-primary" />
            )}
            <List strokeWidth={1.5} className="w-4 h-4 text-text-secondary" />
            <span className="flex-1 text-sm font-sans text-text-primary">All Conversations</span>
            <span className="text-xs font-sans text-text-tertiary">{conversations.length}</span>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-surface-card transition-colors">
            <Star strokeWidth={1.5} className="w-4 h-4 text-text-secondary" />
            <span className="flex-1 text-sm font-sans text-text-primary">Starred</span>
          </button>
        </div>

        {/* My Notes Entry */}
        <div className="mt-2">
          <button
            onClick={() => {
              setViewMode("notes");
              if (MOCK_NOTES.length > 0 && !selectedNoteId) {
                setSelectedNoteId(MOCK_NOTES[0].id);
              }
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 transition-colors relative ${
              viewMode === "notes" ? "bg-bg-surface-card-hover" : "hover:bg-bg-surface-card"
            }`}
          >
            {viewMode === "notes" && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-primary" />
            )}
            <BookOpen strokeWidth={1.5} className="w-4 h-4 text-text-secondary" />
            <span className="flex-1 text-sm font-sans text-text-primary">My Notes</span>
            <span className="text-xs font-sans text-text-tertiary">{MOCK_NOTES.length}</span>
          </button>
        </div>
      </aside>

      {/* Middle Column - Conversation/Note List (320px) */}
      <div className="w-[320px] bg-bg-tertiary flex flex-col">
        {viewMode === "conversations" ? (
          <>
            <div className="px-4 py-3 border-b border-border-subtle">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-serif font-normal text-text-primary">
                    {selectedTopicId ? findTopicById(topics, selectedTopicId)?.name : "All Conversations"}
                  </h2>
                  <span className="text-xs font-sans text-text-tertiary">
                    · {filteredConversations.length} conversations
                  </span>
                </div>
              </div>
            </div>

            {/* New Folder Button */}
            <div className="px-4 py-2 border-b border-[#EEECE5]">
              <button
                onClick={() => console.log("[dashboard] Create new folder")}
                className="text-[12px] font-sans text-text-tertiary hover:text-text-secondary transition-colors"
              >
                + New Folder
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 mt-2">
              {filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConversationId;
                const displayTags =
                  gardenerResults[conv.id]?.tags && gardenerResults[conv.id]!.tags.length > 0
                    ? gardenerResults[conv.id]!.tags
                    : conv.tags;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`w-full text-left p-3 rounded-lg transition-all duration-200 relative group ${
                      isSelected
                        ? "bg-bg-surface-card-active shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                        : "bg-bg-surface-card hover:bg-bg-surface-card-hover hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    }`}
                  >
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRunGardener(conv.id);
                      }}
                      role="button"
                      aria-disabled={gardenerRunningId === conv.id}
                      className={`absolute top-2 right-2 px-2 py-1 rounded-md text-[10px] font-sans transition-all cursor-pointer ${
                        gardenerRunningId === conv.id
                          ? "bg-bg-secondary text-text-secondary"
                          : "bg-bg-secondary text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-primary"
                      }`}
                    >
                      {gardenerRunningId === conv.id ? "Running..." : "Run Gardener"}
                    </span>
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-primary rounded-r" />
                    )}
                    <h3 className="text-sm font-sans font-medium text-text-primary mb-1.5 leading-snug">
                      {conv.title}
                    </h3>
                    <p className="text-[13px] font-sans text-text-secondary leading-relaxed mb-2 line-clamp-2">
                      {conv.snippet}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-sans font-medium leading-none"
                        style={{
                          backgroundColor: platformBackgrounds[conv.platform],
                          color: platformColors[conv.platform],
                        }}
                      >
                        {conv.platform}
                      </span>
                      {displayTags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[11px] font-sans text-text-secondary bg-bg-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="ml-auto text-[11px] font-sans text-text-tertiary">
                        {formatTimeAgo(conv.updated_at)}
                      </span>
                      {conv.has_note && (
                        <span
                          title="Has notes"
                          style={{
                            display: "inline-block",
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: "#3266AD",
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-border-subtle">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-serif font-normal text-text-primary">My Notes</h2>
                  <span className="text-xs font-sans text-text-tertiary">· {MOCK_NOTES.length} notes</span>
                </div>
                <button
                  onClick={() => console.log("[dashboard] Create new note")}
                  className="px-3 py-1.5 text-[13px] font-sans font-medium text-text-primary bg-bg-surface-card hover:bg-bg-surface-card-hover rounded-md transition-colors"
                >
                  + New Note
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {MOCK_NOTES.map((note) => {
                const isSelected = note.id === selectedNoteId;
                const preview = note.content.replace(/[#*\[\]]/g, "").slice(0, 100);
                return (
                  <button
                    key={note.id}
                    onClick={() => setSelectedNoteId(note.id)}
                    className={`w-full text-left p-3 rounded-lg transition-all duration-200 relative group ${
                      isSelected
                        ? "bg-bg-surface-card-active shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                        : "bg-bg-surface-card hover:bg-bg-surface-card-hover hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-primary rounded-r" />
                    )}
                    <h3 className="text-sm font-sans font-medium text-text-primary mb-1.5 leading-snug">
                      {note.title}
                    </h3>
                    <p className="text-[13px] font-sans text-text-secondary leading-relaxed mb-2 line-clamp-2">
                      {preview}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {note.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[11px] font-sans text-text-secondary bg-bg-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="ml-auto text-[11px] font-sans text-text-tertiary">
                        {formatTimeAgo(note.updated_at)}
                      </span>
                      {note.linked_conversation_ids.length > 0 && (
                        <span
                          title={`Linked to ${note.linked_conversation_ids.length} conversation${
                            note.linked_conversation_ids.length > 1 ? "s" : ""
                          }`}
                          style={{
                            display: "inline-block",
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: "#3266AD",
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Right Column - Reader/Editor (flex-1) */}
      {viewMode === "conversations" && selectedConversation && (
        <div className="flex-1 bg-bg-primary overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-6">
            {/* Block A - Header */}
            <div className="mb-6 border-b border-border-subtle pb-6">
              <h1 className="text-2xl font-serif font-normal text-text-primary mb-3 leading-tight">
                {selectedConversation.title}
              </h1>
              <div className="flex items-center gap-2 text-[13px] font-sans text-text-secondary mb-4">
                <span
                  className="px-2 py-0.5 rounded-md text-[11px] font-sans font-medium leading-none"
                  style={{
                    backgroundColor: platformBackgrounds[selectedConversation.platform],
                    color: platformColors[selectedConversation.platform],
                  }}
                >
                  {selectedConversation.platform}
                </span>
                <span>·</span>
                <span>January 15, 2024</span>
                <span>·</span>
                <span>12 messages</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-md text-[13px] font-sans text-text-secondary bg-bg-secondary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Block B - Gardener Summary Card */}
            <div className="mb-6">
              <button
                onClick={() => setGardenerExpanded(!gardenerExpanded)}
                className="w-full p-3 rounded-lg bg-bg-surface-card hover:bg-bg-surface-card-hover transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2 text-sm font-sans">
                  {hasAnalysis ? (
                    <>
                      <Check strokeWidth={1.5} className="w-4 h-4 text-accent-primary" />
                      <span className="text-text-primary">Analyzed</span>
                      {activeTopicName && (
                        <>
                          <span className="text-text-tertiary">·</span>
                          <span className="text-text-tertiary">{activeTopicName}</span>
                        </>
                      )}
                      {activeTags.length > 0 && (
                        <>
                          <span className="text-text-tertiary">·</span>
                          <span className="text-text-tertiary">
                            {activeTags.join(", ")}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-text-tertiary">Not analyzed yet</span>
                    </>
                  )}
                </div>
                {gardenerExpanded ? (
                  <ChevronUp strokeWidth={1.5} className="w-4 h-4 text-text-tertiary" />
                ) : (
                  <ChevronDown strokeWidth={1.5} className="w-4 h-4 text-text-tertiary" />
                )}
              </button>

              {gardenerExpanded && (
                <>
                  {gardenerSteps.length > 0 ? (
                    <div className="mt-3 p-4 rounded-lg bg-bg-surface-card space-y-3">
                      {gardenerSteps.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm font-sans">
                          {renderGardenerStepIcon(item.status)}
                          <span className="text-text-primary">{item.step}</span>
                          {item.details && (
                            <span className="text-xs text-text-tertiary ml-auto">
                              {item.details}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 p-4 rounded-lg bg-bg-surface-card text-sm font-sans text-text-tertiary">
                      {gardenerError
                        ? `Gardener failed: ${gardenerError}`
                        : "Run Gardener to see the analysis steps."}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Block C - Conversation Content */}
            <div className="space-y-6">
              <div>
                <div className="text-xs font-sans text-text-tertiary uppercase tracking-wider mb-2">
                  You
                </div>
                <p className="text-base font-serif text-text-primary leading-relaxed">
                  How can I build a reusable component library for my React app?
                </p>
              </div>

              <div>
                <div className="text-xs font-sans text-text-tertiary uppercase tracking-wider mb-2">
                  ChatGPT
                </div>
                <div className="p-3 rounded-lg bg-bg-surface-ai-message text-base font-serif text-text-primary leading-relaxed">
                  A reusable component library should start with a clear design system and consistent
                  API patterns. Focus on composition, strong typing, and a documented structure for
                  scalability. Key steps include defining tokens, building base components, and setting
                  up proper documentation with Storybook or similar tools.
                </div>
              </div>
            </div>

            {/* Related Notes */}
            {selectedConversation && (
              <div className="mt-10">
                {MOCK_NOTES.filter((note) =>
                  note.linked_conversation_ids.includes(selectedConversation.id)
                ).length > 0 && (
                  <>
                    <h3 className="text-[11px] font-sans font-medium text-text-tertiary uppercase tracking-wider mb-3">
                      Related Notes
                    </h3>
                    <div className="space-y-2">
                      {MOCK_NOTES.filter((note) =>
                        note.linked_conversation_ids.includes(selectedConversation.id)
                      ).map((note) => (
                        <button
                          key={note.id}
                          onClick={() => {
                            setViewMode("notes");
                            setSelectedNoteId(note.id);
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-bg-surface-card transition-colors group"
                        >
                          <span className="text-sm font-sans text-text-primary">{note.title}</span>
                          <span className="text-xs font-sans text-accent-primary flex items-center gap-1">
                            Open
                            <ArrowRight strokeWidth={1.5} className="w-3 h-3" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Related Conversations */}
            <div className="mt-10">
              <h3 className="text-[11px] font-sans font-medium text-text-tertiary uppercase tracking-wider mb-3">
                Related Conversations
              </h3>
              <div className="space-y-2">
                {[1, 2, 3].map((convId) => {
                  const conversation = conversations.find((c) => c.id === convId);
                  if (!conversation) return null;
                  return (
                    <button
                      key={conversation.id}
                      onClick={() => switchToConversation(conversation.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-bg-surface-card transition-colors group relative"
                    >
                      <div>
                        <span className="text-sm font-sans text-text-primary block">
                          {conversation.title}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-md text-[11px] font-sans font-medium leading-none mt-1 inline-block"
                          style={{
                            backgroundColor: platformBackgrounds[conversation.platform],
                            color: platformColors[conversation.platform],
                          }}
                        >
                          {conversation.platform}
                        </span>
                      </div>
                      <span className="text-xs font-sans text-accent-primary flex items-center gap-1">
                        View
                        <ArrowRight strokeWidth={1.5} className="w-3 h-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === "notes" && selectedNote && (
        <div className="flex-1 bg-bg-primary overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-6">
            <div className="mb-6">
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  onBlur={() => setEditingTitle(false)}
                  className="text-2xl font-serif font-normal text-text-primary bg-transparent border-b border-accent-primary focus:outline-none w-full"
                />
              ) : (
                <button
                  onClick={() => setEditingTitle(true)}
                  className="text-2xl font-serif font-normal text-text-primary hover:text-accent-primary transition-colors"
                >
                  {noteTitle}
                </button>
              )}
              <div className="flex items-center gap-2 mt-2">
                {selectedNote.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-md text-[13px] font-sans text-text-secondary bg-bg-secondary"
                  >
                    {tag}
                  </span>
                ))}
                <span className="text-xs font-sans text-text-tertiary ml-auto">
                  {noteSaveStatus === "unsaved"
                    ? "Unsaved changes"
                    : `Updated ${formatTimeAgo(selectedNote.updated_at)}`}
                </span>
              </div>
            </div>

            <div className="mb-8">
              <textarea
                ref={textareaRef}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="w-full min-h-[240px] bg-transparent text-[13px] font-mono text-text-primary leading-relaxed focus:outline-none resize-none"
                placeholder="Start writing..."
              />
            </div>

            <div className="mt-8">
              <h3 className="text-[11px] font-sans font-medium text-text-tertiary uppercase tracking-wider mb-3">
                Linked Conversations
              </h3>
              {selectedNote.linked_conversation_ids.length > 0 ? (
                <div className="space-y-2">
                  {selectedNote.linked_conversation_ids.map((convId) => {
                    const conversation = conversations.find((c) => c.id === convId);
                    if (!conversation) return null;
                    return (
                      <div
                        key={convId}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-bg-surface-card hover:bg-bg-surface-card-hover transition-colors group"
                      >
                        <div>
                          <span className="text-sm font-sans text-text-primary block">
                            {conversation.title}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-md text-[11px] font-sans font-medium leading-none mt-1 inline-block"
                            style={{
                              backgroundColor: platformBackgrounds[conversation.platform],
                              color: platformColors[conversation.platform],
                            }}
                          >
                            {conversation.platform}
                          </span>
                        </div>
                        <button
                          onClick={() => switchToConversation(conversation.id)}
                          className="text-xs font-sans text-accent-primary flex items-center gap-1"
                        >
                          View
                          <ArrowRight strokeWidth={1.5} className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg bg-bg-surface-card">
                  <span className="text-[13px] font-sans text-text-tertiary">No linked conversations</span>
                  <button
                    onClick={() => console.log("[dashboard] Link a conversation")}
                    className="text-xs font-sans text-accent-primary"
                  >
                    + Link a conversation
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
