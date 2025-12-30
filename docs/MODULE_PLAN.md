# Module Implementation Plan

This document outlines the incremental implementation plan for the MHC Control Panel.

---

## Phase 1: Foundation & Database

### 1.1 Project Scaffolding
- [ ] Initialize Node.js monorepo structure
- [ ] Configure TypeScript for server and client
- [ ] Set up package.json scripts (dev, build, test, migrate, worker)
- [ ] Create .env.example with all required variables
- [ ] Configure ESLint and Prettier

### 1.2 Database Setup
- [ ] Create migration runner utility
- [ ] Implement migrations 001-009 (see SCHEMA.md)
- [ ] Create database client module with connection pooling
- [ ] Write migration tests

### 1.3 Configuration & Validation
- [ ] Environment variable validation on startup
- [ ] Runtime mode detection (RUN_MODE=web|worker)
- [ ] Logger setup (structured logging with levels)

**Deliverable**: Database schema created, migrations run successfully, env validation working

---

## Phase 2: Core Data Layer

### 2.1 Person Service
- [ ] `PersonService.findOrCreate(username, platform, role)` - with alias lookup
- [ ] `PersonService.findById(id)`
- [ ] `PersonService.findByUsername(username, platform)` - checks aliases
- [ ] Auto-exclusion logic for `smk_lover`
- [ ] Unit tests for alias matching and exclusion

### 2.2 Snapshot Service
- [ ] `SnapshotService.create(personId, source, rawPayload, normalizedMetrics)`
- [ ] `SnapshotService.getLatest(personId, source)`
- [ ] `SnapshotService.computeDeltas(personId, source, limit=2)` - delta logic
- [ ] Normalization helpers for Statbate and CB Stats payloads
- [ ] Unit tests for delta computation (missing fields → null)

### 2.3 Interaction Service
- [ ] `InteractionService.create(personId, type, content, timestamp, source, metadata, sessionId?)`
- [ ] `InteractionService.getByPerson(personId, filters)`
- [ ] `InteractionService.getBySession(sessionId)`
- [ ] Unit tests for append-only behavior

### 2.4 Session Service
- [ ] `SessionService.start(broadcaster)` - create LIVE session
- [ ] `SessionService.end(sessionId)` - set ended_at, status=ENDED
- [ ] `SessionService.getCurrentSession(broadcaster)`
- [ ] Unit tests for session lifecycle

**Deliverable**: Core services with tests passing, database CRUD operations working

---

## Phase 3: External API Clients

### 3.1 Statbate Premium API Client
- [ ] `StatbateClient` class with bearer token auth
- [ ] `getMemberInfo(site, name, timezone?)` → `/members/{site}/{name}/info`
- [ ] `getMemberInfoBatch(site, names[], timezone?)` → `/members/{site}/info/batch`
- [ ] `getModelInfo(site, name, range?, timezone?)` → `/model/{site}/{name}/info`
- [ ] `getModelActivity(site, name, range?, timezone?)` → `/model/{site}/{name}/activity`
- [ ] `getMemberTips(site, name, range?, timezone?, page?, perPage?)` → `/members/{site}/{name}/tips`
- [ ] Error handling (log failures, return null on 404, throw on auth errors)
- [ ] Integration tests (requires API token in env)

### 3.2 Chaturbate Stats API Client
- [ ] `ChaturbateStatsClient` class
- [ ] `getStats(username, token)` → `https://chaturbate.com/statsapi/`
- [ ] Parse response fields (token_balance, num_followers, etc.)
- [ ] Integration tests

### 3.3 Statbate Plus Session Client (Chat History)
- [ ] `StatbatePlusSession` class with cookie/XSRF management
- [ ] `authenticate(sessionCookie, xsrfToken)` - validate session
- [ ] `getChatHistory(modelName, params)` - XHR endpoint (TBD via network inspection)
- [ ] Playwright fallback for cookie bootstrap (optional, only if direct auth fails)
- [ ] **Never** scrape HTML/DOM
- [ ] Integration tests for auth and chat retrieval

**Deliverable**: All API clients working, integration tests passing

---

## Phase 4: Background Worker (Events API)

### 4.1 Chaturbate Events API Listener
- [ ] `EventsListener` class with longpoll connection
- [ ] Connect to Events API using token
- [ ] Handle event types: `chatMessage`, `privateMessage`, `tip`, `follow`, `unfollow`, `broadcastStart`, `broadcastStop`
- [ ] Persist events as Interactions in real-time
- [ ] Auto-detect session start/stop via `broadcastStart`/`broadcastStop` (optional)
- [ ] Reconnection logic on disconnect
- [ ] Graceful shutdown handling

### 4.2 Worker Process
- [ ] Worker entry point (`server/src/worker.ts`)
- [ ] Start EventsListener on boot
- [ ] Health check endpoint (optional)
- [ ] Error logging and recovery

**Deliverable**: Worker process running, events persisting to database

---

## Phase 5: HTTP API Routes

### 5.1 Lookup API
- [ ] `POST /api/lookup` - main UI endpoint
  - Input: `{ username, role?, pastedText?, includeStatbate, includeMyRoomData }`
  - Extract usernames from pastedText
  - Find or create Person records
  - Optionally fetch Statbate snapshots
  - Return: Person + latest stats + deltas + interactions

### 5.2 Person API
- [ ] `GET /api/person/:id` - person detail
- [ ] `GET /api/person/:id/snapshots` - snapshot timeline
- [ ] `GET /api/person/:id/interactions` - interaction history
- [ ] `POST /api/person/:id/note` - add manual note
- [ ] `PUT /api/person/:id/attributes` - update attributes

### 5.3 Session API
- [ ] `POST /api/session/start` - manual session start
- [ ] `POST /api/session/end` - manual session end
- [ ] `GET /api/session/current` - get current session
- [ ] `GET /api/sessions` - list sessions with summaries

### 5.4 Hudson Details API
- [ ] `GET /api/hudson` - fetch hudson_cage stats
  - Chaturbate Stats API data
  - Latest snapshots
  - Recent interactions
  - Session summaries

### 5.5 Watchlist API
- [ ] `GET /api/watchlists` - list all watchlists
- [ ] `GET /api/watchlist/:id/members` - members in watchlist
- [ ] `POST /api/watchlist/:id/member` - add person to watchlist
- [ ] `DELETE /api/watchlist/:id/member/:personId` - remove from watchlist

**Deliverable**: All API routes working, returning correct data

---

## Phase 6: Frontend UI

### 6.1 Project Setup
- [ ] Initialize React + TypeScript + Vite
- [ ] Dark theme (blue/purple palette)
- [ ] Routing setup (React Router)
- [ ] API client wrapper (axios)

### 6.2 Home Page (Lookup + Analyze)
- [ ] Username input field
- [ ] Role override dropdown
- [ ] Large paste text area
- [ ] "Include Statbate" toggle
- [ ] "Include My Room Data" toggle
- [ ] Submit button
- [ ] Results display:
  - Identity Panel (username, role, IDs, first/last seen)
  - Stats Panel (latest metrics + deltas)
  - Behavior signals (spending patterns, activity times)
  - Memory panel (notes, tags)

### 6.3 Person Detail Page
- [ ] Tabs: Overview | Stats Timeline | Interactions | Notes | Attributes
- [ ] Overview: Summary stats + quick actions
- [ ] Stats Timeline: Chart of metric changes over time
- [ ] Interactions: Sortable/filterable table
- [ ] Notes: Add/edit manual notes
- [ ] Attributes: Tag editor

### 6.4 Hudson Details Page
- [ ] Live status indicator
- [ ] Recent tips list
- [ ] Follower count + delta
- [ ] Session list with summaries
- [ ] Clearly label Statbate vs Chaturbate data sources

### 6.5 Watchlists Page
- [ ] List of all watchlists
- [ ] Each list shows:
  - Members with online status
  - Last snapshot delta
  - Last interaction time
- [ ] Add/remove members from lists

### 6.6 Session Controls Component
- [ ] "Start Session" button
- [ ] "End Session" button
- [ ] Current session status indicator

**Deliverable**: Full UI working, all flows functional

---

## Phase 7: Analysis & Intelligence

### 7.1 Analysis Service
- [ ] Spending pattern analysis (tip frequency, amounts, timing)
- [ ] Behavioral signals (loyalty indicators, engagement level)
- [ ] Tag preference analysis
- [ ] Activity timing patterns
- [ ] All analysis must cite data sources and surface uncertainty

### 7.2 Integration with UI
- [ ] Display analysis results on Person detail page
- [ ] Show confidence levels for inferred attributes
- [ ] Link to evidence (snapshots/interactions)

**Deliverable**: Behavioral analysis surfaced in UI

---

## Phase 8: Testing & Hardening

### 8.1 Unit Tests
- [ ] Person service (alias lookup, exclusion)
- [ ] Snapshot service (delta computation)
- [ ] Data normalizers (Statbate, CB Stats)
- [ ] Coverage target: >80%

### 8.2 Integration Tests
- [ ] Statbate API client (real API calls with test token)
- [ ] Chaturbate Stats API client
- [ ] Snapshot persistence and retrieval
- [ ] Chat import (if Statbate Plus endpoints identified)

### 8.3 Error Handling
- [ ] API failure logging (no silent failures)
- [ ] UI error states (clear failure messages)
- [ ] Database constraint violations (graceful handling)
- [ ] Network timeout handling

**Deliverable**: All tests passing, error handling robust

---

## Phase 9: Deployment

### 9.1 Render Configuration
- [ ] Create `render.yaml` for infrastructure-as-code
- [ ] PostgreSQL service configuration
- [ ] Web service configuration (RUN_MODE=web)
- [ ] Worker service configuration (RUN_MODE=worker)
- [ ] Environment variable setup guide

### 9.2 Deployment Verification
- [ ] Deploy to Render
- [ ] Run migrations on production DB
- [ ] Verify web service responds
- [ ] Verify worker is listening to Events API
- [ ] Test end-to-end flow in production

**Deliverable**: System running in production on Render

---

## Implementation Order Summary

1. **Foundation**: Database schema, migrations, env config
2. **Data Layer**: Services for Person, Snapshot, Interaction, Session
3. **API Clients**: Statbate, CB Stats, CB Events, Statbate Plus
4. **Worker**: Background Events listener
5. **HTTP API**: All REST endpoints
6. **Frontend**: React UI for all pages
7. **Analysis**: Behavioral intelligence layer
8. **Testing**: Unit + integration tests
9. **Deployment**: Render.com production deployment

---

## Success Criteria (Definition of Done)

- ✅ All migrations run successfully
- ✅ All tests pass (unit + integration)
- ✅ Data persists across restarts
- ✅ Snapshots show historical deltas correctly
- ✅ Full chat history captured for sessions
- ✅ API failures logged and visible in UI
- ✅ System deployed and running on Render
- ✅ Manual testing of core flows successful

---

## Dependencies & Packages

### Server
- `express` - HTTP server
- `pg` - PostgreSQL client
- `dotenv` - Environment variables
- `zod` - Schema validation
- `axios` - HTTP client for external APIs
- `playwright` (optional) - Cookie bootstrap for Statbate Plus
- `winston` - Logging
- `jest` + `ts-jest` - Testing

### Client
- `react` + `react-dom` - UI framework
- `react-router-dom` - Routing
- `axios` - API client
- `date-fns` - Date utilities
- `recharts` - Charts for stats timeline
- `tailwindcss` - Styling (dark theme)
