# Architectural Decisions

This document records significant architectural decisions made during development of MHC Control Panel.

---

## 2024-12-XX — Alias Tracking

**Context:**
Need to track username changes for viewers/models across the platform.

**Decision:**
Implemented via `person_aliases` table. Lookups match against both `persons.username` and `person_aliases.alias`.

**Tradeoffs:**
- Pro: Maintains full history of username changes
- Con: Requires join for lookups

**Status:** Accepted

---

## 2024-12-XX — smk_lover Exclusion

**Context:**
The `smk_lover` account generates noise in aggregates.

**Decision:**
Auto-set `is_excluded=true` on Person creation when `username='smk_lover'`. Excluded persons filtered from all aggregates by default.

**Tradeoffs:**
- Pro: Cleaner analytics
- Con: Hardcoded exclusion rule

**Status:** Accepted

---

## 2024-12-XX — Delta Computation

**Context:**
Need to compute changes between consecutive snapshots.

**Decision:**
Deltas computed only for metrics present in **both** consecutive snapshots. Missing fields yield `null` deltas.

**Tradeoffs:**
- Pro: Accurate deltas when data available
- Con: Gaps in data produce null deltas

**Status:** Accepted

---

## 2024-12-XX — Statbate Plus Chat Import

**Context:**
Chat history is not available via the Premium API.

**Decision:**
API/XHR payload-based only. Cookie/XSRF session client first. Playwright only for cookie bootstrap. Raw payload + normalized messages persist to `interactions`.

**Tradeoffs:**
- Pro: More reliable than HTML scraping
- Con: Requires session management

**Status:** Accepted

---

## 2024-12-XX — Deployment Model

**Context:**
Need separate processes for web server and background jobs.

**Decision:**
Render.com with `RUN_MODE` environment variable:
- `RUN_MODE=web`: Express server for HTTP API
- `RUN_MODE=worker`: Background Events API longpoll listener

**Tradeoffs:**
- Pro: Clear separation of concerns
- Con: Two processes to manage

**Status:** Accepted

---

## 2026-01-12 — Documentation Tier Structure Validation

**Context:**
After reorganizing docs/ into a tiered structure (v1.33.5), validation was needed to confirm sufficiency for day-to-day development.

**Decision:**
The 6-document Tier-1 auto-read set is sufficient:

1. CLAUDE.md (entry point)
2. ARCHITECTURE.md (authoritative system rules)
3. MODES.md (behavioral modes)
4. SESSION_SUMMARY.md (current state)
5. TODO.md (task backlog)
6. DECISIONS.md (this file)

Reference docs (`docs/reference/`) are loaded on-demand when relevant.

**Findings from validation:**

- ARCHITECTURE.md and SCHEMA.md are highly useful for BUILD tasks
- UI_PATTERNS.md is a stub (all TODO) — blocks CONSISTENCY_CHECK mode
- TESTING_GUIDE.md is stale (December 2024) — needs refresh for v1.33.x

**Tradeoffs:**

- Pro: Minimal /hydrate context, faster session start
- Pro: Clear separation of authoritative vs reference docs
- Con: UI_PATTERNS.md gap means UI conventions must be inferred from code
- Con: TESTING_GUIDE.md staleness may mislead testers

**Status:** Accepted (with remediation tasks added to TODO.md)

---

## YYYY-MM-DD — <Decision Title>

**Context:**
<TODO>

**Decision:**
<TODO>

**Tradeoffs:**
<TODO>

**Status:**
<TODO: Proposed | Accepted | Deprecated | Superseded>

---

<!-- Add new decisions above this line using the template format -->
