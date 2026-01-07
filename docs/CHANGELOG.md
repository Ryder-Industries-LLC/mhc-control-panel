# Changelog

All notable changes to the MHC Control Panel project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.27.0] - 2026-01-07

### Added
- **Storage Provider System**: Multi-provider media storage architecture
  - New storage routes (`/api/storage/*`) for provider management
  - S3-compatible storage service with local fallback
  - Storage settings table for per-provider configuration
  - Media transfer job for migrating between storage providers
- **Follow Detection Regression Tests**: Comprehensive test suite for profile scrape follow detection
  - 11 tests covering all HTML fixtures (followed/not-followed, online/offline)
  - Tests verify global UI elements are NOT used as evidence
  - Uses Cheerio for server-side DOM testing
- **Profile Username History**: Track historical usernames for profiles
- **Start Script**: New `scripts/start.sh` for streamlined server startup

### Changed
- **People Table Sticky Headers**: Improved sticky column headers in People views
  - Z-index increased from 10 to 20 for proper stacking
  - Background now uses theme variable (`bg-mhc-surface`) instead of hardcoded color
- **Jest Configuration**: Added `transformIgnorePatterns` for ESM module compatibility

### Fixed
- **Profile Scrape Follow Detection**: Fixed false positives in follow status detection
  - **Root cause**: Detection was checking button EXISTENCE instead of VISIBILITY
  - Both follow/unfollow buttons exist in DOM; only one is visible (`display: inline` vs `display: none`)
  - Now correctly checks `getComputedStyle()` display property with inline style fallback
  - Returns `unknown` when visibility cannot be confidently determined
  - Migration 064 invalidates affected profile_scrape records for re-scraping

### Technical
- New migrations: 060-064 (storage columns, storage settings, media transfer, username history, follow detection fix)
- New service: `storage/` directory with multi-provider architecture
- New job: `media-transfer.job.ts` for storage migration

---

## [1.26.0] - 2026-01-06

### Added
- **Follow History Tracking System**: Comprehensive follow/unfollow tracking from all data sources
  - New `follow_history` table to track all follow/unfollow events
  - `FollowHistoryService` for CRUD operations on follow history
  - Events API integration: Auto-updates `profiles.follower` on follow/unfollow events
  - Profile scrape detection: Detects follow/unfollow buttons during profile scrape
  - List scrape logging: Records history when followers/following lists are scraped
  - Backfill migration to populate history from existing `event_logs` data
- **Follow History Page** (`/follow-history`): New page to view follow/unfollow history
  - Two collapsible sections: "Following" (who I followed) and "Followers" (who followed me)
  - Sortable columns: Username, Action, Source, Timestamp
  - Filters: Username search, action type, source type, date range
  - Local time formatting (MMM dd YYYY HH:MM)
  - Click username to navigate to profile
- **Live Screenshot Capture**: Automatic screenshot capture during live broadcasts
  - Configurable interval and retention settings
  - Admin settings UI for enabling/configuring
- **Profile Star Rating**: 5-star rating system for profiles
  - New `StarRating` component with interactive hover states
  - Stored in profiles table with API endpoints
- **Deleted Photosets Tracking**: Track photosets that have been removed from profiles

### Changed
- **Profile Scraper**: Now detects follow/unfollow buttons to determine following status
- **Follower Scraper**: Records history entries when detecting new follows/unfollows from list comparisons
- **Events Client**: Updates `profiles.follower` status on follow/unfollow events from Events API
- **Twitter Link Cleanup**: Migration to remove Chaturbate's own Twitter links from social media

### Fixed
- **Follower Status**: Profiles now correctly reflect follower status from Events API events

---

## [1.25.0] - 2026-01-05

### Changed
- **Job Status Display Overhaul**: Completely redesigned job status states for clarity
  - Removed "Pause" functionality entirely from all jobs (Profile Capture, Affiliate Polling, CBHours Polling, Statbate API)
  - Simplified to Start/Stop controls only
  - New status states: Stopped (gray), Starting (green), Processing (blue), Waiting (amber)
  - "Starting" shows when job first starts and hasn't completed a cycle yet
  - "Waiting" shows when job is between cycles (after first run completes)
- **Social Media Link Scraping Fixes**:
  - Now correctly detects locked vs unlocked social links
  - Properly decodes URL-encoded external links
  - Filters out Chaturbate's own Twitter accounts
  - Added support for more platforms (Telegram, AllMyLinks, Linktree, Throne, WhatsApp)
- **Communications/PMs Query**: Now fetches messages from both directions (to AND from profile user)
- **Events API Broadcaster Fix**: Uses correct broadcaster from API response instead of hardcoded value

### Added
- **Interactions Tab Filter Chips**: Filter interactions by event type (TIP_EVENT, PRIVATE_MESSAGE, etc.)
- **CLAUDE.md**: New project context file for Claude Code sessions

### Removed
- Pause/Resume functionality from all background jobs
- `/api/job/*/pause` and `/api/job/*/resume` endpoints
- `isPaused` state from job status responses

---

## [1.24.0] - 2026-01-04

### Added
- **Bulk Image Upload**: New "Bulk Upload" tab in Admin for uploading multiple images at once
  - Drag & drop file zone or file selector
  - Automatic username parsing from filenames (e.g., `JasonTheGreat.png` or `JasonTheGreat-A.png`)
  - Preview step showing which usernames exist before uploading
  - Groups files by username with file counts
  - Skips unknown usernames and reports in summary
  - Upload progress indicator and results summary
- **Username Validation API**: `POST /api/profile/bulk/validate-usernames` endpoint
- **Bulk Upload API**: `POST /api/profile/bulk/upload` endpoint (accepts up to 100 images)
- **JobStatusButton component**: Unified status and control buttons for Admin Jobs UI

### Changed
- **Admin Jobs UI improvements**:
  - Renamed "Statbate Refresh" to "Statbate API"
  - Unified styling for all job status buttons
  - Combined Stop/Pause/Start buttons with Status button
  - Username now displayed bold in progress indicators
  - Removed duplicate progress indicators from expanded Job Status sections
- **Profile scrape job**: No longer blocks on missing cookies at startup; checks cookies at each cycle instead

### Fixed
- Profile scrape job now gracefully handles missing cookies without blocking startup

---

## [1.23.0] - 2026-01-04

### Added
- **"Banned by Me" flag**: New profile flag to track users you've banned (DB migration, API, UI checkbox)
- **Note Line Limit setting**: Configurable "Read More" truncation for notes >N lines (Admin → Settings → Media)
- **Media Collapsible Section**: Media moved to own collapsible section at top of profile, collapsed by default
- **Chat bubble format for PMs**: Communications now matches Inbox conversation format with chat bubbles

### Changed
- **Profile Flags redesign**: Flags moved to bottom of profile overview as always-visible checkboxes
- **Auto-expand last note**: When Notes section expands, most recent note auto-expands
- **"With Images" → "With Media"**: Updated label in People page filters
- **Sessions default to Events tab**: SessionDetail now opens Events tab instead of Summary
- **Admin Settings organized**: Settings tab reorganized into collapsible sections (Broadcast, AI, Media, Theme)
- **Database & Storage layout**: Cards now fit on one row; By Role and Snapshots by Source merged on same row
- **Renamed "Profile Scraper" → "Profile Capture"**: Updated terminology throughout UI
- **Renamed "Scraper" tab → "Chaturbate Sync"**: Updated Admin tab name

### Fixed
- **Doubled image count**: Media section now shows correct count (was adding uploaded + history twice)
- **Duplicate PM messages**: Added DISTINCT ON deduplication to communications endpoint
- **Broadcaster attribution for PMs**: Uses CHATURBATE_USERNAME env var instead of hardcoded value
- **Interactions tab duplicates**: Added deduplication based on type, content, and timestamp
- **Timeline tab duplicates**: Added deduplication based on type, content, and timestamp
- **People page layout consistency**: All tabs now use shared components with standardized layout

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
