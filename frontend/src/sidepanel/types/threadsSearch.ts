import type {
  ConversationMatchSummary,
  Message,
  Platform,
  SearchMatchSurface,
} from "~lib/types";
import type { DatePreset, HeaderMode } from "./timelineFilters";

export interface SearchSession {
  query: string;
  normalizedQuery: string;
  headerMode: HeaderMode;
  datePreset: DatePreset;
  selectedPlatforms: Set<Platform>;
  resultSummaryMap: Record<number, ConversationMatchSummary>;
  anchorConversationId: number | null;
  scrollTop?: number | null;
}

export type ThreadsSearchSession = SearchSession;

export type FrozenSearchSession = Readonly<SearchSession>;

export interface ReaderOccurrence {
  occurrenceKey: string;
  messageId: number;
  surface: SearchMatchSurface;
  nodeKey: string;
  charOffset: number;
  length: number;
}

export interface ReaderSearchModel {
  query: string;
  firstMatchedMessageId: number | null;
  occurrences: ReaderOccurrence[];
  currentIndex: number;
}

export type ThreadsState =
  | {
      mode: "list_idle";
      session: SearchSession;
    }
  | {
      mode: "list_searching_body";
      session: SearchSession;
    }
  | {
      mode: "list_results";
      session: SearchSession;
    }
  | {
      mode: "list_empty";
      session: SearchSession;
    }
  | {
      mode: "reader_loading_messages";
      session: FrozenSearchSession;
      conversationId: number;
      firstMatchedMessageId: number | null;
    }
  | {
      mode: "reader_building_index";
      session: FrozenSearchSession;
      conversationId: number;
      firstMatchedMessageId: number | null;
      messages: Message[];
    }
  | {
      mode: "reader_ready";
      session: FrozenSearchSession;
      conversationId: number;
      firstMatchedMessageId: number | null;
      messages: Message[];
      searchModel: ReaderSearchModel;
    };

export type ThreadsEvent =
  | { type: "QUERY_CHANGED"; query: string }
  | { type: "QUERY_CLEARED" }
  | { type: "HEADER_MODE_CHANGED"; headerMode: HeaderMode }
  | {
      type: "FILTER_CHANGED";
      datePreset: DatePreset;
      selectedPlatforms: Set<Platform>;
    }
  | { type: "BODY_SEARCH_STARTED" }
  | {
      type: "BODY_SEARCH_RESOLVED";
      summaries: ConversationMatchSummary[];
      hasResults: boolean;
    }
  | {
      type: "OPEN_READER";
      conversationId: number;
      firstMatchedMessageId: number | null;
    }
  | { type: "MESSAGES_LOADED"; messages: Message[] }
  | { type: "INDEX_BUILT"; searchModel: ReaderSearchModel }
  | { type: "NEXT_OCCURRENCE" }
  | { type: "PREV_OCCURRENCE" }
  | { type: "JUMP_TO_OCCURRENCE"; index: number }
  | { type: "BACK_TO_LIST" }
  | { type: "ANCHOR_CONSUMED" };
