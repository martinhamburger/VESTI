import type { IParser, ParsedMessage } from "../IParser";
import type { Platform } from "../../../types";
import {
  extractEarliestTimeFromSelectors,
  queryAllUnique,
  queryAllWithinUnique,
  queryFirst,
  queryFirstWithin,
  safeTextContent,
  uniqueNodesInDocumentOrder,
} from "../shared/selectorUtils";
import { extractAstFromElement } from "../shared/astExtractor";
import { astPerfModeController, type AstPerfMode } from "../shared/astPerfMode";
import { logger } from "../../../utils/logger";

const SELECTORS = {
  userNodes: [".hyc-component-text .hyc-content-text"],
  cotParagraphs: [".hyc-component-deepsearch-cot__think__content__item-text .ybc-p"],
  finalNodes: [".hyc-common-markdown:not(.hyc-common-markdown-style-cot)"],
  anchorRoots: [
    ".hyc-component-text",
    ".hyc-component-deepsearch-cot__think",
    ".hyc-common-markdown:not(.hyc-common-markdown-style-cot)",
  ],
  cotNoiseContainers: [
    ".hyc-component-deepsearch-cot__think__header-container",
    ".hyc-component-deepsearch-cot__think__content__item-search",
    ".hyc-component-deepsearch-cot__think__content__item__docs",
    ".hyc-component-deepsearch-cot__think__content__item__docs__number",
  ],
  title: [
    ".hyc-page-title",
    ".hyc-page-header h1",
    "main h1",
    "header h1",
    "title",
  ],
  generating: [
    "[data-is-streaming='true']",
    "[data-testid*='stream']",
    "[data-testid*='typing']",
    "[class*='stream']",
    "[class*='typing']",
    "[class*='generating']",
  ],
  noiseContainers: [
    "form",
    "footer",
    "nav",
    "[role='navigation']",
    "[data-testid*='composer']",
    "[contenteditable='true']",
  ],
  noiseTextPatterns: [
    /^new chat$/i,
    /^retry$/i,
    /^edit$/i,
    /^copy$/i,
    /^yuanbao can make mistakes\.?/i,
    /^\u5df2\u5b8c\u6210\u6df1\u5ea6\u641c\u7d22.*$/i,
    /^\u627e\u5230\u4e86\s*\d+\s*\u7bc7\u76f8\u5173\u8d44\u6599$/i,
  ],
  sourceTimes: ["time[datetime]", "article time[datetime]"],
  uiNoiseSelectors: [
    ".hyc-component-deepsearch-cot__think__header-container",
    ".hyc-component-deepsearch-cot__think__header__toggle",
    ".hyc-component-deepsearch-cot__think__content__item-search",
    ".hyc-component-deepsearch-cot__think__content__item__docs",
    ".hyc-component-deepsearch-cot__think__content__item__docs__number",
    ".hyc-component-deepsearch-cot__think__content__item__doc",
    ".hyc-component-deepsearch-cot__think__content__item__doc__title",
    ".hyc-component-deepsearch-cot__think__content__item__doc__title__text",
    "button",
    "svg",
  ],
};

const TITLE_PLATFORM_SUFFIX_PATTERN =
  /\s*[-\u2013\u2014]\s*(ChatGPT|Claude|Gemini|DeepSeek|Qwen|Doubao|Kimi|YUANBAO)\s*$/i;
const SESSION_ID_QUERY_KEYS = [
  "conversation",
  "conversation_id",
  "thread",
  "thread_id",
  "chat",
  "chat_id",
  "session",
  "session_id",
  "id",
];

const SESSION_ID_PATTERNS = [
  /\/a\/chat\/s\/([a-zA-Z0-9_-]{8,})/i,
  /\/chat\/([a-zA-Z0-9_-]{8,})/i,
  /\/conversation\/([a-zA-Z0-9_-]{8,})/i,
  /\/c\/([a-zA-Z0-9_-]{8,})/i,
  /\/s\/([a-zA-Z0-9_-]{8,})/i,
];

const INVALID_SESSION_IDS = new Set([
  "chat",
  "new",
  "conversation",
  "session",
  "search",
  "library",
]);

const NOISE_LINE_PATTERNS = [
  /^(copy|edit|retry|like|dislike|share)$/i,
  /^(references?|\u5f15\u7528)$/i,
  /^\u5df2\u5b8c\u6210\u6df1\u5ea6\u641c\u7d22.*$/i,
  /^\u627e\u5230\u4e86\s*\d+\s*\u7bc7\u76f8\u5173\u8d44\u6599$/i,
];

type MessageRole = "user" | "ai";
type ExtractionSource = "selector" | "anchor";
type SemanticCandidateKind = "user" | "cot" | "final";

interface ParserStats {
  source: ExtractionSource;
  totalCandidates: number;
  keptMessages: number;
  roleDistribution: Record<MessageRole, number>;
  droppedNoise: number;
  droppedUnknownRole: number;
  parse_duration_ms: number;
  perf_mode: AstPerfMode;
  next_perf_mode: AstPerfMode;
  degraded_nodes_count: number;
  ast_node_count: number;
  message_count: number;
  platform: Platform;
}

interface ExtractionResult {
  source: ExtractionSource;
  totalCandidates: number;
  droppedNoise: number;
  droppedUnknownRole: number;
  messages: ParsedMessage[];
  degradedNodesCount: number;
  astNodeCount: number;
}

interface ParsedNodeResult {
  message: ParsedMessage;
  degradedNodesCount: number;
  astNodeCount: number;
}

interface SemanticCandidate {
  kind: SemanticCandidateKind;
  node: Element;
}

interface NormalizedSemanticCandidates {
  candidates: SemanticCandidate[];
  droppedNoise: number;
}

export class YuanbaoParser implements IParser {
  detect(): Platform | null {
    const host = window.location.hostname;
    if (host.includes("yuanbao.tencent.com")) {
      return "YUANBAO";
    }
    return null;
  }

  getConversationTitle(): string {
    const titleEl = queryFirst(SELECTORS.title);
    const title = this.cleanTitle(safeTextContent(titleEl));
    if (title) return title;

    const fallbackTitle = this.cleanTitle(document.title || "");
    if (fallbackTitle) return fallbackTitle;

    return "Untitled Conversation";
  }

  getMessages(): ParsedMessage[] {
    const startedAt = performance.now();
    const perfMode = astPerfModeController.getMode("YUANBAO");
    const selectorResult = this.extractUsingSelectorStrategy(perfMode);
    const anchorResult = this.extractUsingAnchorStrategy(perfMode);
    const chosen = this.chooseBestExtraction(selectorResult, anchorResult);
    const deduped = this.dedupeNearDuplicates(chosen.messages);
    const parseDurationMs = Math.round(performance.now() - startedAt);
    const modeUpdate = astPerfModeController.record("YUANBAO", parseDurationMs);

    const stats: ParserStats = {
      source: chosen.source,
      totalCandidates: chosen.totalCandidates,
      keptMessages: deduped.length,
      roleDistribution: { user: 0, ai: 0 },
      droppedNoise: chosen.droppedNoise + (chosen.messages.length - deduped.length),
      droppedUnknownRole: chosen.droppedUnknownRole,
      parse_duration_ms: parseDurationMs,
      perf_mode: perfMode,
      next_perf_mode: modeUpdate.mode,
      degraded_nodes_count: chosen.degradedNodesCount,
      ast_node_count: chosen.astNodeCount,
      message_count: deduped.length,
      platform: "YUANBAO",
    };

    if (modeUpdate.switched) {
      logger.warn("parser", "YUANBAO AST perf mode switched", {
        platform: "YUANBAO",
        from: modeUpdate.previousMode,
        to: modeUpdate.mode,
        parse_duration_ms: parseDurationMs,
        message_count: deduped.length,
      });
    }

    for (const message of deduped) {
      stats.roleDistribution[message.role] += 1;
    }

    this.logStats(stats, deduped);
    return deduped;
  }

  isGenerating(): boolean {
    return queryFirst(SELECTORS.generating) !== null;
  }

  getSessionUUID(): string | null {
    try {
      const url = new URL(window.location.href);

      for (const key of SESSION_ID_QUERY_KEYS) {
        const value = url.searchParams.get(key);
        const normalized = this.normalizeSessionId(value);
        if (normalized) return normalized;
      }

      for (const pattern of SESSION_ID_PATTERNS) {
        const match = url.pathname.match(pattern);
        const normalized = this.normalizeSessionId(match?.[1] ?? null);
        if (normalized) return normalized;
      }
    } catch {
      return null;
    }

    return null;
  }

  getSourceCreatedAt(): number | null {
    return extractEarliestTimeFromSelectors(SELECTORS.sourceTimes);
  }

  private extractUsingSelectorStrategy(perfMode: AstPerfMode): ExtractionResult {
    const rawCandidates = this.collectSemanticCandidatesBySelector();
    return this.buildMessagesFromCandidates(rawCandidates, perfMode, "selector");
  }

  private extractUsingAnchorStrategy(perfMode: AstPerfMode): ExtractionResult {
    const rawCandidates = this.collectSemanticCandidatesByAnchor();
    return this.buildMessagesFromCandidates(rawCandidates, perfMode, "anchor");
  }

  private buildMessagesFromCandidates(
    rawCandidates: SemanticCandidate[],
    perfMode: AstPerfMode,
    source: ExtractionSource,
  ): ExtractionResult {
    const normalized = this.normalizeSemanticCandidates(rawCandidates);

    const messages: ParsedMessage[] = [];
    let droppedNoise = normalized.droppedNoise;
    let droppedUnknownRole = 0;
    let degradedNodesCount = 0;
    let astNodeCount = 0;

    let pendingCotTexts: string[] = [];
    let pendingCotElements: Element[] = [];

    for (const candidate of normalized.candidates) {
      if (candidate.kind === "user") {
        pendingCotTexts = [];
        pendingCotElements = [];

        const parsed = this.parseSingleNodeMessage(candidate.node, "user", perfMode);
        if (!parsed) {
          droppedUnknownRole += 1;
          continue;
        }
        if (!parsed.message.textContent.trim()) {
          droppedNoise += 1;
          continue;
        }

        messages.push(parsed.message);
        degradedNodesCount += parsed.degradedNodesCount;
        astNodeCount += parsed.astNodeCount;
        continue;
      }

      if (candidate.kind === "cot") {
        const cotElement = this.sanitizeContentElement(candidate.node);
        const cotText = this.cleanExtractedText(this.extractVisibleText(cotElement));
        if (!cotText) {
          droppedNoise += 1;
          continue;
        }

        pendingCotTexts.push(cotText);
        pendingCotElements.push(cotElement);
        continue;
      }

      const finalElement = this.sanitizeContentElement(candidate.node);
      const finalText = this.cleanExtractedText(this.extractVisibleText(finalElement));
      if (!finalText) {
        droppedNoise += 1;
        continue;
      }

      const merged = document.createElement("div");
      let textContent = finalText;

      if (pendingCotTexts.length > 0) {
        const cotSection = document.createElement("section");
        cotSection.setAttribute("data-vesti-yuanbao-cot", "true");
        for (const cotElement of pendingCotElements) {
          const fragment = document.createElement("div");
          fragment.setAttribute("data-vesti-yuanbao-cot-fragment", "true");
          fragment.appendChild(cotElement.cloneNode(true));
          cotSection.appendChild(fragment);
        }
        merged.appendChild(cotSection);
        textContent = `${pendingCotTexts.join("\n\n")}\n\n---\n\n${finalText}`;
      }

      const finalSection = document.createElement("section");
      finalSection.setAttribute("data-vesti-yuanbao-final", "true");
      finalSection.appendChild(finalElement.cloneNode(true));
      merged.appendChild(finalSection);

      const ast = extractAstFromElement(merged, {
        platform: "YUANBAO",
        perfMode,
      });

      messages.push({
        role: "ai",
        textContent,
        contentAst: ast.root,
        contentAstVersion: ast.root ? "ast_v1" : null,
        degradedNodesCount: ast.degradedNodesCount,
        htmlContent: merged.innerHTML,
      });

      degradedNodesCount += ast.degradedNodesCount;
      astNodeCount += ast.astNodeCount;

      pendingCotTexts = [];
      pendingCotElements = [];
    }

    return {
      source,
      totalCandidates: rawCandidates.length,
      droppedNoise,
      droppedUnknownRole,
      messages,
      degradedNodesCount,
      astNodeCount,
    };
  }

  private parseSingleNodeMessage(
    node: Element,
    role: MessageRole,
    perfMode: AstPerfMode,
  ): ParsedNodeResult | null {
    const sanitized = this.sanitizeContentElement(node);
    const textContent = this.cleanExtractedText(this.extractVisibleText(sanitized));
    if (!textContent) return null;

    const ast = extractAstFromElement(sanitized, {
      platform: "YUANBAO",
      perfMode,
    });

    return {
      message: {
        role,
        textContent,
        contentAst: ast.root,
        contentAstVersion: ast.root ? "ast_v1" : null,
        degradedNodesCount: ast.degradedNodesCount,
        htmlContent: sanitized.innerHTML,
      },
      degradedNodesCount: ast.degradedNodesCount,
      astNodeCount: ast.astNodeCount,
    };
  }

  private collectSemanticCandidatesBySelector(): SemanticCandidate[] {
    const candidates: SemanticCandidate[] = [];

    queryAllUnique(SELECTORS.userNodes).forEach((node) => {
      candidates.push({ kind: "user", node });
    });

    queryAllUnique(SELECTORS.cotParagraphs).forEach((node) => {
      candidates.push({ kind: "cot", node });
    });

    queryAllUnique(SELECTORS.finalNodes).forEach((node) => {
      candidates.push({ kind: "final", node });
    });

    return candidates;
  }

  private collectSemanticCandidatesByAnchor(): SemanticCandidate[] {
    const candidates: SemanticCandidate[] = [];

    for (const anchor of queryAllUnique(SELECTORS.anchorRoots)) {
      if (anchor.matches(".hyc-component-text")) {
        const userNode = queryFirstWithin(anchor, [".hyc-content-text"]);
        if (userNode) {
          candidates.push({ kind: "user", node: userNode });
        }
      }

      if (anchor.matches(".hyc-component-deepsearch-cot__think")) {
        queryAllWithinUnique(anchor, SELECTORS.cotParagraphs).forEach((node) => {
          candidates.push({ kind: "cot", node });
        });
      }

      if (anchor.matches(".hyc-common-markdown:not(.hyc-common-markdown-style-cot)")) {
        candidates.push({ kind: "final", node: anchor });
      }
    }

    return candidates;
  }

  private normalizeSemanticCandidates(candidates: SemanticCandidate[]): NormalizedSemanticCandidates {
    const byNode = new Map<Element, SemanticCandidate>();

    for (const candidate of candidates) {
      const existing = byNode.get(candidate.node);
      if (!existing) {
        byNode.set(candidate.node, candidate);
        continue;
      }

      if (existing.kind === "cot" && candidate.kind !== "cot") {
        byNode.set(candidate.node, candidate);
      }
    }

    const orderedNodes = uniqueNodesInDocumentOrder(byNode.keys());
    const kept: SemanticCandidate[] = [];
    let droppedNoise = 0;

    for (const node of orderedNodes) {
      const candidate = byNode.get(node);
      if (!candidate) continue;

      if (this.isNoiseCandidate(candidate)) {
        droppedNoise += 1;
        continue;
      }

      const normalizedText = safeTextContent(node).replace(/\s+/g, " ").trim();
      if (normalizedText.length < 2) {
        droppedNoise += 1;
        continue;
      }

      const matchesNoisePattern = SELECTORS.noiseTextPatterns.some((pattern) =>
        pattern.test(normalizedText),
      );
      if (matchesNoisePattern) {
        droppedNoise += 1;
        continue;
      }

      kept.push(candidate);
    }

    return { candidates: kept, droppedNoise };
  }

  private isNoiseCandidate(candidate: SemanticCandidate): boolean {
    const { kind, node } = candidate;

    const inNoiseContainer = SELECTORS.noiseContainers.some(
      (selector) => node.closest(selector) !== null,
    );
    if (inNoiseContainer) return true;

    if (kind === "user") {
      if (!node.closest(".hyc-component-text")) return true;
      if (node.closest(".hyc-component-deepsearch-cot__think")) return true;
      return false;
    }

    if (kind === "cot") {
      if (!node.closest(".hyc-component-deepsearch-cot__think")) return true;
      return SELECTORS.cotNoiseContainers.some((selector) => node.closest(selector) !== null);
    }

    if (!node.matches(".hyc-common-markdown:not(.hyc-common-markdown-style-cot)")) return true;
    return node.closest(".hyc-component-deepsearch-cot__think") !== null;
  }

  private sanitizeContentElement(source: Element): Element {
    const clone = source.cloneNode(true) as Element;

    for (const selector of SELECTORS.uiNoiseSelectors) {
      clone.querySelectorAll(selector).forEach((node) => node.remove());
    }

    this.pruneEmptyNodes(clone);
    return clone;
  }

  private pruneEmptyNodes(root: Element): void {
    const emptyTextNodes: Node[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (!(current.textContent ?? "").trim()) {
        emptyTextNodes.push(current);
      }
    }

    for (const node of emptyTextNodes) {
      node.parentNode?.removeChild(node);
    }

    const descendants = Array.from(root.querySelectorAll("*")).reverse();
    for (const descendant of descendants) {
      if (descendant.tagName.toLowerCase() === "br") continue;
      const text = safeTextContent(descendant).replace(/\s+/g, " ").trim();
      if (descendant.childElementCount === 0 && text.length === 0) {
        descendant.remove();
      }
    }
  }

  private extractVisibleText(element: Element): string {
    if (element instanceof HTMLElement) {
      const innerText = (element.innerText || "").trim();
      if (innerText) {
        return innerText;
      }
    }
    return safeTextContent(element);
  }

  private cleanExtractedText(rawText: string): string {
    const lines = rawText
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0)
      .filter((line) => !NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)));

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  private cleanTitle(rawTitle: string): string {
    return rawTitle
      .replace(/\s+/g, " ")
      .replace(TITLE_PLATFORM_SUFFIX_PATTERN, "")
      .trim();
  }

  private dedupeNearDuplicates(messages: ParsedMessage[]): ParsedMessage[] {
    const deduped: ParsedMessage[] = [];

    for (const message of messages) {
      const signature = `${message.role}|${message.textContent.replace(/\s+/g, " ").trim()}`;
      const isDuplicate = deduped.slice(Math.max(0, deduped.length - 2)).some((existing) => {
        const existingSignature = `${existing.role}|${existing.textContent
          .replace(/\s+/g, " ")
          .trim()}`;
        return existingSignature === signature;
      });

      if (!isDuplicate) {
        deduped.push(message);
      }
    }

    return deduped;
  }

  private chooseBestExtraction(
    selectorResult: ExtractionResult,
    anchorResult: ExtractionResult,
  ): ExtractionResult {
    const selectorScore = this.scoreExtraction(selectorResult);
    const anchorScore = this.scoreExtraction(anchorResult);

    if (selectorScore > anchorScore) return selectorResult;
    if (anchorScore > selectorScore) return anchorResult;
    return selectorResult.messages.length >= anchorResult.messages.length
      ? selectorResult
      : anchorResult;
  }

  private scoreExtraction(result: ExtractionResult): number {
    if (result.messages.length === 0) return 0;

    const userCount = result.messages.filter((message) => message.role === "user").length;
    const aiCount = result.messages.length - userCount;
    const balancedPairs = Math.min(userCount, aiCount);

    return balancedPairs * 8 + aiCount * 4 + userCount * 2 + result.messages.length;
  }

  private normalizeSessionId(value: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim();
    if (normalized.length < 8) return null;
    if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) return null;
    if (INVALID_SESSION_IDS.has(normalized.toLowerCase())) return null;
    return normalized;
  }

  private logStats(stats: ParserStats, messages: ParsedMessage[]): void {
    logger.info("parser", "YUANBAO parse stats", stats);

    if (messages.length === 0) {
      logger.warn("parser", "YUANBAO parser kept zero messages", {
        source: stats.source,
        totalCandidates: stats.totalCandidates,
        droppedNoise: stats.droppedNoise,
        droppedUnknownRole: stats.droppedUnknownRole,
      });
      return;
    }

    const hasSingleRole = stats.roleDistribution.user === 0 || stats.roleDistribution.ai === 0;
    if (hasSingleRole) {
      logger.warn("parser", "YUANBAO parser captured only one role", {
        source: stats.source,
        roleDistribution: stats.roleDistribution,
        samples: messages
          .slice(0, 3)
          .map((message) => message.textContent.replace(/\s+/g, " ").slice(0, 120)),
      });
    }
  }
}
