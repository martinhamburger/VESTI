import type { AstRoot } from "../types/ast";
import { inspectAstStructure } from "./astText";

export function buildRichOnlyNormalizedHtmlSnapshot(params: {
  html: string | null | undefined;
  ast: AstRoot | null | undefined;
  hasCitations?: boolean;
  hasAttachments?: boolean;
  hasArtifacts?: boolean;
}): string | null {
  const html = params.html?.trim();
  if (!html) {
    return null;
  }

  if (params.hasCitations || params.hasAttachments || params.hasArtifacts) {
    return html;
  }

  if (!params.ast) {
    return null;
  }

  const stats = inspectAstStructure(params.ast);
  const shouldPersist =
    stats.hasTable ||
    stats.hasMath ||
    stats.hasCodeBlock ||
    stats.hasBlockquote ||
    stats.hasHeading ||
    stats.hasAttachment;

  return shouldPersist ? html : null;
}
