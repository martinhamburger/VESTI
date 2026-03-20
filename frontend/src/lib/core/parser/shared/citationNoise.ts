import type { Platform, MessageCitationSourceType, MessageCitation } from "../../../types";
import { createMessageCitation, normalizeMessageCitations } from "../../../utils/messageCitations";

export interface CitationSelectorProfile {
  selector: string;
  sourceType: MessageCitationSourceType;
}

export interface CitationNoiseProfile {
  citationSelectors: CitationSelectorProfile[];
  noiseSelectors: string[];
}

export interface CitationNoiseResult {
  clone: Element;
  citations: MessageCitation[];
}

const EMPTY_PROFILE: CitationNoiseProfile = {
  citationSelectors: [],
  noiseSelectors: [],
};

const PROFILE_BY_PLATFORM: Record<Platform, CitationNoiseProfile> = {
  ChatGPT: {
    citationSelectors: [
      {
        selector: '[data-testid="webpage-citation-pill"]',
        sourceType: "inline_pill",
      },
    ],
    noiseSelectors: [],
  },
  Claude: EMPTY_PROFILE,
  Gemini: EMPTY_PROFILE,
  DeepSeek: EMPTY_PROFILE,
  Qwen: {
    citationSelectors: [],
    noiseSelectors: [".qwen-chat-search-card", "[class*='search-card']"],
  },
  Doubao: {
    citationSelectors: [],
    noiseSelectors: [
      "[class*='search-card']",
      "[class*='search-widget']",
      "[class*='reference-count']",
      "[class*='references-count']",
    ],
  },
  Kimi: EMPTY_PROFILE,
  Yuanbao: EMPTY_PROFILE,
};

function collectNodesIncludingRoot(root: Element, selector: string): Element[] {
  const nodes: Element[] = [];
  if (root.matches(selector)) {
    nodes.push(root);
  }
  root.querySelectorAll(selector).forEach((node) => nodes.push(node));
  return nodes;
}

function extractCitationFromNode(
  node: Element,
  sourceType: MessageCitationSourceType,
): MessageCitation | null {
  const linkNode =
    (node.matches("a[href]") ? node : null) ?? node.querySelector("a[href]");
  const href = linkNode?.getAttribute("href") ?? "";
  const rawLabel =
    node instanceof HTMLElement
      ? node.innerText || node.textContent || ""
      : node.textContent || "";

  return createMessageCitation({
    label: rawLabel,
    href,
    sourceType,
  });
}

export function getCitationNoiseProfile(platform: Platform): CitationNoiseProfile {
  return PROFILE_BY_PLATFORM[platform] ?? EMPTY_PROFILE;
}

export function cloneAndSanitizeMessageContent(
  source: Element,
  profile: CitationNoiseProfile,
): CitationNoiseResult {
  const clone = source.cloneNode(true) as Element;
  const citations: MessageCitation[] = [];

  for (const citationProfile of profile.citationSelectors) {
    const matches = collectNodesIncludingRoot(clone, citationProfile.selector);
    for (const match of matches) {
      const citation = extractCitationFromNode(match, citationProfile.sourceType);
      if (citation) {
        citations.push(citation);
      }
    }
  }

  for (const citationProfile of profile.citationSelectors) {
    for (const match of collectNodesIncludingRoot(clone, citationProfile.selector).reverse()) {
      match.remove();
    }
  }

  for (const selector of profile.noiseSelectors) {
    for (const match of collectNodesIncludingRoot(clone, selector).reverse()) {
      match.remove();
    }
  }

  return {
    clone,
    citations: normalizeMessageCitations(citations),
  };
}
