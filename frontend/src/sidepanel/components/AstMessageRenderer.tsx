import { Check, Copy, FileText } from "lucide-react";
import katex from "katex";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { AstNode, AstRoot } from "~lib/types/ast";
import "katex/dist/katex.min.css";

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
    window.setTimeout(() => setCopied(false), 1500);
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

function renderNodes(nodes: AstNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => renderNode(node, `${keyPrefix}-${index}`));
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
        <li key={key}>
          {renderNodes(node.children, key)}
        </li>
      );
    case "table":
      return (
        <div key={key} className="reader-ast-table-wrap">
          <table className="reader-ast-table">
            <thead>
              <tr>
                {node.headers.map((header, index) => (
                  <th key={`${key}-h-${index}`}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rowIndex) => (
                <tr key={`${key}-r-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-c-${rowIndex}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "math":
      return (
        <MathNodeView
          key={key}
          tex={node.tex}
          display={Boolean(node.display)}
        />
      );
    case "blockquote":
      return (
        <blockquote key={key} className="reader-ast-blockquote">
          {renderNodes(node.children, key)}
        </blockquote>
      );
    case "attachment":
      return (
        <span key={key} className="reader-ast-attachment">
          <FileText className="h-3 w-3" strokeWidth={1.75} />
          {node.name}
        </span>
      );
    default: {
      const exhaustiveGuard: never = node;
      return exhaustiveGuard;
    }
  }
}

export function AstMessageRenderer({ root }: AstMessageRendererProps) {
  return (
    <div className="reader-ast-content">
      {renderNodes(root.children, "ast")}
    </div>
  );
}
