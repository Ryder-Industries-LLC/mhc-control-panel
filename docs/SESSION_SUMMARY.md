# Session Summary - v1.34.4

**Date**: 2026-01-14
**Mode**: BUILD

## What Was Accomplished

### Profile Page - Primary Image Fixes

#### Issue 1: Main photo not updating after setting primary
- **Root cause**: Main profile image used `imageHistory` carousel from `/api/person/{id}/images`, but `handleSetAsCurrent` only refreshed `uploadedImages` and `currentProfileImage`
- **Fix**: Removed the image history carousel entirely - now displays `currentProfileImage` (the primary image) directly
- Removed `ImageHistoryItem` interface, `imageHistory` state, `currentImageIndex` state
- Removed useEffect that fetched image history
- Media grid now highlights the primary image with ring styling

#### Issue 2: Affiliate checkmark click did nothing
- **Root cause**: Import endpoint tried to re-download from CB URL, but thumbnails change frequently
- **Fix**: Changed to use existing local file path instead of re-downloading
- Server endpoint now accepts `filePath` parameter
- Creates `profile_images` record pointing to the same file already stored from affiliate captures

### Admin System Stats - Image Source Summary
- Added `imagesBySource` and `imagesByStorage` breakdowns to System Stats
- Queries `profile_images` table grouped by source and storage_provider
- Added affiliate_api_snapshots count separately
- Updated Admin.tsx UI to display these breakdowns

### People Listing - Image Timestamps
- Added `image_captured_at` field to person queries
- Added to `BasePerson` and `PersonWithSource` TypeScript interfaces
- UserCard.tsx shows timestamp in title attribute on hover

### Previous Session (v1.34.3 work carried forward)
- Media Architecture documentation (MEDIA.md)
- Live Screenshot Job source fix (`screensnap` → `following_snap`)
- Affiliate double-download fix
- UI label updates
- Profile page upload removal

## Files Modified

**Server**:
- `server/src/routes/profile.ts` - Simplified import-affiliate endpoint to use local file
- `server/src/routes/system.ts` - Added imagesBySource and imagesByStorage stats
- `server/src/services/person.service.ts` - Added image_captured_at to person query
- `server/src/services/profile-images.service.ts` - Added following_snap source type
- `server/src/services/broadcast-session.service.ts` - Single download for affiliate images
- `server/src/jobs/live-screenshot.job.ts` - Use following_snap source
- `server/src/services/storage/ssd-provider.ts` - Added following_snap mapping
- `server/src/services/storage/storage.service.ts` - Added following_snap mapping

**Client**:
- `client/src/pages/Profile.tsx` - Removed carousel, simplified primary image display, fixed affiliate import
- `client/src/pages/Admin.tsx` - Added image source stats display
- `client/src/types/people.ts` - Added image_captured_at field
- `client/src/api/client.ts` - Added image_captured_at to PersonWithSource
- `client/src/components/people/UserCard.tsx` - Added timestamp title on hover

**Documentation**:
- `docs/reference/MEDIA.md` - Updated with v1.34.4 fixes
- `docs/SESSION_SUMMARY.md` - This file

## Current State

- **Docker containers**: Running
- **Git**: Modified files ready for release
- **API**: Fully functional
- **UI**: Working at http://localhost:8080

## Remaining Tasks

1. Fix rating not working on Directory/People page
2. Fix quick labels on Media page - reflect new values, keep 0-count only for active sources
3. Add sort controls to People Grid view
4. Combine and refactor image handling logic
5. Consider combining Person/Directory handling
6. Review Live status logic for affiliate data
7. SSD Cleanup - verify media-before-s3 in S3
8. Render Migration Planning
9. Fully deprecate double image columns
10. Fix Authentication
11. Profile page UI theming
12. Fix hover image endless loop

## Next Steps

Ready for release as v1.34.4.
