export type AstVersion = "ast_v1";

export interface AstRoot {
  type: "root";
  children: AstNode[];
}

export type AstNode =
  | AstTextNode
  | AstFragmentNode
  | AstParagraphNode
  | AstHeadingNode
  | AstBreakNode
  | AstListNode
  | AstListItemNode
  | AstCodeBlockNode
  | AstInlineCodeNode
  | AstStrongNode
  | AstEmphasisNode
  | AstTableNode
  | AstMathNode
  | AstAttachmentNode
  | AstBlockquoteNode;

export interface AstTextNode {
  type: "text";
  text: string;
}

export interface AstFragmentNode {
  type: "fragment";
  children: AstNode[];
}

export interface AstParagraphNode {
  type: "p";
  children: AstNode[];
}

export interface AstHeadingNode {
  type: "h1" | "h2" | "h3";
  children: AstNode[];
}

export interface AstBreakNode {
  type: "br";
}

export interface AstListNode {
  type: "ul" | "ol";
  children: AstListItemNode[];
}

export interface AstListItemNode {
  type: "li";
  children: AstNode[];
}

export interface AstCodeBlockNode {
  type: "code_block";
  code: string;
  language?: string | null;
}

export interface AstInlineCodeNode {
  type: "code_inline";
  text: string;
}

export interface AstStrongNode {
  type: "strong";
  children: AstNode[];
}

export interface AstEmphasisNode {
  type: "em";
  children: AstNode[];
}

export interface AstTableNode {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface AstMathNode {
  type: "math";
  tex: string;
  display?: boolean;
}

export interface AstAttachmentNode {
  type: "attachment";
  name: string;
  mime?: string | null;
}

export interface AstBlockquoteNode {
  type: "blockquote";
  children: AstNode[];
}
