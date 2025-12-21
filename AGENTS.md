# AGENTS.md

**Project:** MHC Control Panel

**Role:** Autonomous Builder (Claude)

**Owner:** Hudson Cage

---

## 1. Purpose (Read This First)

You are building a **production-grade Node.js web application** that functions as a persistent analysis and memory system for Chaturbate streaming intelligence.

This is **not** a prototype, **not** a demo, and **not** a UI mock.

Your job is to:

- Build the system exactly as specified
- Use real APIs
- Persist real data
- Handle failure explicitly
- Write and run tests
- Verify the application works end-to-end

You must not invent capabilities that are not supported by the APIs described.

---

## 2. Platforms & Scope (Strict)

### Supported (v1)

- Chaturbate
- Statbate Premium API
- Statbate Plus (authenticated chat history import)
- Render.com hosting
- PostgreSQL database

### Explicitly Out of Scope

- Automated messaging
- Scraping cbhours / cbrewards / cbexplorer
- Predictive or probabilistic modeling
- Erotic or roleplay output
- Multi-platform expansion

If something is not listed as supported, **do not implement it**.

---

### 2.5 Documentation Sources (Authoritative)

Claude **must read and respect** the following files before implementing features that touch external APIs:

- `statbate_openapi.json`
    
    **Authoritative source** for all Statbate Premium API endpoints, request shapes, auth, and responses.
    
    Claude must not invent endpoints outside this file.
    
- `STATBATE_API_SPEC.md`
    
    Human-readable overview of Statbate API behavior and limitations.
    
- `CHATURBATE_EVENTS_API.md`
    
    Authoritative source for Chaturbate Events API capabilities, event types, and constraints.
    
- `CHATURBATE_STATS_API.md`
    
    Authoritative source for Chaturbate Stats API fields and refresh behavior.
    
- `STATBATE_WEBHOOK_SPEC.md` and `STATBATE_WEBHOOK_HELP.md`
    
    Reference material for webhook-style integrations and real-time event delivery.
    
- [https://chaturbate.com/apps/api/docs/](https://chaturbate.com/apps/api/docs/) - Event API Docs
- [https://chaturbate.com/statsapi/documentation/](https://chaturbate.com/statsapi/documentation/) - API User Stats
- [https://chaturbate.com/apps/api/docs/objects.html](https://chaturbate.com/apps/api/docs/objects.html) Event API - Objects

Rules:

- If documentation and assumptions conflict, **documentation wins**.
- If an API behavior is undocumented, Claude must surface uncertainty instead of guessing.
- 

---

## 3. Core Architectural Rules (Non-Negotiable)

### 3.1 Persistence Is Mandatory

- All fetched or imported data must be stored in the database.
- No in-memory-only behavior.
- No overwriting historical data.

### 3.2 Append-Only History

- Snapshots are append-only.
- Interactions are append-only.
- Deltas are computed, never stored as truth.

### 3.3 Explicit Failure Handling

- API failures must be logged.
- UI must surface failure states clearly.
- Silent failure is unacceptable.

---

## 4. Data Model (Must Be Implemented)

### 4.1 Person

Represents any username (viewer or model).

Required fields:

- `id` (UUID)
- `username` (lowercase, unique per platform)
- `platform` (`chaturbate`)
- `role` (`MODEL | VIEWER | BOTH | UNKNOWN`)
- `rid` (integer, nullable)
- `firstSeenAt`
- `lastSeenAt`
- `isExcluded` (boolean, default false)
- `createdAt`
- `updatedAt`

Notes:

- Username changes must be tracked via aliases, not overwrites.
- The username `smk_lover` must be excluded from all stats and summaries.

---

### 4.2 Snapshot

Represents a point-in-time capture.

Required fields:

- `id`
- `personId`
- `source`
    
    (`statbate_member`, `statbate_model`, `cb_stats`, `manual`)
    
- `capturedAt`
- `rawPayload` (JSON)
- `normalizedMetrics` (JSON, nullable)

Rules:

- No snapshot is created if a fetch fails.
- Deltas are computed by comparing snapshots.

---

### 4.3 Interaction

Represents events or pasted content.

Types:

- `CHAT_MESSAGE`
- `PRIVATE_MESSAGE`
- `TIP_EVENT`
- `PROFILE_PASTE`
- `CHAT_IMPORT`
- `MANUAL_NOTE`

Required fields:

- `id`
- `personId`
- `type`
- `content`
- `timestamp`
- `source`
- `metadata` (JSON, optional)

---

### 4.4 Attribute / Tag

Structured memory attached to a Person.

Each attribute must store:

- value
- confidence (`low | medium | high`)
- evidence (reference to Interaction or Snapshot)

---

### 4.5 StreamSession

Represents a single streaming session for `hudson_cage`.

Required fields:

- `id`
- `platform` (`chaturbate`)
- `broadcaster` (`hudson_cage`)
- `startedAt`
- `endedAt` (nullable)
- `status` (`LIVE | ENDED`)
- `createdAt`
- `updatedAt`

Relations:

- StreamSession has many Interactions

---

## 5. Authentication & External Data Access

### 5.1 Statbate Premium API

- Base URL: `https://plus.statbate.com/api`
- Auth: `Authorization: Bearer <TOKEN>`
- Use only documented endpoints from `statbate_openapi.json`
- Do not invent endpoints

Used for:

- Member stats
- Model stats
- Activity
- Rank
- Tips
- Tag spending

---

### 5.2 Statbate Plus Chat History (Critical)

Chat history is **not** available via the Premium OpenAPI.

Rules:

- You must authenticate a Statbate Plus session
- Use the same JSON/XHR endpoints used by the Plus UI
- Do **not** scrape rendered HTML
- Do **not** parse DOM tables

Observed characteristics:

- Cookie-based session (`statbate_plus_session`)
- XSRF token (`XSRF-TOKEN`)
- Laravel + Inertia stack

Implementation order:

1. Attempt direct authenticated JSON calls using session cookies
2. Persist cookies securely server-side
3. Handle session expiration explicitly
4. Only if unavoidable, bootstrap session via headless browser (Playwright)

Imported chat logs must be persisted as `CHAT_IMPORT` Interactions.

---

### 5.3 Chaturbate Events API (My Room Only)

Used only for:

- Live chat
- Tips
- Follows / unfollows
- Broadcast start / stop

Rules:

- No historical replay
- Events must be persisted immediately
- Must never be used for other models’ rooms

---

## 6. Streaming Session Chat Capture (Required)

### 6.1 Manual Session Mode (MVP)

UI must include:

- **Start Session** button
- **End Session** button

Behavior:

- Start creates a `StreamSession`
- Begin listening to Events API
- Persist all chat, tip, follow events as Interactions
- End closes the session cleanly

This guarantees full chat history **from capture start to end**.

---

### 6.2 Auto-Detect Session Mode (Designed For, Not Required)

- If broadcast start/stop can be reliably detected, auto-create sessions
- If not reliable, manual mode must remain primary
- No partial or ambiguous session states allowed

---

## 7. UX / UI Contract (Must Be Followed)

### 7.1 Visual Theme

- Dark theme
- Blue / purple color palette
- Clean, modern, readable
- Accessible contrast
- No default “admin panel” styling

---

### 7.2 Home: Lookup + Analyze

Inputs:

- Username
- Role override (optional)
- Large paste box (PM / profile / chat)
- Include Statbate toggle
- Include My Room Data toggle

Behavior:

- Extract usernames from pasted text
- Resolve or create Person
- Store paste as Interaction
- Fetch snapshots only when requested

Outputs:

- Identity panel
- Stats panel (latest + deltas)
- Behavior signals
- Memory (notes, tags, lists)

---

### 7.3 Person Detail Page

Tabs:

- Overview
- Stats Timeline
- Interactions
- Notes
- Attributes / Tags

---

### 7.4 My Details (hudson_cage)

Displays:

- Live status
- Recent tips
- Follower deltas
- Session list and summaries

Statbate vs Chaturbate data must be clearly labeled.

---

### 7.5 Watchlists

System lists:

- Friends
- Known Streamers
- Ones to Watch
- Banned But Craved
- Excluded

Each list shows:

- Online status
- Last snapshot delta
- Last interaction time

---

## 8. Analysis Rules

Analysis must:

- Be deterministic
- Cite data sources
- Surface uncertainty
- Never invent facts

Allowed:

- Behavior summaries
- Spending patterns
- Timing insights

Disallowed:

- Roleplay
- Assumptions of intent
- Predictions without data

---

## 9. Infrastructure & Deployment

### 9.1 Deployment Options

**Production (Render.com)**:
- Web Service (RUN_MODE=web) - Backend API server
- Worker Service (RUN_MODE=worker) - Events API listener
- PostgreSQL database (managed)
- Static Site - React frontend
- See [DEPLOYMENT.md](DEPLOYMENT.md) for instructions

**Local Development (Docker)**:
- docker-compose orchestrates 4 services:
  - PostgreSQL (port 5432)
  - Backend web (port 3000)
  - Background worker
  - React frontend (nginx, port 8080)
- See [DOCKER.md](DOCKER.md) for instructions

### 9.2 Requirements

- Node.js 18+ backend with TypeScript
- PostgreSQL database
- Environment variables validated on startup (Zod schemas)
- Database migrations required and automated
- Multi-stage Docker builds for optimization
- Health checks for service dependencies

---

## 10. Testing Requirements (Mandatory)

You must:

- Write unit tests for data normalization
- Write integration tests for:
    - Statbate API fetch
    - Snapshot persistence
- Test chat import for:
    - Authentication
    - Persistence
    - Idempotency

“No tests” or “manual verification only” is a failure.

---

## 11. Definition of Done

The system is only considered complete if:

- Data persists across restarts
- Snapshots show historical deltas
- Full chat history is captured for sessions
- Failures are visible and logged
- Tests pass locally and in CI

---

## 12. Final Instruction

Do **not** stop early.

Do **not** declare success until:

- The app runs
- The DB is populated
- Tests pass
- Core flows work end-to-end

You are building a **control system**, not a demo.