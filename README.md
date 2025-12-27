# MHC Control Panel

**Production-grade streaming intelligence and memory system for Chaturbate**

Owner: Hudson Cage
Builder: Claude (Autonomous)

---

## Overview

The MHC Control Panel is a persistent analysis and memory system for Chaturbate streaming intelligence. It tracks viewers, models, interactions, and historical snapshots to provide behavioral insights and relationship memory.

**This is a production system, not a demo.**

### For New Claude Code Sessions

If you're continuing work on this project with a new Claude Code account, start here:

1. **[AGENTS.md](AGENTS.md)** - Read first: AI agent instructions and architectural rules
2. **[CLAUDE_CODE_SETUP.md](CLAUDE_CODE_SETUP.md)** - Current project state and setup guide
3. **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development workflow and Docker usage

---

## Features

- **Person Management**: Track viewers and models with alias support
- **Snapshot History**: Append-only historical data from Statbate Premium API
- **Live Chat Capture**: Real-time event capture during streaming sessions
- **Behavioral Analysis**: Spending patterns, timing insights, tag preferences
- **Session Management**: Manual and auto-detected streaming session tracking
- **Watchlists**: Organize contacts into system-defined lists
- **Affiliate API Integration**: Real-time broadcaster session data (viewers, followers, tags, room subjects)
- **Profile Scraping**: Automated profile data collection for broadcasters
- **Configurable Jobs**: Background polling jobs with smart filters and scheduling
- **Profile Viewer**: Comprehensive profile pages merging all data sources with intelligent priority handling

### Recent Enhancements (December 2025)

- **Tailwind CSS Migration**: All 10 React pages migrated from custom CSS to Tailwind utility classes
- **Theme System**: 5 dark themes (Midnight, Charcoal, Ocean, Forest, Ember) with localStorage persistence
- **Grid/List View Toggle**: Users page supports both table and responsive image grid views
- **Profile Schema Optimization**: Updated to match Chaturbate Affiliate API structure
- **Profile Header Redesign**: Image on right, prominent LIVE indicator, HD icon, show start time in ET
- **Multi-Source Data Integration**: Intelligent prioritization of Affiliate API, scraped profiles, and Statbate data

See [docs/SESSION_SUMMARY_2025-12-27.md](docs/SESSION_SUMMARY_2025-12-27.md) for latest changes.

---

## Architecture

### Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL (Render.com or Docker)
- **Frontend**: React + TypeScript + Tailwind CSS + Nginx
- **Hosting**: Render.com (web + worker processes) or Docker (local)

### Process Model

- **RUN_MODE=web**: HTTP server for UI and API endpoints
- **RUN_MODE=worker**: Background process for Chaturbate Events API longpoll listener

### Deployment Options

1. **Local Development (Docker)**: See [DEVELOPMENT.md](DEVELOPMENT.md) - **Start here for daily development**
2. **Production (Render.com)**: See [DEPLOYMENT.md](DEPLOYMENT.md)
3. **Docker Registry (Refineo)**: See [DOCKER_MIGRATION_REFINEO.md](DOCKER_MIGRATION_REFINEO.md)

**Quick Start - Development Mode**:
```bash
# First time setup
cp .env.example .env
# Edit .env with your tokens

# Start development environment (with hot reload)
./scripts/dev.sh

# Open http://localhost:8080
# Backend changes auto-reload via tsx watch
# See DEVELOPMENT.md for full workflow
```

**Production-Like Build**:
```bash
# Build locally with no cache (ensures clean compile)
./scripts/deploy.sh --build

# Or pull from Refineo registry
./scripts/deploy.sh
```

**Building and Publishing to Refineo Registry**:
```bash
# Build and push all images
./scripts/build-and-push.sh v1.0.0

# See scripts/README.md for more details
```

---

## API Notes

### Chaturbate APIs

**Primary Truth**: Repository documentation files (`CHATURBATE_EVENTS_API.md`, `CHATURBATE_STATS_API.md`)

**Secondary Reference**: Official Chaturbate documentation at:
- https://chaturbate.com/apps/api/docs/ (Events API)
- https://chaturbate.com/statsapi/documentation/ (Stats API)
- https://chaturbate.com/apps/api/docs/objects.html (Event objects)

**Status**: Official docs are behind age gates and not accessible for automated retrieval. Repository docs are authoritative.

**Conflicts**: None identified. If conflicts arise between repo docs and official docs, they will be surfaced and resolved explicitly.

### Statbate Premium API

**Authoritative Source**: `statbate_openapi.json`

**Base URL**: `https://plus.statbate.com/api`

**Authentication**: `Authorization: Bearer <TOKEN>`

**Key Endpoints**:
- `/members/{site}/{name}/info` - Returns `did` (donor ID), tip history, activity
- `/members/{site}/info/batch` - Batch member lookup (up to N members)
- `/model/{site}/{name}/info` - Returns `rid` (room ID), rank, sessions, income
- `/model/{site}/{name}/activity` - Session timestamps and durations
- `/model/{site}/{name}/tips` - Tip history for a model
- `/members/{site}/{name}/tips` - Tip history for a member

**Confirmed Fields**:
- `did`: Donor/member ID (integer) - present in member info responses
- `rid`: Room/model ID (integer) - present in model info responses

### Statbate Plus Chat History

**Critical**: Chat history is **NOT** available via the Premium API (`statbate_openapi.json`)

**Implementation Strategy**:
1. Cookie-based session authentication (`statbate_plus_session`, `XSRF-TOKEN`)
2. Direct authenticated JSON/XHR calls to Laravel+Inertia endpoints
3. Playwright only to bootstrap session cookies if needed
4. **Never** scrape HTML or parse DOM

**Persistence**: Raw payload + normalized messages stored in `interactions` table

### Chaturbate Events API

**Endpoint**: `https://eventsapi.chaturbate.com/events/{username}/{token}/?timeout=30`

**Authentication**: Token from `https://chaturbate.com/statsapi/authtoken/` with `Events API` scope

**Implementation**: Longpoll pattern with `nextUrl` continuation

**Constraints**:
- Real-time only, **NO** historical replay
- Only used for `hudson_cage` room
- Rate limit: 2000 requests per minute
- Events: `chatMessage`, `privateMessage`, `tip`, `follow`, `unfollow`, `broadcastStart`, `broadcastStop`, `userEnter`, `userLeave`, `fanclubJoin`, `mediaPurchase`, `roomSubjectChange`

**Reference**: See [EVENTS_API_DOCS.md](EVENTS_API_DOCS.md) for full documentation

### Chaturbate Stats API

**Base URL**: `https://chaturbate.com/statsapi/?username={username}&token={token}`

**Refresh**: Every 5 minutes

**Fields**: `token_balance`, `tips_in_last_hour`, `num_followers`, `num_viewers`, `num_registered_viewers`, `last_broadcast`, `time_online`, `votes_up`, `votes_down`, `satisfaction_score`

### Chaturbate Affiliate API

**Base URL**: `https://chaturbate.com/api/public/affiliates/onlinerooms/`

**Authentication**: None required (public API)

**Rate Limit**: 1 request per 2 seconds per broadcaster

**Fields**: `username`, `display_name`, `age`, `gender`, `location`, `num_users` (viewers), `num_followers`, `room_subject`, `tags`, `image_url`, `is_hd`, `is_new`, `current_show`, `seconds_online`

**Implementation**: Configurable polling job with smart filters (follows, tags, viewer thresholds)

---

## Resolved Design Decisions

### 1. Alias Tracking
**Decision**: Implemented via `person_aliases` table. Lookups match against both `persons.username` and `person_aliases.alias`.

### 2. `smk_lover` Exclusion
**Decision**: Auto-set `is_excluded=true` on Person creation when `username='smk_lover'`. Excluded persons filtered from all aggregates by default.

### 3. Delta Computation
**Decision**: Deltas computed only for metrics present in **both** consecutive snapshots. Missing fields yield `null` deltas.

### 4. Statbate Plus Chat Import
**Decision**: API/XHR payload-based only. Cookie/XSRF session client first. Playwright only for cookie bootstrap. Raw payload + normalized messages persist to `interactions`.

### 5. Deployment Model
**Decision**: Render.com with `RUN_MODE` environment variable:
- `RUN_MODE=web`: Express server for HTTP API
- `RUN_MODE=worker`: Background Events API longpoll listener

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Statbate Premium API
STATBATE_API_TOKEN=your_bearer_token

# Statbate Plus (Chat History)
STATBATE_PLUS_SESSION_COOKIE=statbate_plus_session_value
STATBATE_PLUS_XSRF_TOKEN=xsrf_token_value

# Chaturbate Events API
CHATURBATE_EVENTS_TOKEN=your_events_api_token

# Chaturbate Stats API
CHATURBATE_STATS_TOKEN=your_stats_api_token
CHATURBATE_USERNAME=hudson_cage

# Runtime
RUN_MODE=web # or worker
NODE_ENV=production
PORT=3000
```

---

## Database Schema

See [SCHEMA.md](SCHEMA.md) for detailed schema documentation.

### Core Tables

- **persons**: Users (models or viewers) with username, role, platform IDs
- **person_aliases**: Historical usernames for tracking username changes
- **snapshots**: Append-only point-in-time captures from APIs
- **interactions**: Chat, tips, PMs, notes, pastes (append-only)
- **stream_sessions**: Streaming sessions for `hudson_cage`
- **attributes**: Structured tags/memory (location, notes, preferences)
- **watchlists**: System-defined lists (Friends, Known Streamers, etc.)
- **watchlist_members**: Many-to-many join table
- **broadcast_sessions**: Per-session data from Affiliate API (viewers, followers, room subjects)
- **profiles**: Scraped profile data for broadcasters (bio, photos, languages, etc.)
- **jobs**: Configurable background jobs with scheduling and filtering

---

## Development

**Documentation:**
- [DEVELOPMENT.md](DEVELOPMENT.md) - Complete workflow and explanations
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Common commands and troubleshooting

### Quick Start

```bash
# First time setup
cp .env.example .env
# Edit .env with your API tokens

# Start development environment (hot reload enabled)
./scripts/dev.sh

# Services available at:
# - Frontend: http://localhost:8080
# - API: http://localhost:3000
# - Database: localhost:5432
```

### Making Changes

**Backend (server/src/):**
- Edit any TypeScript file
- Save and it auto-reloads via `tsx watch`
- No rebuild needed!

**Frontend (client/src/):**
- Run `cd client && npm start` in separate terminal
- React dev server runs on http://localhost:3001
- Hot reload for instant feedback

### Useful Commands

```bash
# View logs
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f web

# Stop services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

# Production-like build
./scripts/deploy.sh --build
```

---

## Testing Requirements

- Unit tests for data normalization (`server/tests/unit/`)
- Integration tests for Statbate API fetch and snapshot persistence (`server/tests/integration/`)
- Chat import authentication and idempotency tests

---

## Deployment (Render.com)

### Services

1. **PostgreSQL Database**
   - Type: PostgreSQL
   - Plan: Starter or higher

2. **Web Service**
   - Type: Web Service
   - Environment: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment Variables: Set `RUN_MODE=web` + all API tokens

3. **Background Worker**
   - Type: Background Worker
   - Environment: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run worker`
   - Environment Variables: Set `RUN_MODE=worker` + all API tokens

---

## Definition of Done

The system is complete when:

- ✅ Data persists across restarts
- ✅ Snapshots show historical deltas
- ✅ Full chat history is captured for sessions
- ✅ Failures are visible and logged
- ✅ Tests pass locally and in CI

---

## License

Proprietary - Hudson Cage
