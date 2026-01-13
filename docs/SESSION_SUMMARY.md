# Session Summary - v1.34.0

**Date**: 2026-01-13
**Mode**: BUILD → QA_ANALYZER → RELEASE

## What Was Accomplished

### v1.34.0 Release - Profile UI Overhaul + New Features

This release includes comprehensive Profile page UI improvements and two new features.

#### MHC-1101: Profile Page Header and Browser Tab Polish
- Browser tab title now shows `MHC: {username}` on profile pages
- Username and online status moved to top as page title
- Removed redundant "Profile Viewer" header
- Reduced vertical padding between nav and title (pt-2 instead of p-5)

#### MHC-1102: Profile Overview Card Option B Layout
- Image size optimized to 440x330px
- Source links renamed: "Chaturbate" -> "CB", "UN Cams" -> "UN"
- CB/UN links moved below image (left), Following badge (center), timestamp (right)
- Attribute label changes: "Smoke on Cam" -> "Smoking", "Leather/Fetish" -> "Fetish Gear"
- Profile Smoke indicator moved to Row 3 with icon (🚬 Smoke)
- T2 expandable section collapsed by default
- Profile Details section moved into T2 as nested collapsible
- Bottom row reorganized: Add Note (left), Rating (center), More... (right)
- 5th star rating color changed to pink-400 for better visibility

#### MHC-1103: Visits Naming Clarification
- Renamed "visits from them" to "visits to me"
- Updated tooltip to clarify: "Count of times they appeared in your context"

#### MHC-1104: Room Banned Flag (New Feature)
- Added `room_banned` boolean column to profiles table (migration 082)
- Updated ProfileService.getAttributes() and updateAttributes()
- Added frontend state, handler, and UI checkbox in T2 section

#### MHC-1105: Seen With Field (New Feature)
- Created `profile_seen_with` junction table (migration 083)
- Added GET/POST/DELETE routes for /api/profile/:username/seen-with
- Added frontend state, handlers, autocomplete, and full UI in T2 section

#### MHC-1106: Directory Rename and Filter Reorganization
- Navigation label changed: "Directory" -> "People"
- Page header changed: "Directory" -> "People"
- Filter label changed: "With Media" -> "With Images"

#### MHC-1107: Gender Normalization Consistency
- Enhanced formatGender() to normalize raw Chaturbate values
- "A Man" -> "Male", "A Woman" -> "Female"
- "Shemale", "TS", "Transsexual" -> "Trans"

#### MHC-1108 & MHC-1109: Media Consolidation
- AUTO image selection as main profile image already works (verified)
- Image source attribution documented (affiliate_api vs screensnap)

#### Media Section Improvements
- Source filter chips moved to same row as Images/Videos tabs
- All source filters shown (including 0 count, grayed out)

### Database Migrations

| Migration | Description |
|-----------|-------------|
| 082_add_room_banned.sql | Added `profiles.room_banned` boolean column |
| 083_create_seen_with.sql | Created `profile_seen_with` junction table |

### Files Modified

**Client:**
- `client/src/App.tsx` - Nav label rename, reduced nav spacing
- `client/src/components/GlobalLookup.tsx` - Search width adjustments
- `client/src/components/StarRating.tsx` - 5th star pink-400 color
- `client/src/pages/Profile.tsx` - Major UI restructuring
- `client/src/pages/Users.tsx` - "Directory" -> "People" rename
- `client/src/types/people.ts` - "With Media" -> "With Images"
- `client/src/utils/formatting.ts` - Gender normalization

**Server:**
- `server/src/routes/profile.ts` - room_banned, seen-with endpoints
- `server/src/services/profile.service.ts` - Attribute methods

### Files Created

| File | Purpose |
|------|---------|
| `docs/QA_CHECKLIST_MHC-1101_1109.md` | QA test steps and acceptance criteria |
| `docs/ISSUE_TRACKER.md` | Issue tracking with Bug Keys |
| `server/src/db/migrations/082_add_room_banned.sql` | Room Banned migration |
| `server/src/db/migrations/083_create_seen_with.sql` | Seen With migration |

## Database Status

- ✅ Migration 082 applied: `profiles.room_banned` boolean column
- ✅ Migration 083 applied: `profile_seen_with` junction table
- ✅ Docker containers rebuilt and running

## Next Steps

1. Continue QA validation if needed
2. Investigate studforyouall data-level issue (deferred)
3. Consider further Profile page enhancements based on user feedback
