# Session Summary - v2.2.2

**Date**: 2026-01-21
**Mode**: BUILD → RELEASE

## What Was Accomplished

### v2.2.2 - Alternate Accounts & TIPS Parsing

#### 1. Alternate Accounts Feature (Complete)

Added ability to link two separate profile records as being the same person with different usernames.

**Implementation:**
- New `alternate_accounts` table with bidirectional symmetric linking (same pattern as collaborations)
- `AlternateAccountsService` with full CRUD operations
- API endpoints: `GET/POST/DELETE /api/profile/:username/alternate-accounts`
- Frontend UI with purple pills below Collaborators section
- View and helper functions for bidirectional queries
- Removed unused `person_aliases` table (0 records, superseded by this feature)

**Files:**
- `server/src/db/migrations/093_add_alternate_accounts.sql`
- `server/src/services/alternate-accounts.service.ts` (new)
- `server/src/routes/profile.ts` - Added 3 API endpoints
- `server/src/services/person.service.ts` - Removed alias methods
- `server/src/routes/person.ts` - Removed alias from response
- `client/src/pages/Profile.tsx` - Added UI section

#### 2. TIPS Chat Type Parsing (Complete)

Added support for bookmarklet `ChatType: [TIPS]` format.

**Implementation:**
- Updated regex to detect TIPS chat type
- Extracts tip data: username, token amount, optional message
- Generates formatted HTML table summary
- Auto-toggles "Create Tips Note" when tips detected
- Updated TypeScript interfaces for tips type

**Files:**
- `server/src/services/notes.service.ts` - TIPS parsing logic
- `client/src/pages/Profile.tsx` - Tips type handling

#### 3. Tip Menu Parsing Improvements (Complete)

Enhanced tip menu parsing with better filtering.

**Changes:**
- Filter out text emojis (words starting with `:` like `:berenjena333`)
- Filter out Lovense toy-related lines (vibes, lush, toy levels, duration patterns)
- Better pattern matching for CB text emoji format

**Files:**
- `server/src/services/notes.service.ts` - Filtering logic

## Files Modified

| File | Changes |
|------|---------|
| `server/src/db/migrations/093_add_alternate_accounts.sql` | New migration |
| `server/src/services/alternate-accounts.service.ts` | New service |
| `server/src/services/notes.service.ts` | TIPS parsing, text emoji filtering, Lovense filtering |
| `server/src/services/person.service.ts` | Removed alias methods |
| `server/src/routes/profile.ts` | Added alternate-accounts endpoints |
| `server/src/routes/person.ts` | Removed aliases from response |
| `client/src/pages/Profile.tsx` | Alternate accounts UI, tips type handling |
| `docs/CHANGELOG.md` | Added v2.2.2 release notes |
| `docs/TODO.md` | Updated version |

## Current State

- **Docker containers**: Running
- **Git**: On main branch, releasing v2.2.2
- **API**: All endpoints working correctly

## Next Steps

1. Notes tab restructure: separate tabs for Notes, PM, DM, Public Chat, Tips, Tip Menu
2. Fix PM/DM parsing timestamp format detection
3. Profile page overhaul
