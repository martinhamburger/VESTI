import type { ExportFormat } from "~lib/types";

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
}

export interface ConversationExportResult {
  content: string;
  filename: string;
  mime: string;
  notice?: ConversationExportNotice;
}
