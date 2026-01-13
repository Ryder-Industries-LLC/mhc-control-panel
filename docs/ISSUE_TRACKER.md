# Issue Tracker

This document tracks issues and enhancements for the MHC Control Panel.

---

## Completed Issues (v1.34.0 Sprint)

### MHC-1101: Profile Page Header and Browser Tab Polish

**Status:** Complete
**Type:** Enhancement

**Changes:**

- Browser tab title now shows `MHC: {username}` on profile pages
- Username and online status moved to top as page title
- Reduced vertical padding between nav and title
- Removed redundant "Profile Viewer" header

**Files:** `client/src/pages/Profile.tsx`

---

### MHC-1102: Profile Overview Card Option B Layout

**Status:** Complete (partial)
**Type:** Enhancement

**Changes:**

- Source links renamed: "Chaturbate" -> "CB", "UN Cams" -> "UN"
- Attribute labels: "Smoke on Cam" -> "Smoking", "Leather/Fetish" -> "Fetish Gear"
- T2 expansion state added for future tiering

**Files:** `client/src/pages/Profile.tsx`

**Note:** Full T2 expandable UI deferred to future sprint

---

### MHC-1103: Clarify Visits Naming

**Status:** Complete
**Type:** UX

**Changes:**

- Renamed "visits from them" to "visits to me"
- Updated tooltip to clarify semantics

**Files:** `client/src/pages/Profile.tsx`

---

### MHC-1104: New Room Banned Flag

**Status:** Complete
**Type:** New Feature

**Changes:**

- Added `room_banned` boolean column (migration 082)
- Updated ProfileService.getAttributes/updateAttributes
- Added frontend state and handler

**Files:**

- `server/src/db/migrations/082_add_room_banned.sql`
- `server/src/services/profile.service.ts`
- `server/src/routes/profile.ts`
- `client/src/pages/Profile.tsx`

---

### MHC-1105: Seen With Field

**Status:** Complete
**Type:** New Feature

**Changes:**

- Created `profile_seen_with` junction table (migration 083)
- Added GET/POST/DELETE API endpoints
- Added frontend state, handlers, autocomplete support

**Files:**

- `server/src/db/migrations/083_create_seen_with.sql`
- `server/src/routes/profile.ts`
- `client/src/pages/Profile.tsx`

---

### MHC-1106: Directory Rename and Filter Reorganization

**Status:** Complete (partial)
**Type:** Enhancement

**Changes:**

- Navigation label: "Directory" -> "People"
- Page header: "Directory" -> "People"
- Filter label: "With Media" -> "With Images"

**Files:**

- `client/src/App.tsx`
- `client/src/pages/Users.tsx`
- `client/src/types/people.ts`

**Note:** Full filter reorganization deferred to future sprint

---

### MHC-1107: Gender Normalization Consistency

**Status:** Complete
**Type:** Bug Fix

**Changes:**

- Enhanced formatGender() to normalize raw Chaturbate values
- "A Man" -> "Male", "A Woman" -> "Female"
- "Shemale", "TS" -> "Trans"

**Files:** `client/src/utils/formatting.ts`

---

### MHC-1108: Media Consolidation and AUTO Image Selection

**Status:** Complete (no changes needed)
**Type:** Investigation

**Findings:**

- AUTO image selection already works via import flow
- Affiliate images are imported to profile_images first, then set as current
- Existing functionality is correct

---

### MHC-1109: Auto Photo Source Investigation

**Status:** Complete (documented)
**Type:** Investigation

**Findings:**

- System correctly distinguishes image sources:
  - `affiliate_api` - from affiliate-polling.job.ts
  - `screensnap` - from live-screenshot.job.ts
- studforyouall issue requires data-level investigation
- Possible causes: stale feed cache, delayed ban enforcement, data entry mismatch

---

## Backlog

See `docs/TODO.md` for the full backlog.
