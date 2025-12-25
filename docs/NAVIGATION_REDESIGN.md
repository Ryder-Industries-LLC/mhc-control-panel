# Navigation & UX Redesign

## Current Structure Issues
1. **Lookup** and **Users** serve similar purposes - confusing
2. **Jobs** page is too narrow in scope
3. Missing system monitoring/stats
4. Followers/Following should be integrated with user management
5. No clear distinction between "performers/models" vs future "system users"

## Proposed New Structure

### Top Navigation

```
┌─────────────────────────────────────────────────────────────┐
│ MHC Control Panel                                            │
├─────────────────────────────────────────────────────────────┤
│ Models | Profile | Hudson | Events | Admin                   │
└─────────────────────────────────────────────────────────────┘
```

### 1. **Models** (replaces "Lookup" + "Users")
Main page with three tabs:

#### Tab: Directory
- Current Users table functionality
- Search box (username search)
- Tag filter with presets
- Role filter
- **NEW: Lookup Integration**
  - If username not in database → Show "Add User" button
  - Button opens modal with options:
    - "Quick Add" - Add to P2 queue for next affiliate poll
    - "Priority Add" - Add to P1 queue for immediate lookup
  - If username exists → Show "Refresh" button
    - Queues user for next update cycle
- Table columns: Username | Image | Role | Tags | Priority | Followers | Rank | Events | Snapshots | Last Seen | Actions
- **NEW: Profile Scrape Action**
  - Per-user action button: "Scrape Profile"
  - Opens Chaturbate profile, extracts data
  - Manual/on-demand operation

#### Tab: Following (currently separate page)
- List of models you're following
- **Scraping Button**: "Update Following List"
  - Automated browser scraping of:
    - https://chaturbate.com/followed-cams (online)
    - https://chaturbate.com/followed-cams/offline/ (offline)
  - Runs in your authenticated Chrome session
  - Shows progress and stats (new follows, unfollows)
- Same table structure as Directory
- Filter/sort capabilities

#### Tab: Followers (currently separate page)
- List of users following you
- **Scraping Button**: "Update Followers List"
  - Automated browser scraping of:
    - https://chaturbate.com/accounts/followers/
  - Shows progress and stats (new followers, unfollowers)
- Same table structure
- Useful for identifying tippers, regulars, etc.

### 2. **Profile** (unchanged)
- Current profile lookup functionality
- Can view any model's profile by username

### 3. **Hudson** (unchanged)
- Personal broadcast dashboard
- Current session, stats, etc.

### 4. **Events** (unchanged)
- Event feed from Hudson's room

### 5. **Admin** (replaces "Jobs")
Multi-tab administration interface:

#### Tab: System Stats
**Disk Usage**
- Total disk usage: XXX GB
- Database size: XXX GB
- Images stored: XXX GB (XXX files)
- Breakdown by table

**User Statistics**
- Total persons in database: XXX
- By source:
  - Affiliate API: XXX
  - CBHours tracked: XXX
  - Events API: XXX
  - Following: XXX
  - Followers: XXX
  - Profile scraped: XXX
  - Manual: XXX
- By role:
  - Models: XXX
  - Viewers: XXX
  - Both: XXX
  - Unknown: XXX

**Queue Statistics**
- Priority 1 queue: XXX pending
- Priority 2 queue: XXX pending
- Refresh queue: XXX pending
- Failed lookups (24h): XXX

**Data Freshness**
- Affiliate API:
  - Last poll: X minutes ago
  - Models tracked: XXX
  - Online now: XXX
- CBHours API:
  - Last poll: X minutes ago
  - Models with trophy: XXX
  - Currently online: XXX
- Profile scrapes today: XXX

**API Health**
- Affiliate API: ✓ Healthy (XXXms avg)
- CBHours API: ✓ Healthy (XXXms avg)
- StatBate API: ✓ Healthy (XXXms avg)

#### Tab: Jobs Management
- Current jobs interface
- Start/stop/pause affiliate polling
- Configure poll intervals
- View job logs

#### Tab: Data Sources
**Priority Configuration**
- Define source precedence rules
- Override default priorities per field
- View current effective priorities

**Source Status**
- Affiliate API: Enabled ✓
- CBHours API: Enabled ✓
- Profile Scraping: Manual
- Events API: Running ✓
- StatBate: On-demand
- Browser Scraping: Manual

#### Tab: AI Insights Setup (NEW)
**User Questionnaire Form**
Collects inputs for AI-powered analysis:
- Broadcasting schedule (days/times)
- Goals (followers, income, engagement)
- Target audience demographics
- Content style/themes
- Current challenges
- Specific metrics to track
- Competitor models to compare against

Used to generate personalized insights and recommendations.

## Data Source Hierarchy

### 6 Data Sources (in order of implementation)
1. **Chaturbate Affiliate API** - Real-time online models
2. **CBHours API** - Historical tracking, rank data
3. **Chaturbate Events API** - Hudson's room only
4. **Chaturbate Stats API** - Hudson's stats
5. **StatBate API** - Tips and member analysis
6. **Chaturbate Profile Scraping** - On-demand profile data (NEW)

### Source Precedence Rules

For each field, use the first non-null source in this order:

**Profile Identity** (username, display_name, age, gender, location, birthday):
1. Profile Scraping (most comprehensive, but manual)
2. Affiliate API (current, when online)
3. CBHours API (frequently updated)
4. Cached profiles

**Live Status** (current_show, room_subject, viewers):
1. Affiliate API (real-time, within 10 min)
2. CBHours API (1 min delay)
3. Historical snapshots

**Follower Count**:
1. CBHours API (tracked over time, most accurate)
2. Profile Scraping (snapshot from profile page)
3. Affiliate API (current when online)
4. Historical snapshots

**Tags**:
1. Affiliate API (current from stream)
2. CBHours API (recent)
3. Profile Scraping (from profile)
4. Historical

**Rank/Popularity**:
1. CBHours API (only source with rank/grank)
2. Derived from followers/viewers (Affiliate)

**Bio/Description**:
1. Profile Scraping (only source)

**Social Media Links**:
1. Profile Scraping (only source)

**Wishlist/Amazon**:
1. Profile Scraping (only source)

### Implementation
Store all sources separately, aggregate via view with COALESCE priority chain.

## Profile Scraping Details

### What to Extract from Chaturbate Profile
When user clicks "Scrape Profile" on a model:

1. Open `https://chaturbate.com/{username}/`
2. Extract:
   - Display name
   - Age, gender, location
   - Bio/description
   - Interested in (tags/preferences)
   - Social media links (Twitter, Instagram, etc.)
   - Wishlist/Amazon wishlist link
   - Follower count (if visible)
   - Profile image
   - Any special badges (HD, new, etc.)
3. Store in new `profile_scrapes` table with timestamp
4. Mark person as `profile_scraped = TRUE` in profiles table

### Database Schema
```sql
CREATE TABLE profile_scrapes (
  id SERIAL PRIMARY KEY,
  person_id UUID REFERENCES persons(id),
  scraped_at TIMESTAMP NOT NULL,

  display_name TEXT,
  age INTEGER,
  gender TEXT,
  location TEXT,
  bio TEXT,
  interested_in TEXT[],
  social_links JSONB,
  wishlist_url TEXT,
  follower_count INTEGER,
  profile_image_url TEXT,
  badges TEXT[],

  raw_html TEXT, -- for debugging
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(person_id, scraped_at)
);
```

## Migration Path

1. Complete multi-source architecture (in progress)
2. Update navigation structure
3. Combine Lookup into Models/Directory
4. Add browser automation for Followers/Following
5. Implement profile scraping
6. Create Admin page with tabs
7. Build System Stats dashboard
8. Create AI Insights questionnaire

## Benefits

- **Clearer UX**: One place for all model management
- **Integrated Workflows**: Lookup → Queue → Refresh all in same interface
- **Better Monitoring**: Comprehensive system stats
- **Richer Data**: Profile scraping adds bio, social links, wishlist
- **Scalable**: Easy to add system users later without confusion
- **Comprehensive**: All 6 data sources with clear precedence
