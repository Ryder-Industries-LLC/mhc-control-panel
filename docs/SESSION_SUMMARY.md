# Session Summary - v1.33.5

**Date**: 2026-01-12

## What Was Accomplished

### Documentation Reorganization

Complete restructure of project documentation following "Claude Workflow Spec v1":

#### New Directory Structure

```
docs/
├── ARCHITECTURE.md      (Tier-1: System architecture, authoritative)
├── MODES.md             (Tier-1: Behavioral modes)
├── SESSION_SUMMARY.md   (Tier-1: Current session state)
├── TODO.md              (Tier-1: Task backlog)
├── DECISIONS.md         (Tier-1: Architectural decisions)
├── reference/           (CHANGELOG, SCHEMA, TESTING_GUIDE, UI_PATTERNS, etc.)
├── features/            (Feature designs)
├── setup/               (Development, Deployment, Docker guides)
├── notes/               (Working notes, issue tracker)
├── sessions/            (Historical session summaries)
└── api/                 (API documentation)
```

#### CLAUDE.md Authority Upgrade

- Updated auto-read whitelist to 6 authoritative documents
- Added invariants: "Never contradict ARCHITECTURE.md", "Never treat README.md as authoritative"
- Added Command Vocabulary section (/hydrate, /handoff, /compact, MODE switching)

#### ARCHITECTURE.md Law Clarification

- Added authoritative statement at top
- Removed Claude session workflow language (now in CLAUDE.md)
- Renamed internal header from AGENTS.md to ARCHITECTURE.md

#### README.md Slimmed

- Reduced from 359 lines to 140 lines
- Added Documentation Index with category links
- Added "informational only" statement

#### DECISIONS.md Populated

Consolidated 5 historical decisions from README.md:
1. Alias Tracking - person_aliases table implementation
2. smk_lover Exclusion - Auto-exclude from aggregates
3. Delta Computation - Missing fields yield null deltas
4. Statbate Plus Chat Import - XHR-based, not HTML scraping
5. Deployment Model - RUN_MODE=web vs worker

## Files Modified

### Root
- `CLAUDE.md` - Invariants, auto-read whitelist, command vocabulary
- `README.md` - Slimmed, added Documentation Index

### docs/
- `docs/ARCHITECTURE.md` - Law clarification, header fix
- `docs/DECISIONS.md` - Populated with historical decisions
- `docs/reference/CHANGELOG.md` - v1.33.5 release notes

### File Moves
- `docs/DATA_SOURCE_STRATEGY.md` → `docs/reference/DATA_SOURCE_STRATEGY.md`
- `docs/reference/DECISIONS.md` → `docs/DECISIONS.md`

## Key Design Decisions

1. **Tier-1 vs Reference Docs**: Only 6 documents are auto-read during /hydrate; all others loaded explicitly
2. **README Non-Authoritative**: README.md is informational only; ARCHITECTURE.md is authoritative law
3. **DECISIONS.md Consolidation**: All durable decisions centralized with dated entries

## Next Steps

1. Continue DM scraper monitoring across threads
2. Implement incremental DM update support
3. Add DM search/filter functionality to Admin UI
