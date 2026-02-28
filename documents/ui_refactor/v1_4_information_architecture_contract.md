# Vesti v1.4 Information Architecture Contract

Version: v1.0  
Status: Decision Complete (IA Source of Truth)  
Scope: Sidepanel information architecture and navigation contracts only (no runtime behavior changes)

---

## 1. Summary

This contract freezes v1.4 IA decisions before visual iteration, so frontend, design, and QA share one boundary model.

Locked decisions:
1. Four orthogonal regions: `Threads` / `Insights` / `Data` / `Settings`.
2. `Reader` is not a top-level tab; it is a drill-down child flow under `Threads`.
3. Center logo is a single high-frequency action: `Manual Archive Active Thread`.
4. Knowledge base entry is fixed in `Insights` header.
5. Compaction follows split ownership: trigger in `Threads`, audit/metrics in `Data`.
6. v1.4 keeps internal route id `timeline`; UI label is `Threads`.
7. Top-level page headers use one title contract (18px role) and do not duplicate brand logo/wordmark.

---

## 2. Product Philosophy Alignment

### 2.1 Orthogonality rule
Each region owns one cognitive domain. New features must pass domain fit check before placement.

### 2.2 Single-action rule for center entry
Center logo cannot become a multi-destination hub in v1.4. It must remain one deterministic action.

### 2.3 No protocol drift
IA changes do not alter capture pipeline, messaging contracts, parser strategy, or DB schema.

---

## 3. Region Definitions (MECE)

## 3.1 Threads (Raw Thought Material)

Purpose:
- Default landing region for captured conversation assets.
- Browse, search, and open a thread into Reader child flow.

In scope:
- conversation list and filters
- conversation card actions
- Reader drill-down (message stream view)
- per-thread compaction trigger

Out of scope:
- weekly aggregation generation
- storage dashboard and export controls
- API/system configuration

## 3.2 Insights (Generative Abstraction)

Purpose:
- Present generated artifacts from captured threads.

In scope:
- conversation summary
- weekly report
- knowledge base entry in page header

Out of scope:
- thread-level raw message browsing
- global storage management
- system-level configuration

## 3.3 Data (Asset Management)

Purpose:
- Manage local data assets and storage health.

In scope:
- storage usage dashboard
- export format actions
- compaction audit/history and effectiveness stats

Out of scope:
- LLM prompt generation views
- capture mode tuning

## 3.4 Settings (Meta Control)

Purpose:
- Configure how the system works.

In scope:
- API key/model access
- capture mode and archive settings
- about/external links (GitHub, landing page, version info)

Out of scope:
- core content consumption
- analytics/dashboard operations

---

## 4. Center Logo Contract (Global Core Action)

Action:
- `Manual Archive Active Thread`

Behavior:
- one-click, no hover menu fan-out
- delegates to existing manual archive chain
- result feedback follows existing capture decision mapping
- logo identity is owned by Dock center action; page headers should remain page-semantic, not brand-mark containers

State contract:
- `enabled`: smart/manual mode + supported active tab + transient available
- `disabled_mode_mirror`: mirror mode
- `disabled_unsupported_tab`: active tab host unsupported
- `disabled_no_transient`: no transient snapshot yet
- `disabled_unreachable`: content script unreachable
- `loading`: archive request in flight

Note:
- strict-id remains active; missing conversation ID can still block commit.

---

## 5. Feature-to-Region Mapping

| Feature | Region | Placement rule |
| --- | --- | --- |
| Thread browsing/search | Threads | Primary region content |
| Reader message stream | Threads | Child drill-down only |
| Manual archive core action | Center logo | Global action only |
| Conversation summary | Insights | Main content |
| Weekly summary | Insights | Main content |
| Knowledge base entry | Insights | Header-level structural entry |
| Compaction trigger | Threads | Per-thread action |
| Compaction metrics/history | Data | Dashboard/audit surface |
| Storage usage dashboard | Data | Primary panel |
| Export actions | Data | Primary panel |
| API key/model config | Settings | Primary panel |
| GitHub/landing links | Settings | About section footer |

---

## 6. Naming and Routing Strategy

UI naming (v1.4):
- `Threads`
- `Insights`
- `Data`
- `Settings`

Internal route compatibility (v1.4):
- Keep existing route id: `timeline | insights | data | settings`
- `timeline` is rendered as user-facing label `Threads`

Rationale:
- Preserve low-risk implementation path while freezing user-facing IA semantics.

---

## 7. Non-Goals for This Contract

- No code implementation details for component visuals.
- No capture governance changes.
- No messaging/type/schema migration.
- No floating capsule behavior expansion (reserved for v1.5).

---

## 8. Acceptance Checklist

1. All v1.4 docs use the same four region names.
2. Reader is described only as Threads child flow.
3. Center logo is defined as single manual archive action.
4. Knowledge base entry is documented in Insights header.
5. Compaction split ownership is explicit: trigger vs audit.
6. Internal route compatibility (`timeline`) is clearly documented.
7. Top-level page headers are documented as unified 18px title role with no duplicated logo/wordmark.
