"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, MessageSquare, Trash2, Sparkles } from "lucide-react";
import type { NoteBlock, Message } from "../types";

type NoteBlockEditorProps = {
  blocks?: NoteBlock[];
  messages?: Message[];
  onBlocksChange?: (blocks: NoteBlock[]) => void;
  onSave?: () => void;
  readOnly?: boolean;
  slashTriggerNonce?: number;
};

type SlashCommandId = "note" | "annotate" | "compress" | "extract-code";

type SlashCommand = {
  id: SlashCommandId;
  label: string;
  description: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "note",
    label: "/note",
    description: "Create a new note block below the current block.",
  },
  {
    id: "annotate",
    label: "/annotate",
    description: "Insert an annotation block below current block.",
  },
  {
    id: "compress",
    label: "/compress",
    description: "Compress current block content into a shorter summary.",
  },
  {
    id: "extract-code",
    label: "/extract-code",
    description: "Extract fenced code snippets into separate text blocks.",
  },
];

export function NoteBlockEditor({
  blocks = [],
  messages = [],
  onBlocksChange,
  onSave,
  readOnly = false,
  slashTriggerNonce,
}: NoteBlockEditorProps) {
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [expandedLongTextBlocks, setExpandedLongTextBlocks] = useState<Set<string>>(new Set());
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const lastHandledSlashTrigger = useRef<number>(0);

  const LONG_TEXT_CHAR_LIMIT = 280;

  const toggleLongTextExpand = useCallback((blockId: string) => {
    setExpandedLongTextBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const toggleBlockExpand = useCallback((blockId: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const updateBlock = useCallback(
    (blockId: string, updates: Partial<NoteBlock>) => {
      const updated = blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b));
      onBlocksChange?.(updated);
    },
    [blocks, onBlocksChange]
  );

  const deleteBlock = useCallback(
    (blockId: string) => {
      const idsToDelete = new Set<string>([blockId]);
      let changed = true;
      while (changed) {
        changed = false;
        blocks.forEach((block) => {
          if (block.parentBlockId && idsToDelete.has(block.parentBlockId) && !idsToDelete.has(block.id)) {
            idsToDelete.add(block.id);
            changed = true;
          }
        });
      }
      const filtered = blocks.filter((b) => !idsToDelete.has(b.id));
      onBlocksChange?.(filtered);
    },
    [blocks, onBlocksChange]
  );

  const insertBlocksAfter = useCallback(
    (targetBlockId: string, newBlocks: NoteBlock[]) => {
      const index = blocks.findIndex((b) => b.id === targetBlockId);
      if (index === -1) {
        onBlocksChange?.([...blocks, ...newBlocks]);
        return;
      }
      const next = [...blocks];
      next.splice(index + 1, 0, ...newBlocks);
      onBlocksChange?.(next);
    },
    [blocks, onBlocksChange]
  );

  const startEditing = (blockId: string, content: string) => {
    setEditingBlockId(blockId);
    setEditingContent(content);
  };

  const getSlashToken = useCallback((value: string): string | null => {
    const match = value.match(/(?:^|\s)\/([a-z-]*)$/i);
    if (!match) return null;
    return match[1].toLowerCase();
  }, []);

  const stripTrailingSlashCommand = useCallback((value: string): string => {
    if (!/(?:^|\s)\/[a-z-]*$/i.test(value)) {
      return value;
    }
    return value.replace(/(?:^|\s)\/[a-z-]*$/i, "").trimEnd();
  }, []);

  const finishEditing = (blockId: string) => {
    if (editingBlockId === blockId) {
      const cleanedContent = stripTrailingSlashCommand(editingContent);
      updateBlock(blockId, {
        data: {
          ...blocks.find((b) => b.id === blockId)?.data,
          text: cleanedContent,
        },
      });
      setEditingBlockId(null);
      setSlashSelectedIndex(0);
      onSave?.();
    }
  };

  const getSlashQuery = useCallback((value: string): string | null => {
    return getSlashToken(value);
  }, [getSlashToken]);

  const slashQuery = editingBlockId ? getSlashQuery(editingContent) : null;
  const visibleSlashCommands = useMemo(() => {
    if (slashQuery === null) return [];
    if (!slashQuery) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((command) => command.id.includes(slashQuery));
  }, [slashQuery]);

  const compressText = useCallback((value: string): string => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.length <= 180) return normalized;
    const parts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    const candidate = parts.slice(0, 2).join(" ").trim();
    if (candidate && candidate.length <= 220) {
      return candidate;
    }
    return `${normalized.slice(0, 180)}...`;
  }, []);

  const extractCodeBlocks = useCallback((value: string): string[] => {
    const snippets: string[] = [];
    const fenceRegex = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null = fenceRegex.exec(value);
    while (match) {
      const lang = (match[1] || "text").trim();
      const code = (match[2] || "").trim();
      if (code) {
        snippets.push(`\`\`\`${lang}\n${code}\n\`\`\``);
      }
      match = fenceRegex.exec(value);
    }
    return snippets;
  }, []);

  const executeSlashCommand = useCallback(
    (commandId: SlashCommandId, block: NoteBlock) => {
      const editedSourceText = stripTrailingSlashCommand(editingContent).trim();
      const sourceText = editedSourceText || block.data.text || "";

      if (commandId === "note") {
        if (editedSourceText !== (block.data.text || "")) {
          updateBlock(block.id, {
            data: {
              ...block.data,
              text: editedSourceText,
            },
          });
        }
        const textBlock: NoteBlock = {
          id: `text-${Date.now()}`,
          type: "text",
          data: { text: "" },
        };
        insertBlocksAfter(block.id, [textBlock]);
        setEditingBlockId(textBlock.id);
        setEditingContent("");
        setSlashSelectedIndex(0);
        onSave?.();
        return;
      }

      if (commandId === "annotate") {
        if (editedSourceText !== (block.data.text || "")) {
          updateBlock(block.id, {
            data: {
              ...block.data,
              text: editedSourceText,
            },
          });
        }
        const annotationBlock: NoteBlock = {
          id: `annotation-${Date.now()}`,
          type: "annotation",
          parentBlockId: block.id,
          data: { text: "" },
        };
        insertBlocksAfter(block.id, [annotationBlock]);
        setEditingBlockId(annotationBlock.id);
        setEditingContent("");
        setSlashSelectedIndex(0);
        return;
      }

      if (commandId === "compress") {
        const compressed = compressText(sourceText);
        if (!compressed) {
          setEditingContent(sourceText);
          setSlashSelectedIndex(0);
          return;
        }
        if (editedSourceText && editedSourceText !== (block.data.text || "")) {
          updateBlock(block.id, {
            data: {
              ...block.data,
              text: editedSourceText,
            },
          });
        }
        const compressedBlock: NoteBlock = {
          id: `compressed-${Date.now()}`,
          type: "compressed_context",
          parentBlockId: block.id,
          data: { text: compressed },
        };
        insertBlocksAfter(block.id, [compressedBlock]);
        updateBlock(block.id, { collapsed: true });
        setEditingBlockId(null);
        setEditingContent("");
        setSlashSelectedIndex(0);
        onSave?.();
        return;
      }

      const snippets = extractCodeBlocks(sourceText);
      if (snippets.length === 0) {
        setEditingContent(sourceText);
        setSlashSelectedIndex(0);
        return;
      }
      if (editedSourceText && editedSourceText !== (block.data.text || "")) {
        updateBlock(block.id, {
          data: {
            ...block.data,
            text: editedSourceText,
          },
        });
      }
      const snippetBlocks: NoteBlock[] = snippets.map((snippet, index) => ({
        id: `text-code-${Date.now()}-${index}`,
        type: "text",
        data: { text: snippet },
      }));
      insertBlocksAfter(block.id, snippetBlocks);
      setEditingBlockId(null);
      setEditingContent("");
      setSlashSelectedIndex(0);
      onSave?.();
    },
    [compressText, editingContent, extractCodeBlocks, insertBlocksAfter, onSave, stripTrailingSlashCommand, updateBlock]
  );

  const onEditorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>, block: NoteBlock) => {
      if (slashQuery !== null && visibleSlashCommands.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSlashSelectedIndex((prev) => (prev + 1) % visibleSlashCommands.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSlashSelectedIndex((prev) =>
            prev === 0 ? visibleSlashCommands.length - 1 : prev - 1
          );
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const selected = visibleSlashCommands[slashSelectedIndex] || visibleSlashCommands[0];
          executeSlashCommand(selected.id, block);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setEditingContent(stripTrailingSlashCommand(editingContent));
          setSlashSelectedIndex(0);
          return;
        }
      }

      if (event.key === "Enter" && event.metaKey) {
        finishEditing(block.id);
      }
    },
    [editingContent, executeSlashCommand, slashQuery, slashSelectedIndex, stripTrailingSlashCommand, visibleSlashCommands]
  );

  const getCollapsedText = useCallback((value: string) => {
    if (value.length <= LONG_TEXT_CHAR_LIMIT) return value;
    return `${value.slice(0, LONG_TEXT_CHAR_LIMIT)}...`;
  }, []);

  const renderMessageGroup = (block: NoteBlock) => {
    const isExpanded = expandedBlocks.has(block.id);
    const messageIds = block.data.messageIds || [];
    const blockMessages = messages.filter((m) => messageIds.includes(m.id));
    const preview =
      blockMessages.length > 0
        ? blockMessages[0].content_text.slice(0, 60)
        : `Message IDs: ${messageIds.join(", ") || "none"}`;

    return (
      <div key={block.id} className="mb-4 rounded-lg border border-border-subtle bg-bg-surface-card">
        <button
          onClick={() => toggleBlockExpand(block.id)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-bg-surface-card-hover transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-secondary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-secondary" />
          )}
          <span className="text-xs font-sans font-medium text-text-tertiary uppercase tracking-wider rounded border border-border-subtle px-2 py-0.5">
            Message Group
          </span>
          <span className="text-sm font-sans text-text-secondary flex-1">
            {messageIds.length} messages • {preview}...
          </span>
        </button>

        {isExpanded && (
          <div className="border-t border-border-subtle bg-bg-primary p-4 space-y-2">
            {blockMessages.map((msg) => (
              <div key={msg.id} className="text-sm font-sans text-text-secondary p-2 rounded bg-bg-surface-card">
                <span className="inline-block px-2 py-1 mb-1 text-xs font-medium text-accent-primary capitalize bg-accent-primary/10 rounded">
                  {msg.role}
                </span>
                <p className="mt-1 leading-relaxed">{msg.content_text}</p>
              </div>
            ))}
            {blockMessages.length === 0 && (
              <div className="text-xs font-sans text-text-tertiary">
                Linked conversation messages are not loaded for this note yet.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderAnnotation = (block: NoteBlock) => {
    const isEditing = editingBlockId === block.id && !readOnly;
    const fullText = block.data.text || "";
    const isLongText = fullText.length > LONG_TEXT_CHAR_LIMIT;
    const isExpanded = expandedLongTextBlocks.has(block.id);
    const visibleText = isExpanded ? fullText : getCollapsedText(fullText);

    return (
      <div key={block.id} className="ml-8 mb-3 p-4 rounded-lg border-l-4 border-accent-primary bg-accent-primary/5">
        <div className="flex items-start gap-2 mb-2">
          <MessageSquare className="w-4 h-4 text-accent-primary mt-0.5 flex-shrink-0" />
          <span className="text-xs font-sans font-medium text-accent-primary uppercase rounded border border-accent-primary/40 px-2 py-0.5">
            Annotation
          </span>
        </div>

        {isEditing ? (
          <div className="relative">
            <textarea
              autoFocus
              value={editingContent}
              onChange={(e) => {
                setEditingContent(e.target.value);
                setSlashSelectedIndex(0);
              }}
              onBlur={() => finishEditing(block.id)}
              onKeyDown={(e) => onEditorKeyDown(e, block)}
              className="w-full p-2 rounded border border-border-subtle bg-bg-surface-card text-sm font-sans text-text-primary outline-none focus:border-accent-primary resize-none"
              rows={3}
              placeholder="Type / for commands"
            />
            {editingBlockId === block.id && slashQuery !== null && visibleSlashCommands.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 rounded-md border border-border-subtle bg-bg-primary shadow-sm z-20">
                {visibleSlashCommands.map((command, index) => (
                  <button
                    key={command.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => executeSlashCommand(command.id, block)}
                    className={`w-full px-3 py-2 text-left hover:bg-bg-surface-card ${
                      index === slashSelectedIndex ? "bg-bg-surface-card" : ""
                    }`}
                  >
                    <div className="text-xs font-sans text-text-primary">{command.label}</div>
                    <div className="text-[11px] font-sans text-text-tertiary">{command.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p
              onClick={() => !readOnly && startEditing(block.id, block.data.text || "")}
              className={`text-sm font-sans text-text-secondary leading-relaxed rounded p-2 transition-colors whitespace-pre-wrap ${
                !block.data.text ? "italic text-text-tertiary" : ""
              } ${!readOnly && "cursor-text hover:bg-accent-primary/10"}`}
            >
              {block.data.text ? visibleText : "Click to add annotation..."}
            </p>
            {isLongText && (
              <button
                onClick={() => toggleLongTextExpand(block.id)}
                className="mt-1 text-xs font-sans text-accent-primary hover:text-accent-primary/80 transition-colors"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </button>
            )}
          </div>
        )}

        {!readOnly && (
          <button
            onClick={() => deleteBlock(block.id)}
            className="mt-2 text-xs font-sans text-text-tertiary hover:text-[#B42318] transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        )}
      </div>
    );
  };

  const renderTextBlock = (block: NoteBlock) => {
    const isEditing = editingBlockId === block.id && !readOnly;
    const fullText = block.data.text || "";
    const isLongText = fullText.length > LONG_TEXT_CHAR_LIMIT;
    const isExpanded = expandedLongTextBlocks.has(block.id);
    const visibleText = isExpanded ? fullText : getCollapsedText(fullText);

    return (
      <div key={block.id} className="mb-4 rounded-lg border border-border-subtle bg-bg-surface-card p-3">
        <div className="mb-2 text-xs font-sans font-medium text-text-tertiary uppercase tracking-wider rounded border border-border-subtle px-2 py-0.5 inline-block">
          Text Block
        </div>
        {isEditing ? (
          <div className="relative">
            <textarea
              autoFocus
              value={editingContent}
              onChange={(e) => {
                setEditingContent(e.target.value);
                setSlashSelectedIndex(0);
              }}
              onBlur={() => finishEditing(block.id)}
              onKeyDown={(e) => onEditorKeyDown(e, block)}
              className="w-full p-3 rounded border border-border-subtle bg-bg-surface-card text-sm font-sans text-text-primary outline-none focus:border-accent-primary resize-none"
              rows={4}
              placeholder="Type / for commands"
            />
            {editingBlockId === block.id && slashQuery !== null && visibleSlashCommands.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 rounded-md border border-border-subtle bg-bg-primary shadow-sm z-20">
                {visibleSlashCommands.map((command, index) => (
                  <button
                    key={command.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => executeSlashCommand(command.id, block)}
                    className={`w-full px-3 py-2 text-left hover:bg-bg-surface-card ${
                      index === slashSelectedIndex ? "bg-bg-surface-card" : ""
                    }`}
                  >
                    <div className="text-xs font-sans text-text-primary">{command.label}</div>
                    <div className="text-[11px] font-sans text-text-tertiary">{command.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p
              onClick={() => !readOnly && startEditing(block.id, block.data.text || "")}
              className={`text-sm font-sans text-text-secondary leading-relaxed rounded p-2 transition-colors whitespace-pre-wrap ${
                !readOnly && "cursor-text hover:bg-bg-surface-card"
              }`}
            >
              {block.data.text ? visibleText : "Click to add text..."}
            </p>
            {isLongText && (
              <button
                onClick={() => toggleLongTextExpand(block.id)}
                className="mt-1 text-xs font-sans text-accent-primary hover:text-accent-primary/80 transition-colors"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCompressedContextBlock = (block: NoteBlock) => {
    const isEditing = editingBlockId === block.id && !readOnly;
    const fullText = block.data.text || "";
    const isLongText = fullText.length > LONG_TEXT_CHAR_LIMIT;
    const isExpanded = expandedLongTextBlocks.has(block.id);
    const visibleText = isExpanded ? fullText : getCollapsedText(fullText);

    return (
      <div key={block.id} className="mb-4 rounded-lg border border-accent-primary/40 bg-accent-primary/5 p-3">
        <div className="mb-2 inline-flex items-center gap-1 rounded border border-accent-primary/40 px-2 py-0.5 text-xs font-sans font-medium uppercase tracking-wider text-accent-primary">
          <Sparkles className="h-3 w-3" />
          Compressed Context
        </div>
        {isEditing ? (
          <textarea
            autoFocus
            value={editingContent}
            onChange={(e) => {
              setEditingContent(e.target.value);
              setSlashSelectedIndex(0);
            }}
            onBlur={() => finishEditing(block.id)}
            onKeyDown={(e) => onEditorKeyDown(e, block)}
            className="w-full rounded border border-border-subtle bg-bg-surface-card p-3 text-sm font-sans text-text-primary outline-none focus:border-accent-primary resize-none"
            rows={4}
            placeholder="Type / for commands"
          />
        ) : (
          <div>
            <p
              onClick={() => !readOnly && startEditing(block.id, block.data.text || "")}
              className={`rounded p-2 text-sm font-sans leading-relaxed text-text-primary whitespace-pre-wrap transition-colors ${
                !readOnly && "cursor-text hover:bg-accent-primary/10"
              }`}
            >
              {block.data.text ? visibleText : "Compressed summary will appear here..."}
            </p>
            {isLongText && (
              <button
                onClick={() => toggleLongTextExpand(block.id)}
                className="mt-1 text-xs font-sans text-accent-primary hover:text-accent-primary/80 transition-colors"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const rootBlocks = useMemo(() => blocks.filter((b) => !b.parentBlockId), [blocks]);
  const getChildAnnotations = useCallback(
    (parentId: string) => blocks.filter((b) => b.type === "annotation" && b.parentBlockId === parentId),
    [blocks]
  );

  useEffect(() => {
    if (readOnly) return;
    if (!slashTriggerNonce) return;
    if (slashTriggerNonce === lastHandledSlashTrigger.current) return;
    lastHandledSlashTrigger.current = slashTriggerNonce;

    const editableBlock = blocks.find((block) => block.type !== "message-group");
    if (editableBlock) {
      setEditingBlockId(editableBlock.id);
      setEditingContent("/");
      setSlashSelectedIndex(0);
      return;
    }

    const newTextBlock: NoteBlock = {
      id: `text-${Date.now()}`,
      type: "text",
      data: { text: "" },
    };
    onBlocksChange?.([...blocks, newTextBlock]);
    setEditingBlockId(newTextBlock.id);
    setEditingContent("/");
    setSlashSelectedIndex(0);
  }, [blocks, onBlocksChange, readOnly, slashTriggerNonce]);

  return (
    <div className="space-y-4">
      {rootBlocks.map((block) => {
        const childAnnotations = getChildAnnotations(block.id);

        let mainBlock: ReactNode;
        if (block.type === "message-group") {
          mainBlock = renderMessageGroup(block);
        } else if (block.type === "annotation") {
          mainBlock = renderAnnotation(block);
        } else if (block.type === "compressed_context") {
          mainBlock = renderCompressedContextBlock(block);
        } else {
          mainBlock = renderTextBlock(block);
        }

        return (
          <div key={block.id}>
            {mainBlock}
            {childAnnotations.map((annotation) => renderAnnotation(annotation))}
          </div>
        );
      })}

      {blocks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-tertiary text-sm">No blocks yet. Type /note in any block to create your first note block.</p>
        </div>
      )}
    </div>
  );
}
