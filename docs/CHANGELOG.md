# Changelog

All notable changes to MHC Control Panel.

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
