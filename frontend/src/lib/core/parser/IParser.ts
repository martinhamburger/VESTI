import type {
  MessageArtifact,
  MessageAttachment,
  MessageCitation,
  Platform,
} from "../../types";
import type { AstRoot, AstVersion } from "../../types/ast";

export interface ParsedMessage {
  role: "user" | "ai";
  textContent: string;
  contentAst?: AstRoot | null;
  contentAstVersion?: AstVersion | null;
  degradedNodesCount?: number;
  citations?: MessageCitation[];
  attachments?: MessageAttachment[];
  artifacts?: MessageArtifact[];
  normalizedHtmlSnapshot?: string | null;
  htmlContent?: string;
  timestamp?: number;
}

export interface IParser {
  detect(): Platform | null;
  getConversationTitle(): string;
  getMessages(): ParsedMessage[];
  isGenerating(): boolean;
  getSessionUUID(): string | null;
  getSourceCreatedAt(): number | null;
}
