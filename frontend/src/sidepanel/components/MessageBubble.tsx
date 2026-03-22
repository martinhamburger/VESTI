import { formatArtifactDescriptor, getArtifactExcerptText } from "@vesti/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Check, ChevronDown, Link2 } from "lucide-react";
import type { Message, Platform } from "~lib/types";
import type { AstRoot } from "~lib/types/ast";
import { AstMessageRenderer } from "./AstMessageRenderer";
import { DisclosureSection } from "./DisclosureSection";
import { PLATFORM_TONE } from "./platformTone";
import {
  buildFallbackSegments,
  buildHighlightSegments,
  resolveMessageRenderPlan,
  type MessageRenderPlan,
  type OccurrenceIndexMap,
} from "../lib/readerSearch";

const COLLAPSE_THRESHOLD_PX = 110;
const COLLAPSED_MAX_HEIGHT_PX = 86;
const COLLAPSE_FADE_HEIGHT_PX = 37;
const COPY_FEEDBACK_MS = 1400;
const FENCE_LANGUAGE_PATTERN = /^[a-z0-9+#.-]{1,24}$/i;
const FENCE_LANGUAGE_NOISE_TOKENS = new Set([
  "copy",
  "copied",
  "code",
  "plain",
  "plaintext",
  "text",
]);

interface MessageBubbleProps {
  message: Message;
  platform: Platform;
  renderPlan?: MessageRenderPlan | null;
  occurrenceIndexMap?: OccurrenceIndexMap | null;
  currentIndex?: number | null;
}

export function MessageBubble({
  message,
  platform,
  renderPlan,
  occurrenceIndexMap,
  currentIndex,
}: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canCollapse, setCanCollapse] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const plan = renderPlan ?? resolveMessageRenderPlan(message, platform);
  const shouldUseAst = plan.mode === "ast" && plan.renderAst;
  const indexMap = occurrenceIndexMap ?? {};
  const activeIndex = typeof currentIndex === "number" ? currentIndex : null;

  const renderHighlightSegments = (text: string, nodeKey: string) => {
    const segments = buildHighlightSegments(text, indexMap[nodeKey]);
    if (segments.length === 1 && segments[0].occurrenceIndex === null) {
      return segments[0].text;
    }
    return segments.map((segment, index) => {
      if (segment.occurrenceIndex === null) {
        return <span key={`tx-${nodeKey}-${index}`}>{segment.text}</span>;
      }
      const isActive = segment.occurrenceIndex === activeIndex;
      const className = isActive
        ? "rounded-xs bg-accent-primary px-0.5 text-text-inverse ring-1 ring-border-focus"
        : "rounded-xs bg-accent-primary-light px-0.5 text-text-primary ring-1 ring-border-focus";
      return (
        <mark
          key={`hl-${nodeKey}-${index}`}
          data-occurrence-index={segment.occurrenceIndex}
          className={className}
        >
          {segment.text}
        </mark>
      );
    });
  };

  const isAi = message.role === "ai";
  const shouldCollapse = canCollapse && !isExpanded;

  useLayoutEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) {
      setCanCollapse(false);
      return;
    }

    let frameId = 0;
    const measure = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        const nextCanCollapse = bodyEl.scrollHeight > COLLAPSE_THRESHOLD_PX;
        setCanCollapse((prev) => (prev === nextCanCollapse ? prev : nextCanCollapse));
      });
    };

    measure();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(bodyEl);
    }

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      observer?.disconnect();
    };
  }, [message.id, message.content_text, plan.mode, plan.renderAst]);

  useEffect(() => {
    if (!canCollapse) {
      setIsExpanded(false);
    }
  }, [canCollapse]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content_text).catch(() => {});
    setCopied(true);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, COPY_FEEDBACK_MS);
  };

  return (
    <div className={`reader-turn ${isAi ? "reader-turn-ai" : "reader-turn-user"}`}>
      <div className="reader-turn-header">
        <span
          className={`reader-role-label ${
            isAi
              ? `reader-role-label-model ${PLATFORM_TONE[platform].text}`
              : "reader-role-label-user"
          }`}
        >
          {isAi ? platform : "You"}
        </span>

        <button
          type="button"
          aria-label="Copy message"
          onClick={handleCopy}
          className="reader-turn-copy-btn"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
        </button>
      </div>

      <div
        className={`reader-turn-body-wrap ${shouldCollapse ? "is-collapsed" : ""} ${canCollapse ? "with-expand" : ""}`}
        style={shouldCollapse ? { maxHeight: `${COLLAPSED_MAX_HEIGHT_PX}px` } : undefined}
      >
        <div
          ref={bodyRef}
          className={`reader-turn-body ${isAi ? "reader-turn-body-model" : "reader-turn-body-user"}`}
        >
          {shouldUseAst && plan.renderAst ? (
            <AstMessageRenderer
              root={plan.renderAst as AstRoot}
              messageId={message.id}
              occurrenceIndexMap={indexMap}
              currentIndex={activeIndex}
            />
          ) : (
            <div className="reader-fallback-content whitespace-pre-wrap">
              {renderFallbackContent(message.content_text, message.id, renderHighlightSegments)}
            </div>
          )}
        </div>
        {shouldCollapse ? (
          <div
            className="reader-turn-fade-mask"
            style={{ height: `${COLLAPSE_FADE_HEIGHT_PX}px` }}
          />
        ) : null}
      </div>

      {(message.citations ?? []).length > 0 ? (
        <div className="mt-3">
          <DisclosureSection
            title="Sources"
            description={`${message.citations?.length ?? 0} linked source${(message.citations?.length ?? 0) === 1 ? "" : "s"}`}
            icon={<Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            <div className="space-y-2">
              {(message.citations ?? []).map((citation) => (
                <a
                  key={citation.href}
                  href={citation.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-border-subtle bg-bg-primary/80 px-3 py-2 transition-colors hover:bg-bg-secondary/70"
                >
                  <div className="text-[12px] font-medium text-text-primary">
                    {citation.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-tertiary">
                    {citation.host}
                  </div>
                </a>
              ))}
            </div>
          </DisclosureSection>
        </div>
      ) : null}

      {(message.artifacts ?? []).length > 0 ? (
        <div className="mt-3">
          <DisclosureSection
            title="Artifacts"
            description={`${message.artifacts?.length ?? 0} captured artifact${(message.artifacts?.length ?? 0) === 1 ? "" : "s"}`}
          >
            <div className="space-y-2">
              {(message.artifacts ?? []).map((artifact, index) => {
                const excerpt = getArtifactExcerptText(artifact, {
                  maxLines: 2,
                  maxCharsPerLine: 100,
                });

                return (
                  <div
                    key={`${artifact.kind}-${artifact.label ?? index}`}
                    className="rounded-lg border border-border-subtle bg-bg-primary/80 px-3 py-2"
                  >
                    <div className="text-[12px] font-medium text-text-primary">
                      {artifact.label || artifact.kind}
                    </div>
                    <div className="mt-0.5 text-[11px] text-text-tertiary">
                      {formatArtifactDescriptor(artifact)}
                    </div>
                    {excerpt ? (
                      <div className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-text-secondary">
                        {excerpt}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </DisclosureSection>
        </div>
      ) : null}

      <div className={`reader-expand-row ${canCollapse ? "has-btn" : ""}`}>
        {canCollapse ? (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`reader-expand-btn ${isExpanded ? "open" : ""}`}
          >
            {isExpanded ? "Collapse" : "Expand"}
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function renderFallbackContent(
  text: string,
  messageId: number,
  renderHighlightedText: (text: string, nodeKey: string) => React.ReactNode
): React.ReactNode {
  const segments = buildFallbackSegments(text, messageId);
  return segments.map((segment, index) => {
    if (segment.type === "code_block") {
      const { code, language } = parseFallbackFencedCode(segment.text);
      return <FallbackCodeBlockView key={`code-${index}`} code={code} language={language} />;
    }
    if (segment.type === "bold") {
      return (
        <strong key={`bold-${index}`}>
          {renderHighlightedText(segment.text, segment.nodeKey)}
        </strong>
      );
    }
    return (
      <span key={`text-${index}`}>
        {renderHighlightedText(segment.text, segment.nodeKey)}
      </span>
    );
  });
}

interface FallbackCodeBlockViewProps {
  code: string;
  language: string;
}

function FallbackCodeBlockView({ code, language }: FallbackCodeBlockViewProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, COPY_FEEDBACK_MS);
  };

  return (
    <div className="reader-ast-code-block">
      <div className="reader-ast-code-head">
        <span className="reader-ast-code-lang">{language}</span>
        <button
          type="button"
          className="reader-ast-code-copy"
          onClick={handleCopy}
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" strokeWidth={1.75} /> : <Copy className="h-3 w-3" strokeWidth={1.75} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="reader-ast-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseFallbackFencedCode(part: string): { code: string; language: string } {
  const raw = part.slice(3, -3).replace(/^\r?\n/, "");
  const normalized = raw.replace(/\r\n?/g, "\n").trimEnd();
  const firstNewline = normalized.indexOf("\n");

  if (firstNewline < 0) {
    return {
      code: normalized,
      language: "plain",
    };
  }

  const maybeLanguage = normalizeFenceLanguage(normalized.slice(0, firstNewline));
  if (!maybeLanguage) {
    return {
      code: normalized,
      language: "plain",
    };
  }

  return {
    code: normalized.slice(firstNewline + 1),
    language: maybeLanguage,
  };
}

function normalizeFenceLanguage(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const prefixed = normalized.match(/^(?:language|lang)[:_\-\s]*([a-z0-9+#.-]{1,24})$/i);
  const token = (prefixed?.[1] ?? normalized).toLowerCase();
  if (!FENCE_LANGUAGE_PATTERN.test(token) || FENCE_LANGUAGE_NOISE_TOKENS.has(token)) {
    return null;
  }
  return token;
}

