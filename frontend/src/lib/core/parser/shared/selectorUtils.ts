export interface CandidateNormalizationOptions {
  minTextLength?: number;
  noiseContainerSelectors?: string[];
  noiseTextPatterns?: RegExp[];
}

export interface CandidateNormalizationResult {
  nodes: Element[];
  droppedNoise: number;
}

function sortByDocumentOrder(nodes: Element[]): Element[] {
  return [...nodes].sort((a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

export function uniqueNodesInDocumentOrder(nodes: Iterable<Element>): Element[] {
  return sortByDocumentOrder(Array.from(new Set(nodes)));
}

export function queryFirst(selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function queryAll(selectors: string[]): Element[] {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length > 0) return nodes;
  }
  return [];
}

export function queryAllUnique(selectors: string[]): Element[] {
  const nodes: Element[] = [];
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((node) => nodes.push(node));
  }
  return uniqueNodesInDocumentOrder(nodes);
}

export function queryAllWithinUnique(root: Element, selectors: string[]): Element[] {
  const nodes: Element[] = [];
  for (const selector of selectors) {
    if (root.matches(selector)) {
      nodes.push(root);
    }
    root.querySelectorAll(selector).forEach((node) => nodes.push(node));
  }
  return uniqueNodesInDocumentOrder(nodes);
}

export function matchesAnySelector(root: Element, selectors: string[]): boolean {
  return selectors.some((selector) => root.matches(selector));
}

export function queryFirstWithin(root: Element, selectors: string[]): Element | null {
  for (const selector of selectors) {
    if (root.matches(selector)) return root;
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function hasAnySelector(root: Element, selectors: string[]): boolean {
  return selectors.some(
    (selector) => root.matches(selector) || root.querySelector(selector) !== null,
  );
}

export function closestAnySelector(root: Element, selectors: string[]): Element | null {
  let current: Element | null = root;
  while (current) {
    if (matchesAnySelector(current, selectors)) return current;
    current = current.parentElement;
  }
  return null;
}

export function collapseNodesToNearestRoots(
  nodes: Iterable<Element>,
  selectors: string[],
): Element[] {
  const collapsed: Element[] = [];

  for (const node of uniqueNodesInDocumentOrder(nodes)) {
    const root = matchesAnySelector(node, selectors)
      ? node
      : closestAnySelector(node, selectors);
    if (root) {
      collapsed.push(root);
    }
  }

  return uniqueNodesInDocumentOrder(collapsed);
}

export function normalizeCandidateNodes(
  nodes: Element[],
  options: CandidateNormalizationOptions = {},
): CandidateNormalizationResult {
  const minTextLength = options.minTextLength ?? 1;
  const noiseContainerSelectors = options.noiseContainerSelectors ?? [];
  const noiseTextPatterns = options.noiseTextPatterns ?? [];

  let droppedNoise = 0;
  const kept: Element[] = [];

  for (const node of uniqueNodesInDocumentOrder(nodes)) {
    const inNoiseContainer = noiseContainerSelectors.some(
      (selector) => node.closest(selector) !== null,
    );
    if (inNoiseContainer) {
      droppedNoise += 1;
      continue;
    }

    const normalizedText = safeTextContent(node).replace(/\s+/g, " ").trim();
    if (normalizedText.length < minTextLength) {
      droppedNoise += 1;
      continue;
    }

    const matchesNoisePattern = noiseTextPatterns.some((pattern) =>
      pattern.test(normalizedText),
    );
    if (matchesNoisePattern) {
      droppedNoise += 1;
      continue;
    }

    kept.push(node);
  }

  return { nodes: kept, droppedNoise };
}

export function safeTextContent(el: Element | null): string {
  if (!el) return "";
  try {
    const text = (el.textContent || "").trim();
    if (text) return text;
    if (el instanceof HTMLElement) {
      const inner = (el.innerText || "").trim();
      if (inner) return inner;
    }
  } catch {
    // Ignore parsing errors and fall back to empty.
  }
  return "";
}

export function extractEarliestTimeFromSelectors(selectors: string[]): number | null {
  const nodes = queryAllUnique(selectors);
  let earliest: number | null = null;

  for (const node of nodes) {
    const rawDateTime =
      node.getAttribute("datetime") ??
      (node instanceof HTMLTimeElement ? node.dateTime : null);
    if (!rawDateTime) continue;

    const parsed = Date.parse(rawDateTime);
    if (!Number.isFinite(parsed)) continue;

    if (earliest === null || parsed < earliest) {
      earliest = parsed;
    }
  }

  return earliest;
}
