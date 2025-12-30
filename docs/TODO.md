# MHC Control Panel - TODO

**Last Updated**: 2024-12-21

This document tracks remaining tasks for completing the MHC Control Panel setup and transitioning from Render to Docker-based local development.

---

## Phase 1: Docker Local Setup (Next Steps)

### 1.1 Test Docker Environment

- [ ] Copy `.env.example` to `.env` and fill in actual API tokens:
  - [ ] `CHATURBATE_USERNAME`
  - [ ] `CHATURBATE_EVENTS_TOKEN`
  - [ ] `CHATURBATE_STATS_TOKEN`
  - [ ] `STATBATE_API_TOKEN`

- [ ] Start Docker stack: `docker-compose up -d`

- [ ] Verify all services are running:
  ```bash
  docker-compose ps
  # Should show: db, web, worker, frontend all "Up"
  ```

- [ ] Check service logs for errors:
  ```bash
  docker-compose logs -f web     # Backend API
  docker-compose logs -f worker  # Events listener
  docker-compose logs -f frontend # React app
  docker-compose logs db         # PostgreSQL
  ```

- [ ] Test database migrations ran successfully:
  ```bash
  docker-compose exec web npm run migrate
  # Should show: "All migrations completed successfully"
  ```

- [ ] Access frontend at http://localhost:8080
  - [ ] Verify navigation works (Lookup / Hudson pages)
  - [ ] Test lookup functionality
  - [ ] Test Hudson dashboard loads

- [ ] Test backend API at http://localhost:3000
  ```bash
  curl http://localhost:3000/api/hudson
  # Should return JSON with Hudson's stats
  ```

- [ ] Verify worker is listening to Chaturbate Events API:
  ```bash
  docker-compose logs -f worker
  # Should show: "Listening to events for hudson_cage"
  # Should show event polling activity
  ```

### 1.2 Test Live Session Capture

- [ ] Start a test broadcast on Chaturbate (or wait for next real session)

- [ ] Monitor worker logs to see events being captured:
  ```bash
  docker-compose logs -f worker
  ```

- [ ] Verify events are being stored in database:
  ```bash
  docker-compose exec db psql -U mhc_user -d mhc_control_panel
  # Run: SELECT COUNT(*) FROM interactions;
  # Run: SELECT * FROM stream_sessions ORDER BY created_at DESC LIMIT 5;
  ```

- [ ] Check Hudson dashboard shows live session data

### 1.3 Troubleshooting Common Issues

- [ ] If database won't start:
  ```bash
  docker-compose down -v  # WARNING: Deletes all data
  docker-compose up -d
  ```

- [ ] If migrations fail:
  ```bash
  docker-compose exec web npm run migrate
  ```

- [ ] If worker can't connect to Events API:
  - [ ] Verify `CHATURBATE_EVENTS_TOKEN` is correct in `.env`
  - [ ] Check worker logs for specific error
  - [ ] Restart worker: `docker-compose restart worker`

- [ ] If frontend can't reach backend:
  - [ ] Verify backend is running: `docker-compose ps web`
  - [ ] Check backend logs: `docker-compose logs web`
  - [ ] Verify port 3000 is accessible: `curl http://localhost:3000/api/hudson`

---

## Phase 2: Render Cleanup (After Docker Confirmed Working)

### 2.1 Data Migration (If Needed)

- [ ] Decide if you want to preserve Render production data

  **Option A: Start Fresh** (recommended for testing)
  - Docker starts with empty database
  - Historical data stays in Render until cancelled

  **Option B: Export and Import**
  - [ ] Export data from Render PostgreSQL:
    ```bash
    # Get database connection string from Render dashboard
    pg_dump <RENDER_DATABASE_URL> > render_backup.sql
    ```
  - [ ] Import into Docker database:
    ```bash
    cat render_backup.sql | docker-compose exec -T db psql -U mhc_user -d mhc_control_panel
    ```

### 2.2 Cancel Render Services

**Only do this after confirming Docker works!**

- [ ] Stop Render services (don't delete yet):
  - [ ] Pause Web Service (backend)
  - [ ] Pause Worker Service
  - [ ] Pause Static Site (frontend)

- [ ] Test Docker is still working while Render is paused

- [ ] If Docker works perfectly, delete Render services:
  - [ ] Delete Web Service
  - [ ] Delete Worker Service
  - [ ] Delete Static Site

- [ ] Database options:
  - [ ] Keep Render database temporarily as backup ($7/month)
  - [ ] Export final backup then delete database
  - [ ] Set database to pause when inactive (if available)

### 2.3 Cost Savings Estimate

**Current Render Costs** (estimated):
- Web Service: $7-25/month
- Worker Service: $7-25/month
- Static Site: Free (but limited)
- PostgreSQL: $7-25/month
- **Total: ~$21-75/month**

**Docker Costs**:
- $0/month (runs on your local machine)
- Only cost is electricity to run your computer

---

## Phase 3: Production Features (Future)

### 3.1 Missing Core Features

- [ ] Session management API endpoints:
  - [ ] `POST /api/session/start` - Manual session start
  - [ ] `POST /api/session/end/:id` - Manual session end
  - [ ] `GET /api/session/:id/stats` - Enhanced session stats

- [ ] Person detail page in frontend:
  - [ ] Route: `/person/:id`
  - [ ] Tabs: Overview, Stats Timeline, Interactions, Notes
  - [ ] Edit person metadata
  - [ ] Add manual notes

- [ ] Watchlist functionality:
  - [ ] Create/edit/delete watchlists
  - [ ] Add/remove people from lists
  - [ ] Watchlist view with online status
  - [ ] System lists (Friends, Known Streamers, etc.)

- [ ] Statbate Plus chat import:
  - [ ] Cookie-based authentication
  - [ ] Chat history import endpoint
  - [ ] Idempotent chat message storage
  - [ ] UI to trigger imports

### 3.2 Testing (Currently Missing)

- [ ] Unit tests for services:
  - [ ] PersonService tests
  - [ ] SnapshotService delta computation tests
  - [ ] InteractionService tests
  - [ ] SessionService tests

- [ ] Integration tests:
  - [ ] API endpoint tests
  - [ ] Database migration tests
  - [ ] External API client tests (mocked)

- [ ] E2E tests:
  - [ ] Frontend user flows
  - [ ] Full lookup workflow
  - [ ] Session capture workflow

### 3.3 Enhancements

- [ ] Add attribute/tag system:
  - [ ] Database schema
  - [ ] API endpoints
  - [ ] UI for viewing/editing tags

- [ ] Behavioral analysis features:
  - [ ] Spending pattern detection
  - [ ] Activity timing analysis
  - [ ] Tag preference tracking
  - [ ] Loyalty indicators

- [ ] Advanced delta visualizations:
  - [ ] Charts for metric changes over time
  - [ ] Comparison views
  - [ ] Trend indicators

- [ ] Search and filtering:
  - [ ] Search persons by username/tags
  - [ ] Filter interactions by type/date
  - [ ] Advanced query builder

---

## Phase 4: Production Deployment (Optional)

If you later want to deploy to production again:

### 4.1 Options

**A. Keep Local Only**
- Run Docker on your machine when you need it
- No hosting costs
- Data stays private on your machine

**B. Self-Hosted Server**
- Rent a VPS (DigitalOcean, Linode, etc.) ~$5-12/month
- Install Docker on VPS
- Run same docker-compose setup
- Set up domain and SSL certificate

**C. Return to Render**
- Use same Render setup as before
- Keep Docker for local development/testing

**D. Kubernetes/Cloud**
- More complex, not recommended unless scaling needs

### 4.2 If Deploying to VPS

- [ ] Rent VPS (2GB RAM minimum)
- [ ] Install Docker + Docker Compose
- [ ] Clone repository to VPS
- [ ] Configure `.env` with production values
- [ ] Set up SSL certificate (Let's Encrypt)
- [ ] Configure firewall (ports 80, 443, 22 only)
- [ ] Set up automated backups
- [ ] Configure monitoring/alerts

---

## Current Status

### ✅ Completed

- [x] Backend API server (Express + TypeScript)
- [x] PostgreSQL database schema (9 migrations)
- [x] Person management with alias support
- [x] Snapshot system with delta computation
- [x] Interaction logging
- [x] Session tracking
- [x] Chaturbate Events API integration
- [x] Chaturbate Stats API integration
- [x] Statbate Premium API integration
- [x] React frontend (Lookup + Hudson dashboard)
- [x] Docker Compose configuration
- [x] Full deployment to Render
- [x] Worker service for Events API
- [x] Auto-exclusion for smk_lover
- [x] Environment variable validation

### 🚧 In Progress

- [ ] Testing Docker local setup (Phase 1)

### ⏳ Not Started

- [ ] Render cleanup (Phase 2)
- [ ] Production features (Phase 3)
- [ ] Testing suite (Phase 3.2)

---

## Notes

### Important Reminders

1. **Don't delete Render services until Docker is confirmed working**
2. **Back up production data before any destructive operations**
3. **Keep `.env` file secure and never commit to git**
4. **Test database backups regularly**: `docker-compose exec db pg_dump -U mhc_user mhc_control_panel > backup.sql`

### Docker Quick Reference

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# View logs
docker-compose logs -f [service]

# Rebuild after code changes
docker-compose up -d --build

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d

# Access database
docker-compose exec db psql -U mhc_user -d mhc_control_panel

# Run migrations
docker-compose exec web npm run migrate

# Backup database
docker-compose exec db pg_dump -U mhc_user mhc_control_panel > backup_$(date +%Y%m%d).sql

# Restore database
cat backup.sql | docker-compose exec -T db psql -U mhc_user -d mhc_control_panel
```

---

**Next Action**: Test Docker setup (Phase 1.1) - Start with `docker-compose up -d` tomorrow!
