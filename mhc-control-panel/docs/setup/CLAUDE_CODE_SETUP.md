# Claude Code Setup Guide

**For setting up a new Claude Code account to continue work on the MHC Control Panel**

---

## Quick Start

When starting a new Claude Code session on this project, read these files in order:

1. **[README.md](README.md)** - Project overview and architecture
2. **[AGENTS.md](AGENTS.md)** - AI agent instructions and architectural rules
3. **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development workflow
4. **This file** - Current state and recent changes

---

## Current Project State

### Completed Features

#### Core Infrastructure
- ✅ PostgreSQL database with comprehensive schema
- ✅ Node.js + TypeScript backend with Express
- ✅ React + TypeScript frontend
- ✅ Docker Compose for local development
- ✅ Render.com deployment configuration
- ✅ Multi-process architecture (web + worker)

#### Data Collection & APIs
- ✅ Chaturbate Events API integration (longpoll listener)
- ✅ Chaturbate Stats API integration
- ✅ Chaturbate Affiliate API integration
- ✅ Statbate Premium API integration
- ✅ Profile scraping service (Puppeteer-based)
- ✅ Configurable background jobs system
- ✅ Real-time broadcast session tracking

#### Database Schema
- ✅ Persons table with alias support
- ✅ Snapshots table (append-only history)
- ✅ Interactions table (chat, tips, notes, pastes)
- ✅ Stream sessions table
- ✅ Broadcast sessions table (Affiliate API data)
- ✅ Profiles table (scraped profile data)
- ✅ Jobs table (configurable polling jobs)
- ✅ Watchlists and watchlist_members tables
- ✅ Attributes table (structured memory/tags)

#### User Interface
- ✅ Lookup page with username search and paste analysis
- ✅ Profile viewer page with comprehensive data display
- ✅ Jobs configuration page
- ✅ My Details page (hudson_cage stats)
- ✅ Dark theme with purple/blue gradient design
- ✅ Responsive layout with mobile support

#### Recent Enhancements (December 2025)
- ✅ Profile schema updated to match Affiliate API
- ✅ Profile header redesigned with image on right
- ✅ LIVE indicator above image with prominent styling
- ✅ HD displayed as icon (🎥) next to MODEL badge
- ✅ Show start time calculation in ET timezone
- ✅ Room subject displayed as dedicated line
- ✅ Multiple data source integration (Affiliate API, scraped profiles, Statbate)

### Recent Schema Changes

**Profiles Table (Migration 012)**:
- Removed: `sexual_orientation`, `hair_color`, `eye_color`, `weight`
- Renamed: `languages` → `spoken_languages` (changed from TEXT[] to TEXT)
- Added: `country`, `is_new`, `location_detail`, `birthday_public`, `smoke_drink`, `body_decorations`, `data_source`, `last_seen_online`

See [PROFILE_SCHEMA_UPDATE.md](PROFILE_SCHEMA_UPDATE.md) for full details.

---

## Key Files to Know

### Documentation
- `README.md` - Project overview
- `AGENTS.md` - AI agent instructions (READ THIS FIRST)
- `DEVELOPMENT.md` - Development workflow and Docker usage
- `DEPLOYMENT.md` - Render.com deployment guide
- `SCHEMA.md` - Database schema reference
- `PROFILE_SCHEMA_UPDATE.md` - Recent profile schema changes
- `DOCKER_MIGRATION_REFINEO.md` - Docker registry migration guide
- `PROFILE_SCRAPING.md` - Profile scraping documentation

### API Documentation
- `CHATURBATE_EVENTS_API.md` - Events API spec
- `CHATURBATE_STATS_API.md` - Stats API spec
- `statbate_openapi.json` - Statbate Premium API OpenAPI spec
- `STATBATE_API_SPEC.md` - Statbate API overview
- `STATBATE_WEBHOOK_SPEC.md` - Webhook integration spec

### Code Structure
```
mhc-control-panel/
├── server/               # Backend (Node.js + TypeScript)
│   ├── src/
│   │   ├── api/         # API route handlers
│   │   ├── services/    # Business logic
│   │   ├── db/          # Database client and migrations
│   │   ├── routes/      # Express routes
│   │   ├── workers/     # Background workers
│   │   └── app.ts       # Main application entry
│   └── tests/           # Tests (unit + integration)
│
├── client/              # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── pages/       # Page components
│   │   ├── components/  # Reusable components
│   │   ├── api/         # API client
│   │   └── utils/       # Utilities
│   └── public/          # Static assets
│
├── scripts/             # Build and deployment scripts
│   ├── dev.sh          # Start development environment
│   ├── deploy.sh       # Production-like build
│   └── build-and-push.sh # Docker registry push
│
└── docker-compose.yml   # Docker orchestration
```

### Critical Service Files

**Backend Services:**
- `server/src/services/profile.service.ts` - Profile data management
- `server/src/services/profile-scraper.service.ts` - Profile scraping
- `server/src/api/chaturbate/affiliate-client.ts` - Affiliate API client
- `server/src/services/jobs.service.ts` - Background jobs
- `server/src/workers/events-worker.ts` - Events API listener

**Frontend Pages:**
- `client/src/pages/Profile.tsx` - Profile viewer
- `client/src/pages/Lookup.tsx` - Username lookup and analysis
- `client/src/pages/Jobs.tsx` - Job configuration
- `client/src/pages/MyDetails.tsx` - Hudson Cage stats

**Database Migrations:**
- `server/src/db/migrations/` - All schema changes
- `server/src/db/migrations/012_update_profiles_schema.sql` - Latest profile schema update

---

## Custom Instructions for Claude Code

When working on this project:

### 1. Always Check Documentation First
- Read `AGENTS.md` for architectural rules
- Check API documentation files before implementing API features
- Review `DEVELOPMENT.md` for workflow guidance

### 2. Follow Architectural Principles
- **Append-only history**: Never overwrite snapshots or interactions
- **Explicit failure handling**: Log all API failures, surface errors in UI
- **Persistence is mandatory**: All data must be stored in PostgreSQL
- **Production-grade**: This is not a demo, build for real use

### 3. Data Source Priority
When displaying profile data, prioritize sources in this order:
1. **Affiliate API** (`latestSession`) - Most current, real-time data when broadcasting
2. **Scraped Profile Data** (`profile`) - Detailed profile information
3. **Statbate API** (`latestSnapshot`) - Historical metrics and stats

### 4. Code Style
- TypeScript for all backend and frontend code
- Use async/await, not callbacks or `.then()`
- Comprehensive error handling with try/catch
- Log all significant operations using the logger
- Write tests for new features

### 5. Database Changes
- Always create a migration file for schema changes
- Test migrations locally first
- Update TypeScript interfaces to match schema
- Document schema changes in commit messages

### 6. UI Guidelines
- Dark theme with purple/blue gradients
- Mobile-responsive design
- Clear error states
- Loading indicators for async operations
- Accessible contrast ratios

### 7. Environment-Specific Behavior
- Development: Use `./scripts/dev.sh` for hot reload
- Production builds: Use `./scripts/deploy.sh`
- Database: PostgreSQL (Docker local, Render.com production)

### 8. Testing Requirements
- Unit tests for data normalization
- Integration tests for API clients
- Test idempotency for imports
- Verify error handling

---

## Common Development Tasks

### Starting Development Environment
```bash
# First time setup
cp .env.example .env
# Edit .env with your API tokens

# Start all services with hot reload
./scripts/dev.sh

# Frontend: http://localhost:8080
# Backend API: http://localhost:3000
# Database: localhost:5432
```

### Running Database Migrations
```bash
# Connect to database
docker-compose exec db psql -U mhc_user -d mhc_db

# Run migration files manually
\i /docker-entrypoint-initdb.d/001_initial_schema.sql
\i /docker-entrypoint-initdb.d/012_update_profiles_schema.sql
```

### Viewing Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f web
docker-compose logs -f worker
```

### Frontend Development
```bash
# React dev server with hot reload
cd client
npm start
# Opens on http://localhost:3001
```

### Backend Development
```bash
# Backend auto-reloads via tsx watch
# Just edit files in server/src/ and save
```

### Production-Like Build
```bash
# Build and start production-like environment
./scripts/deploy.sh --build
```

---

## Environment Variables

Required environment variables (see `.env.example`):

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

## Known Issues and Considerations

### Profile Scraping
- Scraping is supplementary to Affiliate API
- Use Puppeteer for JavaScript-rendered pages
- Rate limit: 2 second delay between requests
- Store `data_source` field to track origin

### Affiliate API
- Rate limit: 1 request per 2 seconds per broadcaster
- Public API, no authentication required
- Use for real-time session data (viewers, followers, room subject)

### Events API
- Real-time only, no historical replay
- Only used for `hudson_cage` room
- Longpoll pattern with 30s timeout
- Must handle reconnection on failure

### Timezone Handling
- Display times in ET (America/New_York)
- Use `toLocaleString('en-US', { timeZone: 'America/New_York' })`
- Store timestamps in UTC in database

---

## Recent Work Summary

### Profile Schema Update (December 2025)
- Aligned profile schema with Chaturbate Affiliate API data structure
- Removed fields not provided by the API
- Changed `languages` to `spoken_languages` (array → string)
- Added new fields: `country`, `is_new`, `location_detail`, etc.
- Migration completed successfully

### Profile Header Redesign (December 2025)
- Moved profile image to right side of header
- Added prominent LIVE indicator above image with pulsing animation
- Changed HD from text badge to icon (🎥)
- Implemented show start time calculation in ET timezone
- Added room subject as dedicated line with italic styling
- Improved badge alignment and spacing

---

## Next Steps / Potential Enhancements

### Potential Features
- Member tips history analysis
- AI insights data aggregation (foundation exists)
- Date range filtering enhancements
- Comparison views for metrics
- Export functionality for reports

### Optimization Opportunities
- Implement caching for frequently accessed profiles
- Add pagination for large data sets
- Optimize database queries with indexes
- Add request debouncing for search inputs

### Monitoring & Observability
- Health check endpoints
- Performance metrics
- Error tracking integration
- Database query performance monitoring

---

## Getting Help

### Documentation Hierarchy
1. **Project docs** (this repo) - Primary source of truth
2. **API docs** (Chaturbate, Statbate) - For API-specific questions
3. **Technology docs** (React, PostgreSQL, etc.) - For general tech questions

### Troubleshooting
- Check `DEVELOPMENT.md` for common issues
- Review Docker logs: `docker-compose logs -f`
- Verify environment variables are set correctly
- Ensure database migrations have run
- Check network connectivity for API calls

---

## Claude Code Best Practices for This Project

### When Starting Work
1. Read `AGENTS.md` to understand architectural constraints
2. Review recent git commits to see what changed
3. Check `CLAUDE_CODE_SETUP.md` (this file) for current state
4. Start development environment: `./scripts/dev.sh`

### When Making Changes
1. Update relevant documentation files
2. Create database migrations if schema changes
3. Update TypeScript interfaces to match schema
4. Test changes locally before committing
5. Write tests for new features

### When Encountering Issues
1. Check logs first: `docker-compose logs -f`
2. Verify environment variables
3. Review API documentation for limitations
4. Test in isolation before integrating

### When Completing Work
1. Update this file with current state
2. Document any new features or changes
3. Update schema documentation if applicable
4. Ensure tests pass
5. Commit with clear, descriptive messages

---

## Project Philosophy

This is a **production-grade control system**, not a demo or prototype. Every feature must:

- Persist data reliably
- Handle errors explicitly
- Surface failures clearly
- Work end-to-end
- Be maintainable

Quality over speed. Correctness over convenience.

---

**Last Updated**: December 23, 2025
**Current Version**: v1.0 with profile enhancements
**Maintainer**: Hudson Cage (via Claude Code)
