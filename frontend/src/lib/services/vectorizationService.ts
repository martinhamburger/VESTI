import { logger } from "../utils/logger";

export function requestVectorization(conversationIds?: number[]): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  try {
    if (Array.isArray(conversationIds) && conversationIds.length > 0) {
      chrome.runtime.sendMessage(
        {
          type: "BUILD_RETRIEVAL_ASSETS",
          target: "background",
          payload: { conversationIds },
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
      return;
    }

    chrome.runtime.sendMessage({ type: "RUN_VECTORIZATION", target: "background" }, () => {
      void chrome.runtime.lastError;
    });
  } catch (error) {
    logger.warn("vectorize", "Failed to request vectorization", {
      error: (error as Error)?.message ?? String(error),
    });
  }
}
