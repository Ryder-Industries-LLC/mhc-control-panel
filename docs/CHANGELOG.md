# Changelog

All notable changes to MHC Control Panel.

## [2.3.1] - 2026-01-23

### Changed

- **Table Renames** - Database tables renamed to reflect actual purpose
  - `snapshots` → `statbate_api_polling`
  - `affiliate_api_snapshots` → `affiliate_api_polling`
  - All indexes and FK constraints renamed to match new table names

- **Service Rename** - `snapshot.service.ts` → `statbate-polling.service.ts`
  - `SnapshotService` class → `StatbatePollingService`
  - Updated all imports across routes, jobs, and services

### Database

- Migration 096: Rename tables, indexes, and constraints

---

## [2.3.0] - 2026-01-23

### Added

- **Profile Trends Charts** - Follower and rank history visualizations on Profile page
  - New `ProfileHistoryChart.tsx` reusable Recharts component
  - "Trends" collapsible section with period selector (7d / 14d / 30d / 60d)
  - Follower count chart with growth stats (total growth, avg/day, current count)
  - Rank chart with global rank and gender rank (inverted Y-axis)
  - API endpoints: `GET /api/profile/:username/follower-history`, `rank-history`

- **Directory Page Column Sorting** - Clickable column headers across all tabs
  - Generic sort function supporting date, string, and numeric fields
  - Sort state per tab (Following, Followers, Unfollowed, Relationships, Bans, Tippers)

### Changed

- **Legacy Attribute System Dismantled** - All reads now use `attribute_lookup` table
  - Dropped 8 boolean columns and 7 indexes from profiles table (migration 094)
  - Migrated all SQL queries for `banned_me`, `watch_list` to attribute_lookup subqueries
  - Removed `ProfileService.getAttributes()` and `ProfileService.updateAttributes()`
  - Updated: visitors, system stats, relationships, follower scraper, profile scrape job

- **Statbate Job Stats** - Renamed confusing stat fields
  - `lastRunRefreshed` → `currentRunRefreshed`, `lastRunFailed` → `currentRunFailed`
  - Removed unhelpful `totalRefreshed`/`totalFailed` cumulative counters

- **Snapshot Service** - Maintains only 2 rows per person per source (oldest baseline + latest)
  - `create()` now upserts latest row, preserving oldest as baseline
  - `getDelta()` compares latest vs baseline ("since first observed")
  - Removed unused `getLatestN()` and `deleteOlderThan()` methods

### Database

- Migration 094: Drop 8 legacy boolean columns and 7 indexes from profiles table
- Migration 095: Prune snapshots to oldest+latest per person per source (397K → 46K rows, 595 MB saved)
- Deleted 30K zero-delta rows from follower_count_history (22 MB saved)
- Total database reduction: ~648 MB reclaimed

---

## [2.2.2] - 2026-01-21

### Added

- **Alternate Accounts Feature** - Link profiles belonging to the same person
  - New `alternate_accounts` table with bidirectional symmetric linking (same pattern as collaborations)
  - `AlternateAccountsService` with full CRUD operations
  - API endpoints: `GET/POST/DELETE /api/profile/:username/alternate-accounts`
  - Frontend UI with purple pills below Collaborators section
  - Removed unused `person_aliases` table (0 records, superseded)

- **TIPS Chat Type Parsing** - Support for bookmarklet `ChatType: [TIPS]` format
  - Extracts tip data: username, token amount, optional message
  - Generates formatted HTML table summary of tips
  - Auto-toggles "Create Tips Note" when tips detected

### Changed

- **Tip Menu Parsing Improvements**
  - Filter out text emojis (words starting with `:` like `:berenjena333`) from tip menu items
  - Filter out Lovense toy-related lines (vibes, lush, toy levels, duration patterns)
  - Better pattern matching for CB text emoji format

### Database

- Migration 093: `alternate_accounts` table with bidirectional view and helper functions
- Dropped `person_aliases` table (unused, 0 records)

---

## [2.2.1] - 2026-01-21

### Fixed

- **S3 Image Serving** - Changed from presigned URL redirects to server-side proxy
  - Fixes 403 Forbidden errors caused by bucket policy restrictions on presigned URLs
  - Images now served through Express with proper cache headers (1 year)
- **Profile Images Deduplication** - Fixed duplicate images appearing in API response
  - Same images from both `media_locator` and `affiliate_api_snapshots` joins now deduplicated by ID
  - Added `deleted_at IS NULL` filter for affiliate images
- **Legacy S3 Prefix Migration** - Moved 21 orphaned files from `mhc-media/` to `mhc/media/` prefix
  - Files from Jan 16, 2026 were uploaded to wrong S3 prefix
  - All 21 files now accessible and marked as `s3_verified = true`

### Added

- `scripts/move-legacy-s3-files.js` - ES module script for migrating files between S3 prefixes

---

## [2.2.0] - 2026-01-20

### Added
- **Media Favorites System** - Mark images/videos as favorites and view in dedicated page
  - New `is_favorite` column on `media_locator` table with indexed queries
  - MediaService methods: `toggleFavorite`, `setFavorite`, `getFavorites`, `getFavoriteStats`
  - New API routes at `/api/media/favorites` and `/api/media/:mediaId/favorite`
  - New `FavoriteIcon.tsx` component - heart icon with toggle animation
  - New `/favorites` page with:
    - Grid view of all favorite media
    - Filter by media type (images/videos)
    - Stats showing total favorites, images, and videos counts
    - Each item links back to user profile
    - Pagination support
  - Favorite icons on Profile page image gallery and video section
  - Navigation link added between "Follow History" and "Event Log"

- **StarRating Component** - Reusable rating component for profile pages

### Changed
- **People/Directory Tab Reorganization**
  - Main tabs now: Directory, Following, Followers, Doms, Friends, Bans, Watchlist
  - Removed from main tabs: Unfollowed, Subs, Tipped By Me, Tipped Me (still accessible via URL params)
  - Card filters now: All, Live Now, With Images, With Videos, Rated, Models, Viewers, Following
  - Removed from card filters: Watchlist, Friends (they are main tabs now)

### Fixed
- Profile Not Found crash - now shows "Profile Not Found" message instead of blank screen when navigating to non-existent profiles
- Quick filters on People page now reset sort to "Last Active (Newest)" when applied
- Watchlist tab now has full filtering and sorting support with sort dropdown

### Database
- Migration 092: `is_favorite` boolean column on `media_locator` table
- Partial index on `is_favorite` for efficient favorite queries

---

## [2.1.0] - 2026-01-20

### Added
- **Attributes System (Phase 3)** - Complete profile attribute management
  - New `attribute_definitions` and `person_attributes` tables
  - History tracking in `attribute_history` table
  - `AttributeService` with full CRUD operations
  - API endpoints at `/api/attributes/*`
  - System attributes: `banned_me`, `banned_by_me`, `room_banned`, `watch_list`, `had_interaction`
  - Auto-derived attributes from person data (e.g., `is_friend`, `is_dom`, `is_sub`)
  - Custom user-defined attributes support
  - New frontend components:
    - `AttributeBadge.tsx` - Standalone badge pill component
    - `AttributeCheckbox.tsx` - Toggle checkbox component
    - `AttributeHistoryTooltip.tsx` - Hover tooltip showing last 5 changes
    - `ManageAttributesModal.tsx` - Admin modal for managing attribute definitions
    - `ProfileAttributes.tsx` - Profile page attributes section

- **Notes Categories System (Phase 2)** - Enhanced note categorization
  - Note categories: `note`, `pm`, `dm`, `public_chat`, `tips`, `tip_menu`
  - `NotesService` with category support and parsing
  - Chat log parsing with multiple format support:
    - Standard CB copy/paste format
    - Bookmarklet format: `Timestamp: [...] | Username: [...] | Message: [...] | isBroadcaster: [...]`
    - Rating badge format: `username|100| message`
    - No-colon format: `usernameMessage`
  - Chat bubbles with broadcaster on right, others on left
  - Unified paste modal for PM, DM, and Public Chat
  - Tip extraction and tip menu parsing

- **Room Presence Improvements**
  - Added `last_seen_at` tracking for visitors
  - Enhanced visitor endpoints with recency filtering

### Changed
- Profile.tsx Add Note modal simplified:
  - Single "Note" button for direct text entry
  - Arrow buttons (PM →, DM →, Public Chat →) open paste modals
- CollapsibleSection component styling updates
- Modal z-index adjustments for proper layering

### Database
- Migration 089: `note_category` enum type
- Migration 090: `attribute_definitions` table for attribute metadata
- Migration 090: `person_attributes` table for person-attribute values
- Migration 090: `attribute_history` table for change tracking
- Migration 091: Note categories on `profile_notes` table

---

## [2.0.0] - 2026-01-18

### Added
- **Collaborations System** - Replaces "Seen With" with bidirectional relationships
  - New `collaborations` table with symmetric relationship model
  - When A is added as collaborator on B's profile, B automatically appears on A's profile
  - Single database row represents both directions (no duplicates)
  - CollaborationsService with full CRUD operations
  - API endpoints: GET/POST/DELETE `/api/profile/:username/collaborations`
  - Frontend UI updated to show "Collaborators" section
  - Migration from old `profile_seen_with` data

- **MediaService** - Consolidated media handling service
  - Single service for all media operations (download, upload, query, delete)
  - SHA256 deduplication support
  - S3 verification tracking (`s3_verified`, `s3_verified_at` columns)

- **S3 Verification Script** - `verify-s3-files.ts`
  - Verifies each media_locator record has corresponding S3 file
  - Batch processing with progress tracking
  - Updates verification status in database

- **S3 Directory Report** - `s3-directory-report.ts`
  - Lists all S3 prefixes with file counts and sizes
  - Identifies active vs deletable directories

### Changed
- Renamed "Seen With" to "Collaborators" throughout UI
- Storage module exports now use `export type` for TypeScript interfaces
- Profile page collaborators section uses new bidirectional API

### Fixed
- TypeScript module export issues with `DiskSpaceInfo` and `LastWriteInfo` interfaces

### Database
- Migration 088: `collaborations` table with ordered pairs constraint
- Migration 088: `collaborations_view` for bidirectional queries
- Migration 088: `add_collaboration()` and `remove_collaboration()` helper functions

---

## [1.35.0] - 2026-01-15

### Added
- Legacy Image Import Service for handling orphaned images
- S3 Storage Consolidation - all images now in unified S3 structure
- New API endpoints for legacy import and S3 audit operations

### Changed
- Migrated 122,349 SSD orphan files to database and S3
- Removed 103,116 duplicate flat S3 files
- Storage reduced from ~215 GB to ~179 GB (17% reduction)

---

## [1.34.8] - 2026-01-14

### Fixed
- Timeline PM direction indicator
- Media section quick labels for new source values
- Hover image endless loop (400ms delay)
- Space between username and top navigation

---

## [1.34.7] - 2026-01-13

### Changed
- Images sorted by most recent first, profile pictures grouped last

---

## [1.34.6] - 2026-01-12

### Added
- Authentication system with Register/Login
- Google OAuth as primary login method
- Configurable gate password in Admin Settings
- GatedRoute protection for all routes

---

## [1.34.5] - 2026-01-11

### Changed
- Profile page UI theming improvements
- Swapped rating/CB links positions
- Brightened pills
- Moved Profile Details section

---

## [1.34.4] - 2026-01-10

### Fixed
- Main photo not updating after setting primary
- Affiliate image set-as-primary using local file
- Image timestamp on hover for People listing
- Admin image source summary by source and storage provider
