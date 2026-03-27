import {
  buildMessageFallbackDisplayText as buildSharedFallbackDisplayText,
  buildMessagePreviewText as buildSharedPreviewText,
  buildMessageSidecarSummaryLines as buildSharedSidecarSummaryLines,
} from "@vesti/ui";
import type { Message } from "../types";
import { extractAstPlainText, isAstRoot, shouldPreferAstCanonicalText } from "./astText";

function normalizeBodyText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resolveCanonicalBodyText(message: Pick<Message, "content_text" | "content_ast">): string {
  const fallbackText = normalizeBodyText(message.content_text);
  const astRoot = isAstRoot(message.content_ast) ? message.content_ast : null;

  if (
    astRoot &&
    shouldPreferAstCanonicalText({
      root: astRoot,
      fallbackText,
    })
  ) {
    const canonical = normalizeBodyText(extractAstPlainText(astRoot));
    if (canonical) {
      return canonical;
    }
  }

  return fallbackText;
}

export function buildMessageSidecarSummaryLines(message: Message): string[] {
  return buildSharedSidecarSummaryLines(message);
}

export function buildMessagePreviewText(
  message: Message,
  options: {
    maxChars?: number;
    separator?: string;
    includeSidecarsWhenBodyPresent?: boolean;
  } = {},
): string {
  return buildSharedPreviewText(
    {
      ...message,
      content_text: resolveCanonicalBodyText(message),
    },
    options,
  );
}

export function buildMessageFallbackDisplayText(message: Message): string {
  return buildSharedFallbackDisplayText({
    ...message,
    content_text: resolveCanonicalBodyText(message),
  });
}

export function buildMessageSearchIndexText(message: Message): string {
  const bodyText = resolveCanonicalBodyText(message);
  const sidecarLines = buildSharedSidecarSummaryLines(message);
  return [bodyText, ...sidecarLines].filter(Boolean).join("\n").trim();
}
