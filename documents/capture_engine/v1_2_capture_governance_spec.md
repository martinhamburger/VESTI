# Vesti v1.2 Capture Governance Engineering Spec

Version: v1.2  
Status: Decision Complete (implementation baseline)  
Scope: Capture governance core only (no new platform parser in v1.2)

---

## 1. Summary

v1.2 delivers capture governance with three modes (`mirror/smart/manual`) and write interception before IndexedDB I/O.  
This version keeps parser coverage on ChatGPT + Claude and adds Sidepanel-only manual archive control.

Locked decisions:
- v1.2 does not introduce Gemini/DeepSeek/Doubao/Qwen parser implementation.
- Manual override entry is Sidepanel only.
- Interception happens before `deduplicateAndSave`.
- `VESTI_DATA_UPDATED` is emitted only after a real DB write succeeds.

Implementation log:
- Step1-Step4 engineering execution details are tracked in
  `documents/capture_engine/v1_2_step1_to_step4_execution_log.md`.

---

## 2. Current Baseline (As-Is)

Current capture path:

`contents/chatgpt.ts | contents/claude.ts`  
-> `ConversationObserver`  
-> `CapturePipeline.capture()`  
-> runtime `CAPTURE_CONVERSATION`  
-> `offscreen/background` handler  
-> `deduplicateAndSave`  
-> Dexie (`conversations/messages`)

Current behavior is passthrough (equivalent to future `mirror` mode).

---

## 3. In-Scope / Out-of-Scope

### In scope (v1.2)
- Capture mode settings and persistence.
- Pre-write interception layer (gatekeeper).
- Transient memory contract and force-archive flow.
- Sidepanel settings UI for capture mode and smart config.
- Sidepanel button `Archive Active Thread Now`.
- New internal messaging and event contracts.

### Out of scope (v1.2)
- New content scripts/parsers for new platforms.
- New floating/injected page UI for manual archive.
- Cloud sync or cross-device transient persistence.
- Parser strategy overhaul beyond existing ChatGPT/Claude.

---

## 4. Data Model and Defaults

## 4.1 Storage key

- `chrome.storage.local["vesti_capture_settings"]`

## 4.2 Types

```ts
type CaptureMode = "mirror" | "smart" | "manual"

type CaptureDecision = "committed" | "held" | "rejected"

type CaptureDecisionReason =
  | "mode_mirror"
  | "mode_manual_hold"
  | "smart_below_min_turns"
  | "smart_keyword_blocked"
  | "smart_pass"
  | "force_archive"
  | "empty_payload"
  | "storage_limit_blocked"
  | "persist_failed"

interface CaptureSettings {
  mode: CaptureMode
  smartConfig: {
    minTurns: number // 1..20
    blacklistKeywords: string[]
  }
}

interface CaptureDecisionMeta {
  mode: CaptureMode
  decision: CaptureDecision
  reason: CaptureDecisionReason
  messageCount: number
  turnCount: number
  blacklistHit: boolean
  forceFlag: boolean
  intercepted: boolean
  transientKey?: string
  occurredAt: number
}
```

## 4.3 Defaults

```ts
const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  mode: "mirror",
  smartConfig: {
    minTurns: 3,
    blacklistKeywords: []
  }
}
```

Validation rules:
- `minTurns` must be integer in `[1, 20]`.
- `blacklistKeywords` trimmed, deduplicated, empty items removed.

---

## 5. Interception Layer (Gatekeeper)

## 5.1 Placement

New module:
- `frontend/src/lib/capture/storage-interceptor.ts`

Invocation point:
- in offscreen/background `CAPTURE_CONVERSATION` path, before `deduplicateAndSave`.

## 5.2 Decision algorithm

Input:
- `payload` (conversation + messages)
- `settings`
- `forceFlag` (default `false`)

Derived fields:
- `messageCount = payload.messages.length`
- `turnCount = Math.floor(messageCount / 2)`
- `combinedText = title + snippet + all message text` (lowercased)
- `blacklistHit = any keyword in combinedText`

Rules:
1. if `messageCount === 0`: `rejected/empty_payload`
2. if `forceFlag === true`: `committed/force_archive`
3. if `mode === mirror`: `committed/mode_mirror`
4. if `mode === manual`: `held/mode_manual_hold`
5. if `mode === smart` and `blacklistHit === true`: `held/smart_keyword_blocked`
6. if `mode === smart` and `turnCount < minTurns`: `held/smart_below_min_turns`
7. if `mode === smart` and conditions pass: `committed/smart_pass`

Persistence rule:
- only `committed` proceeds to `deduplicateAndSave`.
- `held/rejected` returns without DB write.

Error mapping:
- `STORAGE_HARD_LIMIT_REACHED` -> `rejected/storage_limit_blocked`
- other persistence error -> `rejected/persist_failed`

---

## 6. Transient Memory and Retroactive Save

## 6.1 Location and lifecycle

Transient payload lives in content script RAM (per tab, non-persistent).

Suggested module:
- `frontend/src/lib/capture/transient-store.ts`

Key:
- `transientKey = "${platform}:${sessionUUID}"`

Value:
- latest full payload (`conversation + messages`)
- latest `CaptureDecisionMeta`
- `updatedAt`

## 6.2 Update policy

On each observer emit:
1. parse payload
2. update transient store (overwrite latest)
3. send `CAPTURE_CONVERSATION` to runtime
4. receive decision
5. update transient status from response

When commit succeeds:
- keep lightweight status (`archived`) and clear heavy payload body to save memory.

## 6.3 Force archive flow

Sidepanel action `Archive Active Thread Now`:
1. Sidepanel -> Background (`FORCE_ARCHIVE_TRANSIENT`, with active tab context)
2. Background -> active tab content script (`FORCE_ARCHIVE_TRANSIENT`)
3. Content script reads current transient payload
4. Content script sends `CAPTURE_CONVERSATION` with `forceFlag=true`
5. Runtime commits bypassing hold rules
6. Runtime returns decision + saved result
7. Sidepanel refreshes status and conversation list

No transient payload case:
- return diagnosable error `TRANSIENT_NOT_FOUND` (not silent fail).

---

## 7. Internal Messaging Contract (v1.2)

## 7.1 New request types

- `GET_CAPTURE_SETTINGS`
- `SET_CAPTURE_SETTINGS`
- `GET_ACTIVE_CAPTURE_STATUS`
- `FORCE_ARCHIVE_TRANSIENT`

## 7.2 Extended request payload

- `CAPTURE_CONVERSATION.payload` adds:
  - `forceFlag?: boolean` (default false)

## 7.3 Response shape additions

`CAPTURE_CONVERSATION` response extends to:

```ts
{
  saved: boolean
  newMessages: number
  conversationId?: number
  decision: CaptureDecisionMeta
}
```

Other responses:

```ts
GET_CAPTURE_SETTINGS -> { settings: CaptureSettings }
SET_CAPTURE_SETTINGS -> { saved: true; settings: CaptureSettings }
GET_ACTIVE_CAPTURE_STATUS -> {
  available: boolean
  mode: CaptureMode
  transientKey?: string
  platform?: Platform
  sessionUUID?: string
  messageCount?: number
  turnCount?: number
  lastDecision?: CaptureDecisionMeta
  updatedAt?: number
}
FORCE_ARCHIVE_TRANSIENT -> {
  forced: boolean
  saved: boolean
  conversationId?: number
  decision: CaptureDecisionMeta
}
```

---

## 8. Runtime Events

Add/standardize:
- `VESTI_CAPTURE_STATUS_UPDATED`
  - emitted when capture decision state changes (held/committed/rejected).
- `VESTI_DATA_UPDATED`
  - emitted only when DB write actually succeeds.

Event payload baseline:

```ts
{
  type: "VESTI_CAPTURE_STATUS_UPDATED"
  decision: CaptureDecisionMeta
  tabId?: number
}
```

---

## 9. Sidepanel UX Spec (v1.2)

## 9.1 Settings > Capture Engine card

Controls:
- Radio group: `Full Mirror` / `Smart Denoising` / `Manual Archive`
- Smart subpanel (visible only in `smart`)
  - `Minimum turns` number input (1..20)
  - `Blacklist keywords` chip input (enter/comma split)
- Manual help text (visible only in `manual`)
  - clearly states auto-save is blocked until manual archive

Primary actions:
- `Save Capture Settings`
- `Archive Active Thread Now` (available when active tab is supported and transient exists)

Status surface:
- last decision reason
- active mode badge
- active thread transient availability (`available/unavailable`)

## 9.2 Supported-page behavior

If active tab is unsupported domain:
- disable `Archive Active Thread Now`
- show reason `Unsupported active tab`.

---

## 10. Edge Cases and Expected Behavior

1. **Smart threshold crossing**
   - conversation held at 2 turns, then reaches 3 turns
   - expected: next emit commits full latest conversation snapshot.
2. **Blacklist toggling**
   - keyword hit holds capture; later no hit
   - expected: next emit re-evaluates and may commit.
3. **Manual mode tab close**
   - transient not persisted, page closes
   - expected: transient lost (accepted by design).
4. **Force archive while parser returns empty**
   - expected: `TRANSIENT_NOT_FOUND` or `empty_payload` reject.
5. **Storage hard limit reached**
   - expected: rejected with `storage_limit_blocked`; no `VESTI_DATA_UPDATED`.

---

## 11. Acceptance Criteria (v1.2)

1. Mode switch persists in `vesti_capture_settings` and reloads correctly.
2. `mirror` writes continue to work exactly as v1.2 baseline.
3. `smart` holds or commits according to threshold/blacklist rules.
4. `manual` blocks auto-write for all observer emits.
5. `Archive Active Thread Now` commits held/manual transient successfully.
6. `CAPTURE_CONVERSATION` returns decision metadata on every call.
7. `VESTI_DATA_UPDATED` fires only on successful DB write.
8. Existing title rename remains preserved across new capture writes.
9. ChatGPT/Claude baseline parser behavior shows no functional regression.

---

## 12. Non-Goals and Deferred Items

- Floating injected archive UI is deferred to v1.3.
- New parser implementations for Gemini/DeepSeek/Doubao/Qwen are deferred to v1.3.
- No transient persistence to extension storage in v1.2.

---

## 13. Cross-Document Reference

- Existing legacy parser SOP remains at `documents/capture_engine/parser_debug_playbook_legacy.md`.
- New governance-specific operational baseline is in:
  - `capture_debugging_playbook.md`
  - `manual_sampling_and_acceptance.md`

When conflicts exist, this v1.2 spec is source of truth for capture governance behavior.

