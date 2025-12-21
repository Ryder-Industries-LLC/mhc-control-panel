# Deployment Guide - MHC Control Panel

This guide covers deploying the MHC Control Panel to Render.com.

---

## Prerequisites

1. GitHub repository with the code
2. Render.com account
3. API tokens from:
   - Statbate Premium API
   - Chaturbate Events API
   - Chaturbate Stats API

---

## Step 1: Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "PostgreSQL"
3. Configure:
   - Name: `mhc-db`
   - Database: `mhc_control_panel`
   - User: `mhc_user`
   - Region: Choose closest to you
   - Plan: Starter ($7/month)
4. Click "Create Database"
5. Wait for database to provision
6. Note the "Internal Database URL" - this will be used automatically by services

---

## Step 2: Deploy Web Service

1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `mhc-control-panel-web`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter ($7/month)

4. Add Environment Variables:
   ```
   NODE_ENV=production
   PORT=3000
   LOG_LEVEL=info
   CHATURBATE_USERNAME=hudson_cage
   ```

5. Link Database:
   - `DATABASE_URL` → Link to mhc-db (automatic via Render UI)

6. Add Secret File (`.env`):
   - Go to "Secret Files" section
   - Add file with filename: `.env`
   - Contents:
     ```bash
     RUN_MODE=web
     STATBATE_API_TOKEN=your_statbate_premium_api_token
     CHATURBATE_EVENTS_TOKEN=your_chaturbate_events_api_token
     CHATURBATE_STATS_TOKEN=your_chaturbate_stats_api_token
     ```
   - This file will be placed at `/etc/secrets/.env` by Render
   - The application automatically detects and loads this file on startup

7. Click "Create Web Service"

---

## Step 3: Run Database Migrations

After the web service deploys successfully:

1. Go to the web service's "Shell" tab
2. Run:
   ```bash
   npm run migrate
   ```

3. Verify migrations succeeded (should see "All migrations completed successfully")

---

## Step 4: Deploy Worker Service

1. Click "New +" → "Background Worker"
2. Connect same GitHub repository
3. Configure:
   - **Name**: `mhc-control-panel-worker`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run worker`
   - **Plan**: Starter ($7/month)

4. Add Environment Variables:
   ```
   NODE_ENV=production
   LOG_LEVEL=info
   CHATURBATE_USERNAME=hudson_cage
   ```

5. Link Database:
   - `DATABASE_URL` → Link to mhc-db (automatic via Render UI)

6. Add Secret File (`.env`):
   - Go to "Secret Files" section
   - Add file with filename: `.env`
   - Contents:
     ```bash
     RUN_MODE=worker
     CHATURBATE_EVENTS_TOKEN=your_chaturbate_events_api_token
     ```
   - This file will be placed at `/etc/secrets/.env` by Render
   - The application automatically detects and loads this file on startup

7. Click "Create Background Worker"

---

## Step 5: Verify Deployment

### Check Web Service

1. Visit your web service URL (e.g., `https://mhc-control-panel-web.onrender.com`)
2. Test health endpoint: `https://your-url.onrender.com/health`
3. Should return: `{"status":"ok","timestamp":"..."}`

### Check Worker Service

1. Go to worker service → "Logs" tab
2. Look for: "Starting MHC Control Panel Worker"
3. Should see: "Starting Chaturbate Events API listener"

### Test API Endpoints

```bash
# Test lookup endpoint
curl -X POST https://your-url.onrender.com/api/lookup \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","includeStatbate":false}'

# Test Hudson details
curl https://your-url.onrender.com/api/hudson

# Test session management
curl -X POST https://your-url.onrender.com/api/session/start
```

---

## Important Notes

### Chaturbate Events API Endpoint

✅ **Implemented**: The Events API client uses the correct longpoll endpoint from [EVENTS_API_DOCS.md](EVENTS_API_DOCS.md):

```typescript
// Initial URL
https://eventsapi.chaturbate.com/events/{username}/{token}/?timeout=30

// Subsequent requests use nextUrl from response
this.nextUrl = response.data.nextUrl;
```

**Pattern**: Longpoll with automatic `nextUrl` continuation as documented in official Chaturbate Events API docs.

### Statbate Plus Chat History

Chat history import functionality is **not yet implemented** because:
- Statbate Plus chat history requires cookie-based authentication
- XHR endpoint URLs need to be reverse-engineered from the Statbate Plus UI
- Playwright cookie bootstrap may be needed

To implement, see [MODULE_PLAN.md](MODULE_PLAN.md#32-chaturbate-stats-api-client).

---

## Monitoring & Logs

### View Logs

**Web Service**:
- Go to web service → "Logs" tab
- Filter by level: `info`, `warn`, `error`

**Worker Service**:
- Go to worker service → "Logs" tab
- Watch for event processing logs

### Common Log Messages

```
✓ Server listening on port 3000
✓ Starting Chaturbate Events API listener
✓ Created person: <id> (<username>)
✓ Created snapshot for person <id> from source statbate_member
✗ Events API authentication failed - check token
✗ Statbate API error: status 404
```

---

## Troubleshooting

### Database Connection Errors

```
Error: Connection terminated unexpectedly
```

**Solution**: Check that `DATABASE_URL` environment variable is set and database is running.

### Migration Failures

```
Migration 001_create_persons failed
```

**Solution**:
1. Check database logs
2. Manually connect to database via psql
3. Run migrations individually

### Worker Not Receiving Events

```
Events API authentication failed
```

**Solution**:
1. Verify `CHATURBATE_EVENTS_TOKEN` is correct
2. Ensure token has "Events API" scope
3. Check token hasn't been deleted (wait 1 minute after deletion)

### API Rate Limits

If you see 429 errors:
- Statbate Premium API has rate limits (check docs)
- Add exponential backoff to API clients
- Cache responses where appropriate

---

## Scaling Considerations

### Current Setup (Starter Plan)

- **Web**: 1 instance, 512MB RAM
- **Worker**: 1 instance, 512MB RAM
- **Database**: 1GB storage, shared CPU

### When to Upgrade

**Upgrade Web Service** if:
- Response times > 2 seconds
- Memory usage consistently > 400MB
- Need autoscaling for traffic spikes

**Upgrade Worker** if:
- Event processing lag > 10 seconds
- Worker crashes due to OOM

**Upgrade Database** if:
- Storage > 80% full
- Query times slow down
- Need more connections

---

## Backup & Recovery

### Database Backups

Render.com provides automatic daily backups for paid plans.

**Manual Backup**:
```bash
pg_dump $DATABASE_URL > backup.sql
```

**Restore**:
```bash
psql $DATABASE_URL < backup.sql
```

### Data Retention

- **Snapshots**: Kept indefinitely (append-only)
- **Interactions**: Kept indefinitely (append-only)
- **Sessions**: Kept indefinitely

To implement cleanup, use `SnapshotService.deleteOlderThan(date)`.

---

## Environment Variables Reference

### Render Environment Variables (non-secret)
| Variable | Required | Service | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | Both | `production` |
| `PORT` | No | Web | HTTP port (default: 3000) |
| `LOG_LEVEL` | No | Both | `error` \| `warn` \| `info` \| `debug` |
| `CHATURBATE_USERNAME` | Yes | Both | Broadcaster username (hudson_cage) |
| `DATABASE_URL` | Yes | Both | PostgreSQL connection string (linked via Render UI) |

### Secret File (`.env`) - Stored in Render Secret Files

**Location**: `/etc/secrets/.env` (automatically detected by the application)

**How it works**:

- The application checks for `.env` at `/etc/secrets/.env` (Render Secret Files location)
- If not found, falls back to local `.env` file (for development)
- See [config/env.ts:10-21](server/src/config/env.ts#L10-L21) for implementation

**Format**:
```bash
# Required for both services
RUN_MODE=web                              # or 'worker' for worker service

# Required for web service
STATBATE_API_TOKEN=xxx                    # Statbate Premium API bearer token
CHATURBATE_EVENTS_TOKEN=xxx               # Chaturbate Events API token
CHATURBATE_STATS_TOKEN=xxx                # Chaturbate Stats API token

# Required for worker service
CHATURBATE_EVENTS_TOKEN=xxx               # Chaturbate Events API token

# Optional (for future chat history import)
STATBATE_PLUS_SESSION_COOKIE=xxx
STATBATE_PLUS_XSRF_TOKEN=xxx
```

**Note**: The `.env` file is loaded automatically by `dotenv` at runtime.

---

## Cost Estimate

**Monthly Costs** (Render.com Starter Plan):
- PostgreSQL: $7/month
- Web Service: $7/month
- Worker Service: $7/month
- **Total**: ~$21/month

**Free Tier** (for testing):
- Use Render Free tier for web/worker
- Use free PostgreSQL (limited to 90 days)

---

## Support & Documentation

- **Render Docs**: https://render.com/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Chaturbate API**: https://chaturbate.com/apps/api/docs/
- **Statbate Premium**: https://plus.statbate.com/openapi.json

---

## Next Steps

After deployment:

1. ✅ Verify all services are running
2. ✅ Test API endpoints
3. ✅ Monitor logs for errors
4. 🔲 Build React frontend (see [MODULE_PLAN.md](MODULE_PLAN.md#phase-6-frontend-ui))
5. 🔲 Implement Statbate Plus chat history import
6. 🔲 Add behavioral analysis layer
7. 🔲 Configure domain (optional)

---

**Deployment Complete!**

Your MHC Control Panel backend is now live. The web API is accessible at your Render URL, and the worker is listening for Chaturbate events.
