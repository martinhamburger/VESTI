import type { MessageArtifact, MessageArtifactKind } from "../types";

export function createMessageArtifact(params: {
  kind: MessageArtifactKind;
  label?: string;
}): MessageArtifact {
  const label = params.label?.trim();
  return label
    ? { kind: params.kind, label }
    : { kind: params.kind };
}

export function normalizeMessageArtifacts(value: unknown): MessageArtifact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: MessageArtifact[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as {
      kind?: unknown;
      label?: unknown;
    };

    const kind =
      record.kind === "canvas" ||
      record.kind === "preview" ||
      record.kind === "code_artifact" ||
      record.kind === "download_card"
        ? record.kind
        : "unknown";

    const artifact = createMessageArtifact({
      kind,
      label: typeof record.label === "string" ? record.label : undefined,
    });

    const signature = `${artifact.kind}|${artifact.label ?? ""}`;
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    normalized.push(artifact);
  }

  return normalized;
}
