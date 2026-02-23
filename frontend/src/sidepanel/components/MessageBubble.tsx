import { useState } from "react";
import { Copy, Check, ChevronDown } from "lucide-react";
import type { Message, Platform } from "~lib/types";
import type { AstRoot } from "~lib/types/ast";
import { AstMessageRenderer } from "./AstMessageRenderer";

const COLLAPSE_THRESHOLD = 500;

interface MessageBubbleProps {
  message: Message;
  platform: Platform;
}

export function MessageBubble({ message, platform }: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLong = message.content_text.length > COLLAPSE_THRESHOLD;
  const shouldCollapse = isLong && !isExpanded;
  const isAi = message.role === "ai";
  const hasAst =
    message.content_ast_version === "ast_v1" &&
    !!message.content_ast &&
    message.content_ast.type === "root" &&
    message.content_ast.children.length > 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content_text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <span className="mb-1 block text-vesti-xs font-medium text-text-tertiary">
        {isAi ? platform : "You"}
      </span>

      <div
        className={`relative rounded-md px-3 py-3 ${
          isAi ? "bg-surface-ai-message" : ""
        }`}
      >
        <button
          type="button"
          aria-label="Copy message"
          onClick={handleCopy}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary opacity-0 pointer-events-none transition-[opacity,colors] [transition-duration:120ms] hover:bg-accent-primary-light hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
        </button>

        <div
          className={`relative transition-[max-height] duration-300 ease-in-out overflow-hidden ${
            shouldCollapse ? "max-h-[200px]" : "max-h-[100000px]"
          }`}
        >
          <div className="text-vesti-lg leading-[1.7] text-text-primary font-serif">
            {hasAst ? (
              <AstMessageRenderer root={message.content_ast as AstRoot} />
            ) : (
              <div className="whitespace-pre-wrap">{renderContent(message.content_text)}</div>
            )}
          </div>

          {shouldCollapse && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[60px] bg-gradient-to-t from-bg-tertiary to-transparent" />
          )}
        </div>

        {isLong && !isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="mt-1 flex items-center gap-1 text-vesti-sm font-medium text-accent-primary transition-colors [transition-duration:120ms] hover:text-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Expand
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}

function renderContent(text: string): React.ReactNode {
  const parts = text.split(/(```[\s\S]*?```|\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const code = part.slice(3, -3);
      const firstNewline = code.indexOf("\n");
      const codeBody = firstNewline > -1 ? code.slice(firstNewline + 1) : code;
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-sm bg-surface-ai-message p-3 font-mono text-[13px] leading-[1.85] text-text-primary"
        >
          <code>{codeBody}</code>
        </pre>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
