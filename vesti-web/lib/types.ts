export type Platform =
  | 'ChatGPT'
  | 'Claude'
  | 'Gemini'
  | 'DeepSeek'
  | 'Qwen'
  | 'Doubao';

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
  status: 'pending' | 'running' | 'completed';
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
  tags: string[];
  topic_id: number | null;
  source_created_at: number | null;
  first_captured_at: number;
  last_captured_at: number;
  created_at: number;
  updated_at: number;
  is_starred: boolean;
  is_archived?: boolean;
  is_trash?: boolean;
  has_note?: boolean;
}

export interface AgentStep {
  step: string;
  status: 'pending' | 'running' | 'completed';
  details?: string;
}

export interface RelatedConversation {
  id: number;
  title: string;
  similarity: number;
  platform: Platform;
}

export interface RagResponse {
  answer: string;
  sources: RelatedConversation[];
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'ai';
  content_text: string;
  created_at: number;
}

export type NoteBlockType = 'message-group' | 'annotation' | 'text' | 'compressed_context';

export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  collapsed?: boolean;
  data: {
    messageIds?: number[];
    text?: string;
    markdown?: string;
  };
  parentBlockId?: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  blocks?: NoteBlock[];
  linked_conversation_ids: number[];
  created_at: number;
  updated_at: number;
  tags: string[];
}

export type ExportFormat = 'json' | 'txt' | 'md';
export type StorageUsageStatus = 'ok' | 'warning' | 'blocked';

export interface StorageUsageSnapshot {
  originUsed: number;
  originQuota: number | null;
  localUsed: number;
  unlimitedStorageEnabled: boolean;
  softLimit: number;
  hardLimit: number;
  status: StorageUsageStatus;
}

export interface ChatSummaryData {
  meta: {
    title: string;
    generated_at: string;
    tags: string[];
    fallback: boolean;
    range_label?: string;
  };
  core_question: string;
  thinking_journey: Array<{
    step: number;
    speaker: "User" | "AI";
    assertion: string;
    real_world_anchor: string | null;
  }>;
  key_insights: Array<{ term: string; definition: string }>;
  unresolved_threads: string[];
  meta_observations: {
    thinking_style: string;
    emotional_tone: string;
    depth_level: "superficial" | "moderate" | "deep";
  };
  actionable_next_steps: string[];
  plain_text?: string;
}

export interface SummaryRecord {
  id: number;
  conversationId: number;
  content: string;
  structured?: Record<string, unknown> | null;
  modelId: string;
  createdAt: number;
  sourceUpdatedAt: number;
}
