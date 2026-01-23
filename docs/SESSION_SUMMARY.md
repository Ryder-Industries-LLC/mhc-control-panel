# Session Summary - v2.3.0

**Date**: 2026-01-23
**Mode**: BUILD → RELEASE

## What Was Accomplished

### v2.3.0 - Database Optimization, Legacy Cleanup & Profile Trends

#### 1. Legacy Attribute System Dismantling (Complete)

Removed all reads/writes from 8 legacy boolean columns on `profiles` table, replaced with `attribute_lookup` table queries.

**Implementation:**
- Dropped 8 boolean columns and 7 indexes from profiles table (migration 094)
- Removed `ProfileService.getAttributes()` and `ProfileService.updateAttributes()`
- Updated `ProfileService.updateProfileSmoke()` to use `AttributeService.setAttribute()`
- Migrated all SQL queries reading `banned_me`, `watch_list` from profiles to attribute_lookup subqueries
- Updated: visitors.ts, system.ts, relationship.ts, follower-scraper.service.ts, profile-scrape.job.ts, room-presence.service.ts, stats-collection.service.ts

#### 2. Statbate Job Stats Renaming (Complete)

Fixed confusing stats naming in Statbate refresh job.

- Renamed `lastRunRefreshed` → `currentRunRefreshed`
- Renamed `lastRunFailed` → `currentRunFailed`
- Removed `totalRefreshed`/`totalFailed` (unhelpful cumulative counters)
- Updated Admin.tsx and Jobs.tsx UI

#### 3. Database Size Optimization (Complete)

Reduced database from 1.6 GB to ~976 MB:

- **Snapshots pruning** (migration 095): 397K → 46K rows, 668 → 73 MB
  - Keep only oldest (baseline) + latest per person per source
  - Updated SnapshotService.create() to maintain 2-row pattern
  - Updated getDelta() to compare latest vs baseline
  - Removed unused getLatestN() and deleteOlderThan()
- **Profiles vacuum**: 47 → 16 MB (after column drops)
- **Follower history cleanup**: Deleted 30K zero-delta rows, 87 → 65 MB
  - FollowerHistoryService already prevents future zero-delta inserts

#### 4. Profile Trends Charts (Complete)

Added follower count and rank history charts to Profile page.

**Backend:**
- New endpoints: `GET /api/profile/:username/follower-history?days=30`
- New endpoints: `GET /api/profile/:username/rank-history?days=7`

**Frontend:**
- New `ProfileHistoryChart.tsx` reusable Recharts component
- "Trends" collapsible section in Profile snapshot tab
- Period selector (7d / 14d / 30d / 60d)
- Follower chart (emerald) with growth stats
- Rank chart (purple = global rank, amber dashed = gender rank) with inverted Y-axis

#### 5. Directory Page Sorting (Complete)

Added column sorting to all tabs on Users/Directory page.

- Generic `sortData()` function for date, string, and numeric fields
- Sort state per tab (Following, Followers, Unfollowed, Relationships, Bans, Tippers)
- Clickable column headers with asc/desc toggle

## Current State

- **Docker containers**: Running (frontend + web rebuilt)
- **Git**: On main branch, releasing v2.3.0
- **Database**: Optimized, migrations 094-095 applied

## Next Steps

1. Table rename backlog: `snapshots` → `statbate_api_polling`, `affiliate_api_snapshots` → `affiliate_api_polling`
2. Notes tab restructure
3. Profile page overhaul
