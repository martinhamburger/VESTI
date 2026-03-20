# Web Dashboard Reader / Render Contract Draft

Status: Draft canonical web-facing contract  
Audience: Frontend engineers, runtime engineers, release owners

## 1. Purpose

This document defines the **minimum web-facing schema draft** and the **reader/web rendering contract draft**
for the next implementation stage.

It does not redefine capture-engine internals or storage schema.
Instead, it answers:

- what is the minimum structured package the web layer should consume
- how web reader / library detail should render that package
- which behaviors must stay aligned with sidepanel reader

## 2. Current problem statement

The current web/dashboard stack is only partially aligned with sidepanel:

- time semantics are moving toward shared helpers
- message rendering is still more text-centric
- `message.content_text` is still doing too much work
- `citations[]` and `artifacts[]` are not yet stable first-class surfaces in web detail views

This creates three practical risks:

1. rich message fidelity still depends on how much structure survived into `content_text`
2. citation / search-card noise can reappear as body-tail text in web consumers
3. web and sidepanel can drift into two different notions of reader correctness

## 3. Minimum web-facing schema draft

This is a **consumer contract draft**, not a Dexie schema definition.

### 3.1 Conversation view-model

```ts
interface WebConversationView {
  id: number;
  title: string;
  platform: Platform;
  url: string;
  source_created_at: number | null;
  first_captured_at: number;
  last_captured_at: number;
  created_at: number;
  updated_at: number;
  message_count: number;
  turn_count: number;
  tags: string[];
  topic_id: number | null;
  is_starred: boolean;

  originAt: number;
  captureFreshnessAt: number;
  recordModifiedAt: number;
}
```

Rules:
- `title` must come from app-shell metadata capture, not body-heading inference
- `originAt = source_created_at ?? first_captured_at ?? created_at`
- `captureFreshnessAt = last_captured_at ?? updated_at`
- `recordModifiedAt = updated_at`

### 3.2 Message view-model

```ts
interface WebMessageView {
  id: number;
  conversation_id: number;
  role: "user" | "ai";
  canonical_plain_text: string;
  semantic_ast_version?: "ast_v2" | "ast_v1" | null;
  semantic_ast?: unknown | null;
  citations?: WebMessageCitation[];
  artifacts?: WebMessageArtifact[];
  created_at: number;
}

interface WebMessageCitation {
  label: string;
  href: string;
  host: string;
  sourceType: "inline_pill" | "search_card" | "reference_list" | "unknown";
}

interface WebMessageArtifact {
  kind:
    | "canvas"
    | "preview"
    | "code_artifact"
    | "download_card"
    | "standalone_artifact"
    | "unknown";
  label?: string;
  captureMode?: "presence_only" | "embedded_dom_snapshot" | "standalone_artifact";
  renderDimensions?: { width: number; height: number };
}
```

Rules:
- `canonical_plain_text` is fallback-only body text
- `semantic_ast` is the preferred rich rendering source
- `citations[]` and `artifacts[]` are sidecars and never body suffixes

### 3.3 Transitional compatibility rule

Until runtime/package refactors are fully completed, the web adapter may derive:

- `canonical_plain_text` from current `message.content_text`
- `semantic_ast_version` from current `content_ast_version`
- `semantic_ast` from current `content_ast`

But the web layer should already behave as if the target contract exists.

## 4. Reader / web rendering contract

### 4.1 Shared title rule

- conversation title is resolved before body rendering
- body headings never overwrite title
- web and sidepanel must display the same conversation title for the same thread

### 4.2 Shared metadata rule

Reader header must show:
- `Started` = `originAt`
- `Source Time` if present
- `First Captured`
- `Last Captured`
- `Last Modified`

Web and sidepanel must not diverge on the meaning of these fields.

### 4.3 Body rendering rule

- first choice: rich render from `semantic_ast`
- fallback: render `canonical_plain_text`
- web must not keep a separate pure-text reader as its long-term detailed-reading mode

### 4.4 Table / math / code fidelity rule

For rich messages:
- table must render from structured table nodes, not reconstructed plain text
- math must render from semantic source, not renderer-polluted text
- code blocks must exclude UI controls such as copy buttons, badges, and toolbars

### 4.5 Sources rule

If `citations.length > 0`:
- render a message-level folded `Sources` section
- each item shows at least `label + host`
- click navigates to `href`
- citation text must not be appended to message body

### 4.6 Artifacts rule

If `artifacts.length > 0`:
- render a message-level folded `Artifacts` section
- this stage only requires presence-level rendering
- acceptable fields:
  - `kind`
  - `label`
  - `captureMode`
  - `renderDimensions`

This stage does **not** require full artifact replay.

## 5. Web-library specific rule

The web Library surface may keep a compact list preview, but once the user opens a conversation detail:

- it must switch to the same rendering contract as sidepanel reader
- it must not revert to a raw `content_text` transcript viewer

Compact list cards and detailed thread readers are not the same surface and must not share the same fidelity threshold.

## 6. Implementation order

Recommended next-stage order:

1. align web adapter to the minimum schema draft
2. reuse or port sidepanel reader renderer into web detail view
3. add `Sources` sidecar rendering
4. add `Artifacts` sidecar rendering
5. only then expand web-specific export/summary UX

## 7. Non-goals

This draft does not commit to:
- full artifact replay in web
- new storage schema by itself
- insights/compression becoming package-aware in the same step
- network graph redesign

Those are separate follow-on work items.
