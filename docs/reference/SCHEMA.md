# Database Schema

This document defines the complete PostgreSQL schema for the MHC Control Panel.

---

## Design Principles

1. **Append-Only History**: Snapshots and interactions are never updated or deleted
2. **Explicit Failure Handling**: No silent failures; all API errors logged
3. **Normalized Storage**: Raw API payloads stored alongside normalized metrics
4. **Alias Support**: Username changes tracked via separate aliases table
5. **Exclusion by Default**: `smk_lover` auto-excluded on creation

---

## Tables

### persons

Represents any username (viewer or model) on the platform.

```sql
CREATE TABLE persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL DEFAULT 'chaturbate',
  role VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN', -- MODEL | VIEWER | BOTH | UNKNOWN
  rid INTEGER,                                  -- Room ID (models only, from Statbate)
  did INTEGER,                                  -- Donor ID (members only, from Statbate)
  first_seen_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  is_excluded BOOLEAN DEFAULT FALSE,            -- Auto-set for smk_lover
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(username, platform)
);

CREATE INDEX idx_persons_username ON persons(username);
CREATE INDEX idx_persons_role ON persons(role);
CREATE INDEX idx_persons_excluded ON persons(is_excluded);
```

**Notes**:
- `rid` and `did` are confirmed in `statbate_openapi.json` responses
- `is_excluded` automatically set to `true` when `username = 'smk_lover'`
- Username changes tracked via `person_aliases` table

---

### person_aliases

Tracks historical usernames for a person.

```sql
CREATE TABLE person_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  alias VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL DEFAULT 'chaturbate',
  valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMP,                           -- NULL if current
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(alias, platform, valid_from)
);

CREATE INDEX idx_person_aliases_person_id ON person_aliases(person_id);
CREATE INDEX idx_person_aliases_alias ON person_aliases(alias);
CREATE INDEX idx_person_aliases_current ON person_aliases(valid_to) WHERE valid_to IS NULL;
```

**Notes**:
- Lookups match against both `persons.username` and `person_aliases.alias`
- `valid_to IS NULL` indicates current/active username
- Username history preserved for forensic analysis

---

### snapshots

Append-only point-in-time captures from external APIs.

```sql
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL,                  -- statbate_member | statbate_model | cb_stats | manual
  captured_at TIMESTAMP NOT NULL,
  raw_payload JSONB NOT NULL,                   -- Original API response
  normalized_metrics JSONB,                     -- Standardized metrics for delta computation
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(person_id, source, captured_at)
);

CREATE INDEX idx_snapshots_person_id ON snapshots(person_id);
CREATE INDEX idx_snapshots_captured_at ON snapshots(captured_at DESC);
CREATE INDEX idx_snapshots_person_source ON snapshots(person_id, source, captured_at DESC);
```

**Notes**:
- **Never updated or deleted** (append-only)
- `raw_payload`: Exact API response for debugging/reprocessing
- `normalized_metrics`: Standardized format for delta computation
- Deltas computed by comparing consecutive snapshots for same `person_id` and `source`

---

### interactions

Append-only events, messages, notes, and pastes.

```sql
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  stream_session_id UUID REFERENCES stream_sessions(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,                    -- CHAT_MESSAGE | PRIVATE_MESSAGE | TIP_EVENT | PROFILE_PASTE | CHAT_IMPORT | MANUAL_NOTE
  content TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  source VARCHAR(50) NOT NULL,                  -- cb_events | statbate_plus | manual
  metadata JSONB,                               -- Additional context (tip amount, event details, etc.)
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_interactions_person_id ON interactions(person_id);
CREATE INDEX idx_interactions_timestamp ON interactions(timestamp DESC);
CREATE INDEX idx_interactions_session_id ON interactions(stream_session_id);
CREATE INDEX idx_interactions_type ON interactions(type);
```

**Notes**:
- **Never updated or deleted** (append-only)
- `CHAT_IMPORT`: Messages imported from Statbate Plus chat history
- `metadata`: Stores tip amounts, raw event payloads, etc.
- `stream_session_id`: Links live events to sessions

---

### stream_sessions

Represents streaming sessions for `hudson_cage`.

```sql
CREATE TABLE stream_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL DEFAULT 'chaturbate',
  broadcaster VARCHAR(255) NOT NULL DEFAULT 'hudson_cage',
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'LIVE',   -- LIVE | ENDED
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stream_sessions_status ON stream_sessions(status);
CREATE INDEX idx_stream_sessions_started_at ON stream_sessions(started_at DESC);
CREATE INDEX idx_stream_sessions_broadcaster ON stream_sessions(broadcaster);
```

**Notes**:
- Created manually via "Start Session" button or auto-detected via `broadcastStart` event
- `ended_at IS NULL` indicates live session
- All interactions during session linked via `stream_session_id`

---

### attributes

Structured tags and memory attached to persons.

```sql
CREATE TABLE attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,                    -- location | favorite_tag | note | preference
  value TEXT NOT NULL,
  confidence VARCHAR(20) NOT NULL,              -- low | medium | high
  evidence_type VARCHAR(50),                    -- snapshot | interaction | manual
  evidence_id UUID,                             -- FK to snapshot or interaction (not enforced)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_attributes_person_id ON attributes(person_id);
CREATE INDEX idx_attributes_key ON attributes(key);
```

**Notes**:
- `evidence_id`: References snapshot or interaction (polymorphic, no FK constraint)
- `confidence`: Source reliability (manual = high, inferred = low/medium)
- Updatable (not append-only) to reflect changing attributes

---

### watchlists

System-defined lists for organizing people.

```sql
CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,            -- Friends | Known Streamers | Ones to Watch | Banned But Craved | Excluded
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed data
INSERT INTO watchlists (name, description) VALUES
  ('Friends', 'Trusted and friendly users'),
  ('Known Streamers', 'Models I recognize or have interacted with'),
  ('Ones to Watch', 'Interesting users to track'),
  ('Banned But Craved', 'Users I want to monitor despite restrictions'),
  ('Excluded', 'Users excluded from all stats and summaries');
```

**Notes**:
- System lists only (not user-creatable in v1)
- `Excluded` list for users like `smk_lover`

---

### watchlist_members

Many-to-many join table for watchlist membership.

```sql
CREATE TABLE watchlist_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(watchlist_id, person_id)
);

CREATE INDEX idx_watchlist_members_watchlist_id ON watchlist_members(watchlist_id);
CREATE INDEX idx_watchlist_members_person_id ON watchlist_members(person_id);
```

---

## Delta Computation Logic

Deltas are **computed, never stored**.

### Algorithm

1. Fetch consecutive snapshots for same `person_id` and `source`, ordered by `captured_at ASC`
2. For each metric in `normalized_metrics`:
   - If metric exists in **both** snapshots: compute delta (`new - old`)
   - If metric missing in either snapshot: delta = `null`
3. Return delta object with same keys as `normalized_metrics`

### Example

**Snapshot 1** (captured_at: 2025-01-01T00:00:00Z):
```json
{
  "all_time_tokens": 10000,
  "tips": 50
}
```

**Snapshot 2** (captured_at: 2025-01-02T00:00:00Z):
```json
{
  "all_time_tokens": 12000,
  "models_tipped_2weeks": 5
}
```

**Delta**:
```json
{
  "all_time_tokens": 2000,
  "tips": null,
  "models_tipped_2weeks": null
}
```

---

## Exclusion Logic

### Auto-Exclusion on Creation

When a `Person` is created with `username = 'smk_lover'`:
1. Set `is_excluded = true`
2. Optionally add to `Excluded` watchlist

### Filtering in Aggregates

All aggregate queries (stats summaries, watchlist counts, etc.) must filter by default:

```sql
WHERE is_excluded = false
```

To include excluded persons, explicitly opt-in:

```sql
WHERE is_excluded = false OR include_excluded = true
```

---

## Normalization Examples

### Statbate Member Info → normalized_metrics

**Raw Payload** (`/members/{site}/{name}/info`):
```json
{
  "data": {
    "name": "example_user",
    "did": 12345,
    "all_time_tokens": 10000,
    "first_tip_date": "2024-01-01T12:00:00Z",
    "last_tip_date": "2025-01-15T18:30:00Z",
    "models_tipped_2weeks": 3,
    "models_messaged_2weeks": 5
  }
}
```

**Normalized Metrics**:
```json
{
  "did": 12345,
  "all_time_tokens": 10000,
  "first_tip_date": "2024-01-01T12:00:00Z",
  "last_tip_date": "2025-01-15T18:30:00Z",
  "models_tipped_2weeks": 3,
  "models_messaged_2weeks": 5
}
```

### Chaturbate Stats API → normalized_metrics

**Raw Payload** (`/statsapi/?username=hudson_cage&token=...`):
```json
{
  "username": "hudson_cage",
  "token_balance": 1500,
  "num_followers": 250,
  "tips_in_last_hour": 10,
  "time_online": 120
}
```

**Normalized Metrics**:
```json
{
  "token_balance": 1500,
  "num_followers": 250,
  "tips_in_last_hour": 10,
  "time_online_minutes": 120
}
```

---

## Migration Plan

Migrations will be created incrementally in `server/src/db/migrations/`:

1. `001_create_persons.sql`
2. `002_create_person_aliases.sql`
3. `003_create_snapshots.sql`
4. `004_create_interactions.sql`
5. `005_create_stream_sessions.sql`
6. `006_create_attributes.sql`
7. `007_create_watchlists.sql`
8. `008_create_watchlist_members.sql`
9. `009_seed_watchlists.sql`

Each migration is idempotent and includes rollback logic.
