# Changelog

All notable changes to the MHC Control Panel project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.22.0] - 2026-01-04

### Added
- **People Page Component Library**: Refactored monolithic Users.tsx (2,945 lines) into modular, reusable components
  - `PeopleLayout` - Page skeleton with segment tabs
  - `SegmentTabs` - Horizontal tab navigation with color theming
  - `FiltersPanel` - Collapsible filters with counts grid, tag presets, and search inputs
  - `CountsGrid` - Compact 2x4 stat cards grid
  - `ActiveFiltersBar` - Removable filter chips between toolbar and results
  - `ResultsToolbar` - View toggle, sort dropdown, and pagination summary
  - `Pagination` - Reusable pagination component
  - `PeopleTable` - Generic table with column configuration pattern
  - `PeopleGrid` - Responsive grid container
  - `UserCard` - Grid card component with badges and indicators
- **Column Configurations**: Separate column configs for Directory, Friends, Subs, and Doms segments
- **Types File**: Centralized type definitions in `client/src/types/people.ts`
- **Image Upload Settings**: New migration for image upload configuration
- **Video Support**: New migration adding media_type and video support

### Changed
- Stats cards moved inside collapsible FiltersPanel as compact grid
- Filter collapse state persists globally via localStorage (`mhc-filters-expanded`)
- Active filters bar positioned between toolbar and results list
- Friends/Subs/Doms segments now use unified table layout with shared column configs
- All 11 People segments use same PeopleLayout wrapper

### Fixed
- Cleaned up unused imports and variables in refactored components

---

## [1.21.2] - 2026-01-03

### Added
- Session 'ended' status indicator
- Placeholder profile images for users without images

---

## [1.21.1] - 2026-01-03

### Fixed
- Duplicate events appearing across all views

---

## [1.21.0] - 2026-01-03

### Added
- **Sessions V2 System**: Complete broadcast sessions refactor
  - Segment Builder: Creates segments from broadcastStart/broadcastStop events
  - Session Stitcher: Merges adjacent segments within configurable merge gap
  - Rollups Service: Computes stats from events (tokens, followers, viewers)
  - Finalize Sessions Job: Background job for AI summary generation
- **Sessions Page** (`/sessions`): List of sessions with stats and filters
- **Session Detail Page** (`/sessions/:id`): Detailed view with Summary, Events, Audience tabs
- **Inbox Page** (`/inbox`): Threaded PM interface with search and stats
- Dashboard Live Status Widget and Monthly Stats
- New database tables: `app_settings`, `broadcast_segments`, `broadcast_sessions_v2`

### Changed
- Navigation simplified to: Dashboard | Sessions | Inbox | People | Admin
- Dashboard is now the homepage (`/`)
- 30-minute merge gap for session stitching (configurable)

---

## [1.20.0] - 2025-12-30

### Added
- Unified Relationship Model for Friends, Subs, and Doms
- Role badges on profile overview cards (Sub, Dom, Friend, Custom)
- Relationship status indicators

---

## [1.19.0] - 2025-12-28

### Added
- Activity timeline filtering by event type
- Image storage size display on Admin page
- Server-side date filtering for broadcasts

### Fixed
- Duplicate messages in Communications PMs (deduplication in InteractionService)
- Missing January 1 broadcast data
- Broadcast count mismatch (10-minute dedup buckets)
- Zero/non-zero stats display (excluded zeros from averages)

---

## [1.18.0] - 2025-12-27

### Added
- Active Doms stat card for user segments
- Watchlist user segment stat
- "Show Raw Data" toggle on Communications tab

### Changed
- Merged Snapshot + Profile + History into unified "Profile" tab
- Collapsible "Member History" section
- Model/Follower count left-aligned on profile overview

### Fixed
- Offline visitors display
- "LIVE SESSION" label for non-live users (now shows "LAST SESSION")
