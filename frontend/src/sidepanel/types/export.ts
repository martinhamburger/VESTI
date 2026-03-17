import type { ExportFormat } from "~lib/types";
import type { LlmDiagnostic } from "~lib/services/llmService";

export type ConversationExportFormat = ExportFormat;
export type ConversationExportContentMode = "full" | "compact" | "summary";

export interface ConversationExportConfig {
  conversationIds?: number[];
  contentMode: ConversationExportContentMode;
  format: ConversationExportFormat;
}

export interface ConversationExportNotice {
  message: string;
  tone: "default" | "warning";
  title?: string;
  detail?: string;
  technicalSummary?: string;
  hint?: string;
  diagnostic?: LlmDiagnostic | null;
}

export interface ConversationExportResult {
  content: string;
  filename: string;
  mime: string;
  notice?: ConversationExportNotice;
}
