import type {
  ConversationMatchSummary,
  Message,
  Platform,
} from "~lib/types";
import { getSearchReadiness, shouldRunFullTextSearch } from "~lib/utils/searchReadiness";
import type { DatePreset, HeaderMode } from "../types/timelineFilters";
import type {
  ReaderSearchModel,
  SearchSession,
  ThreadsEvent,
  ThreadsState,
} from "../types/threadsSearch";

function buildResultSummaryMap(
  summaries: ConversationMatchSummary[]
): Record<number, ConversationMatchSummary> {
  const next: Record<number, ConversationMatchSummary> = {};
  for (const summary of summaries) {
    next[summary.conversationId] = summary;
  }
  return next;
}

export function createInitialSearchSession(): SearchSession {
  return {
    query: "",
    normalizedQuery: "",
    headerMode: "default",
    datePreset: "all_time",
    selectedPlatforms: new Set<Platform>(),
    resultSummaryMap: {},
    anchorConversationId: null,
    scrollTop: null,
  };
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function isReaderMode(state: ThreadsState): boolean {
  return (
    state.mode === "reader_loading_messages" ||
    state.mode === "reader_building_index" ||
    state.mode === "reader_ready"
  );
}

export function createInitialThreadsState(): ThreadsState {
  return {
    mode: "list_idle",
    session: createInitialSearchSession(),
  };
}

function resolveListMode(
  session: SearchSession,
  preferResults: boolean
): ThreadsState {
  const readiness = getSearchReadiness(session.normalizedQuery);
  const hasQuery = readiness !== "empty";
  const hasResults = Object.keys(session.resultSummaryMap).length > 0;
  if (!hasQuery) {
    return { mode: "list_idle", session };
  }
  if (readiness === "title_snippet_only") {
    return { mode: "list_results", session };
  }
  if (preferResults || hasResults) {
    return { mode: "list_results", session };
  }
  return { mode: "list_empty", session };
}

function updateSessionQuery(session: SearchSession, query: string): SearchSession {
  const normalizedQuery = normalizeQuery(query);
  return {
    ...session,
    query,
    normalizedQuery,
    resultSummaryMap: {},
  };
}

function updateSessionFilters(
  session: SearchSession,
  datePreset: DatePreset,
  selectedPlatforms: Set<Platform>
): SearchSession {
  return {
    ...session,
    datePreset,
    selectedPlatforms,
    resultSummaryMap: {},
  };
}

function updateHeaderMode(
  session: SearchSession,
  headerMode: HeaderMode
): SearchSession {
  return {
    ...session,
    headerMode,
  };
}

function resolveFirstMatchedMessageId(
  summary: ConversationMatchSummary | undefined
): number | null {
  if (!summary) return null;
  const value = summary.firstMatchedMessageId;
  return Number.isFinite(value) ? value : null;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const mod = index % length;
  return mod < 0 ? mod + length : mod;
}

export function threadsReducer(
  state: ThreadsState,
  event: ThreadsEvent
): ThreadsState {
  const readerMode = isReaderMode(state);
  switch (event.type) {
    case "QUERY_CHANGED": {
      if (readerMode) return state;
      const session = updateSessionQuery(state.session, event.query);
      if (!shouldRunFullTextSearch(session.normalizedQuery)) {
        return resolveListMode(session, false);
      }
      return {
        mode: "list_searching_body",
        session,
      };
    }
    case "QUERY_CLEARED": {
      if (readerMode) return state;
      const session = updateSessionQuery(state.session, "");
      return { mode: "list_idle", session };
    }
    case "HEADER_MODE_CHANGED": {
      if (readerMode) return state;
      const session = updateHeaderMode(state.session, event.headerMode);
      return resolveListMode(session, state.mode === "list_results");
    }
    case "FILTER_CHANGED": {
      if (readerMode) return state;
      const session = updateSessionFilters(
        state.session,
        event.datePreset,
        event.selectedPlatforms
      );
      if (!shouldRunFullTextSearch(session.normalizedQuery)) {
        return resolveListMode(session, false);
      }
      return {
        mode: "list_searching_body",
        session,
      };
    }
    case "BODY_SEARCH_STARTED": {
      if (readerMode) return state;
      if (!shouldRunFullTextSearch(state.session.normalizedQuery)) {
        return resolveListMode(state.session, false);
      }
      if (state.mode === "list_searching_body") {
        return state;
      }
      return {
        mode: "list_searching_body",
        session: state.session,
      };
    }
    case "BODY_SEARCH_RESOLVED": {
      if (readerMode) return state;
      const session: SearchSession = {
        ...state.session,
        resultSummaryMap: buildResultSummaryMap(event.summaries),
      };
      if (!shouldRunFullTextSearch(session.normalizedQuery)) {
        return resolveListMode(session, false);
      }
      return event.hasResults
        ? { mode: "list_results", session }
        : { mode: "list_empty", session };
    }
    case "OPEN_READER": {
      const session = state.session;
      return {
        mode: "reader_loading_messages",
        session,
        conversationId: event.conversationId,
        firstMatchedMessageId: event.firstMatchedMessageId,
      };
    }
    case "MESSAGES_LOADED": {
      if (state.mode !== "reader_loading_messages") {
        return state;
      }
      return {
        mode: "reader_building_index",
        session: state.session,
        conversationId: state.conversationId,
        firstMatchedMessageId: state.firstMatchedMessageId,
        messages: event.messages,
      };
    }
    case "INDEX_BUILT": {
      if (state.mode !== "reader_building_index") {
        return state;
      }
      return {
        mode: "reader_ready",
        session: state.session,
        conversationId: state.conversationId,
        firstMatchedMessageId: state.firstMatchedMessageId,
        messages: state.messages,
        searchModel: event.searchModel,
      };
    }
    case "NEXT_OCCURRENCE": {
      if (state.mode !== "reader_ready") return state;
      const { searchModel } = state;
      if (searchModel.occurrences.length === 0) return state;
      const nextIndex = clampIndex(
        searchModel.currentIndex + 1,
        searchModel.occurrences.length
      );
      return {
        ...state,
        searchModel: { ...searchModel, currentIndex: nextIndex },
      };
    }
    case "PREV_OCCURRENCE": {
      if (state.mode !== "reader_ready") return state;
      const { searchModel } = state;
      if (searchModel.occurrences.length === 0) return state;
      const nextIndex = clampIndex(
        searchModel.currentIndex - 1,
        searchModel.occurrences.length
      );
      return {
        ...state,
        searchModel: { ...searchModel, currentIndex: nextIndex },
      };
    }
    case "JUMP_TO_OCCURRENCE": {
      if (state.mode !== "reader_ready") return state;
      const { searchModel } = state;
      if (searchModel.occurrences.length === 0) return state;
      const nextIndex = clampIndex(event.index, searchModel.occurrences.length);
      return {
        ...state,
        searchModel: { ...searchModel, currentIndex: nextIndex },
      };
    }
    case "BACK_TO_LIST": {
      if (
        state.mode !== "reader_loading_messages" &&
        state.mode !== "reader_building_index" &&
        state.mode !== "reader_ready"
      ) {
        return state;
      }
      const session: SearchSession = {
        ...state.session,
        anchorConversationId: state.conversationId,
      };
      return resolveListMode(session, true);
    }
    case "ANCHOR_CONSUMED": {
      if (readerMode) return state;
      const session = { ...state.session, anchorConversationId: null };
      return resolveListMode(session, state.mode === "list_results");
    }
    default:
      return state;
  }
}

export function resolveFirstMatchedIdForConversation(
  session: SearchSession,
  conversationId: number
): number | null {
  const summary = session.resultSummaryMap[conversationId];
  return resolveFirstMatchedMessageId(summary);
}

export function getReaderQuery(session: SearchSession): string {
  return session.query.trim();
}

export function deriveCurrentIndex(
  occurrences: ReaderSearchModel["occurrences"],
  firstMatchedMessageId: number | null
): number {
  if (!occurrences.length) return 0;
  if (!firstMatchedMessageId) return 0;
  const idx = occurrences.findIndex(
    (occurrence) => occurrence.messageId === firstMatchedMessageId
  );
  return idx >= 0 ? idx : 0;
}

export function createEmptySearchModel(
  query: string,
  firstMatchedMessageId: number | null
): ReaderSearchModel {
  return {
    query,
    firstMatchedMessageId,
    occurrences: [],
    currentIndex: 0,
  };
}

export function createSearchModel(
  query: string,
  firstMatchedMessageId: number | null,
  occurrences: ReaderSearchModel["occurrences"]
): ReaderSearchModel {
  const currentIndex = deriveCurrentIndex(occurrences, firstMatchedMessageId);
  return {
    query,
    firstMatchedMessageId,
    occurrences,
    currentIndex,
  };
}

export function resolveMessageOrder(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.created_at - b.created_at);
}
