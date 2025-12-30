# Chaturbate Affiliate API Integration

## Overview

The MHC Control Panel now integrates with the **Chaturbate Affiliate API** to collect rich broadcaster profile and session data. This official public API provides real-time information about currently online broadcasters without requiring authentication.

## Why Use the Affiliate API?

The Affiliate API provides data that is NOT available through other Chaturbate APIs:

✅ **Location** - Where broadcasters are from
✅ **Age & Birthday** - If publicly visible
✅ **Tags** - Content tags for the room
✅ **Room Subject** - Current show description
✅ **Follower Count** - Popularity metric
✅ **Viewer Count** - Real-time engagement
✅ **HD Status** - Stream quality
✅ **Languages** - Spoken languages
✅ **Display Name** - Alternate name
✅ **Image URLs** - Profile thumbnails
✅ **Show Type** - Public/private/group/away

Combined with the **Statbate Premium API** (rank, income, sessions) and **Events API** (live chat), we now have comprehensive broadcaster intelligence.

## Database Architecture

### New Tables

#### 1. **broadcast_sessions**
Tracks online broadcast snapshots from the Affiliate API.

**Key Fields:**
- `person_id` - Links to `persons` table
- `observed_at` - When this snapshot was captured
- `seconds_online` - Broadcaster's online duration at observation time
- `session_start` - Calculated start time (GENERATED column)
- `current_show` - public, private, group, or away
- `room_subject` - Show description
- `tags[]` - Array of content tags
- `num_users` - Viewer count at observation
- `num_followers` - Total followers
- `is_hd` - HD stream quality
- `image_url` - Thumbnail URLs

**Why Separate from Snapshots?**
- Different data source (Affiliate API vs Statbate Premium API)
- Different update frequency (real-time vs periodic)
- Per-broadcast granularity (vs daily stats)

#### 2. **profiles** (Updated)
Enhanced to store Affiliate API data alongside existing fields.

**New Columns:**
- `country` - ISO alpha-2 country code
- `is_new` - New broadcaster flag
- `location_detail` - Full location from scraping (Phase 2)
- `birthday_public` - Public birthday (YYYY-MM-DD)
- `interested_in` - Target audience (Phase 2)
- `body_type` - Physical description (Phase 2)
- `smoke_drink` - Lifestyle choices (Phase 2)
- `body_decorations` - Tattoos/piercings (Phase 2)
- `data_source` - affiliate_api, scrape, or manual
- `last_seen_online` - Last time seen in Affiliate API

### Data Separation Strategy

**Profile Data** (relatively static):
- Stored in `profiles` table
- Updated when values change
- Source: Affiliate API + authenticated scraping (Phase 2)

**Session Data** (dynamic, per-broadcast):
- Stored in `broadcast_sessions` table
- New record for each observation
- Tracks progression over time (viewer count changes, duration, etc.)

**Performance Metrics** (financial, ranking):
- Stored in existing `snapshots` table
- Source: Statbate Premium API

**Interactions** (chat, tips, PMs):
- Stored in existing `interactions` table
- Source: Events API + Statbate Plus chat history

## API Endpoints

### Profile Enrichment

#### Enrich Single Profile
```bash
GET /api/affiliate/enrich/:username

# Example
curl http://localhost:3000/api/affiliate/enrich/giomar_reyes
```

**What it does:**
1. Fetches broadcaster from Affiliate API (only if currently online)
2. Creates/updates person record
3. Upserts profile data
4. Records broadcast session snapshot
5. Returns person, profile, and session data

**Response:**
```json
{
  "person": { "id": "...", "username": "giomar_reyes", ... },
  "profile": {
    "display_name": "GIOMAR REYES",
    "age": 24,
    "birthday": "2001-05-18",
    "gender": "m",
    "location": "Bogota D.C., Colombia",
    "country": "VE",
    "spoken_languages": "español",
    "is_new": false,
    ...
  },
  "session": {
    "id": 123,
    "seconds_online": 2273,
    "current_show": "public",
    "room_subject": "Giomar_reyes's #FEET #WEIGHTS #MUSCLES",
    "tags": ["feet", "weights", "muscles"],
    "num_users": 6,
    "num_followers": 2769,
    ...
  }
}
```

#### Get Enriched Profile (All Data Sources)
```bash
GET /api/affiliate/profile/:username

# Example
curl http://localhost:3000/api/affiliate/profile/giomar_reyes
```

**Returns:**
```json
{
  "person": { ... },
  "profile": { ... },
  "latestSession": { ... },
  "sessionStats": {
    "totalSessions": 45,
    "totalMinutesOnline": 3420,
    "avgViewersPerSession": 125,
    "avgFollowersGained": 15,
    "mostUsedTags": [
      { "tag": "feet", "count": 32 },
      { "tag": "muscles", "count": 28 }
    ],
    "peakViewers": 450
  },
  "snapshots": [...], // Stats API snapshots
  "interactions": [...] // Recent interactions
}
```

### Broadcast Sessions

#### Get Sessions for User
```bash
GET /api/affiliate/sessions/:username?limit=100

# Example
curl http://localhost:3000/api/affiliate/sessions/giomar_reyes?limit=50
```

### Online Rooms

#### Get Currently Online Rooms
```bash
GET /api/affiliate/online?gender=m&limit=100&hd=true

# Parameters:
# - gender: f, m, t, c (can specify multiple)
# - limit: 1-500 (default 100)
# - offset: pagination offset
# - hd: true/false (HD streams only)
# - tag: filter by tags (up to 5)

# Examples:
curl 'http://localhost:3000/api/affiliate/online?gender=m&limit=50'
curl 'http://localhost:3000/api/affiliate/online?gender=f&gender=t&hd=true'
curl 'http://localhost:3000/api/affiliate/online?tag=feet&tag=muscles'
```

### Batch Operations

#### Batch Enrich Profiles
```bash
POST /api/affiliate/batch-enrich
Content-Type: application/json

{
  "gender": "m",
  "limit": 100
}

# Example
curl -X POST http://localhost:3000/api/affiliate/batch-enrich \
  -H "Content-Type: application/json" \
  -d '{"gender":"m","limit":100}'
```

**What it does:**
1. Fetches currently online rooms from Affiliate API
2. Enriches each profile (person + profile + session)
3. Returns success/failure counts

**Use case**: Import all currently online broadcasters to build initial dataset.

## Code Usage

### ChaturbateAffiliateClient

```typescript
import { chaturbateAffiliateClient } from './api/chaturbate/affiliate-client.js';

// Get online rooms
const response = await chaturbateAffiliateClient.getOnlineRooms({
  gender: 'm',
  limit: 100,
  hd: true,
  tag: ['feet', 'muscles'],
});

// Find specific user
const room = await chaturbateAffiliateClient.getRoomByUsername('giomar_reyes');

// Get all online rooms (paginated)
const allRooms = await chaturbateAffiliateClient.getAllOnlineRooms({
  gender: ['m', 'f'],
});

// Get popular rooms
const popular = await chaturbateAffiliateClient.getPopularRooms(50);
```

### ProfileEnrichmentService

```typescript
import { ProfileEnrichmentService } from './services/profile-enrichment.service.js';

// Enrich single profile
const result = await ProfileEnrichmentService.enrichFromAffiliateAPI('giomar_reyes');

// Get comprehensive profile
const profile = await ProfileEnrichmentService.getEnrichedProfile('giomar_reyes');

// Batch enrich
const stats = await ProfileEnrichmentService.batchEnrichFromAffiliateAPI({
  gender: 'm',
  limit: 500,
});
```

### BroadcastSessionService

```typescript
import { BroadcastSessionService } from './services/broadcast-session.service.js';

// Get latest session
const latest = await BroadcastSessionService.getLatestSession(personId);

// Get all sessions
const sessions = await BroadcastSessionService.getSessionsByPerson(personId, 100);

// Get session statistics
const stats = await BroadcastSessionService.getSessionStats(personId, 30);
```

## Data Flow

### Enrichment Flow
```
1. User visits lookup page OR cron job runs
2. Call /api/affiliate/enrich/:username
3. Affiliate API: Fetch room data (if online)
4. Database: Upsert person record
5. Database: Upsert profile record
6. Database: Insert broadcast_sessions record
7. Return: person + profile + session
```

### Comprehensive Lookup Flow
```
1. User requests /api/affiliate/profile/:username
2. Database: Fetch person record
3. Database: Fetch profile record
4. Database: Fetch latest broadcast session
5. Database: Calculate 30-day session stats
6. Database: Fetch Stats API snapshots
7. Database: Fetch recent interactions
8. Return: Enriched profile with all data
```

## Building the UI (Next Phase)

The detailed user lookup page will have:

### Part 1: Search/Lookup
- Username input (existing)
- Search button

### Part 2: Basic Info Card
- Profile image (from `image_url`)
- Display name
- Age, location, country
- Gender, languages
- Latest session info (current show, viewers, online time)

### Part 3: Tabbed Interface

**Tab 1: Latest Snapshot**
- Current Stats API data (rank, income, sessions)
- Delta comparison
- Existing lookup page content

**Tab 2: Session Details**
- Session history table
- Start time, duration, viewers, followers gained
- Room subject, tags, show type
- Chart: Viewer count over time
- Chart: Session frequency calendar

**Tab 3: Profile Details**
- All profile fields
- Birthday, age, location details
- Body type, decorations (Phase 2 scraping)
- Interested in, smoke/drink (Phase 2)
- Profile completeness score

**Tab 4: Recent Interactions**
- Existing interactions display
- Tips, chat messages, PMs
- Interaction timeline

## Phase 2: Authenticated Scraping

For fields not in the Affiliate API:
- **Interested In**: Women, Men, Couples, Trans
- **Location Detail**: Full location string vs country code
- **Last Broadcast**: Relative time (15 minutes ago)
- **Body Type**: ATHLETIC, SLIM, etc.
- **Smoke/Drink**: YES/YES, NO/NO, etc.
- **Body Decorations**: TATTOO, PIERCING, etc.

**Implementation:**
- Use Puppeteer with authenticated session
- Scrape profile page (/username/)
- Store in `profiles` table with `data_source='scrape'`
- Update existing profile-scraper.service.ts

## Advantages Over Scraping

| Feature | Affiliate API | Web Scraping |
|---------|--------------|--------------|
| Authentication | ❌ Not required | ✅ Required |
| Rate Limits | ✅ 500/request | ⚠️ Must be careful |
| Real-time Data | ✅ Live | ✅ Live |
| Reliability | ✅ Stable API | ⚠️ HTML changes break |
| Data Fields | ⚠️ Limited | ✅ All fields |
| Legal/ToS | ✅ Official API | ⚠️ Grey area |

**Best Practice**: Use Affiliate API as primary source, supplement with authenticated scraping for missing fields.

## Testing

```bash
# Test Affiliate API client
curl 'http://localhost:3000/api/affiliate/online?limit=10'

# Test single enrichment
curl http://localhost:3000/api/affiliate/enrich/giomar_reyes

# Test comprehensive profile
curl http://localhost:3000/api/affiliate/profile/giomar_reyes

# Test batch enrichment
curl -X POST http://localhost:3000/api/affiliate/batch-enrich \
  -H "Content-Type: application/json" \
  -d '{"gender":"m","limit":50}'

# Verify database
docker-compose exec db psql -U mhc_user -d mhc_control_panel \
  -c "SELECT * FROM broadcast_sessions ORDER BY observed_at DESC LIMIT 5;"
```

## Monitoring & Maintenance

### Recommended Cron Jobs

**Hourly**: Enrich active broadcasters
```bash
# Fetch currently online, update sessions
curl -X POST http://localhost:3000/api/affiliate/batch-enrich -d '{"limit":500}'
```

**Daily**: Cleanup old sessions
```sql
DELETE FROM broadcast_sessions
WHERE observed_at < NOW() - INTERVAL '90 days';
```

### Database Indexes

All critical indexes are created by migration 012:
- `idx_broadcast_sessions_person_id` - Fast person lookups
- `idx_broadcast_sessions_observed_at` - Time-based queries
- `idx_broadcast_sessions_session_start` - Session start queries
- `idx_broadcast_sessions_person_session` - Combined lookup
- `idx_broadcast_sessions_tags` - GIN index for tag searches

## API Documentation

Full Chaturbate Affiliate API docs:
https://chaturbate.com/affiliates/developer/

**Base URL**: `https://chaturbate.com/api/public/affiliates/`

**Endpoints Used**:
- `/onlinerooms/` - Get currently online broadcasters

**Rate Limits**: Not explicitly documented, recommend max 1 request/second.

## Future Enhancements

1. **WebSocket Integration**: Real-time session updates
2. **Session Grouping**: Group observations into continuous sessions
3. **Viewer Count Charts**: Plot viewer trends during broadcasts
4. **Tag Analytics**: Popular tag combinations, tag performance
5. **Follower Growth Tracking**: Track follower count changes
6. **Show Type Analysis**: Time spent in public vs private shows
7. **Geo Analytics**: Location-based broadcaster statistics
8. **HD Adoption**: Track HD streaming trends

## Summary

The Chaturbate Affiliate API integration provides:
- ✅ **Legal, official data source**
- ✅ **No authentication required**
- ✅ **Rich broadcaster profile data**
- ✅ **Real-time session tracking**
- ✅ **Comprehensive analytics foundation**

This replaces the previous web scraping approach with a more reliable, scalable solution that respects Chaturbate's Terms of Service while providing better data quality.
