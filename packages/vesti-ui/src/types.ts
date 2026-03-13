export type Platform =
  | "ChatGPT"
  | "Claude"
  | "Gemini"
  | "DeepSeek"
  | "Qwen"
  | "Doubao"
  | "Kimi"
  | "Yuanbao";

export type UiThemeMode = "light" | "dark";

export interface Topic {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: number;
  updated_at: number;
  count?: number;
  children?: Topic[];
}

export interface GardenerStep {
  step: string;
  status: "pending" | "running" | "completed";
  details?: string;
}

export interface GardenerResult {
  tags: string[];
  matchedTopic?: Topic;
  createdTopic?: Topic;
  steps: GardenerStep[];
}

export interface Conversation {
  id: number;
  title: string;
  platform: Platform;
  snippet: string;
  url?: string;
  tags: string[];
  topic_id: number | null;
  created_at: number;
  updated_at: number;
  is_starred: boolean;
  is_archived?: boolean;
  is_trash?: boolean;
  has_note?: boolean;
}

export interface RelatedConversation {
  id: number;
  title: string;
  platform: Platform;
  similarity: number;
}

export type ExploreMode = "agent" | "classic";

export type ExploreSearchScopeMode = "all" | "selected";

export interface ExploreSearchScope {
  mode: ExploreSearchScopeMode;
  conversationIds?: number[];
}

export interface ExploreAskOptions {
  searchScope?: ExploreSearchScope;
}

export type ExploreIntentType =
  | "fact_lookup"
  | "cross_conversation_summary"
  | "weekly_review"
  | "timeline"
  | "clarification_needed";

export type ExploreRequestedTimeScopePreset =
  | "none"
  | "current_week_to_date"
  | "last_7_days"
  | "last_full_week"
  | "custom";

export interface ExploreRequestedTimeScope {
  preset: ExploreRequestedTimeScopePreset;
  label?: string;
  startDate?: string;
  endDate?: string;
}

export interface ExploreResolvedTimeScope {
  preset: Exclude<ExploreRequestedTimeScopePreset, "none">;
  label: string;
  rangeStart: number;
  rangeEnd: number;
  startDate: string;
  endDate: string;
}

export type ExplorePlannerPath = "rag" | "weekly_summary" | "clarify";

export type ExploreToolName =
  | "intent_planner"
  | "time_scope_resolver"
  | "weekly_summary_tool"
  | "query_planner"
  | "search_rag"
  | "summary_tool"
  | "context_compiler"
  | "answer_synthesizer";

export type ExploreToolStatus = "completed" | "failed" | "skipped";

export interface ExploreToolCall {
  id: string;
  name: ExploreToolName;
  status: ExploreToolStatus;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  description?: string;
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
}

export interface ExploreContextCandidate {
  conversationId: number;
  title: string;
  platform: Platform;
  similarity: number;
  matchType?: "semantic" | "time_scope";
  selectionReason?: string;
  summarySnippet?: string;
  excerpt?: string;
}

export interface ExploreAgentPlan {
  intent: ExploreIntentType;
  reason: string;
  preferredPath: ExplorePlannerPath;
  sourceLimit: number;
  summaryTargetCount: number;
  answerGoal?: string;
  needsClarification?: boolean;
  clarifyingQuestion?: string;
  requestedTimeScope?: ExploreRequestedTimeScope;
  resolvedTimeScope?: ExploreResolvedTimeScope;
  toolPlan?: ExploreToolName[];
}

export interface ExploreAgentMeta {
  mode: ExploreMode;
  query?: string;
  searchScope?: ExploreSearchScope;
  plan?: ExploreAgentPlan;
  toolCalls: ExploreToolCall[];
  contextDraft?: string;
  contextCandidates?: ExploreContextCandidate[];
  selectedContextConversationIds?: number[];
  totalDurationMs?: number;
}

export interface RagResponse {
  answer: string;
  sources: RelatedConversation[];
  agent?: ExploreAgentMeta;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "ai";
  content_text: string;
  created_at: number;
}

export type AsyncStatus = "idle" | "loading" | "ready" | "error";
export type ExportFormat = "json" | "txt" | "md";
export type StorageUsageStatus = "ok" | "warning" | "blocked";

export interface StorageUsageSnapshot {
  originUsed: number;
  originQuota: number | null;
  localUsed: number;
  unlimitedStorageEnabled: boolean;
  softLimit: number;
  hardLimit: number;
  status: StorageUsageStatus;
}

export type ConversationFilters = {
  platform?: Platform;
  search?: string;
  dateRange?: { start: number; end: number };
};

export interface ExploreSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExploreMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  sources?: RelatedConversation[];
  agentMeta?: ExploreAgentMeta;
  timestamp: number;
}

export type StorageApi = {
  getTopics: () => Promise<Topic[]>;
  getConversations: (filters?: ConversationFilters) => Promise<Conversation[]>;
  runGardener?: (
    conversationId: number
  ) => Promise<{ updated: boolean; conversation: Conversation; result: GardenerResult }>;
  getRelatedConversations?: (
    conversationId: number,
    limit?: number
  ) => Promise<RelatedConversation[]>;
  getAllEdges?: (options?: {
    threshold?: number;
    conversationIds?: number[];
  }) => Promise<Array<{ source: number; target: number; weight: number }>>;
  getMessages?: (conversationId: number) => Promise<Message[]>;
  updateConversation?: (
    id: number,
    changes: { topic_id?: number | null; is_starred?: boolean; tags?: string[] }
  ) => Promise<{ updated: boolean; conversation: Conversation }>;
  updateConversationTitle?: (id: number, title: string) => Promise<Conversation>;
  deleteConversation?: (id: number) => Promise<void>;
  renameFolderTag?: (
    from: string,
    to: string
  ) => Promise<{ updated: number }>;
  moveFolderTag?: (
    from: string,
    to: string
  ) => Promise<{ updated: number }>;
  removeFolderTag?: (tag: string) => Promise<{ updated: number }>;
  askKnowledgeBase?: (
    query: string,
    sessionId?: string,
    limit?: number,
    mode?: ExploreMode,
    options?: ExploreAskOptions
  ) => Promise<RagResponse & { sessionId: string }>;
  // Explore Session APIs
  createExploreSession?: (title: string) => Promise<string>;
  listExploreSessions?: (limit?: number) => Promise<ExploreSession[]>;
  getExploreSession?: (sessionId: string) => Promise<ExploreSession | null>;
  getExploreMessages?: (sessionId: string) => Promise<ExploreMessage[]>;
  deleteExploreSession?: (sessionId: string) => Promise<void>;
  renameExploreSession?: (sessionId: string, title: string) => Promise<void>;
  updateExploreMessageContext?: (
    messageId: string,
    contextDraft: string,
    selectedContextConversationIds: number[]
  ) => Promise<void>;
  getSummary?: (conversationId: number) => Promise<ChatSummaryData | null>;
  generateSummary?: (conversationId: number) => Promise<ChatSummaryData>;
  getNotes?: () => Promise<Note[]>;
  saveNote?: (note: Omit<Note, "id" | "created_at" | "updated_at">) => Promise<Note>;
  updateNote?: (
    id: number,
    changes: Partial<Pick<Note, "title" | "content">>
  ) => Promise<Note>;
  deleteNote?: (id: number) => Promise<void>;
  getStorageUsage?: () => Promise<StorageUsageSnapshot>;
  exportData?: (
    format: ExportFormat
  ) => Promise<{ blob: Blob; filename: string; mime: string }>;
  clearAllData?: () => Promise<void>;
};

export interface ArtifactMetaData {
  title: string;
  generated_at: string;
  tags: string[];
  fallback: boolean;
  range_label?: string;
}

export interface ChatSummaryData {
  meta: ArtifactMetaData;
  core_question: string;
  thinking_journey: Array<{
    step: number;
    speaker: "User" | "AI";
    assertion: string;
    real_world_anchor: string | null;
  }>;
  key_insights: Array<{
    term: string;
    definition: string;
  }>;
  unresolved_threads: string[];
  meta_observations: {
    thinking_style: string;
    emotional_tone: string;
    depth_level: "superficial" | "moderate" | "deep";
  };
  actionable_next_steps: string[];
  plain_text?: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  linked_conversation_ids: number[];
}
