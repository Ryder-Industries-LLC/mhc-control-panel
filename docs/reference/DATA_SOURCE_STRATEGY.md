# Multi-Source Data Architecture

## Overview

The MHC Control Panel aggregates data from multiple sources, each with different coverage, update frequencies, and reliability. This document defines the architecture for storing and prioritizing data from multiple sources.

## Data Sources

### 1. Chaturbate Affiliate API
- **Coverage**: All online broadcasters in feed
- **Update Frequency**: Real-time (we poll every 5 minutes)
- **Reliability**: Very high (official API)
- **Data Points**:
  - username, display_name, age, gender, location, country
  - spoken_languages[], tags[]
  - current_show, room_subject, is_hd, is_new
  - num_users, num_followers, seconds_online
  - image_url, image_url_360x270
- **Limitations**: Only shows models currently online

### 2. CBHours API
- **Coverage**: Models with trophy/calendar in bio (after one studio search)
- **Update Frequency**: Live stats every 1 min, activity every 3 min
- **Reliability**: High (third-party tracking)
- **Data Points**:
  - Live: room_status, gender, rank, grank, viewers, followers, current_show, room_subject, tags[], is_new
  - Historical: 60 days of activity data with 3-min granularity
- **Limitations**: Requires model to have trophy/calendar icon in bio

### 3. Chaturbate Events API
- **Coverage**: Hudson's room only
- **Update Frequency**: Real-time via worker
- **Reliability**: Very high (official API)
- **Data Points**:
  - tips, messages, user joins/leaves
  - User metadata from events
- **Limitations**: Only Hudson's room

### 4. Chaturbate Stats API
- **Coverage**: Hudson's stats only
- **Update Frequency**: On-demand
- **Reliability**: Very high (official API)
- **Data Points**: Hudson's broadcast statistics
- **Limitations**: Only Hudson

### 5. StatBate API
- **Coverage**: Models with tips in StatBate system
- **Update Frequency**: On-demand
- **Reliability**: High (third-party)
- **Data Points**: Historical tips, member analysis
- **Limitations**: Only models with tip history

### 6. Browser Scraping (Following/Followers)
- **Coverage**: Your followed models and followers
- **Update Frequency**: Manual/scheduled
- **Reliability**: Medium (scraping, can break)
- **Data Points**: Following/follower relationships
- **Limitations**: Requires authenticated session

## Source Priority Rules

### Field Priority (Most Authoritative → Least)

#### Identity Fields
1. Chaturbate Affiliate API (username, platform)
2. Events API (for Hudson)
3. Browser scraping

#### Profile Fields (display_name, age, gender, location, etc.)
1. **Affiliate API** - Most current, updated when online
2. **CBHours API** - Good secondary, updated frequently
3. **Profile enrichment** - Cached from previous Affiliate API calls

#### Live Status Fields (room_status, current_show, viewers, etc.)
1. **Affiliate API** - Real-time when online
2. **CBHours API** - 1-min delay, but works when offline
3. **Broadcast sessions** - Historical, last known state

#### Follower Count
1. **CBHours API** - Most accurate, tracked over time
2. **Affiliate API** - Current snapshot when online
3. **Broadcast sessions** - Historical snapshots

#### Tags
1. **Affiliate API** - Most current from active stream
2. **CBHours API** - Recent from tracking
3. **Broadcast sessions** - Last known

#### Rank/Popularity Metrics
1. **CBHours API** - Only source with rank/grank
2. **Affiliate API** - Can infer from viewers/followers
3. N/A - Not available elsewhere

## Schema Design

### Principle: Store All Source Data Separately

Each source gets its own table to preserve:
- Source attribution
- Timestamp of data collection
- Complete raw data for debugging
- Historical tracking per source

### Core Tables

#### `persons` (Master Record)
- Primary identity table
- Minimal fields: id, username, platform, role
- Does NOT store data fields - only references

#### Source-Specific Tables

**`affiliate_api_snapshots`**
```sql
CREATE TABLE affiliate_api_snapshots (
  id SERIAL PRIMARY KEY,
  person_id UUID REFERENCES persons(id),
  observed_at TIMESTAMP NOT NULL,

  -- Profile data
  display_name TEXT,
  age INTEGER,
  gender TEXT,
  location TEXT,
  country TEXT,
  spoken_languages TEXT[],
  birthday TEXT,

  -- Stream data
  current_show TEXT,
  room_subject TEXT,
  tags TEXT[],
  is_hd BOOLEAN,
  is_new BOOLEAN,

  -- Metrics
  num_users INTEGER,
  num_followers INTEGER,
  seconds_online INTEGER,

  -- Images
  image_url TEXT,
  image_url_360x270 TEXT,
  image_path TEXT,
  image_path_360x270 TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(person_id, observed_at)
);
```

**`cbhours_live_stats`**
```sql
CREATE TABLE cbhours_live_stats (
  id SERIAL PRIMARY KEY,
  person_id UUID REFERENCES persons(id),
  checked_at TIMESTAMP NOT NULL,

  -- Status
  room_status TEXT, -- 'Online' | 'Offline'

  -- Profile (may differ from affiliate)
  gender TEXT,
  is_new BOOLEAN,

  -- Rankings (unique to CBHours)
  rank INTEGER,
  grank INTEGER, -- gender rank

  -- Metrics
  viewers INTEGER,
  followers INTEGER,

  -- Stream data
  current_show TEXT,
  room_subject TEXT,
  tags TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(person_id, checked_at)
);
```

**`cbhours_activity`**
```sql
CREATE TABLE cbhours_activity (
  id SERIAL PRIMARY KEY,
  person_id UUID REFERENCES persons(id),
  timestamp TIMESTAMP NOT NULL,

  -- 3-minute segment data
  show_type TEXT, -- '_public', '_private', etc.
  rank INTEGER,
  grank INTEGER,
  followers INTEGER,
  viewers INTEGER,
  gender TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(person_id, timestamp)
);
```

**Existing Tables** (keep as-is):
- `profiles` - Profile enrichment cache
- `broadcast_sessions` - Renamed from affiliate snapshots
- `interactions` - Events API data
- `snapshots` - Stats API snapshots

### Aggregation Views

Create materialized views or functions that aggregate across sources:

**`v_person_current_state`** - Current best-known state
```sql
CREATE OR REPLACE VIEW v_person_current_state AS
SELECT
  p.id,
  p.username,
  p.platform,
  p.role,

  -- Display name (priority: affiliate → cbhours → profiles)
  COALESCE(
    (SELECT display_name FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    (SELECT display_name FROM profiles WHERE person_id = p.id)
  ) as display_name,

  -- Current status (priority: affiliate → cbhours)
  COALESCE(
    (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id AND observed_at > NOW() - INTERVAL '10 minutes' ORDER BY observed_at DESC LIMIT 1),
    (SELECT CASE WHEN room_status = 'Online' THEN current_show ELSE NULL END FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1)
  ) as current_show,

  -- Followers (priority: cbhours → affiliate)
  COALESCE(
    (SELECT followers FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1),
    (SELECT num_followers FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1)
  ) as followers,

  -- Rank (only from cbhours)
  (SELECT rank FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1) as rank,
  (SELECT grank FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1) as grank,

  -- Tags (priority: affiliate → cbhours)
  COALESCE(
    (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    (SELECT tags FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1)
  ) as tags,

  -- Images (affiliate only for now)
  (SELECT COALESCE(image_path_360x270, image_url_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as image_url,

  -- Metadata
  p.last_seen_at,
  (SELECT MAX(observed_at) FROM affiliate_api_snapshots WHERE person_id = p.id) as last_affiliate_update,
  (SELECT MAX(checked_at) FROM cbhours_live_stats WHERE person_id = p.id) as last_cbhours_update

FROM persons p;
```

## Migration Strategy

1. **Rename existing table**: `broadcast_sessions` → `affiliate_api_snapshots`
2. **Create new tables**: `cbhours_live_stats`, `cbhours_activity`
3. **Keep profiles table**: As enrichment cache
4. **Create views**: Aggregation views for efficient queries
5. **Update services**: Modify to write to source-specific tables
6. **Update queries**: Use aggregation views instead of direct queries

## Implementation Plan

1. Create migration to rename and restructure tables
2. Create CBHours API client
3. Create aggregation service with priority logic
4. Update broadcast session service to write to `affiliate_api_snapshots`
5. Create CBHours polling job
6. Update UI queries to use aggregation views
7. Add source indicators in UI to show data provenance

## Benefits

- **Data Provenance**: Always know where data came from
- **Historical Tracking**: Per-source history for debugging
- **Flexibility**: Easy to add new sources
- **Reliability**: Graceful fallbacks when sources are unavailable
- **Analytics**: Can analyze source coverage and freshness
- **Debugging**: Can see exactly what each source returned
