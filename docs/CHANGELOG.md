# Changelog

All notable changes to MHC Control Panel.

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
