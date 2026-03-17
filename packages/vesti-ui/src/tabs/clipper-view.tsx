"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Copy,
  Save,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  AlertCircle,
} from "lucide-react";
import type { Conversation, Message, StorageApi, Note } from "../types";

type ClipperViewProps = {
  storage: StorageApi;
  conversations: Conversation[];
  onNoteCreated?: (note: Note) => void;
  isLibrarySidebarCollapsed?: boolean;
  onSidebarToggle?: () => void;
};

export function ClipperView({
  storage,
  conversations,
  onNoteCreated,
  isLibrarySidebarCollapsed = false,
  onSidebarToggle,
}: ClipperViewProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConversationId || !storage.getMessages) {
      setMessages([]);
      return;
    }

    setMessagesLoading(true);
    storage
      .getMessages(selectedConversationId)
      .then((data) => {
        setMessages(data);
        setSelectedMessages(new Set());
      })
      .catch((error) => {
        console.error("[clipper] Failed to load messages:", error);
        setMessages([]);
      })
      .finally(() => setMessagesLoading(false));
  }, [selectedConversationId, storage]);

  // Get selected message content
  const selectedMessageContent = useMemo(() => {
    if (selectedMessages.size === 0) return "";
    const selectedIds = Array.from(selectedMessages);
    return messages
      .filter((m) => selectedIds.includes(m.id))
      .map((m) => `**${m.role}:**\n${m.content_text}`)
      .join("\n\n---\n\n");
  }, [messages, selectedMessages]);

  // Update draft content when messages are selected
  useEffect(() => {
    if (selectedMessageContent) {
      setDraftContent(selectedMessageContent);
    }
  }, [selectedMessageContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [draftContent]);

  // Handle keyboard shortcut for saving (Ctrl+Shift+S or Cmd+Shift+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
        e.preventDefault();
        void handleSaveNote();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [draftTitle, draftContent, selectedConversationId]);

  const toggleMessageSelection = (messageId: number) => {
    const newSet = new Set(selectedMessages);
    if (newSet.has(messageId)) {
      newSet.delete(messageId);
    } else {
      newSet.add(messageId);
    }
    setSelectedMessages(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedMessages.size === messages.length) {
      setSelectedMessages(new Set());
    } else {
      setSelectedMessages(new Set(messages.map((m) => m.id)));
    }
  };

  const handleCopyDraft = () => {
    const text = draftTitle ? `${draftTitle}\n\n${draftContent}` : draftContent;
    navigator.clipboard.writeText(text).then(() => {
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    });
  };

  const handleSaveNote = async () => {
    if (!draftTitle.trim() || !storage.saveNote) {
      alert("Please enter a title for your note");
      return;
    }

    setIsSaving(true);
    setSaveStatus("saving");

    try {
      const newNote = await storage.saveNote({
        title: draftTitle.trim(),
        content: draftContent,
        linked_conversation_ids: selectedConversationId ? [selectedConversationId] : [],
      });

      setSaveStatus("success");
      setDraftTitle("");
      setDraftContent("");
      setSelectedMessages(new Set());

      setTimeout(() => {
        setSaveStatus("idle");
        onNoteCreated?.(newNote);
      }, 1500);
    } catch (error) {
      console.error("[clipper] Failed to save note:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const canSaveNote = draftTitle.trim().length > 0 && draftContent.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border-subtle px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-normal text-text-primary">Message Clipper</h1>
            <p className="text-sm font-sans text-text-tertiary mt-1">
              Select messages to save as a note
            </p>
          </div>
          {onSidebarToggle && (
            <button
              onClick={onSidebarToggle}
              className="p-2 hover:bg-bg-surface-card rounded-lg transition-colors text-text-secondary"
              title={isLibrarySidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            >
              {isLibrarySidebarCollapsed ? (
                <PanelLeftOpen strokeWidth={1.5} className="w-5 h-5" />
              ) : (
                <PanelLeftClose strokeWidth={1.5} className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Left panel - Conversation selector and message list */}
        <div className="w-80 border-r border-border-subtle flex flex-col overflow-hidden">
          {/* Conversation selector */}
          <div className="p-4 border-b border-border-subtle">
            <label className="block text-sm font-sans font-medium text-text-primary mb-2">
              Select Conversation
            </label>
            <select
              value={selectedConversationId ?? ""}
              onChange={(e) => {
                setSelectedConversationId(e.target.value ? parseInt(e.target.value) : null);
              }}
              className="w-full rounded-md border border-border-subtle bg-bg-surface-card px-3 py-2 text-sm font-sans text-text-primary outline-none focus:border-accent-primary"
            >
              <option value="">Choose a conversation...</option>
              {conversations.map((conv) => (
                <option key={conv.id} value={conv.id}>
                  {conv.title}
                </option>
              ))}
            </select>
          </div>

          {/* Messages list */}
          {selectedConversationId ? (
            <>
              <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                <span className="text-xs font-sans font-medium text-text-tertiary uppercase tracking-wider">
                  Messages ({messages.length})
                </span>
                {messages.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs font-sans text-accent-primary hover:text-accent-primary/80 transition-colors"
                  >
                    {selectedMessages.size === messages.length ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>

              {messagesLoading ? (
                <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
                  Loading messages...
                </div>
              ) : messages.length > 0 ? (
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-2 p-3">
                    {messages.map((message) => (
                      <button
                        key={message.id}
                        onClick={() => toggleMessageSelection(message.id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors border-2 ${
                          selectedMessages.has(message.id)
                            ? "bg-accent-primary/10 border-accent-primary"
                            : "bg-bg-surface-card border-border-subtle hover:bg-bg-surface-card-hover"
                        }`}
                      >
                        <div className="flex items-start gap-2 mb-1">
                          <span className="text-xs font-sans font-semibold text-accent-primary capitalize">
                            {message.role}
                          </span>
                        </div>
                        <p className="text-[12px] font-sans text-text-secondary line-clamp-3">
                          {message.content_text}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
                  No messages in this conversation
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-tertiary">
              <div className="text-center">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a conversation to start</p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel - Draft editor */}
        <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
          {selectedConversationId ? (
            <>
              {/* Draft info */}
              <div className="px-6 py-4 border-b border-border-subtle">
                <div className="text-sm font-sans text-text-secondary">
                  {selectedMessages.size > 0 ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-primary/20 text-accent-primary text-xs font-medium">
                        {selectedMessages.size}
                      </span>
                      message{selectedMessages.size !== 1 ? "s" : ""} selected
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-text-tertiary">
                      <AlertCircle strokeWidth={1.5} className="w-4 h-4" />
                      Select messages to create draft
                    </span>
                  )}
                </div>
              </div>

              {/* Title input */}
              <div className="px-6 py-4 border-b border-border-subtle space-y-2">
                <label className="block text-sm font-sans font-medium text-text-primary">
                  Draft Title
                </label>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Enter title for this note..."
                  className="w-full rounded-md border border-border-subtle bg-bg-surface-card px-3 py-2 text-base font-sans text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent-primary"
                />
              </div>

              {/* Content editor */}
              <div className="flex-1 flex flex-col px-6 py-4 overflow-hidden">
                <label className="block text-sm font-sans font-medium text-text-primary mb-2">
                  Draft Content
                </label>
                <textarea
                  ref={textareaRef}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Selected messages will appear here..."
                  className="flex-1 rounded-md border border-border-subtle bg-bg-surface-card px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent-primary resize-none overflow-y-auto"
                />
              </div>

              {/* Action buttons */}
              <div className="px-6 py-4 border-t border-border-subtle space-y-3">
                <button
                  onClick={handleSaveNote}
                  disabled={!canSaveNote || isSaving}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-sans font-medium transition-colors ${
                    canSaveNote && !isSaving
                      ? "bg-accent-primary text-white hover:bg-accent-primary/90"
                      : "bg-bg-surface-card text-text-tertiary cursor-not-allowed"
                  }`}
                >
                  <Save strokeWidth={1.5} className="w-4 h-4" />
                  {saveStatus === "saving" ? "Saving..." : "Save as Note"}
                  {saveStatus === "success" && " ✓"}
                </button>

                <button
                  onClick={handleCopyDraft}
                  disabled={draftContent.trim().length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-sans font-medium text-text-primary bg-bg-surface-card hover:bg-bg-surface-card-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Copy strokeWidth={1.5} className="w-4 h-4" />
                  Copy to Clipboard
                  {saveStatus === "success" && " ✓"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-tertiary">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-base font-sans">Select a conversation to start clipping</p>
                <p className="text-xs font-sans text-text-tertiary mt-2">
                  You can create notes from selected messages
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
