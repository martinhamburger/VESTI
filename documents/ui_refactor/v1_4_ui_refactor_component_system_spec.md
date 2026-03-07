# Vesti v1.4 UI Refactor Component System Spec

Version: v1.2  
Status: Decision Complete  
Scope: Component architecture, visual tokens, and interaction contracts

---

## 1. Component Tiers

Tier A (app shell)
- `VestiSidepanel`
- `Dock`
- center action affordance (logo button)

Tier B (top-level regions)
- Threads region (`timeline` route id in code)
- `InsightsPage`
- `DataPage`
- `SettingsPage`

Tier B child flow
- `ReaderView` (Threads drill-down only)

Tier C (reusable units)
- `ConversationCard`
- `MessageBubble`
- `PlatformTag`
- `SearchInput`
- `StructuredSummaryCard`
- `StructuredWeeklyCard`
- `DataManagementPanel`

Reference:
- `documents/ui_refactor/v1_4_information_architecture_contract.md`
- `documents/ui_refactor/v1_4_settings_information_density_contract.md`

---

## 2. Token Contract

Source files:
- `frontend/src/style.css`
- `frontend/tailwind.config.ts`
- `packages/vesti-ui/src/constants/platform.ts`

Rules:
1. Dock / sidepanel / Threads colors come from semantic tokens; avoid hard-coded hex in those components.
2. Web dashboard badges in `@vesti/ui` use a separate solid-fill platform contract from `packages/vesti-ui/src/constants/platform.ts`.
3. Dock / Threads and web dashboard share platform identity and labels, not the same badge rendering algorithm.
4. Spacing scale must be consistent across all top-level regions.
5. Typography roles are fixed:
   - page title (18px role, shared by Threads / Insights / Data / Settings)
   - section title
   - body text
   - metadata text
6. Platform tag colors use the locked 8-platform mapping:
   - ChatGPT `#10A37F`
   - Claude `#CC785C`
   - Gemini `#AD89EB`
   - DeepSeek `#0D28F3`
   - Qwen `#C026D3`
   - Doubao `#1E6FFF`
   - Kimi `#181C28`
   - Yuanbao `#00C5A3`
7. Naming contract is fixed to `Yuanbao` for type/display/theme mapping.
8. Sans UI font must load from local bundle (`Vesti Sans UI`) with unicode split (Lexend for Latin, Source Han Sans SC for CJK), not external CDN.
9. Brand logo/wordmark is not repeated in top-level page headers; Dock center action remains the single logo owner.

---

## 3. State Rendering Contract

Each Tier B region must define explicit rendering for:
- loading
- empty
- error
- ready

Each Tier C actionable component must define:
- default
- hover
- active
- disabled
- focus-visible

Center action states must define:
- enabled
- disabled_mode_mirror
- disabled_unsupported_tab
- disabled_no_transient
- disabled_unreachable
- loading

---

## 4. Interaction Contract

1. Card click area and action buttons cannot overlap semantics.
2. Reader remains a Threads child flow, not a dock-level destination.
3. Inline edit controls (e.g., title rename) must preserve keyboard flows:
   - Enter: confirm
   - Esc: cancel
4. Destructive actions must keep confirm guard.
5. Copy/open/external actions must keep telemetry hooks where already present.
6. Center logo interaction must stay single-purpose in v1.4 (manual archive only).
7. Settings grouping contract:
   - `DisclosureSection` is used for `Appearance` + `System` sections.
   - `Support` uses dedicated flat link rows (no disclosure shell).
   - `Language` uses disabled-soon row semantics (non-expandable, no chevron).
8. Send Feedback contract:
   - inline reveal block is row-triggered disclosure, not switch/toggle behavior.
   - reveal content includes email, copy action, and GitHub issue shortcut.

---

## 5. Feature Boundary Contract

1. Knowledge base entry is a structural element in Insights header.
2. Compaction trigger belongs to Threads per-thread action.
3. Compaction metrics/history belong to Data dashboard.
4. External links (GitHub/landing) belong to Settings about section.
5. Components must not host cross-domain actions outside these boundaries.

---

## 6. Accessibility Contract

Minimum requirements:
- visible focus ring for keyboard navigation
- aria labels on icon-only buttons
- color contrast must pass practical readability standard for metadata text
- no critical action only discoverable via hover

---

## 7. Responsiveness and Density

- Sidepanel width is constrained, so dense mode must remain readable.
- Multi-line truncation rules must be deterministic (`line-clamp-*` where applicable).
- Metadata rows should not wrap into ambiguous layouts for long titles.
- Center action affordance must remain discoverable in compact height.
- Settings body text density must remain minimal; long explanatory paragraphs move to README.

---

## 8. Regression Guardrails

Do not regress:
- capture status visibility in Settings
- archive action reachability in Settings/center action
- thread list refresh after `VESTI_DATA_UPDATED`
- insights generate/test action flows
- data export and clear data flows

---

## 9. Deliverables

1. Updated component implementation.
2. Before/after screenshot set by region and Reader child flow.
3. Component diff notes explaining hierarchy or behavior changes.
4. QA evidence package from manual sampling checklist.

---

## 10. rc.6 Addendum (Kimi + Yuanbao)

1. This cycle only expands platform mapping for capture/capsule/insights badges.
2. Threads layout structure must remain unchanged (no header/spacing/density/radius redesign).
3. Light/dark token additions are additive only; existing 6-platform tones must not shift.

## 11. rc.7 Addendum (Web Theme Sync)

1. Dashboard/options and dock share a single `vesti_ui_settings.themeMode` state contract, but keep separate badge rendering systems.
2. Web dashboard appearance controls live in the top-right avatar settings drawer under an explicit `Appearance` section.
3. Web dashboard theme changes must react to `chrome.storage.local` updates so dock-initiated changes propagate without reload.
4. Dock/Threads badge visuals remain unchanged; only shared theme state is synchronized.
5. Web badge rendering keeps solid fills, with a Kimi-specific override: light mode uses dark text, dark mode uses white text.
