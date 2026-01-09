# MHC Control Panel - TODO

**Last Updated**: 2026-01-09 (v1.31.0)

This document tracks remaining tasks for the MHC Control Panel, organized by feature area and sorted by effort/risk (lowest first within each section).

---

## Quick Wins (Low Effort / Low Risk)

### /visitors

- [ ] Review new /visitors page
- [x] Fix offline visitors _(v1.18.0)_

### /people

- [x] Refactor People page into modular components _(v1.22.0 - extracted to client/src/components/people/)_
- [x] Stats cards moved to collapsible FiltersPanel _(v1.22.0)_
- [x] Unified Friends/Subs/Doms table layout _(v1.22.0)_
- [x] Change "With Images" label to "With Media" _(v1.23.0)_
- [x] Add CB Profile Link to List view, Grid view _(v1.28.0 - CB and UN Cams links added)_
- [x] Rename "People" to "Directory" in navigation _(v1.28.0)_

### /admin

- [x] Add Bulk Image Upload feature _(v1.24.0 - new Bulk Upload tab with drag & drop, username parsing from filenames)_

### /profile - Info Card

- [x] If DOM or SUB, add a badge to the user profile overview card _(v1.20.0 - added role badges for Sub, Dom, Friend, Custom with status indicators)_
- [x] Instead of centering Model and Follower count on profile overview card, make it left aligned _(v1.18.0)_
- [x] Move Flags to bottom of profile overview as always-visible checkboxes _(v1.23.0)_
- [x] Add "Banned by Me" flag field _(v1.23.0 - DB migration, API, UI)_

### /profile - Media

- [x] Move Media to own collapsible section at top, collapsed by default _(v1.23.0)_
- [x] Fix doubled image count (was showing 18 instead of 9) _(v1.23.0)_

### /profile - Notes

- [x] Auto-expand last note when Notes section expands _(v1.23.0)_
- [x] Add "Read More" for notes >6 lines with configurable setting _(v1.23.0 - Admin → Settings → Media)_

### /profile - Snapshot

- [x] Latest snapshot should not say "LIVE SESSION" if the user is not live, use "LAST SESSION" instead _(v1.18.0)_
- [x] Combine snapshot and profile tabs _(v1.18.0 - merged Snapshot + Profile + History into "Profile" tab)_
- [x] Rename "History" tab _(v1.18.0 - merged into collapsible "Member History" section)_

### /profile - Communications

- [x] Add "Show Raw Data" toggle on Communications tab _(v1.18.0)_
- [x] Fix duplicate messages in Communications PMs _(v1.23.0 - DISTINCT ON deduplication)_
- [x] Match PM format to Inbox conversation format _(v1.23.0 - chat bubble style)_
- [x] Fix broadcaster attribution bug for PMs _(v1.25.0 - uses actual broadcaster from Events API response)_
- [x] Fix Communications to show both directions of conversation _(v1.25.0 - query by fromUser OR toUser)_

### /profile - Interactions & Timeline

- [x] Add deduplication for Interactions tab _(v1.23.0 - DISTINCT ON type, content, timestamp)_
- [x] Add deduplication for Timeline tab _(v1.23.0 - DISTINCT ON type, content, timestamp)_
- [x] Add filter chips to Interactions tab _(v1.25.0 - filter by event type)_

### /sessions

- [x] Default Sessions to Events tab instead of Summary _(v1.23.0)_

### /admin

- [x] Add Active Doms as a stat card for user segments _(v1.18.0)_
- [x] Add Watchlist as a user segment stat _(v1.18.0)_
- [x] Add image storage size as well as database size to Admin page _(v1.19.0)_
- [x] Organize Settings into collapsible sections (Broadcast, AI, Media, Theme) _(v1.23.0)_
- [x] Rename "Profile Scraper" to "Profile Capture" _(v1.23.0)_
- [x] Rename "Scraper" tab to "Chaturbate Sync" _(v1.23.0)_
- [x] Make Database & Storage cards fit on one row _(v1.23.0)_
- [x] Merge By Role and Snapshots by Source on same row _(v1.23.0)_
- [x] Simplify job controls to Start/Stop only _(v1.25.0 - removed Pause/Resume)_
- [x] Add clearer job status states _(v1.25.0 - Stopped/Starting/Processing/Waiting)_

---

## Investigation Required (Runtime Verification)

- [ ] Investigate empty Events for recent sessions
- [ ] Investigate missing January 1 session data
- [ ] Fix Priority Lookup Queue always showing 0 (table may not exist/be populated)
- [ ] Investigate statbate_model not increasing
- [ ] Add search/watchlist prioritization for scraping jobs (needs requirements)

---

## Bug Fixes (Medium Effort / Medium Risk)

### /profile - Communications

- [x] The Communications direction is backwards - PMs in "hudson_cage's Room" are actually PMs in "username's room" _(v1.25.0 - fixed broadcaster attribution)_
- [x] Investigate why there are duplicate messages in Communications PMs _(v1.19.0 - added deduplication to InteractionService)_

### /profile - Images

- [ ] `/profile/mrleather` Images tab says (6) but only 3 images are showing - investigate mismatch

### /profile - Interactions

- [ ] Fix Interactions messages to be more like the PMs in hudson_cage's Room (See profile/danbury44)

### /sessions

- [x] My Broadcasts is missing January 1 broadcast - investigate missing data _(v1.19.0 - added server-side date filtering)_
- [x] Total Broadcasts says 3 for this month but only 2 are showing _(v1.19.0 - changed from hourly to 10-minute dedup buckets)_
- [x] Total Tokens, Avg Viewers, Peak Viewers and Followers are showing zero/non-zero data incorrectly _(v1.19.0 - excluded zeros from averages)_
- [x] Broadcast stats staying at 0, missing sessions, session merging rules _(v1.21.0 - new sessions-v2 system with rollups from events)_
- [x] AI summary timing issue _(v1.21.0 - finalize_at computed from merge gap)_

---

## Feature Enhancements (Medium Effort)

### /profile - Timeline

- [ ] Fix/add Private Message From/To indicator (like on Communications)
- [x] Add ability to filter the Activity timeline by Event Type _(v1.19.0)_

### /profile - Communications

- [ ] Add ability to add manual DM or PMs in each tab in Communications

### /profile - Notes

- [ ] Rework the Notes section - move the Notes Add field below the Notes list with 2 levels:
  - Expand Notes
    - Collapsible Section of Previous Notes - most recent note shows snippet with expand option
    - Add Notes Field

### /sessions (formerly /broadcasts)

- [x] If Broadcasts are within 10 minutes of each other, merge those together _(v1.19.0 - auto-merges in 10-minute buckets)_
- [x] Session merging with configurable gap _(v1.21.0 - 30-minute merge gap, configurable in settings)_
- [x] Should be able to expand Broadcasts and see the full history and chat threads _(v1.21.0 - SessionDetail page with Events tab)_
- [ ] Fix auto-generated summaries (AI summary infrastructure in place, needs Claude API integration)

### /events

- [ ] Rework the page, maybe more like timeline

### /people

- [x] Add CB Profile Link to List view, Grid view, and UN Cam view _(v1.28.0)_

### /admin

- [ ] Verify Active Subs are actually active
- [ ] Consider moving datasources and merging that with Jobs management page
- [ ] Add settings page feature that allows you to set API keys and environment variables including ability to upload a logo to replace the main page logo

---

## New Features (Higher Effort)

### /profile - Interactions

- [ ] Plan new feature for adding multiple external video links (e.g., to embed videos from x.com/jayksmoker)

### /profile - Images

- [ ] Look at scraping CB API for images on profile pages and pull images, tagging them as "profile" type

### Stats & Data Sources

- [ ] Identify exactly what data is coming from Statbate that we can't get elsewhere (subscription expires soon)
- [ ] See what is pulling from CB Hours, CB Rewards, etc. - investigate if we can get more data

---

## Research Tasks (Investigation Needed)

### Scraping & Data Import

- [ ] Research if we can scrape CB to pull Direct Messages and save to profile
- [ ] Research if we can scrape Chaturbate to pull Notes from username
  - This will be tricky but we should be able to go to the DM interface, search for the user, click on the user, and see the notes
  - Check if there is another way through the API to get this

---

## Major Features (High Effort / Higher Risk)

### Authentication

- [ ] Add Register/Signup/Login functionality
- [ ] Include login options: Email, Google, Facebook, Apple, X

---

## Testing

- [ ] Finish testing previous pages
- [ ] /profile - Communications: Create test cases for PM direction fix

---

## Archived / Completed Phases

<details>
<summary>Phase 1: Docker Local Setup (Completed)</summary>

### 1.1 Test Docker Environment

- [x] Copy `.env.example` to `.env` and fill in actual API tokens
- [x] Start Docker stack: `docker-compose up -d`
- [x] Verify all services are running
- [x] Check service logs for errors
- [x] Test database migrations ran successfully
- [x] Access frontend at http://localhost:8080
- [x] Test backend API at http://localhost:3000
- [x] Verify worker is listening to Chaturbate Events API

### 1.2 Test Live Session Capture

- [x] Monitor worker logs to see events being captured
- [x] Verify events are being stored in database
- [x] Check Hudson dashboard shows live session data

</details>

<details>
<summary>Phase 2: Render Cleanup</summary>

### 2.1 Data Migration (If Needed)

- [ ] Decide if you want to preserve Render production data

### 2.2 Cancel Render Services

**Only do this after confirming Docker works!**

- [ ] Stop Render services (don't delete yet)
- [ ] Test Docker is still working while Render is paused
- [ ] If Docker works perfectly, delete Render services

</details>

---

## Docker Quick Reference

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# View logs
docker-compose logs -f [service]

# Rebuild after code changes
docker-compose up -d --build

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d

# Access database
docker-compose exec db psql -U mhc_user -d mhc_control_panel

# Run migrations
docker-compose exec web npm run migrate

# Backup database
docker-compose exec db pg_dump -U mhc_user mhc_control_panel > backup_$(date +%Y%m%d).sql

# Restore database
cat backup.sql | docker-compose exec -T db psql -U mhc_user -d mhc_control_panel
```

---

## Notes

### Important Reminders

1. **Back up production data before any destructive operations**
2. **Keep `.env` file secure and never commit to git**
3. **Test database backups regularly**
