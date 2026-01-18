# Image Storage Analysis Report

**Generated:** 2026-01-17
**Project:** MHC Control Panel

---

## Executive Summary

The image storage system has **TWO database tables** storing image paths (not one as intended). There are significant inconsistencies between what's stored in the database and what exists in S3, with approximately 56K database entries pointing to non-existent or incorrectly-formatted S3 paths, and ~200K orphaned S3 objects not tracked in the database.

### Quick Stats

| Metric | Count |
|--------|-------|
| Total profile_images records | 211,552 |
| Total affiliate_api_snapshots with images | 128,691 |
| S3 objects in mhc/media/ | 483,245 |
| S3 objects properly linked to DB | 283,910 |
| S3 objects orphaned (not in DB) | 199,335 |
| DB paths missing from S3 | 56,119 |

---

## Issue #1: Image Paths in Two Tables (NOT Referencing)

### Current State

Image paths are stored independently in two tables:

1. **`profile_images`** - Main image storage table
   - 211,552 total records
   - Columns: `file_path`, `legacy_file_path`, `source_url`, `sha256`
   - Storage provider: 211,548 S3, 4 SSD

2. **`affiliate_api_snapshots`** - Broadcast session thumbnails
   - 148,486 total records
   - 128,691 have `image_path_360x270` populated
   - These are NOT foreign keys to `profile_images`

### Problem

The `affiliate_api_snapshots.image_path_360x270` column stores actual file paths, not references to `profile_images.id`. This means:
- Same image can be tracked in both tables
- No referential integrity
- Duplicate storage/tracking overhead

### Recommendation

Consider whether `affiliate_api_snapshots` should:
1. Reference `profile_images.id` instead of storing paths directly, OR
2. Continue storing paths separately (current behavior) but ensure consistency

---

## Issue #2: Legacy `profiles/*` Paths (971 records)

### Current State

971 records in `profile_images` have paths like:
```
profiles/{person_id}/{image_id}.jpg
```

These are marked as `storage_provider = 's3'` but **DO NOT EXIST** in S3.

### Root Cause

These files exist on the **local SSD** at:
```
/Volumes/Imago/MHC-Control_Panel/media/profiles/{person_id}/{filename}.jpg
```

They were likely marked as S3 during a migration but never actually uploaded.

### Impact

- 971 broken image links in the application
- ~3,155 files on SSD in legacy `profiles/` structure

### Recommended Fix

1. Update `storage_provider` to `'ssd'` for these records, OR
2. Upload files to S3 at correct paths and update `file_path` column

---

## Issue #3: Filename-Only Paths in affiliate_api_snapshots (54,107 records)

### Current State

54,107 records in `affiliate_api_snapshots` have `image_path_360x270` as just a filename:
```
oldnewfun_1766905959636_95be6d04.jpg
```

Instead of the proper path format:
```
people/oldnewfun/auto/oldnewfun_1766905959636_95be6d04.jpg
```

### Impact

- These paths don't resolve correctly when serving images
- The actual files DO exist in S3 at the proper `people/*/auto/` path

### Recommended Fix

Run a migration to update these paths:
```sql
UPDATE affiliate_api_snapshots
SET image_path_360x270 =
  CONCAT('people/',
    SPLIT_PART(image_path_360x270, '_', 1),
    '/auto/',
    image_path_360x270)
WHERE image_path_360x270 NOT LIKE '%/%'
  AND image_path_360x270 IS NOT NULL;
```

Note: The username extraction may need refinement for usernames containing underscores.

---

## Issue #4: Orphaned S3 Objects (199,335 files)

### Breakdown by Folder Type

| Folder | Count | Status | Action |
|--------|-------|--------|--------|
| `auto/` | 108,100 | Legitimate images | Import to DB |
| `profile/` | 48,820 | Legitimate images | Import to DB |
| `all/` | 41,837 | Duplicate symlinks | DELETE |
| `migrated/` | 501 | Migration artifacts | Review & DELETE |
| `snaps/` | 70 | Legitimate images | Import to DB |
| `.DS_Store` | 6 | macOS artifacts | DELETE |

### Analysis

1. **`auto/` and `profile/` orphans** - These are legitimate images that were saved to S3 but not tracked in `profile_images`. They should be imported.

2. **`all/` folder orphans** - These are duplicates created by the SSD symlink system. On SSD, `all/` contains symlinks; when uploaded to S3, they became real files. These are pure duplicates and should be deleted to save storage.

3. **`migrated/` folder** - Legacy migration artifacts that should be reviewed and cleaned up.

### Recommended Actions

1. **For `auto/` and `profile/` orphans:**
   - Extract username from path
   - Find or create `person_id` in database
   - Check for duplicate (same SHA256 hash already exists for user)
   - If unique, insert into `profile_images` with `source = 'affiliate_api'`

2. **For `all/` duplicates:**
   - Safe to delete entirely (saves ~12GB+ estimated)

3. **For `migrated/` artifacts:**
   - Review contents, likely safe to delete

---

## Issue #5: Missing S3 Files (1,039 `people/*` paths)

### Current State

1,039 records in `profile_images` have `people/*` paths that don't exist in S3.

### Investigation Needed

These could be:
1. Files that were deleted but DB records weren't cleaned up
2. Failed uploads where DB was updated but S3 write failed
3. Files moved during migration

### Recommended Fix

1. Mark these records with a flag or delete them
2. Implement better upload verification (transactional DB+S3)

---

## S3 Path Structure Summary

### Current S3 Prefix Configuration

- **Bucket:** `mhc-media-prod`
- **Region:** `us-east-2`
- **Prefix:** `mhc/media/`

### Valid Path Formats

```
mhc/media/people/{username}/auto/{timestamp}_{hash}.jpg     # Affiliate API
mhc/media/people/{username}/profile/{timestamp}_{hash}.jpg  # Profile scrape
mhc/media/people/{username}/snaps/{timestamp}_{hash}.jpg    # Screenshots
mhc/media/people/{username}/uploads/{filename}              # Manual uploads
mhc/media/people/{username}/following/{timestamp}_{hash}.jpg # Following snaps
```

### Legacy Path Formats (Should NOT Exist)

```
mhc/media/profiles/{person_id}/{image_id}.jpg  # Old format
mhc/media/people/{username}/all/*              # Should be symlinks only
mhc/media/people/{username}/migrated/*         # Migration artifacts
```

### Alternative Prefix Issue

There's also a `mhc-media/` prefix with 21 objects - this appears to be a typo/misconfiguration that should be cleaned up:
```
mhc-media/people/{username}/auto/...
```

---

## Recommended Remediation Steps

### Phase 1: Fix Database Paths (Low Risk)

1. **Fix filename-only paths in `affiliate_api_snapshots`**
   - Update 54,107 records to use proper `people/*/auto/` format

2. **Fix legacy `profiles/*` storage_provider**
   - Update 971 records from `s3` to `ssd`

### Phase 2: Import Orphaned Images (Medium Risk)

1. **Import `auto/` orphans to `profile_images`**
   - 108,100 files
   - Source: `affiliate_api`

2. **Import `profile/` orphans to `profile_images`**
   - 48,820 files
   - Source: `profile`

3. **Import `snaps/` orphans to `profile_images`**
   - 70 files
   - Source: `screensnap`

### Phase 3: Cleanup Duplicates (Recoverable Risk)

1. **Delete `all/` duplicates from S3**
   - 41,837 files
   - Verify these are exact copies first

2. **Delete `migrated/` artifacts from S3**
   - 501 files
   - Review contents first

3. **Delete `.DS_Store` files from S3**
   - 6 files

4. **Move/delete `mhc-media/` prefix contents**
   - 21 files at wrong prefix

### Phase 4: Data Integrity (Future Prevention)

1. **Add constraints/triggers** to ensure path format consistency
2. **Consider foreign key** from `affiliate_api_snapshots` to `profile_images`
3. **Add upload verification** - confirm S3 write before DB commit

---

## Files Generated by This Analysis

- `/tmp/s3_all_objects.txt` - All 483K S3 object keys
- `/tmp/db_all_paths.txt` - All 340K DB image paths
- `/tmp/s3_orphans.txt` - 199K orphaned S3 objects
- `/tmp/db_missing.txt` - 56K DB paths not in S3
- `/tmp/legacy_paths.txt` - 971 legacy profile/* paths

---

| Project       | Value             |        | Git Info  | Value        |
| ------------- | ----------------- | ------ | --------- | ------------ |
| Name          | MHC Control Panel | **\_** | Repo Root | /Volumes/Imago/Development/code/Ryder/mhc-control-panel  |
| Absolute Path | /Volumes/Imago/Development/code/Ryder/mhc-control-panel   |        | Status    | Modified     |
| Working Dir   | /Volumes/Imago/Development/code/Ryder/mhc-control-panel   |        | Branch    | main         |
| Mode          | DEBUG/ANALYSIS    |        | Commit    | 0197a45      |
