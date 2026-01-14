# Media Architecture

**Last Updated**: 2026-01-14

This document describes the media (images/videos) architecture for MHC Control Panel.

---

## Storage Providers

| Provider | Purpose | Path/Location | Status |
|----------|---------|---------------|--------|
| **S3** | Primary storage | `mhc-media-prod` bucket (us-east-2) | Active |
| **SSD** | Local cache/fallback | `/Volumes/Imago/MHC-Control_Panel/media` | Deprecated (migrating to S3-only) |
| **Docker** | Legacy internal volume | Internal Docker volume | Deprecated |

### File Path Convention

Images are stored with username-based paths:
```
people/{username}/{source_folder}/{timestamp}_{hash}.jpg
```

Source folders:
- `auto/` - Affiliate API thumbnails
- `snaps/` - Manual screensnaps (Keyboard Maestro)
- `following/` - Automated Following captures
- `profile/` - CB profile photoset images
- `uploads/` - Manual uploads

---

## Database Tables

### `profile_images`

Primary table for user-associated media (profile photos, screensnaps, uploads, videos).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `person_id` | UUID | FK to persons table |
| `file_path` | TEXT | Relative path to image file |
| `source` | VARCHAR(50) | Image source type (see below) |
| `storage_provider` | VARCHAR(20) | `s3`, `ssd`, or `docker` |
| `is_primary` | BOOLEAN | Whether this is the profile's featured image |
| `media_type` | VARCHAR(20) | `image` or `video` |
| `username` | VARCHAR(255) | Cached username for path generation |

### `affiliate_api_snapshots`

Session tracking table with embedded thumbnail references. NOT used for profile media display.

| Column | Type | Description |
|--------|------|-------------|
| `image_url` | TEXT | Original CB thumbnail URL |
| `image_url_360x270` | TEXT | Same URL (CB doesn't differentiate) |
| `image_path` | TEXT | Local/S3 path to downloaded thumbnail |
| `image_path_360x270` | TEXT | **Deprecated** - duplicate download |

---

## Image Sources

### Active Sources

| Source Value | UI Label | Description | Capture Method |
|--------------|----------|-------------|----------------|
| `affiliate_api` | **Affiliate** | Live broadcast thumbnails | Affiliate Polling Job downloads CB-provided thumbnail URL |
| `profile` | **Profile** | CB profile photoset images | Profile Scraper Job scrapes user's CB profile page |
| `screensnap` | **Snap** | Manual screen captures | User triggers via Keyboard Maestro (Cmd+/) |
| `following_snap` | **Follow** | Auto captures of Following users | Live Screenshot Job captures every 30 min while broadcasting |
| `manual_upload` | **Upload** | Manually uploaded images | Bulk Uploader (Admin → Settings) |

### Deprecated Sources (0 records)

| Source Value | Notes |
|--------------|-------|
| `external` | Was for external URL imports - never used |
| `imported` | Was for bulk imports - use `manual_upload` instead |

---

## Capture Jobs

### Affiliate Polling Job

- **Interval**: Every 2 minutes (configurable)
- **Target**: All online broadcasters matching gender filter
- **Data Source**: Chaturbate Affiliate API
- **Image**: Downloads `image_url` from API response (CB-generated thumbnail)
- **Storage**: `affiliate_api_snapshots` table + `people/{username}/auto/` path

### Live Screenshot Job

- **Interval**: Every 30 minutes (configurable)
- **Target**: Only users you're Following who are currently live
- **Data Source**: Affiliate feed cache
- **Image**: Downloads same CB thumbnail URL
- **Storage**: `profile_images` table with `source: 'following_snap'`

### Profile Scraper Job

- **Interval**: Every 2 minutes (configurable)
- **Target**: Profiles in scrape queue (prioritizes Following/Watchlist)
- **Data Source**: Browser scraping of CB profile pages
- **Image**: Downloads images from profile photosets
- **Storage**: `profile_images` table with `source: 'profile'`

---

## Manual Capture Methods

### Keyboard Maestro Screensnap (Cmd+/)

User-triggered capture while viewing a live broadcast.

1. Keyboard Maestro detects hotkey
2. Apple Shortcut determines current thumbnail URL
3. Shell script downloads image
4. POST to `/api/profile/{username}/images` with `source: 'screensnap'`

See: [Apple Shortcut](https://www.icloud.com/shortcuts/5d673e41de6a4014b21236213eca02e6)

### Bulk Uploader (Admin → Settings)

Upload multiple images at once with automatic username parsing from filenames.

- Supports drag & drop
- Parses `{username}_*.jpg` pattern
- Creates records with `source: 'manual_upload'`

---

## UI Labels Mapping

```typescript
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  affiliate_api: { label: 'Affiliate', color: 'bg-blue-500' },
  profile: { label: 'Profile', color: 'bg-cyan-500' },
  screensnap: { label: 'Snap', color: 'bg-purple-500' },
  following_snap: { label: 'Follow', color: 'bg-green-500' },
  manual_upload: { label: 'Upload', color: 'bg-amber-500' },
  external: { label: 'Link', color: 'bg-orange-500' },
  imported: { label: 'Import', color: 'bg-gray-500' },
};
```

---

## Known Issues / Tech Debt

1. ~~**Duplicate Affiliate Downloads**: Currently downloading both `image_url` and `image_url_360x270` even though they're identical. Should only download once.~~ **FIXED in v1.34.3** - Now downloads once and reuses path for both columns.

2. **Historical Screensnap Ambiguity**: Historical `screensnap` records (before v1.34.3) may contain both manual captures (Keyboard Maestro) and automated captures (Live Screenshot Job). These cannot be distinguished retroactively. Going forward, automated captures use `following_snap` source.

3. ~~**Profile Page Upload**: Legacy upload feature on profile page should be removed in favor of Bulk Uploader.~~ **FIXED in v1.34.3** - Upload button and modal removed from profile page. Use Admin → Settings → Bulk Uploader.

4. ~~**Image History Carousel**: Main profile image used a carousel with separate `/api/person/{id}/images` endpoint. Redundant now that Media section is prominent.~~ **FIXED in v1.34.4** - Simplified to show primary image directly. Removed carousel.

5. ~~**Affiliate Import Re-downloads**: Promoting an affiliate image to primary tried to re-download from CB URL, which often fails since thumbnails change frequently.~~ **FIXED in v1.34.4** - Now uses existing local file path instead of re-downloading.

---

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Overall system architecture
- [CLAUDE.md](../../CLAUDE.md) - Storage architecture quick reference
