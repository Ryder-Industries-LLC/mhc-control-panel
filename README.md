# MHC Control Panel

**Production-grade streaming intelligence and memory system for Chaturbate**

Owner: Hudson Cage
Builder: Claude (Autonomous)

> **Note:** README.md is informational only and not authoritative. See [CLAUDE.md](CLAUDE.md) for Claude workflow rules and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system architecture.

---

## Overview

The MHC Control Panel is a persistent analysis and memory system for Chaturbate streaming intelligence. It tracks viewers, models, interactions, and historical snapshots to provide behavioral insights and relationship memory.

**This is a production system, not a demo.**

---

## Features

- **Person Management**: Track viewers and models with alias support
- **Snapshot History**: Append-only historical data from Statbate Premium API
- **Live Chat Capture**: Real-time event capture during streaming sessions
- **Behavioral Analysis**: Spending patterns, timing insights, tag preferences
- **Session Management**: Manual and auto-detected streaming session tracking
- **Watchlists**: Organize contacts into system-defined lists
- **Affiliate API Integration**: Real-time broadcaster session data
- **Profile Scraping**: Automated profile data collection for broadcasters
- **Configurable Jobs**: Background polling jobs with smart filters and scheduling

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

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Quick Start

```bash
# First time setup
cp .env.example .env
# Edit .env with your tokens

# Start development environment
./scripts/dev.sh

# Open http://localhost:8080
```

For full development workflow, see [docs/setup/DEVELOPMENT.md](docs/setup/DEVELOPMENT.md).

---

## Environment Variables

Key environment variables (see `.env.example` for full list):

- `DATABASE_URL` - PostgreSQL connection string
- `CHATURBATE_USERNAME` - Your CB username
- `STATBATE_API_TOKEN` - Statbate API authentication
- `CB_AUTH_TOKEN` - Chaturbate Events API token
- `RUN_MODE` - `web` or `worker`

---

## Documentation Index

### Authoritative Documents

| Document | Purpose |
| -------- | ------- |
| [CLAUDE.md](CLAUDE.md) | Claude workflow rules, session lifecycle, modes |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture (authoritative) |
| [docs/MODES.md](docs/MODES.md) | Behavioral modes and their meanings |
| [docs/SESSION_SUMMARY.md](docs/SESSION_SUMMARY.md) | Latest session work summary |
| [docs/TODO.md](docs/TODO.md) | Outstanding tasks and backlog |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architectural decisions |

### Reference Documentation

| Directory | Contents |
| --------- | -------- |
| [docs/reference/](docs/reference/) | CHANGELOG, SCHEMA, TESTING_GUIDE, UI_PATTERNS, DATA_SOURCE_STRATEGY |
| [docs/features/](docs/features/) | Feature designs (AI Insights, Profile Scraping, Settings, etc.) |
| [docs/setup/](docs/setup/) | Development, Deployment, Docker setup guides |
| [docs/notes/](docs/notes/) | Working notes, fixes needed, issue tracker |
| [docs/sessions/](docs/sessions/) | Historical session summaries |
| [docs/api/](docs/api/) | API documentation (Chaturbate, Statbate) |

---

## API Documentation

API contracts and integration details are documented in:

- [docs/api/CHATURBATE_EVENTS_API.md](docs/api/CHATURBATE_EVENTS_API.md) - Events API
- [docs/api/CHATURBATE_AFFILIATE_API.md](docs/api/CHATURBATE_AFFILIATE_API.md) - Affiliate API
- [docs/api/STATBATE_API_SPEC.md](docs/api/STATBATE_API_SPEC.md) - Statbate Premium API

---

## Database Schema

See [docs/reference/SCHEMA.md](docs/reference/SCHEMA.md) for detailed schema documentation.

---

## Deployment

- **Local Development**: [docs/setup/DEVELOPMENT.md](docs/setup/DEVELOPMENT.md)
- **Production (Render.com)**: [docs/setup/DEPLOYMENT.md](docs/setup/DEPLOYMENT.md)
- **Docker Registry (Refineo)**: [docs/setup/DOCKER_MIGRATION_REFINEO.md](docs/setup/DOCKER_MIGRATION_REFINEO.md)

---

## Testing

See [docs/reference/TESTING_GUIDE.md](docs/reference/TESTING_GUIDE.md) for testing requirements and guidelines.

---

## License

Proprietary - Hudson Cage
