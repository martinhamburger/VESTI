# Vesti Capture Debugging Playbook (v1.2/v1.3)

Version: v1.0  
Status: Operational SOP  
Audience: Engineers, QA, release owners

---

## 1. Purpose

Define a single debugging workflow for capture governance and parser issues.  
This playbook focuses on:
- capture decisions (`committed/held/rejected`)
- parser quality (`role/noise/order`)
- force-archive chain reliability

Reference relationship:
- Legacy parser-only playbook: `documents/capture_engine/parser_debug_playbook_legacy.md`
- This file is governance-aware and should be used for v1.2+ releases.

---

## 2. Debug Lifecycle (fixed 5 steps)

## Step 1: Environment Isolation

- Keep only one Vesti extension instance enabled.
- Close other chat-capture extensions.
- Confirm active branch/build hash.
- Use a fresh browser tab for each case.

## Step 2: Structured Sampling

Collect evidence before code changes:
- parser stats log
- capture decision log
- `chrome.storage.local` snapshot for `vesti_capture_settings`
- IndexedDB counts before action

## Step 3: Root-Cause Classification

Classify issue into one primary bucket:
- `parser_miss` (婕忔姄)
- `parser_noise` (璇姄/姹℃煋)
- `gate_misdecision` (鎷︽埅瑙勫垯璇垽)
- `transient_chain_failure` (force archive 閾捐矾澶辫触)
- `storage_persist_failure` (鍐欏簱澶辫触)

## Step 4: Minimal Fix Scope

- Apply smallest code surface needed.
- Do not mix parser and gate changes in one fix unless causally required.
- Keep one issue -> one fix -> one validation cycle.

## Step 5: Regression Validation

- Re-run original failing case.
- Re-run minimum regression suite:
  - ChatGPT standard flow
  - Claude standard flow
  - smart hold -> force archive flow

---

## 3. Required Logs and Key Schema

## 3.1 Capture decision log

Every capture decision must be loggable in this shape:

```ts
{
  platform: Platform
  sessionUUID: string
  mode: "mirror" | "smart" | "manual"
  decision: "committed" | "held" | "rejected"
  reason: string
  messageCount: number
  turnCount: number
  blacklistHit: boolean
  forceFlag: boolean
  intercepted: boolean
  saved?: boolean
  conversationId?: number
  occurredAt: number
}
```

## 3.2 Parse report log

```ts
{
  platform: Platform
  source: "selector" | "anchor"
  totalCandidates: number
  keptMessages: number
  roleDistribution: { user: number; ai: number }
  droppedNoise: number
  droppedUnknownRole: number
}
```

## 3.3 Status update trace

Track event emissions:
- `VESTI_CAPTURE_STATUS_UPDATED`
- `VESTI_DATA_UPDATED`

Mandatory rule:
- `VESTI_DATA_UPDATED` must not appear on held/rejected decisions.

---

## 4. Fault Matrix (Typical Failures)

| Symptom | Likely root cause | Verify first | Target fix |
| --- | --- | --- | --- |
| Smart mode never commits | turns calc or keyword matching bug | decision log `reason` always hold | fix gate rule and normalization |
| Manual force archive fails | missing transient or routing break | `GET_ACTIVE_CAPTURE_STATUS` + tab route | fix sidepanel->background->content chain |
| Only user or only ai captured | role inference drift | parse report roleDistribution | parser selector/anchor fallback fix |
| Duplicated messages in DB | missing signature idempotency path | compare incoming/stored signatures | dedupe pipeline correction |
| Data updated event fires while held | incorrect event trigger location | runtime event trace | move emit to write-success branch |

---

## 5. Evidence Package Template (per debug round)

Each round must provide:

1. One-line symptom statement  
2. Case metadata:
   - platform
   - capture mode
   - URL (masked if needed)
   - local timestamp
3. Parser log excerpt  
4. Capture decision log excerpt  
5. IndexedDB before/after counts  
6. Screenshot(s) with timestamp

Without all items above, issue is not accepted for triage.

---

## 6. Inspection Methods

## 6.1 storage.local snapshot

Inspect:
- `vesti_capture_settings`
- any capture status cache key

Record:
- raw value
- normalized value used by runtime

## 6.2 IndexedDB snapshot

Record at minimum:
- conversations row count
- messages row count
- target conversation message count

## 6.3 Active thread status check

From sidepanel action path:
- run `GET_ACTIVE_CAPTURE_STATUS`
- record `available/transientKey/messageCount/turnCount/lastDecision`

---

## 7. Round-Based SOP

## Round 1: Identify
- classify root-cause bucket only
- no broad refactor proposals

## Round 2: Patch
- apply minimal targeted fix
- include explicit changed file list

## Round 3: Verify
- rerun failing case + mandatory regression set
- produce pass/fail summary and residual risk

---

## 8. Exit Criteria for Closing a Bug

A bug is closed only if:
1. Original case passes.
2. No blocker in mandatory regression set.
3. Evidence package is complete and reproducible.
4. Fix references the root-cause class from Section 3.

---

## 9. Escalation Rules

Escalate to release owner if:
- same issue reoccurs in 2 consecutive builds
- root cause crosses modules (parser + gate + runtime)
- blocker persists within release cutoff window

Escalation package must include:
- last two evidence bundles
- attempted fixes
- unresolved hypotheses

---

## 10. Deliverable Format for Debug Reports

Store report under:
- `documents/capture_engine/debug_reports/<date>-<case-id>.md`

File naming:
- `YYYYMMDD-<platform>-<mode>-<issue-key>.md`

This keeps debugging trace auditable for release postmortem.

