# Session Summary - v1.29.0

**Date**: 2026-01-08

## What Was Accomplished

### Storage Architecture Redesign

Complete overhaul of the image storage system to support username-based organization with symlinks for easy browsing.

#### New Path Structure

```
/Volumes/Imago/MHC-Control_Panel/
├── db/                              # PostgreSQL data (moved from Docker volume)
└── media/                           # All images
    ├── people/
    │   └── {username}/
    │       ├── auto/                # affiliate_api thumbnails
    │       ├── uploads/             # manual_upload, external, imported
    │       ├── snaps/               # screensnap (live screenshots)
    │       ├── profile/             # profile scrape images
    │       └── all/                 # symlinks to all files above
    └── all/                         # global symlinks: {username}_{filename}
```

#### Database Changes

**New Migration: `067_storage_username_paths.sql`**
- Added `username` column to `profile_images` for path generation
- Added `legacy_file_path` column to track original paths during migration
- Created index on username for efficient lookups

**PostgreSQL Moved to SSD**
- Database bind mount changed from Docker volume to SSD
- Path: `/Volumes/Imago/MHC-Control_Panel/db`

#### Storage Service Updates

**storage.service.ts**
- Removed Docker fallback - SSD-only writes
- Added operation queue for when SSD unavailable
- New `writeWithUsername()` method with automatic symlink creation
- Queue processor runs every 5 minutes

**ssd-provider.ts**
- New username-based path methods: `generateUsernamePath()`, `writeWithUsername()`
- Symlink creation: `createUserAllSymlink()`, `createGlobalAllSymlink()`
- Source-to-folder mapping (affiliate_api→auto, screensnap→snaps, etc.)

#### Image Writer Updates

All services updated to use new storage:
- `broadcast-session.service.ts` - Affiliate API thumbnails
- `live-screenshot.job.ts` - Live stream screenshots
- `chaturbate-scraper.service.ts` - Profile scrape images
- `profile-images.service.ts` - Manual uploads

#### Migration Job

**New Job: `storage-migration.job.ts`**
- Migrates files from UUID paths to username paths
- Copies files (doesn't move) with SHA256 verification
- Creates symlinks in both `/all/` folders
- API endpoints for control and monitoring

**Results:**
- 50,828 images migrated successfully
- 2,191 user folders created
- 50,889 global symlinks created
- 0 failures

#### Frontend Changes

**Profile.tsx**
- Simplified `getProfileImageUrl()` to always use `/images/`
- Removed complex storage_provider logic

**app.ts**
- Unified `/images/` route with SSD-first, Docker fallback
- Removed `/ssd-images/` route

## Files Modified/Created

### Server
- `server/src/db/migrations/067_storage_username_paths.sql` (NEW)
- `server/src/jobs/storage-migration.job.ts` (NEW)
- `server/src/routes/storage.ts` (MODIFIED - migration endpoints)
- `server/src/services/storage/storage.service.ts` (MODIFIED - queue, writeWithUsername)
- `server/src/services/storage/ssd-provider.ts` (MODIFIED - username paths, symlinks)
- `server/src/services/broadcast-session.service.ts` (MODIFIED - new storage)
- `server/src/jobs/live-screenshot.job.ts` (MODIFIED - new storage)
- `server/src/services/chaturbate-scraper.service.ts` (MODIFIED - new storage)
- `server/src/services/profile-images.service.ts` (MODIFIED - username support)
- `server/src/app.ts` (MODIFIED - unified /images route)

### Client
- `client/src/pages/Profile.tsx` (MODIFIED - simplified URL logic)

### Configuration
- `docker-compose.yml` (MODIFIED - SSD bind mount for database)

## Current State

- All code changes compile successfully
- Docker containers rebuilt and running
- Database running on SSD
- 50,828 images migrated to new path structure
- All new images saving to username-based paths

## Key Decisions Made

1. **SSD-only storage** - Removed Docker fallback to simplify architecture
2. **Queue for unavailability** - Operations queued when SSD disconnected rather than failing
3. **Copy then verify** - Files copied with SHA256 verification before DB update
4. **Real filesystem symlinks** - `/all/` folders use actual symlinks for Finder browsing
5. **Username lowercase** - All usernames normalized to lowercase in paths

## Next Steps

1. Consider adding S3 provider for production deployment
2. Monitor operation queue for any recurring SSD availability issues
3. Run cleanup job to remove legacy UUID-based files after confirming migration success
4. Remove `image-storage.service.ts` legacy code (only used for placeholder cleanup)
