import "~style.css";

import { VestiDashboard as VestiDashboardShell } from "@vesti/ui";
import { LOGO_BASE64 } from "~lib/ui/logo";
import {
  getConversations,
  getTopics,
  runGardener,
  getRelatedConversations,
  getAllEdges,
  getMessages,
  updateConversation,
  updateConversationTitle,
  deleteConversation,
  renameFolderTag,
  moveFolderTag,
  removeFolderTag,
  askKnowledgeBase,
  createExploreSession,
  listExploreSessions,
  getExploreSession,
  getExploreMessages,
  deleteExploreSession,
  renameExploreSession,
  getSummary,
  generateSummary,
  getNotes,
  saveNote,
  updateNote,
  deleteNote,
  getStorageUsage,
  exportData,
  clearAllData,
} from "~lib/services/storageService";

export default function VestiDashboardPage() {
  return (
    <VestiDashboardShell
      logoSrc={LOGO_BASE64}
      rootClassName="vesti-options"
      storage={{
        getConversations,
        getTopics,
        runGardener,
        getRelatedConversations,
        getAllEdges,
        getMessages,
        updateConversation,
        updateConversationTitle,
        deleteConversation,
        renameFolderTag,
        moveFolderTag,
        removeFolderTag,
        askKnowledgeBase,
        createExploreSession,
        listExploreSessions,
        getExploreSession,
        getExploreMessages,
        deleteExploreSession,
        renameExploreSession,
        getSummary,
        generateSummary,
        getNotes,
        saveNote,
        updateNote,
        deleteNote,
        getStorageUsage,
        exportData,
        clearAllData,
      }}
    />
  );
}
