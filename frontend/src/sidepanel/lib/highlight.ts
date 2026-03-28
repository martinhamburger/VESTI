import { normalizeSearchQuery, shouldHighlightSearchQuery } from "~lib/utils/searchReadiness";

export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

export function splitWithHighlight(text: string, query: string): HighlightSegment[] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!text || !shouldHighlightSearchQuery(normalizedQuery)) {
    return [{ text, highlight: false }];
  }

  const lower = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const matchIndex = lower.indexOf(normalizedQuery, index);
    if (matchIndex === -1) {
      segments.push({ text: text.slice(index), highlight: false });
      break;
    }
    if (matchIndex > index) {
      segments.push({ text: text.slice(index, matchIndex), highlight: false });
    }
    segments.push({
      text: text.slice(matchIndex, matchIndex + normalizedQuery.length),
      highlight: true,
    });
    index = matchIndex + normalizedQuery.length;
  }

  return segments;
}
