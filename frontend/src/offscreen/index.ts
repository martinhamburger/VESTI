
import { isRequestMessage } from "../lib/messaging/protocol";
import type { RequestMessage, ResponseMessage } from "../lib/messaging/protocol";
import { interceptAndPersistCapture } from "../lib/capture/storage-interceptor";
import {
  listConversations,
  listMessages,
  listAnnotations,
  listNotes,
  getTopics,
  createTopic,
  updateConversationTopic,
  updateConversation,
  saveAnnotation,
  deleteAnnotation,
  searchConversationIdsByText,
  searchConversationMatchesByText,
  deleteConversation,
  createNote,
  updateNote,
  deleteNote,
  updateConversationTitle,
  renameTagAcrossConversations,
  moveTagAcrossConversations,
  removeTagFromConversations,
  getDashboardStats,
  getDataOverview,
  getStorageUsage,
  exportAllData,
  clearAllData,
  clearInsightsCache,
  getSummary,
  getWeeklyReport,
  listRetrievalAssetStatus,
  createExploreSession,
  listExploreSessions,
  getExploreSession,
  getExploreMessages,
  deleteExploreSession,
  updateExploreSession,
  updateExploreMessageEvidence,
} from "../lib/db/repository";
import { runGardener } from "../lib/services/gardenerService";
import {
  findRelatedConversations,
  findAllEdges,
  askKnowledgeBase,
} from "../lib/services/searchService";
import {
  buildRetrievalAssets,
  getEvidenceBundle,
  getQueryRewriteHints,
} from "../lib/services/retrievalAssetsService";
import { requestVectorization } from "../lib/services/vectorizationService";
import {
  exportAnnotationToMyNotes,
  exportAnnotationToNotion,
} from "../lib/services/annotationExportService";
import { getLlmSettings, setLlmSettings } from "../lib/services/llmSettingsService";
import { callInference, getLlmDiagnostic } from "../lib/services/llmService";
import {
  generateConversationSummary,
  generateWeeklyReport,
} from "../lib/services/insightGenerationService";
import type { LlmConfig } from "../lib/types";
import { logger } from "../lib/utils/logger";
import { getLlmAccessMode, normalizeLlmSettings } from "../lib/services/llmConfig";

function notifyDataUpdated(): void {
  chrome.runtime.sendMessage({ type: "VESTI_DATA_UPDATED" }, () => {
    void chrome.runtime.lastError;
  });
}

function requireSettings(settings: LlmConfig | null): LlmConfig {
  if (!settings) {
    throw new Error("LLM_CONFIG_MISSING");
  }
  const normalized = normalizeLlmSettings(settings);
  const mode = getLlmAccessMode(normalized);
  if (mode === "demo_proxy") {
    if ((!normalized.proxyBaseUrl && !normalized.proxyUrl) || !normalized.modelId) {
      throw new Error("LLM_CONFIG_MISSING");
    }
    return normalized;
  }
  if (!normalized.apiKey || !normalized.modelId || !normalized.baseUrl) {
    throw new Error("LLM_CONFIG_MISSING");
  }
  return normalized;
}

async function handleRequest(message: RequestMessage): Promise<ResponseMessage> {
  const messageType = message.type;
  try {
    switch (message.type) {
      case "CAPTURE_CONVERSATION": {
        const result = await interceptAndPersistCapture(message.payload);
        return { ok: true, type: messageType, data: result };
      }
      case "GET_CONVERSATIONS": {
        const data = await listConversations(message.payload);
        return { ok: true, type: messageType, data };
      }
      case "GET_TOPICS": {
        const data = await getTopics();
        return { ok: true, type: messageType, data };
      }
      case "CREATE_TOPIC": {
        const topic = await createTopic(message.payload);
        return { ok: true, type: messageType, data: { topic } };
      }
      case "UPDATE_CONVERSATION_TOPIC": {
        const conversation = await updateConversationTopic(
          message.payload.id,
          message.payload.topic_id
        );
        return { ok: true, type: messageType, data: { updated: true, conversation } };
      }
      case "UPDATE_CONVERSATION": {
        const data = await updateConversation(
          message.payload.id,
          message.payload.changes
        );
        return { ok: true, type: messageType, data };
      }
      case "RUN_GARDENER": {
        const data = await runGardener(message.payload.conversationId);
        return { ok: true, type: messageType, data };
      }
      case "GET_RELATED_CONVERSATIONS": {
        const data = await findRelatedConversations(
          message.payload.conversationId,
          message.payload.limit
        );
        return { ok: true, type: messageType, data };
      }
      case "GET_ALL_EDGES": {
        const data = await findAllEdges(message.payload);
        return { ok: true, type: messageType, data };
      }
      case "RENAME_FOLDER_TAG": {
        const updated = await renameTagAcrossConversations(
          message.payload.from,
          message.payload.to
        );
        return { ok: true, type: messageType, data: { updated } };
      }
      case "MOVE_FOLDER_TAG": {
        const updated = await moveTagAcrossConversations(
          message.payload.from,
          message.payload.to
        );
        return { ok: true, type: messageType, data: { updated } };
      }
      case "REMOVE_FOLDER_TAG": {
        const updated = await removeTagFromConversations(message.payload.tag);
        return { ok: true, type: messageType, data: { updated } };
      }
      case "ASK_KNOWLEDGE_BASE": {
        const data = await askKnowledgeBase(
          message.payload.query,
          message.payload.sessionId,
          message.payload.limit,
          message.payload.mode,
          message.payload.options
        );
        return { ok: true, type: messageType, data };
      }
      case "BUILD_RETRIEVAL_ASSETS": {
        const data = await buildRetrievalAssets(message.payload);
        if (data.built > 0) {
          notifyDataUpdated();
        }
        return { ok: true, type: messageType, data };
      }
      case "GET_RETRIEVAL_ASSET_STATUS": {
        const [statuses, overview] = await Promise.all([
          listRetrievalAssetStatus(message.payload?.conversationIds),
          getDataOverview(),
        ]);
        return {
          ok: true,
          type: messageType,
          data: {
            statuses,
            diagnostics: overview.retrievalDiagnostics ?? null,
          },
        };
      }
      case "GET_QUERY_REWRITE_HINTS": {
        const data = await getQueryRewriteHints({
          query: message.payload.query,
          sessionId: message.payload.sessionId,
        });
        return { ok: true, type: messageType, data };
      }
      case "GET_EVIDENCE_BUNDLE": {
        const data = await getEvidenceBundle({
          query: message.payload.query,
          sessionId: message.payload.sessionId,
          limit: message.payload.limit,
          searchScope: message.payload.options?.searchScope,
        });
        return { ok: true, type: messageType, data };
      }
      case "CREATE_EXPLORE_SESSION": {
        const sessionId = await createExploreSession(message.payload.title);
        return { ok: true, type: messageType, data: { sessionId } };
      }
      case "LIST_EXPLORE_SESSIONS": {
        const sessions = await listExploreSessions(message.payload?.limit);
        return { ok: true, type: messageType, data: sessions };
      }
      case "GET_EXPLORE_SESSION": {
        const session = await getExploreSession(message.payload.sessionId);
        return { ok: true, type: messageType, data: session };
      }
      case "GET_EXPLORE_MESSAGES": {
        const msgs = await getExploreMessages(message.payload.sessionId);
        return { ok: true, type: messageType, data: msgs };
      }
      case "DELETE_EXPLORE_SESSION": {
        await deleteExploreSession(message.payload.sessionId);
        return { ok: true, type: messageType, data: { deleted: true } };
      }
      case "RENAME_EXPLORE_SESSION": {
        await updateExploreSession(message.payload.sessionId, {
          title: message.payload.title,
        });
        return { ok: true, type: messageType, data: { updated: true } };
      }
      case "UPDATE_EXPLORE_MESSAGE_EVIDENCE": {
        await updateExploreMessageEvidence(
          message.payload.messageId,
          message.payload.selectedContextConversationIds,
          message.payload.evidenceBriefSnapshot
        );
        return { ok: true, type: messageType, data: { updated: true } };
      }
      case "GET_MESSAGES": {
        const data = await listMessages(message.payload.conversationId);
        return { ok: true, type: messageType, data };
      }
      case "GET_ANNOTATIONS_BY_CONVERSATION": {
        const data = await listAnnotations(message.payload.conversationId);
        return { ok: true, type: messageType, data };
      }
      case "SAVE_ANNOTATION": {
        const annotation = await saveAnnotation(message.payload);
        requestVectorization([message.payload.conversationId]);
        return { ok: true, type: messageType, data: { annotation } };
      }
      case "DELETE_ANNOTATION": {
        await deleteAnnotation(message.payload.annotationId);
        requestVectorization();
        return { ok: true, type: messageType, data: { deleted: true } };
      }
      case "EXPORT_ANNOTATION_TO_NOTE": {
        const note = await exportAnnotationToMyNotes(message.payload.annotationId);
        return { ok: true, type: messageType, data: { note } };
      }
      case "EXPORT_ANNOTATION_TO_NOTION": {
        const data = await exportAnnotationToNotion(message.payload.annotationId);
        return { ok: true, type: messageType, data };
      }
      case "GET_NOTES": {
        const data = await listNotes();
        return { ok: true, type: messageType, data };
      }
      case "CREATE_NOTE": {
        const note = await createNote(message.payload);
        return { ok: true, type: messageType, data: { note } };
      }
      case "UPDATE_NOTE": {
        const note = await updateNote(message.payload.id, message.payload.changes);
        return { ok: true, type: messageType, data: { note } };
      }
      case "DELETE_NOTE": {
        await deleteNote(message.payload.id);
        return { ok: true, type: messageType, data: { deleted: true } };
      }
      case "SEARCH_CONVERSATION_IDS_BY_TEXT": {
        const data = await searchConversationIdsByText(message.payload.query);
        return { ok: true, type: messageType, data };
      }
      case "SEARCH_CONVERSATION_MATCHES_BY_TEXT": {
        const data = await searchConversationMatchesByText(message.payload);
        return { ok: true, type: messageType, data };
      }
      case "DELETE_CONVERSATION": {
        const deleted = await deleteConversation(message.payload.id);
        return { ok: true, type: messageType, data: { deleted } };
      }
      case "UPDATE_CONVERSATION_TITLE": {
        const conversation = await updateConversationTitle(
          message.payload.id,
          message.payload.title
        );
        return { ok: true, type: messageType, data: { updated: true, conversation } };
      }
      case "GET_DASHBOARD_STATS": {
        const data = await getDashboardStats();
        return { ok: true, type: messageType, data };
      }
      case "GET_STORAGE_USAGE": {
        const data = await getStorageUsage();
        return { ok: true, type: messageType, data };
      }
      case "GET_DATA_OVERVIEW": {
        const data = await getDataOverview();
        return { ok: true, type: messageType, data };
      }
      case "EXPORT_DATA": {
        const data = await exportAllData(message.payload.format);
        return { ok: true, type: messageType, data };
      }
      case "CLEAR_ALL_DATA": {
        const cleared = await clearAllData();
        return { ok: true, type: messageType, data: { cleared } };
      }
      case "CLEAR_INSIGHTS_CACHE": {
        const cleared = await clearInsightsCache();
        return { ok: true, type: messageType, data: { cleared } };
      }
      case "GET_LLM_SETTINGS": {
        const settings = await getLlmSettings();
        return { ok: true, type: messageType, data: { settings } };
      }
      case "SET_LLM_SETTINGS": {
        await setLlmSettings(message.payload.settings);
        return { ok: true, type: messageType, data: { saved: true } };
      }
      case "TEST_LLM_CONNECTION": {
        const settings = requireSettings(await getLlmSettings());
        try {
          await callInference(settings, "Reply with OK only.", {
            systemPrompt: "You are a connectivity probe. Reply with OK only.",
          });
        } catch (error) {
          const diagnostic = getLlmDiagnostic(error);
          if (diagnostic) {
            return {
              ok: true,
              type: messageType,
              data: {
                ok: false,
                message: diagnostic.userMessage,
                diagnostic,
              },
            };
          }
          throw error;
        }
        return {
          ok: true,
          type: messageType,
          data: { ok: true, message: "Connection verified." },
        };
      }
      case "GET_CONVERSATION_SUMMARY": {
        const data = await getSummary(message.payload.conversationId);
        return { ok: true, type: messageType, data };
      }
      case "GENERATE_CONVERSATION_SUMMARY": {
        const settings = requireSettings(await getLlmSettings());
        const record = await generateConversationSummary(
          settings,
          message.payload.conversationId
        );
        return { ok: true, type: messageType, data: record };
      }
      case "GET_WEEKLY_REPORT": {
        const data = await getWeeklyReport(
          message.payload.rangeStart,
          message.payload.rangeEnd
        );
        return { ok: true, type: messageType, data };
      }
      case "GENERATE_WEEKLY_REPORT": {
        const settings = requireSettings(await getLlmSettings());
        const record = await generateWeeklyReport(
          settings,
          message.payload.rangeStart,
          message.payload.rangeEnd
        );
        return { ok: true, type: messageType, data: record };
      }
      default:
        return {
          ok: false,
          type: messageType,
          error: `Unsupported message type: ${messageType}`,
        };
    }
  } catch (error) {
    logger.error("offscreen", "Request failed", error as Error);
    return {
      ok: false,
      type: messageType,
      error: (error as Error).message || "Unknown error",
    };
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (!isRequestMessage(message)) return;
    if (message.target !== "offscreen") return;

    void (async () => {
      const response = await handleRequest(message);
      sendResponse(response);
    })();

    return true;
  }
);

logger.info("offscreen", "Offscreen handler initialized");
