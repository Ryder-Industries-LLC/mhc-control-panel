# Fixes Needed - December 24, 2025

Based on user testing feedback from TESTING_GUIDE.md

## CRITICAL - Tabs Not Visible ✅ FIXED

**Issue**: Following, Followers, Unfollowed, System Stats, and Data Sources tabs not showing
**Root Cause**: Inactive tabs had white text on white background (no contrast)
**Fix Applied**:
- Changed background from `rgba(255, 255, 255, 0.05)` to `rgba(45, 55, 72, 0.6)` (dark gray)
- Changed text color to `rgba(255, 255, 255, 0.9)` (bright white)
- Changed border to `rgba(255, 255, 255, 0.2)` (subtle white border)
- Applied to both [Users.css](../client/src/pages/Users.css:766-778) and [Admin.css](../client/src/pages/Admin.css:330-342)
- Rebuilt frontend with `--no-cache` flag
- **Result**: Tabs now clearly visible with white text on dark background

## HIGH PRIORITY FIXES

### 1. Age Column Not Populating ✅ FIXED
**File**: `server/src/services/person.service.ts`
**Issue**: Age field not being returned in `findAllWithSource()`
**Fix Applied**: Added age and follower tracking fields to SELECT query from profiles table

### 2. Show All Tags (Not Truncated) ✅ FIXED
**File**: `client/src/pages/Users.tsx`
**Issue**: Shows only 3 tags with "+X more"
**Fix Applied**: Changed `.slice(0, 3)` to `.slice(0, 5)` in all 4 tabs

### 3. Make Table Headers Sticky ✅ FIXED
**File**: `client/src/pages/Users.css`
**Fix Applied**: Added `position: sticky` with backdrop-filter to table headers

### 4. Move Role Badge Above Username ✅ FIXED
**File**: `client/src/pages/Users.tsx`
**Fix Applied**:
- Removed Role column from all tables
- Created `.username-with-role` wrapper with flex-column layout
- Role badge now displays above username in all 4 tabs

### 5. Fix Live Status Detection (FALSE POSITIVES)
**Issue**: Users showing as "live" when they're actually offline
**Examples**:
- `samueldixky` - Shows live but ended 4h 45m ago
- `adam_21cm` - Shows live but duration suggests show ended

**Root Cause**:
- Not checking if broadcast session has ended
- Relying on `current_show` field which may be stale
- No end time tracking for broadcasts

**Fix Needed**:
- Add logic to check if session is actually still active
- Compare start time + duration vs current time
- Don't show as "live" if session has likely ended

**Files to Modify**:
- `server/src/services/person.service.ts` - Add live status calculation
- Database - Ensure we're tracking session end times

### 6. Default/Placeholder Images
**Issue**: Chaturbate replaces user images with branded placeholder after user goes offline
**Problem**: We're storing these placeholder images
**Requested**: Only store real user images, show most recent real image

**Fix Needed**:
- Image validation before storage
- Size check or image comparison to detect placeholder
- Keep history of images per user, show most recent valid one

### 7. Add Live/Offline Toggle Filter
**File**: `client/src/pages/Users.tsx`
**Requested**: Toggle button to filter by online/offline status
**Fix**: Add filter button similar to role filters

## MEDIUM PRIORITY FIXES

### 8. Admin Config Form - Interval Reset Issue
**File**: `client/src/pages/Admin.tsx`
**Issue**:
- Changing interval first, then enabling job resets interval to default
- May need to click "Update Configuration" twice

**Root Cause**: Form state management issue
**Fix**: Review useEffect dependencies and form state updates

### 9. Error Message Visibility on Lookup
**File**: `client/src/pages/Users.tsx`
**Current**: Error message only shows after closing priority modal
**Requested**: Show error immediately before opening modal
**Fix**: Display error message, then open modal on user acknowledgment

### 10. Timestamp Format Issues
**Files**: Multiple
**Issues**:
- No timezone indication (is it AM/PM?)
- Unclear if timestamp is start or end time
- Duration format confusing (5h 50m)

**Fix**:
- Add clear AM/PM
- Show timezone (ET)
- Label timestamps as "Started" vs "Ended"
- Consider more readable duration format

## NICE TO HAVE

### 11. Events Count Column
**Question**: Do we need the Events count column?
**Decision Pending**: User to confirm if this is useful or can be removed

### 12. Notes System Enhancement
**Current**: Can only add notes when adding to priority queue
**Requested**:
- Add/view notes directly on profile page
- Add/view notes action on directory page
- Structure notes with timestamps
- Allow edit/delete of notes

**Implementation**:
- Create `notes` table with timestamps
- Add notes UI to profile page
- Add notes action button to directory
- Show note indicator if user has notes

### 13. Browser Automation for Followers/Following
**Current**: Manual HTML upload
**Requested**: Automated scraping with button click
**Implementation**:
- Use Playwright or similar
- Authenticate as user
- Navigate to follower pages
- Scrape usernames
- Update database

**Complexity**: Medium-High
**Priority**: Low (manual upload works for now)

## QUESTIONS FOR USER

1. **Events Count Column**: Keep or remove?
2. **Tag Display**: Show all tags or limit to 5?
3. **CBHours Polling**: Why not enabled yet? Should we add it to the affiliate job cycle?
4. **Live Detection**: What's the acceptable threshold? (e.g., if show started >6 hours ago, assume offline?)

## IMPLEMENTATION PRIORITY

**Phase 1** (Do Now): ✅ COMPLETE
1. ✅ Fix missing tabs (cache issue)
2. ✅ Age column population
3. ✅ Show all tags
4. ✅ Sticky headers
5. ✅ Move role badge

**Phase 2** (Critical Functionality):
6. Fix live status detection
7. Add live/offline filter
8. Fix admin config form

**Phase 3** (Polish):
9. Improve error messages
10. Fix timestamp formats
11. Image validation

**Phase 4** (Future Enhancement):
12. Notes system
13. Browser automation
14. CBHours polling integration

## TESTING AFTER FIXES

After each fix:
1. Hard refresh browser (Cmd+Shift+R)
2. Clear browser cache if needed
3. Test specific functionality
4. Update TESTING_GUIDE.md with results
