# Vesti v1.2 Data Management Engineering Spec

Version: v1.2  
Status: Transitional canonical (implementation baseline, decision complete)  
Scope: Sidepanel settings + storage/messaging/data layer; no backend/cloud sync work

---

## 1. Goals

Implement local data governance without architecture rewrite:

1. Observable storage usage and quota status
2. Export all local data in JSON/TXT/MD
3. Safe clear flow with explicit danger confirmation
4. 1GB product-level soft/hard write guard

Locked product decisions:

- Add `unlimitedStorage` permission
- Keep large data in IndexedDB; keep config in `chrome.storage.local`
- Progressive disclosure for Chrome storage details (collapsed by default)
- JSON is the only reversible format; TXT/MD are human-readable
- JSON export includes summaries and weekly report caches by default
- Clear data keeps LLM config (`vesti_llm_settings`)

---

## 2. Public API / Interface Changes

## 2.1 Manifest

File: `frontend/package.json`

- Add permission: `unlimitedStorage`

## 2.2 Messaging Protocol

File: `frontend/src/lib/messaging/protocol.ts`

### Request

- `EXPORT_DATA.payload.format`: `"json" | "txt" | "md"` (previously only `"json"`)

### Response

- `GET_STORAGE_USAGE` now returns:
  - `originUsed: number`
  - `originQuota: number | null`
  - `localUsed: number`
  - `unlimitedStorageEnabled: boolean`
  - `softLimit: number`
  - `hardLimit: number`
  - `status: "ok" | "warning" | "blocked"`
- `EXPORT_DATA` now returns:
  - `content: string`
  - `mime: string`
  - `filename: string`

## 2.3 Shared Types

File: `frontend/src/lib/types/index.ts`

New types:

- `ExportFormat`
- `ExportPayload`
- `StorageUsageStatus`
- `StorageUsageSnapshot`

---

## 3. Storage Policy and Limits

## 3.1 Constants

File: `frontend/src/lib/db/storageLimits.ts`

- `SOFT_LIMIT_BYTES = 900 * 1024 * 1024`
- `HARD_LIMIT_BYTES = 1024 * 1024 * 1024`

## 3.2 Snapshot Source

- Origin usage/quota: `navigator.storage.estimate()`
- `chrome.storage.local` usage: `chrome.storage.local.getBytesInUse(null)`
- `unlimitedStorageEnabled`: derive from manifest permissions

## 3.3 Status Mapping

- `ok`: usage < 900MB
- `warning`: 900MB <= usage < 1GB
- `blocked`: usage >= 1GB

## 3.4 Write Guard

Guard all write-heavy paths:

- conversation/message writes (`deduplicateAndSave`)
- summary writes (`saveSummary`)
- weekly report writes (`saveWeeklyReport`)

Behavior:

- `blocked`: throw `STORAGE_HARD_LIMIT_REACHED`
- `warning`: allow write + emit warning log
- `ok`: allow write

---

## 4. Export Specification

Implementation file: `frontend/src/lib/services/exportSerializers.ts`

## 4.1 JSON (reversible)

Top-level:

- `schema_version = "vesti_export.v1"`
- `exported_at`
- `timezone`
- `app_version`
- `data: { conversations, messages, summaries, weeklyReports }`

Rules:

- UTF-8
- Preserve existing epoch fields
- Add ISO timestamp companion fields
- No API key / LLM credentials in export payload

## 4.2 TXT (human-readable)

Transcript style:

- Global export header
- Per-conversation metadata:
  - `Title`, `URL`, `Platform`, `Created`, `Messages`
- Message blocks:
  - `User|AI: [timestamp]`
  - message text
- Include cached summary section if available
- Include weekly report section at end

## 4.3 MD (human-readable)

Structure:

- Export metadata header
- One section per conversation
- Role-based message blocks
- Cached summary section per conversation
- Weekly reports section

Download filename:

- `vesti-export-YYYYMMDD-HHmmss.{json|txt|md}`

---

## 5. Clear Data Semantics

File: `frontend/src/lib/db/repository.ts`

`clearAllData()` must clear only business tables:

- `conversations`
- `messages`
- `summaries`
- `weekly_reports`

Must not clear:

- `chrome.storage.local["vesti_llm_settings"]`

Post-clear UI refresh:

- Send runtime signal `VESTI_DATA_UPDATED` via storage service

---

## 6. Settings UI Changes

File: `frontend/src/sidepanel/pages/SettingsPage.tsx`

Add **Data Management** card with warm-paper styling:

1. Summary (always visible)
   - `Used / App limit (1GB)` with progress bar and status chip
   - `Browser quota` with `Unknown` fallback
2. Progressive disclosure (`<details>`)
   - `chrome.storage.local used`
   - `Estimated IndexedDB + other = max(originUsed - localUsed, 0)`
   - `unlimitedStorage` enabled/disabled
3. Export actions
   - `Export JSON`, `Export TXT`, `Export MD`
4. Danger zone
   - `Clear local data` button
   - Confirmation prompt requires exact input `DELETE`
5. Feedback states
   - loading / success / error messaging

---

## 7. Data/Flow Overview

1. UI calls storage service (`GET_STORAGE_USAGE`, `EXPORT_DATA`, `CLEAR_ALL_DATA`)
2. Runtime routes to offscreen/background handlers
3. Repository + serializers execute:
   - snapshot
   - export assembly
   - clear transaction
4. Results return to UI and trigger status/notification updates

---

## 8. Test Cases

## A. Quota and Status

1. `GET_STORAGE_USAGE` returns complete structure
2. `originQuota = null` renders `Unknown`
3. Detail panel remains collapsed by default
4. Status transitions:
   - `<900MB -> ok`
   - `900MB..1GB -> warning`
   - `>=1GB -> blocked`

## B. Export

1. JSON/TXT/MD all download successfully
2. MIME and filenames match format
3. JSON contains all four datasets and schema version
4. TXT/MD keep readable chronological message order

## C. Clear

1. Non-`DELETE` input cancels operation
2. On confirm, all four business tables are empty
3. LLM config remains intact
4. Sidepanel receives refresh signal and updates views

## D. Write Guard

1. Below soft limit: writes succeed
2. Soft-limit range: writes succeed with warning logs
3. At/above hard limit: writes fail with `STORAGE_HARD_LIMIT_REACHED`
4. Export and clear remain available even in blocked state

## E. Regression

1. Summary/weekly generation unchanged under normal capacity
2. `pnpm -C frontend build` passes
3. `pnpm -C frontend package` passes

---

## 9. Known Limits / Non-goals

1. 1GB is an app policy, not a browser-guaranteed fixed quota
2. No cloud sync and no cross-device quota coordination in v1.2
3. No importer implementation in this version (JSON schema is prepared for future import)

---

## 10. Rollback Strategy

If issues occur:

1. Revert protocol expansions for `GET_STORAGE_USAGE` and `EXPORT_DATA`
2. Keep `clearAllData` table coverage fix
3. Keep `package` build-before-package script
4. Temporarily disable write guard enforcement while preserving UI quota display

---

## 11. Export Header Spec (v1.2.1)

Scope:

- Applies to TXT and MD exports only
- JSON export schema remains `vesti_export.v1` (unchanged)

Header title:

- `# vesti蹇冭抗 | 鎬濇兂妗ｆ瀵煎嚭 (Digital Dialogue Archive)`

System metadata keys (stable, non-localized):

- `Generated_By`
- `Export_Timestamp` (ISO8601 with timezone offset, e.g. `+08:00`)
- `Total_Threads`
- `Covered_Platforms` (array-like text, e.g. `[Claude, ChatGPT]`)
- `Temporal_Range` (`YYYY-MM-DD to YYYY-MM-DD`, or `N/A`)

Overview block:

- `鏃堕棿璺ㄥ害 (Date Range)`
- `鏀跺綍骞冲彴 (Platforms)`
- `瀵硅瘽鎬绘暟 (Total Threads)`
- `鏍稿績绾跨储 (Key Topics): TBD` (placeholder; NLP extraction deferred)

Thread block format:

- Heading: `## [Thread 01] {title} - {platform}`
- Fields:
  - `Source URL`
  - `Platform`
  - `Created At`
  - `Message Count`

Message block format:

- `User|AI: [timestamp]` followed by message body

Encoding and compatibility:

- UTF-8 required
- Structure optimized for both human scanning and LLM key-value extraction
- Existing summary/weekly content sections remain compatible

