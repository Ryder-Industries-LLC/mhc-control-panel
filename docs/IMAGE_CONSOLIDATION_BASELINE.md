# Image Storage Consolidation - Baseline Report

**Generated**: 2026-01-15T08:15:00Z
**Version**: v1.34.8 (before consolidation)

## Database Summary

| Metric | Value |
|--------|-------|
| **Total Images in DB** | 69,411 |
| **Total Size in DB** | 96 GB (102,796,654,853 bytes) |

### By Storage Provider

| Provider | Count | Size |
|----------|-------|------|
| S3 | 68,910 | 96 GB (102,782,391,511 bytes) |
| SSD | 501 | 14 MB (14,263,342 bytes) |

### By Source Type

| Source | Count | Size |
|--------|-------|------|
| profile | 57,166 | 95 GB (102,301,158,817 bytes) |
| screensnap | 11,426 | 233 MB (244,121,750 bytes) |
| manual_upload | 245 | 235 MB (246,213,227 bytes) |
| following_snap | 560 | 5 MB (5,133,027 bytes) |
| imported | 3 | 27 KB (28,032 bytes) |
| affiliate_api | 11 | 0 bytes |

## Actual Storage Status

### S3 Bucket

| Metric | Value |
|--------|-------|
| Bucket | mhc-media-prod |
| Prefix | mhc/media |
| **Object Count** | 1,048,810 |
| **Total Size** | 193 GB (207,387,739,457 bytes) |

### SSD Local Storage

| Metric | Value |
|--------|-------|
| Path | /Volumes/Imago/MHC-Control_Panel/media |
| **File Count** | 353,494 |
| **Total Size** | 21 GB |

## Discrepancies Identified

### 1. Orphaned SSD Files
- **SSD has 353,494 files** but DB only tracks **501 SSD records**
- ~352,993 files are orphaned (not in database)
- These need to be either migrated or cleaned up

### 2. S3 Object Count Mismatch
- **S3 has 1,048,810 objects** but DB only tracks **68,910 S3 records**
- Difference: ~979,900 objects untracked
- These may be old migration artifacts or backup files

### 3. Duplicate Images
- **29 duplicate pairs** found (same source_url, same person_id)
- These will be deduplicated in Phase 1

## Configuration

```
Primary Storage: S3
Write Backend: S3
SSD Status: Available (used as cache)
S3 Bucket: mhc-media-prod
S3 Region: us-east-2
```

## Next Steps

1. Phase 0.75: Create S3 backup directories
2. Phase 1: Remove 29 duplicate pairs
3. Phase 3: Migrate remaining 501 SSD records to S3
4. Phase 3.5: Clean up orphaned files
