# Profile System Refactoring - Plan Forward

**Created**: 2026-01-19
**Last Updated**: 2026-01-20
**Status**: Active Implementation

---

## Completed Phases

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| Media Storage | Phases 7-11 | ✅ COMPLETED | v2.0.0 release |
| Phase 1 | Collaborations | ✅ COMPLETED | Bidirectional "Seen With" |
| Phase 3 | Attributes System | ✅ COMPLETED | v2.1.0 release |
| Phase 2 | Notes Categories | ⚠️ 80% DONE | Parsing complete, tabs pending |

---

## Phase 3: Attributes System - ✅ COMPLETED (v2.1.0)

All components created and working:

- `AttributeBadge.tsx` - Standalone badge pill component
- `AttributeCheckbox.tsx` - Toggle checkbox component
- `AttributeHistoryTooltip.tsx` - Hover tooltip showing last 5 changes
- `ManageAttributesModal.tsx` - Admin modal for managing definitions
- `ProfileAttributes.tsx` - Profile page attributes section
- `types/attributes.ts` - TypeScript type definitions
- `utils/attributeColors.ts` - Color utilities

Backend complete:

- `AttributeService` with full CRUD and history
- Routes at `/api/attributes/*`
- System and custom attribute support

---

## Phase 2: Notes Categories - Remaining Work

### ✅ Completed (v2.1.0)

- Chat log parsing with multi-format support
- Unified paste modal for PM, DM, Public Chat
- Broadcaster detection (knownBroadcaster parameter)
- Tip extraction and tip menu parsing

### ⚠️ Pending

**Tab Restructure**:

Current: `[ General | Public Chat | Tips | Tip Menu ]`
Target: `[ Notes | PM | DM | Public Chat | Tips | Tip Menu ]`

- Each category gets its own tab
- PM and DM tabs show even if count is 0
- Default tab is "Notes" on section expand

---

## Phase 4: Relationship Management - ✅ ALREADY IMPLEMENTED

Already fully implemented in v2.0.0:

- `relationships` table with roles[], status, traits[], dates, notes
- `RelationshipService` and `RelationshipHistoryService`
- `RelationshipEditor.tsx` and `RelationshipHistoryViewer.tsx`

No further work needed.

---

## ARCHIVED - Phase 3 Original Requirements

<details>
<summary>Original component specifications (now implemented)</summary>

1. **`AttributeBadge.tsx`** - Standalone badge pill component
   ```tsx
   interface AttributeBadgeProps {
     attribute: PersonAttribute;
     onToggle?: (value: boolean) => void;  // undefined = read-only
     size?: 'sm' | 'md';
   }
   ```
   - Used in: Profile header, Directory cards, anywhere badges appear
   - Read-only when no `onToggle` provided

2. **`AttributeCheckbox.tsx`** - Checkbox toggle component
   ```tsx
   interface AttributeCheckboxProps {
     attribute: PersonAttribute;
     onToggle: (value: boolean) => void;
     disabled?: boolean;  // For auto-derived
   }
   ```
   - Used in: Profile Attributes section only

3. **`AttributeHistoryTooltip.tsx`** - Tooltip showing last 5 changes
   - Per plan: "Tooltip on hover - Quick view of last 5 changes with timestamps"
   - Currently only expandable section exists

### ❌ Not Implemented

**"Manage Attributes" Modal** (via Admin or Profile settings):
- List all custom (non-system) attributes
- Create new: key, label, color, badge vs checkbox
- Delete custom attributes (with confirmation)
- Location: Admin page > Attributes tab

### Files to Modify
| File | Action |
|------|--------|
| `client/src/components/Attributes.tsx` | REFACTOR → split into components |
| `client/src/components/AttributeBadge.tsx` | CREATE |
| `client/src/components/AttributeCheckbox.tsx` | CREATE |
| `client/src/components/AttributeHistoryTooltip.tsx` | CREATE |
| `client/src/components/ManageAttributesModal.tsx` | CREATE |
| `client/src/pages/Admin.tsx` | ADD Attributes management tab |
| `client/src/pages/Profile.tsx` | UPDATE to use new components |

---

## Phase 2: Notes Service & Categories

**Status**: NOT STARTED

### Purpose
Add category support to profile notes: Note, PM, DM, Public Chat, Tip Menu

### Database Migration (089_note_categories.sql)
```sql
CREATE TYPE note_category AS ENUM ('note', 'pm', 'dm', 'public_chat', 'tip_menu');

ALTER TABLE profile_notes
ADD COLUMN IF NOT EXISTS category note_category DEFAULT 'note';

ALTER TABLE profile_notes
ADD COLUMN IF NOT EXISTS formatted_content TEXT;

ALTER TABLE profile_notes
ADD COLUMN IF NOT EXISTS source_url TEXT;
```

### Category Design
| Category | Color | Badge | Description |
|----------|-------|-------|-------------|
| note | Blue | Note | General free-form notes (default) |
| pm | Purple | PM | Private messages (in-room) |
| dm | Indigo | DM | Direct messages (outside room) |
| public_chat | Green | Chat | Pasted public chat logs |
| tip_menu | Amber | Menu | Tip menu entries |

### Key Features
1. **Chat Log Paste** - Parse usernames, assign colors, format nicely
2. **Tip Menu Paste** - Parse various formats, display in Profile Overview
3. **Category Tabs** - `[ All | Notes | PM | DM | Chat | Menu ]`

### Files to Create/Modify
| File | Action |
|------|--------|
| `server/src/db/migrations/089_note_categories.sql` | CREATE |
| `server/src/services/profile-notes.service.ts` | RENAME → notes.service.ts, add categories |
| `server/src/routes/profile.ts` | Update note endpoints with category param |
| `client/src/pages/Profile.tsx` | Add category tabs, paste modals, tip menu link |

---

## Phase 4: Relationship Management

**Status**: NOT STARTED

### Purpose
Track Dom/Sub/Friend/Partner relationships with tiers

### Database Migration (092_relationships.sql)
```sql
CREATE TYPE relationship_type AS ENUM ('friend', 'dom', 'sub', 'partner', 'acquaintance', 'blocked');
CREATE TYPE relationship_tier AS ENUM ('tier1', 'tier2', 'tier3');

CREATE TABLE IF NOT EXISTS profile_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  related_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  relationship_type relationship_type NOT NULL,
  tier relationship_tier DEFAULT 'tier1',
  notes TEXT,
  started_at DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (profile_id, related_person_id, relationship_type)
);
```

### Backend
- `RelationshipService` - CRUD for relationships
- Routes at `/api/profile/:username/relationships/*`
- History tracking

### Frontend
- Relationship section in Profile UI
- Dropdown for type selection
- Tier indicator (stars or badges)
- Quick filter: "Show my Doms", "Show my Subs"

---

## Phase 5: Profile Service Compartmentalization

**Status**: NOT STARTED

### Purpose
Split monolithic profile.service.ts and profile.ts routes

### Proposed Service Split
| New Service | Responsibilities |
|-------------|-----------------|
| ProfileCoreService | Basic CRUD, person/profile linking |
| NotesService | Notes CRUD (renamed from ProfileNotesService) |
| AttributeService | ✅ DONE - Attribute management + history |
| CollaborationsService | ✅ DONE - Bidirectional collaborations |
| RelationshipService | Dom/Sub/Friend relationships |
| ProfileStatsService | Stats, viewer counts, rankings |
| ProfileScrapingService | CB profile scraping logic |

### Route File Split
| New Route File | Endpoints |
|---------------|-----------|
| profile-core.ts | GET/PATCH /profile/:username |
| profile-notes.ts | /profile/:username/notes/* |
| attributes.ts | ✅ DONE - /api/attributes/* |
| collaborations.ts | ✅ DONE (in profile.ts) |
| profile-relationships.ts | /profile/:username/relationships/* |
| profile-stats.ts | /profile/:username/stats/* |

---

## Phase 6: Profile UI Reorganization

**Status**: NOT STARTED

### Purpose
Extract components from Profile.tsx (3200+ lines)

### Collapsible Sections
| Section | Default State |
|---------|---------------|
| Header | Always visible |
| Quick Stats | Open |
| Attributes | Open |
| Notes | Open |
| Relationships | Collapsed |
| Collaborators | Collapsed |
| Images | Open |
| Broadcast History | Collapsed |
| Activity Log | Collapsed |

### New Components
| Component | Purpose |
|-----------|---------|
| ProfileHeader.tsx | Avatar, name, status, external links |
| ProfileQuickStats.tsx | Follower count, rank, last seen |
| ProfileAttributes.tsx | Attribute badges + checkboxes |
| ProfileNotes.tsx | Notes list with category tabs |
| ProfileRelationships.tsx | Relationship management |
| ProfileCollaborators.tsx | Collaborators list |
| ProfileImages.tsx | Image gallery |
| ProfileBroadcasts.tsx | Stream history |
| CollapsibleSection.tsx | Reusable wrapper (exists, may need updates) |

---

## Phase 11.1: S3 Consistency Check - Analysis Required

**Status**: ANALYSIS NEEDED

### Current State (from 2026-01-17 analysis)

**Database**: 205,438 tracked S3 images
**S3 Actual**: 532,601 objects (before cleanup)

### Cleanup Status

| Folder | S3 Count | DB Count | Action | Status |
|--------|----------|----------|--------|--------|
| people/*/all/ | 105,052 | 0 | DELETE ALL | ✅ Completed |
| people/*/migrated/ | 501 | 0 | DELETE | ✅ Completed |
| people/*/auto/ | 297,096 | 123,252 | Analyze 174K untracked | ⏳ Pending |
| people/*/profile/ | 116,204 | 67,503 | Analyze 49K untracked | ⏳ Pending |
| people/*/snaps/ | 11,715 | 11,645 | ✅ 99% tracked | Done |
| people/*/following/ | 1,817 | 1,817 | ✅ 100% tracked | Done |
| people/*/uploads/ | 248 | 248 | ✅ 100% tracked | Done |

### Outstanding Files (from Jan 17 verification)
- **S3 Orphans**: 199,335 files in S3 with no DB record
- **DB Missing**: 56,119 DB records with no S3 file

### Required Actions

1. **Verify all/ and migrated/ cleanup completed**
   ```bash
   curl -s 'http://localhost:8080/api/legacy-import/s3-samples?prefix=mhc/media/people&limit=100' | \
     python3 -c "import json,sys; d=json.load(sys.stdin); \
     all_cnt = len([s for s in d['data']['samples'] if '/all/' in s['key']]); \
     mig_cnt = len([s for s in d['data']['samples'] if '/migrated/' in s['key']]); \
     print(f'all/: {all_cnt}, migrated/: {mig_cnt}')"
   ```

2. **Sample and analyze untracked auto/ files**
   - Determine if legitimate captures or orphans
   - Decision: Import to DB or quarantine/delete

3. **Sample and analyze untracked profile/ files**
   - Same analysis as auto/

4. **Handle DB records with missing S3 files**
   - 56K records point to non-existent files
   - Options: Soft-delete records, or attempt re-download

5. **Final verification**
   - DB count should match S3 count (excluding QUARANTINE)
   - Document final state

---

## Implementation Priority

Based on user value and dependencies:

1. **Phase 3 Completion** - Fix Attributes component architecture
2. **Phase 11.1 Analysis** - Resolve S3/DB consistency
3. **Phase 2** - Notes Categories (high user value)
4. **Phase 4** - Relationships (new feature)
5. **Phase 5** - Service compartmentalization (refactoring)
6. **Phase 6** - UI reorganization (depends on Phase 5)

---

## Verification Checklist

After each phase:
- [ ] `npm run build` succeeds (client and server)
- [ ] `docker-compose up -d --build` completes
- [ ] Existing profile pages load without errors
- [ ] New features work as expected
- [ ] No regression in existing functionality

---

## Reference Files

- Original Plan: `/prompts/Profile System Refactoring Plan.txt`
- Session Summary: `/docs/SESSION_SUMMARY.md`
- Architecture: `/docs/ARCHITECTURE.md`
