# Testing & Debugging Guide

**Date**: December 24, 2025

## System Status ✅

### Containers

All containers running successfully:

- **mhc-db**: PostgreSQL 15 (healthy) - Port 5432
- **mhc-web**: Backend API - Port 3000
- **mhc-frontend**: React UI - Port 8080
- **mhc-worker**: Background jobs

### Database Schema

- ✅ 197 persons in database
- ✅ Migration 019 applied (follower tracking columns)
- ✅ Tables verified: `affiliate_api_snapshots`, `cbhours_live_stats`, `cbhours_activity`, `profiles`
- ✅ View created: `v_person_current_state`
- ✅ Indexes created for follower queries

### API Endpoints

All endpoints tested and working:

- ✅ `GET /api/person/all` - Returns persons with new fields (age, following, follower, etc.)
- ✅ `GET /api/followers/unfollowed` - Returns unfollowed users (currently 0)
- ✅ `GET /api/affiliate/priority` - Returns 14 priority lookups
- ✅ `GET /api/job/affiliate/status` - Job running, enabled, 5min interval

## Testing Checklist

### 1. Users Page - Directory Tab

#### What to Test

- ✅ **Navigation**: Click "Users" in nav bar - should load as homepage
- ✅ **User List Display**: Should show all 197 users in table
- [ ] **Columns**: Username | Image | Age | Role | Tags | Priority | Events | Snapshots | Last Seen | Actions
  - [ ] Age column not populating
  - [ ] Can we move Role to just above the username as a visual cue and free up space in the table
  - [ ] Show all 5 tags instead of +1 +3 +2 etc... should always be 5 for recent broadcast
  - [ ] Make the headers sticky so we when we scroll, we don't lose the headers.
  - [ ] Do we need Events count?
  - [ ] Last Seen I noticed is not always correct, it was likely correct when the import ran but several are showing live that not live and haven't been live for awhile. For example sumueldixky shows as live and show started at 12/24/25 5:03 AM ET but he is no longer live, and looks like have the Broadcast Sessions --> Recent Sessions the duration was 4h 45m....so that means the show has ended. Need to reconcile that so we don't have false lives.
    - [ ] Also, we have an issue with the image. Chaturbate puts a default image after so many hours of not being live with their brandmark. We shouldn't store this image and should show the most recent real image we have for the user. I am not sure how to tell the difference other than to look at the exact size or do some type of image comparison. However, we do display the correct image in the directory (users) just not on the broadcast page, perhaps because we think it is live. Another example is adam_21cm he was live 23 minutes ago, so makes sense that he is profile page says live. However, in Broadcast Sessions --> Recent Sessions it says 12/24/2025 5:23:21 (is that AM/PM, what timezone? start time or end time? and duration says 5h 50m. If it was start time then this is incorrect.
- ✅ **\*Role Filter**: Toggle between All (197) / Models / Viewers
- ✅ **\*Search**: Type username in search box - should filter results
- ✅ **Tag Filter**:
  - Type tag name in tag filter box
  - [ ] If we can fix the live/not live issue then we should add a toggle for this on the directory/users page.
  - Click preset tag buttons (#smoke, #master, etc.)
  - Should only show users with that tag
- ✅ **Sorting**: Click column headers to sort
- ✅ **Images**: Should display user images (if available)
- [ ] **Live Indicator**: Green dot if user is currently live
  - This is a red dot, not green dot. Red dot is fine.

#### Lookup/Queue Integration

- [ ] **Search for Existing User**:
  1. ✅ Type existing username in lookup box
  2. ✅ Click "Lookup / Queue" button
  3. Should trigger refresh for that user
  - Not sure I can really test this other to wait and see if my selected test user who was not in the directory show sup

- [ ] **Search for Non-Existing User**:
  1.  ✅ Type non-existing username (e.g., "testuser123")
  2.  ✅ Click "Lookup / Queue" button
  3.  Should show error: "User 'testuser123' not found in database"
      1.  This goes straight to the priority pop-up but you dont see the error message until after you select the priorit and return to th edirectorypage.
  4.  ✅ Should open priority modal
  5.  ✅ Can select Priority 1 (one-time) or Priority 2 (recurring)
  6.  ✅ Can add optional notes
      1.  [ ] We should be able to add and view notes on the profile page as well. Also would be helpful to have a direct action on the directory page for adding/viewing notes. The notes should also be structured with date/timestamps and ability to edit/delete.
  7.  ✅ Click "Add to Queue" - should add to priority_lookups table

#### Actions

- ✅ **Add to Priority**: Click ★ button - opens modal
- ✅ **On-Demand Lookup**: Click 🔍 button - triggers refresh
  - hard to tell
- [ ✅ **Delete**: Click 🗑 button - confirms and deletes
- ✅ **View Profile**: Click username - navigates to /profile/:username

### 2. Users Page - Following Tab

- [ ] Don't see the following tab

#### What to Test

- [ ] **Tab Navigation**: Click "Following" tab
- [ ] **Empty State**: Should show "No following users. Upload your following list to populate this tab."
- [ ] **Upload Button**: "Update Following List" button visible

#### Upload Process

1. [ ] Go to https://chaturbate.com/followed-cams (must be logged in)
2. [ ] Save page as HTML (File → Save Page As → Complete Page)
3. [ ] Go to https://chaturbate.com/followed-cams/offline/
4. [ ] Save that page too
5. [ ] In Users → Following tab, click "Update Following List"
6. [ ] Upload the HTML file
7. [ ] Should show stats banner: "New Follows: X, Unfollowed: X, Total: X"
8. [ ] Table should populate with following users
9. [ ] Should show "Following Since" column with dates

#### Expected Behavior

- Sets `following = TRUE` for users in the list
- Sets `following_since = NOW()` on first follow
- If user was previously followed but unfollowed, clears `unfollowed_at` and sets `following = TRUE` again
- Users not in HTML but marked as following get `following = FALSE` and `unfollowed_at = NOW()`

### 3. Users Page - Followers Tab

[ ] Dont' see the follower tab

#### What to Test

- [ ] **Tab Navigation**: Click "Followers" tab
- [ ] **Empty State**: Should show "No followers found. Upload your followers list to populate this tab."
- [ ] **Upload Button**: "Update Followers List" button visible
- [ ] **Role Filter**: All / Models / Viewers toggle

#### Upload Process

1. [ ] Go to https://chaturbate.com/accounts/followers/ (must be logged in)
2. [ ] Save page as HTML
3. [ ] In Users → Followers tab, click "Update Followers List"
4. [ ] Upload the HTML file
5. [ ] Should show stats banner: "New Followers: X, Unfollowers: X, Total: X"
6. [ ] Table should populate with followers
7. [ ] Should show "Follower Since" column with dates

#### Expected Behavior

- Sets `follower = TRUE` for users in the list
- Sets `follower_since = NOW()` on first follow
- Users not in HTML but marked as follower get `follower = FALSE` and `unfollower_at = NOW()`

### 4. Users Page - Unfollowed Tab

[ ] don't see the unfollowed tab

#### What to Test

- [ ] **Tab Navigation**: Click "Unfollowed" tab
- [ ] **Empty State**: Initially shows "No unfollowed users in the selected timeframe."
- [ ] **Timeframe Filters**: Last 7 Days / Last 30 Days / Last 90 Days buttons
- [ ] **After Upload**: Will populate when followers/following data is uploaded and users unfollow

#### Table Columns

- Username
- Image
- Age
- Role
- Followed On (follower_since)
- Unfollowed On (unfollower_at)
- Days Followed (calculated)
- Last Seen
- Actions

#### Insights Banner (when data exists)

- Total Unfollows count
- Average Days Followed

### 5. Admin Page - Jobs Management Tab

#### What to Test

- ✅ **Navigation**: Click "Admin" in nav bar
- ✅ **Default Tab**: Should show Jobs Management tab by default
- ✅ **Current Status Card**:
- Shows running/paused/stopped badge
- Displays interval (currently 5 minutes)
- Shows gender filter
- Shows limit (0 = ALL paginated)

#### Job Controls

- ✅ **Start Button**: Only visible when stopped
- ✅ **Pause Button**: Only visible when running
- ✅ **Resume Button**: Only visible when paused
- ✅ **Stop Button**: Only visible when running
- ✅ **Disabled State**: Start button disabled if job not enabled in config

#### Configuration Section

- ✅ **Expand/Collapse**: Click header to toggle
- ✅ **Enable Job Checkbox**: Toggle enabled state
- ✅ **Polling Interval**: 5-1440 minutes (step: 5)
- ✅ **Gender Filter**: Dropdown with options (m, f, t, c, combinations)
- ✅ **Limit**: 0 = ALL, or 100-10000
- ✅ **Update Configuration Button**: Saves cha
- [ ] There's I werid issue here if you change the profile interval first, then select enable job the profile interval resets to the default.
- [ ] Also, it seems I have to select Update Configuration twice for it to submit but could be related to the profile itnerval issue just mentioned.

#### Statistics Section

- ✅ **Total Cycles**: Number of times job has run
- ✅ **Total Enriched**: Total users enriched
- ✅ **Total Failed**: Total failures
- ✅ **Last Run**: Date/time of last execution
- ✅ **Last Cycle Results**: Shows enriched/failed/success rate for most recent run
- ✅ **Reset Stats Button**: Confirms and resets all statistics
- [ ] Need some indication on why the failures, but that can come when we do the logs page.

### 6. Admin Page - System Stats Tab

- [ ] Don't see the system stats tab

#### What to Test

- [ ] **Tab Navigation**: Click "System Stats" tab
- [ ] **Disk Usage Card**:
  - Currently shows placeholder (0 B)
  - Note: "System Stats API endpoint not yet implemented. Coming soon!"
- [ ] **User Statistics Card**:
  - Total Users count (placeholder)
- [ ] **Queue Statistics Card**:
  - Priority 1 Pending
  - Priority 2 Active
  - Failed Lookups (24h)

#### To Implement Later

- Real disk usage calculation
- Breakdown by source (Affiliate, CBHours, Events, etc.)
- Breakdown by role (Models, Viewers)

### 7. Admin Page - Data Sources Tab

- [ ] Don't see Admin → Data Sources Tab

#### What to Test

- [ ] **Tab Navigation**: Click "Data Sources" tab
- [ ] **Data Sources List**: Should show all 6 sources with status badges

#### Expected Status Badges

- ✅ **Active** (Green): Chaturbate Affiliate API, Events API, Stats API
- 🔵 **Ready** (Blue): CBHours API (implemented but not polling yet)
- ⚠️ **On-Demand** (Yellow): StatBate API
- ⏳ **Planned** (Gray): Profile Scraping

#### Source Details

Each item should show:

- Status badge
- Source name
- Brief description

### 8. Profile Page Integration

#### What to Test

- ✅ **From Users Directory**: Click username → navigates to /profile/:username
- ✅ **Displays User Data**: Should show all available data for that user
- ✅ **Works with URL**: Can navigate directly to /profile/hudson_cage

### 9. End-to-End Workflow Tests

#### Test 1: Add New User via Lookup

1. [ ] Go to Users → Directory
2. [ ] Type a new username in lookup box: "testmodel123"
3. [ ] Click "Lookup / Queue"
4. [ ] Should show error and open priority modal
5. [ ] Select Priority 2, add note "Test user"
6. [ ] Click "Add to Queue"
7. [ ] Check priority count increases in stats
8. [ ] Wait for affiliate job to run (5 min interval)
9. [ ] User should appear in directory if online on Chaturbate

#### Test 2: Follower Tracking Workflow

1. [ ] Upload Following list (HTML from Chaturbate)
2. [ ] Verify users appear in Following tab with dates
3. [ ] Check Directory - should show following users with priority
4. [ ] Upload Followers list
5. [ ] Verify users appear in Followers tab
6. [ ] Later, re-upload with changes
7. [ ] Verify Unfollowed tab populates with unfollowers

#### Test 3: Job Management

1.  ✅ Go to Admin → Jobs Management
2.  ✅ Note current configuration
3.  ✅ Change interval to 10 minutes
4.  ✅ Change gender filter to "m,f"
5.  ✅ Click "Update Configuration"
6.  ✅ Verify changes saved
7.  ✅ Pause the job
8.  ✅ Verify status shows "Paused"
9.  ✅ Resume the job
10. ✅ Verify status shows "Running"

## Known Issues & Limitations

### Current Limitations

1. **System Stats Not Implemented**: System Stats tab shows placeholders - API endpoint needs to be created
2. **Age Data**: Not all users have age data (depends on Affiliate API response)
3. **Following/Followers Data**: Requires manual HTML upload (browser automation not automated)
   - [ ] Thought we decided to have a button on the followers/following page to live pull this data when I am authenticated. We could use playwright, or something to login as me and navigate to the pages and scrape the HTMl for the usernames that we need.
4. **CBHours Polling**: CBHours API integrated but not added to polling cycle yet

- [ ] Why Not

5. **Profile Scraping**: 6th data source not yet implemented

### Expected Behavior Notes

- **Empty Data**: Many fields will be null initially until:
  - Affiliate job runs and enriches users
  - Following/Followers HTML is uploaded
  - Users go live on Chaturbate
- **Timestamps**: All new follower/following relationships get timestamped on first detection
- **Priority Queue**: P1 users fetched once, P2 users fetched on every cycle

## Debugging Commands

### Check Container Logs

```bash
# Web server logs
docker-compose logs web --tail=100

# Worker logs
docker-compose logs worker --tail=100

# Database logs
docker-compose logs db --tail=50
```

### Check Database

```bash
# Connect to database
docker-compose exec db psql -U mhc_user -d mhc_control_panel

# Check migrations
SELECT * FROM migrations ORDER BY id DESC LIMIT 5;

# Check person count
SELECT COUNT(*) FROM persons;

# Check priority lookups
SELECT username, priority_level, status FROM priority_lookups;

# Check followers
SELECT username, following, follower, following_since, follower_since
FROM persons p
JOIN profiles pr ON p.id = pr.person_id
WHERE following = TRUE OR follower = TRUE;

# Check unfollowed
SELECT username, follower_since, unfollower_at
FROM persons p
JOIN profiles pr ON p.id = pr.person_id
WHERE unfollower_at IS NOT NULL
ORDER BY unfollower_at DESC;
```

### Check API Endpoints

```bash
# Get all persons
curl http://localhost:3000/api/person/all?limit=5 | jq

# Get priority lookups
curl http://localhost:3000/api/affiliate/priority | jq

# Get job status
curl http://localhost:3000/api/job/affiliate/status | jq

# Get unfollowed users
curl http://localhost:3000/api/followers/unfollowed | jq
```

### Rebuild Frontend

```bash
docker-compose stop frontend
docker-compose build frontend
docker-compose up -d frontend
```

### Rebuild Backend

```bash
docker-compose stop web worker
docker-compose build web
docker-compose up -d web worker
```

## Success Criteria

### All Systems Go ✅

- [ ] All 4 containers running
- [ ] Database migrations applied
- [ ] Frontend loads at http://localhost:8080
- [ ] Backend API responds at http://localhost:3000
- [ ] Users page shows all tabs
- [ ] Admin page shows all tabs
- [ ] No console errors in browser
- [ ] No errors in server logs

### Core Functionality Working

- [ ] Can view users in Directory
- [ ] Can search and filter users
- [ ] Can add users to priority queue
- [ ] Can upload Following/Followers HTML
- [ ] Can view follower tracking data
- [ ] Can control affiliate job
- [ ] Can view job statistics
- [ ] Can view data source status

## Next Steps (Future Implementation)

1. **Implement System Stats API**: Create endpoint to return real disk usage, user counts by source
2. **Add CBHours Polling**: Integrate CBHours API calls into affiliate job cycle
3. **Profile Scraping**: Add 6th data source for bio, social links, wishlist
4. **Error Handling**: Add comprehensive try-catch blocks and user-friendly error messages
5. **System Activity Log**: Create database table and logging service
6. **Unit Tests**: Add Jest tests for services
7. **Integration Tests**: Add API endpoint tests

## Support

If you encounter issues:

1. Check container logs first
2. Verify database schema
3. Test API endpoints directly
4. Check browser console for frontend errors
5. Review this testing guide for expected behavior
