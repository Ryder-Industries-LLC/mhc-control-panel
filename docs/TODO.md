# MHC Control Panel - TODO

**Last Updated**: 2026-01-02

This document tracks remaining tasks for the MHC Control Panel, organized by feature area and sorted by effort/risk (lowest first within each section).

---

## Quick Wins (Low Effort / Low Risk)

### /visitors

- [ ] Review new /visitors page
- [ ] Fix offline visitors

### /profile - Info Card
- [ ] If DOM or SUB, add a badge to the user profile overview card
- [ ] Instead of centering Model and Follower count on profile overview card, make it left aligned

### /profile - Snapshot
- [ ] Latest snapshot should not say "LIVE SESSION" if the user is not live, use "LAST SESSION" instead
- [ ] Combine snapshot and profile tabs

### /profile - History
- [ ] Rename "History" to something that makes more sense (it's about last 2 weeks, but also has some historical facts like all-time tokens)

### /profile - Communications
- [ ] Add "Show Raw Data" toggle on Communications tab

### /admin
- [ ] Add Active Doms as a stat card for user segments
- [ ] Add Watchlist as a user segment stat
- [ ] Add image storage size as well as database size to Admin page

---

## Bug Fixes (Medium Effort / Medium Risk)

### /profile - Communications
- [ ] The Communications direction is backwards - PMs in "hudson_cage's Room" are actually PMs in "username's room"
  - [ ] Create test cases to verify correct behavior
  - [ ] PMs in Hudson_cage's room are also showing direct messages in PMs - needs fix
- [ ] Investigate why there are duplicate messages in Communications PMs

### /profile - Images
- [ ] `/profile/mrleather` Images tab says (6) but only 3 images are showing - investigate mismatch

### /profile - Interactions
- [ ] Fix Interactions messages to be more like the PMs in hudson_cage's Room (See profile/danbury44)

### /broadcasts
- [ ] My Broadcasts is missing January 1 broadcast - investigate missing data
- [ ] Total Broadcasts says 3 for this month but only 2 are showing
- [ ] Total Tokens, Avg Viewers, Peak Viewers and Followers are showing zero/non-zero data incorrectly

---

## Feature Enhancements (Medium Effort)

### /profile - Timeline
- [ ] Fix/add Private Message From/To indicator (like on Communications)
- [ ] Add ability to filter the Activity timeline by Event Type

### /profile - Communications
- [ ] Add ability to add manual DM or PMs in each tab in Communications

### /profile - Notes
- [ ] Rework the Notes section - move the Notes Add field below the Notes list with 2 levels:
  - Expand Notes
    - Collapsible Section of Previous Notes - most recent note shows snippet with expand option
    - Add Notes Field

### /broadcasts
- [ ] If Broadcasts are within 10 minutes of each other, merge those together
- [ ] Should be able to expand Broadcasts and see the full history and chat threads
- [ ] Fix auto-generated summaries

### /events
- [ ] Rework the page, maybe more like timeline

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
