# CLAUDE.md - Project Context for Claude Code

**Project:** MHC Control Panel
**Version:** 1.33.0
**Last Updated:** 2026-01-10
**Local Path:** `/Volumes/Imago/Development/MHC/mhc-control-panel`

---

## Quick Start for Claude Code Sessions

This file provides context for Claude Code sessions working on this project.

### Project Overview

MHC Control Panel is a **production-grade Node.js web application** that serves as a persistent analysis and memory system for Chaturbate streaming intelligence. It captures, stores, and analyzes broadcaster events, viewer interactions, and profile data.

### Tech Stack

- **Backend:** Node.js 18+ with TypeScript, Express
- **Frontend:** React with TypeScript, TailwindCSS
- **Database:** PostgreSQL
- **Deployment:** Docker Compose (local), Render.com (production)
- **External APIs:** Chaturbate Events API, Chaturbate Affiliate API, Statbate API, CBHours API

### Key Directories

```
mhc-control-panel/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── pages/          # Page components (Profile, Admin, etc.)
│       └── types/          # TypeScript type definitions
├── server/                 # Express backend
│   └── src/
│       ├── api/            # External API clients
│       ├── db/             # Database migrations and client
│       ├── jobs/           # Background job implementations
│       ├── routes/         # API route handlers
│       └── services/       # Business logic services
├── docs/                   # Documentation
└── docker-compose.yml      # Container orchestration
```

### Background Jobs

The system has several background jobs managed through the Admin UI:

| Job Name | Purpose | Key File |
|----------|---------|----------|
| Profile Capture | Scrapes CB profiles for detailed data | `profile-scrape.job.ts` |
| Affiliate Polling | Polls CB Affiliate API for online broadcasters | `affiliate-polling.job.ts` |
| CBHours Polling | Polls CBHours API for rank/stats | `cbhours-polling.job.ts` |
| Statbate API | Refreshes Statbate data for tracked models | `statbate-refresh.job.ts` |

**Job States:**
- `Stopped` - Job is not running
- `Starting` - Job just started, waiting for first cycle
- `Processing` - Job is actively processing
- `Waiting` - Job is between cycles (after first run completed)

### Common Development Tasks

```bash
# Start development environment
docker-compose up -d

# View logs
docker-compose logs -f [service]

# Rebuild after code changes
docker-compose up -d --build

# Run database migrations
docker-compose exec web npm run migrate

# Access database
docker-compose exec db psql -U mhc_user -d mhc_control_panel
```

### Important Files to Read

1. **[docs/AGENTS.md](docs/AGENTS.md)** - Architectural rules and API constraints
2. **[docs/CHANGELOG.md](docs/CHANGELOG.md)** - Version history and changes
3. **[docs/TODO.md](docs/TODO.md)** - Outstanding tasks and backlog
4. **[docs/SESSION_SUMMARY.md](docs/SESSION_SUMMARY.md)** - Latest session work summary

### API Clients

| API | Client File | Purpose |
|-----|-------------|---------|
| Chaturbate Events | `api/chaturbate/events-client.ts` | Real-time room events |
| Chaturbate Affiliate | `api/chaturbate/affiliate-client.ts` | Broadcaster data |
| Statbate | `api/statbate/client.ts` | Member/model stats |
| CBHours | `services/cbhours-stats.service.ts` | Rank and viewer stats |

### Environment Variables

Key environment variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `CHATURBATE_USERNAME` - Your CB username
- `STATBATE_API_TOKEN` - Statbate API authentication
- `CB_AUTH_TOKEN` - Chaturbate Events API token
- `RUN_MODE` - `web` or `worker`

### Code Style

- TypeScript strict mode
- ESLint with Prettier
- No inline CSS (use TailwindCSS)
- Async/await over callbacks
- Explicit error handling (no silent failures)

### Testing

```bash
# Run server tests
cd server && npm test

# Run client tests
cd client && npm test
```

---

## Recent Changes (v1.28.0)

### Major UI/UX Overhaul

- **Navigation Restructure**: Two-row layout with logo spanning both rows
  - Row 1: Directory, Inbox, Stats, Broadcasts, Follow History, Event Log, Admin
  - Row 2: Global search and contextual actions
- **Renamed Pages**: Dashboard → Stats, Sessions → Broadcasts, People → Directory
- **New Event Log Page** (`/event-log`): View Chaturbate Events API data with filters
- **Inter Font**: Site-wide typography update

### Profile Improvements

- New boolean attribute checkboxes: Smoke on Cam, Leather/Fetish, Profile Smoke, Had Interaction
- Profile attributes stored as boolean columns (migration 065)

### Admin Reorganization

- Data Sources and Chaturbate Sync moved to Settings tab
- Follower Trends moved to Follow History page

### Inbox Fix

- Fixed chat bubble alignment using `env.CHATURBATE_USERNAME` for `is_from_broadcaster`

### People/Directory Page

- Added CB and UN Cams external links in list and grid views

### Files Modified

- `client/src/App.tsx` - Two-row navigation, route changes
- `client/src/pages/EventLog.tsx` - New page
- `client/src/pages/Admin.tsx` - Reorganized sections
- `client/src/pages/Sessions.tsx` - AI Summary button
- `client/src/pages/BroadcasterDashboard.tsx` - Account Stats collapsible
- `client/src/pages/FollowHistory.tsx` - 24h filter, Follower Trends section
- `server/src/routes/inbox.ts` - Fixed is_from_broadcaster logic
- `server/src/services/profile.service.ts` - New attribute methods
