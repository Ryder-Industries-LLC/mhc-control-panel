# Changelog

All notable changes to MHC Control Panel will be documented in this file.

## [1.20.0] - 2026-01-02

### Added

- Unified Relationship Model: Merged Dom, Sub, Friend into single relationship record per profile
  - Multi-select roles (Dom, Sub, Friend, Custom) with custom role label support
  - Status tracking: Potential, Occasional, Active, On Hold, Inactive, Decommissioned, Banished
  - Traits multi-select with seed suggestions and custom values
  - Since/Until date tracking (DATE only)
  - Notes field
- Profile Names section: New collapsible section for identity management
  - IRL Name (private, never displayed publicly)
  - Identity Name (safe to display)
  - Address As terms (Sir, Pup, Master, etc.) with predefined + custom options
- Relationship History tracking: Automatic change logging for status, roles, and dates
  - Collapsible history viewer with field type and time range filters
  - Roles changes shown as Added/Removed diffs
- New API endpoints:
  - `GET/PUT/DELETE /api/profile/:username/relationship` - Unified relationship CRUD
  - `GET /api/profile/:username/relationship/history` - History with filters
  - `GET/PATCH /api/profile/:username/names` - Profile names
  - `GET /api/relationship/seeds` - Trait and address term suggestions
- Database migrations (039-042): Seed tables, relationships, history, and data migration
- Profile header: Role badges (Sub, Dom, Friend, Custom) with status indicators

### Changed

- Profile page: Separated Flags, Names, and Relationship into distinct collapsible sections
- Badge display: Status takes visual precedence, Banished shows red emphasis
- Legacy service relationships: Shown in deprecated section during transition period

### Migration

- Automatic data migration from `service_relationships` and `friend_tier` to new unified model
- Status mapping: Current/Actively Serving → Active, Paused → On Hold, Ended → Inactive
- Combined roles when user had both Sub+Dom or Sub+Friend relationships
- Initial history entries created with `migration_042` source

## [1.19.0] - 2026-01-02

### Added

- Admin page: Image storage size display alongside database size
- Timeline tab: Event type filter buttons (Enter, Leave, Chat, PM, Tip, Media Purchase, Fan Club)
- InteractionService: `createIfNotDuplicate()` method for message deduplication with configurable time window
- Broadcasts API: Server-side date range filtering with `startDate` and `endDate` parameters

### Fixed

- Duplicate private messages in Communications - added 1-minute deduplication window
- My Broadcasts missing data - moved date filtering from client to server-side
- Broadcast count mismatch - changed from hourly to 10-minute deduplication buckets
- Broadcast stats (Total Tokens, Avg Viewers, Peak Viewers, Followers) showing incorrect zeros - excluded zero values from averages

### Changed

- Broadcasts deduplication: Uses 10-minute time buckets instead of hourly for more granular session detection
- MyBroadcasts page: Date filtering now handled server-side for accuracy

## [1.18.0] - 2026-01-02

### Added

- Admin page: Active Doms and Watchlist stat cards in User Segments section
- Communications tab: "Show Raw" toggle to view raw JSON message data
- Visitors page: Offline sort button (sort by offline visit count)
- Profile tab merge: Combined Snapshot + Profile + History tabs into single "Profile" tab
  - Profile Details section with bio, age, location, etc.
  - Social Media Links section (collapsible)
  - Member History section (collapsible, Statbate data)
  - Raw Data toggle

### Changed

- Profile page: "LIVE SESSION" header now shows "LAST SESSION" when user is offline
- Profile page: Left-aligned Model/Follower badges above profile image
- Visitors: Manual visit recording now defaults to `is_broadcasting=false` (offline)

### Fixed

- Offline visitors tracking: POST `/api/profile/:username/visits` now properly accepts `is_broadcasting` parameter

## [1.17.1] - 2026-01-02

### Changed

- Renamed "My Broadcasts" to "Broadcasts" in navigation bar

### Documentation

- Added /visitors review and offline visitors fix to TODO.md

## [1.17.0] - 2026-01-02

### Added
- New Visitors page (`/visitors`) for tracking room visitors
- Offline visitor tracking - distinguishes between visits during broadcasts vs. profile visits when offline
- Visitor statistics with daily/weekly/monthly breakdowns
- Filter visitors by: following, followers, tippers, regulars, new visitors, and offline visits
- Visit history view with broadcast status indicators
- Database migration for `is_broadcasting` and `session_id` columns on room_visits

### Fixed
- Profile page social links rendering error (React error #31) - now handles multiple data formats
- Social links now properly support array, object with strings, and object with objects formats

### Changed
- Reorganized TODO.md with page prefixes for clarity (e.g., `/profile - Info Card:`)

## [1.16.1] - 2026-01-02

### Changed
- Updated Docker ports to avoid conflicts with pims-ops-portal
  - PostgreSQL: 5432 -> 5433
  - Backend API: 3000 -> 3002
  - Frontend remains on 8080

## [1.16.0] - 2025-12-31

### Added
- Pagination for large data sets
- Inline search functionality
- Twitter validation for profiles
- PM formatting improvements

## [1.15.0] - 2025-12-30

### Fixed
- Badge display issues
- Event handling improvements
- Admin jobs merge functionality

## [1.14.0] - 2025-12-29

### Added
- Occasional subscription sub-level
- Live monitoring improvements

### Fixed
- HistoryTab functionality

## [1.13.0] - 2025-12-28

### Changed
- Profile page reorganization
- New profile features

## [1.12.0] - 2025-12-27

### Added
- Drag & drop for profile images
- Multi-upload support
- Set-as-current functionality for profile images
