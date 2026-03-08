import { Check, Copy } from "lucide-react";
import katex from "katex";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { AstNode, AstRoot } from "~lib/types/ast";
import "katex/dist/katex.min.css";

const COPY_FEEDBACK_MS = 1400;
const LANGUAGE_TOKEN_PATTERN = /^[a-z0-9+#.-]{1,24}$/i;
const LANGUAGE_NOISE_TOKENS = new Set(["copy", "copied", "code", "plain", "plaintext", "text"]);
const BLOCKQUOTE_ATTRIBUTION_PATTERN = /^\s*[—-]\s*\S+/;

interface AstMessageRendererProps {
  root: AstRoot;
}

interface MathNodeViewProps {
  tex: string;
  display: boolean;
}

interface CodeBlockViewProps {
  code: string;
  language?: string | null;
}

interface TableNodeViewProps {
  headers: string[];
  rows: string[][];
}

function MathNodeView({ tex, display }: MathNodeViewProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        displayMode: display,
      });
    } catch {
      return "";
    }
  }, [display, tex]);

  if (!html) {
    return (
      <span className="reader-ast-math-fallback">
        {tex}
      </span>
    );
  }

  const className = display ? "reader-ast-math-block" : "reader-ast-math-inline";
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function CodeBlockView({ code, language }: CodeBlockViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div className="reader-ast-code-block">
      <div className="reader-ast-code-head">
        <span className="reader-ast-code-lang">{language || "plain"}</span>
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

function TableNodeView({ headers, rows }: TableNodeViewProps) {
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 1);
  const normalizedHeaders =
    headers.length > 0
      ? headers
      : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  const normalizedRows = rows.map((row) =>
    Array.from({ length: normalizedHeaders.length }, (_, index) => row[index] ?? ""),
  );

  return (
    <div className="reader-ast-table-wrap">
      <table className="reader-ast-table">
        <thead>
          <tr>
            {normalizedHeaders.map((header, index) => (
              <th key={`header-${index}`}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {normalizedRows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderNodes(nodes: AstNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => renderNode(node, `${keyPrefix}-${index}`));
}

function normalizeLanguageToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const prefixed = normalized.match(/^(?:language|lang)[:_\-\s]*([a-z0-9+#.-]{1,24})$/i);
  const token = (prefixed?.[1] ?? normalized).toLowerCase();
  if (!LANGUAGE_TOKEN_PATTERN.test(token) || LANGUAGE_NOISE_TOKENS.has(token)) {
    return null;
  }
  return token;
}

function extractLanguageLeakToken(node: AstNode): string | null {
  if (node.type === "text") {
    return normalizeLanguageToken(node.text);
  }
  if (node.type !== "p") {
    return null;
  }
  const text = astNodeToPlainText(node).trim();
  return normalizeLanguageToken(text);
}

function sanitizeLanguageLeakage(nodes: AstNode[]): AstNode[] {
  const sanitizedChildren = nodes.map((node) => {
    if (
      node.type === "fragment" ||
      node.type === "p" ||
      node.type === "h1" ||
      node.type === "h2" ||
      node.type === "h3" ||
      node.type === "ul" ||
      node.type === "ol" ||
      node.type === "li" ||
      node.type === "strong" ||
      node.type === "em" ||
      node.type === "blockquote"
    ) {
      return {
        ...node,
        children: sanitizeLanguageLeakage(node.children),
      };
    }
    return node;
  });

  const result: AstNode[] = [];
  for (let i = 0; i < sanitizedChildren.length; i += 1) {
    const current = sanitizedChildren[i];
    const next = sanitizedChildren[i + 1];
    if (next?.type === "code_block") {
      const codeLanguage = normalizeLanguageToken(next.language ?? null);
      const leakToken = current ? extractLanguageLeakToken(current) : null;
      if (codeLanguage && leakToken && codeLanguage === leakToken) {
        continue;
      }
    }
    result.push(current);
  }

  return result;
}

function sanitizeRootForRender(root: AstRoot): AstRoot {
  return {
    ...root,
    children: sanitizeLanguageLeakage(root.children),
  };
}

function astNodeToPlainText(node: AstNode): string {
  switch (node.type) {
    case "text":
      return node.text;
    case "fragment":
    case "p":
    case "h1":
    case "h2":
    case "h3":
    case "ul":
    case "ol":
    case "li":
    case "strong":
    case "em":
    case "blockquote":
      return node.children.map(astNodeToPlainText).join(" ");
    case "br":
      return "\n";
    case "code_inline":
      return node.text;
    case "code_block":
      return node.code;
    case "table": {
      const header = node.headers.join(" | ");
      const rows = node.rows.map((row) => row.join(" | "));
      return [header, ...rows].filter(Boolean).join("\n");
    }
    case "math":
      return node.tex;
    case "attachment":
      return node.name;
    default: {
      const exhaustiveGuard: never = node;
      return exhaustiveGuard;
    }
  }
}

function toParagraphNode(key: string, text: string): ReactNode {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }
  return <p key={key}>{normalized}</p>;
}

function renderUnsupportedAsParagraphs(node: AstNode, key: string): ReactNode {
  if (node.type === "attachment") {
    return toParagraphNode(key, astNodeToPlainText(node));
  }

  return null;
}

function isInlineBlockquoteAttributionNode(node: AstNode): boolean {
  switch (node.type) {
    case "text":
    case "code_inline":
    case "br":
      return true;
    case "strong":
    case "em":
      return node.children.every(isInlineBlockquoteAttributionNode);
    case "fragment":
      return node.children.every(isInlineBlockquoteAttributionNode);
    default:
      return false;
  }
}

function isBlockquoteAttributionText(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim();
  return BLOCKQUOTE_ATTRIBUTION_PATTERN.test(normalized);
}

function splitBlockquoteChildrenForCitation(children: AstNode[]): {
  bodyChildren: AstNode[];
  citationChildren: AstNode[] | null;
} {
  if (children.length === 0) {
    return { bodyChildren: children, citationChildren: null };
  }

  const lastNode = children[children.length - 1];
  if (lastNode?.type === "p") {
    const paragraphText = astNodeToPlainText(lastNode);
    if (isBlockquoteAttributionText(paragraphText)) {
      return {
        bodyChildren: children.slice(0, -1),
        citationChildren: lastNode.children,
      };
    }
  }

  let inlineStart = children.length;
  for (let index = children.length - 1; index >= 0; index -= 1) {
    if (!isInlineBlockquoteAttributionNode(children[index])) {
      break;
    }
    inlineStart = index;
  }

  if (inlineStart < children.length) {
    const inlineTail = children.slice(inlineStart);
    const tailText = inlineTail.map(astNodeToPlainText).join(" ");
    if (isBlockquoteAttributionText(tailText)) {
      return {
        bodyChildren: children.slice(0, inlineStart),
        citationChildren: inlineTail,
      };
    }
  }

  return {
    bodyChildren: children,
    citationChildren: null,
  };
}

function renderNode(node: AstNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return <Fragment key={key}>{node.text}</Fragment>;
    case "fragment":
      return <Fragment key={key}>{renderNodes(node.children, key)}</Fragment>;
    case "br":
      return <br key={key} />;
    case "p":
      return (
        <p key={key}>
          {renderNodes(node.children, key)}
        </p>
      );
    case "h1":
    case "h2":
    case "h3": {
      const HeadingTag = node.type;
      return (
        <HeadingTag key={key}>
          {renderNodes(node.children, key)}
        </HeadingTag>
      );
    }
    case "strong":
      return (
        <strong key={key}>
          {renderNodes(node.children, key)}
        </strong>
      );
    case "em":
      return (
        <em key={key}>
          {renderNodes(node.children, key)}
        </em>
      );
    case "code_inline":
      return (
        <code key={key} className="reader-ast-inline-code">
          {node.text}
        </code>
      );
    case "code_block":
      return (
        <CodeBlockView
          key={key}
          code={node.code}
          language={node.language ?? null}
        />
      );
    case "math":
      return (
        <MathNodeView
          key={key}
          tex={node.tex}
          display={Boolean(node.display)}
        />
      );
    case "table":
      return (
        <TableNodeView
          key={key}
          headers={node.headers}
          rows={node.rows}
        />
      );
    case "ul":
      return (
        <ul key={key} className="reader-ast-list reader-ast-list-ul">
          {renderNodes(node.children, key)}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="reader-ast-list reader-ast-list-ol">
          {renderNodes(node.children, key)}
        </ol>
      );
    case "li":
      return (
        <li key={key} className="reader-ast-list-item">
          {renderNodes(node.children, key)}
        </li>
      );
    case "blockquote": {
      const { bodyChildren, citationChildren } = splitBlockquoteChildrenForCitation(node.children);
      return (
        <blockquote key={key} className="reader-ast-blockquote">
          {renderNodes(bodyChildren, `${key}-body`)}
          {citationChildren ? (
            <cite className="reader-ast-blockquote-cite">
              {renderNodes(citationChildren, `${key}-cite`)}
            </cite>
          ) : null}
        </blockquote>
      );
    }
    case "attachment":
      return renderUnsupportedAsParagraphs(node, key);
    default: {
      const exhaustiveGuard: never = node;
      return exhaustiveGuard;
    }
  }
}

export function AstMessageRenderer({ root }: AstMessageRendererProps) {
  const sanitizedRoot = useMemo(() => sanitizeRootForRender(root), [root]);
  return (
    <div className="reader-ast-content">
      {renderNodes(sanitizedRoot.children, "ast")}
    </div>
  );
}
