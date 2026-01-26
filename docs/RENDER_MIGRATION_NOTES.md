# Render Migration Notes

This document captures the issues encountered during the Render.com migration attempt on 2026-01-26 and their potential solutions. Use this as a reference for the next migration attempt.

## Migration Approach

1. Start with a fresh DB import to Render from local
2. Deploy code at the pre-migration state (before Render-specific changes)
3. Apply fixes one at a time, testing after each
4. Do a final DB import once everything is working

## Issues Encountered & Solutions

### 1. SPA Routing (404 on direct URL access)

**Problem:** Direct navigation to `/people`, `/gate`, etc. returned 404.

**Root Cause:** Render static sites need rewrite rules configured via API/dashboard, not `_redirects` file.

**Solution:** Add routes via Render API:
```bash
# Add API proxy (priority 0 = highest)
curl -X POST 'https://api.render.com/v1/services/{serviceId}/routes' \
  -H 'Authorization: Bearer {API_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{"type": "rewrite", "source": "/api/*", "destination": "https://mhc-control-panel-web.onrender.com/api/*", "priority": 0}'

# Add SPA catch-all (higher priority number = lower precedence)
curl -X POST 'https://api.render.com/v1/services/{serviceId}/routes' \
  -H 'Authorization: Bearer {API_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{"type": "rewrite", "source": "/*", "destination": "/index.html", "priority": 100}'
```

**Status:** Routes were added successfully. API calls started returning JSON instead of HTML.

---

### 2. API Client Using Wrong Base URL

**Problem:** Frontend was calling `https://mhc-control-panel-web.onrender.com` directly instead of using relative URLs through the proxy.

**Root Cause:** `client/src/api/client.ts` had hardcoded fallback URL and `REACT_APP_API_URL` env var was set to backend URL.

**Symptoms:**
- CORS errors in console
- Cookies not being sent (cross-origin)
- 30-second timeouts on API calls

**Solution (code change):**
```typescript
// client/src/api/client.ts line 3
// BEFORE:
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://mhc-control-panel-web.onrender.com';

// AFTER:
const API_BASE_URL = process.env.REACT_APP_API_URL || '';
```

**Solution (env var):** Delete `REACT_APP_API_URL` from Render static site env vars.

**Status:** Change committed but not verified working due to other issues.

---

### 3. Database Column Name Mismatches

**Problem:** Queries failing with "column does not exist" errors.

**Files affected:**
- `server/src/services/stats-collection.service.ts`
- `server/src/routes/system.ts`

**Specific issues:**

| Query Reference | Wrong | Correct |
|----------------|-------|---------|
| priority_lookups.priority | `priority` | `priority_level` |
| Table name | `priority_lookup_queue` | `priority_lookups` |
| cbhours_live_stats.is_online | `is_online = true` | `room_status = 'Online'` |
| cbhours_live_stats.recorded_at | `recorded_at` | `checked_at` |
| profile_images table | `profile_images` | `media_locator` |

**Status:** Fixes committed.

---

### 4. Database SSL Configuration

**Problem:** Connection errors with SSL/TLS.

**Root Cause:** Render internal URLs (format `dpg-xxx-a`) don't need SSL, but external URLs do.

**Solution (in `server/src/db/client.ts`):**
```typescript
const dbHost = env.DATABASE_URL?.split('@')[1]?.split('/')[0]?.split(':')[0] || 'unknown';
const isExternalUrl = dbHost.includes('.render.com') || dbHost.includes('.postgres.render.com');
const isProduction = env.NODE_ENV === 'production';

const sslConfig = isProduction && isExternalUrl
  ? { rejectUnauthorized: false }
  : undefined;
```

**Status:** Committed but may need revisiting based on which DATABASE_URL format is used.

---

### 5. Cross-Origin-Opener-Policy Warning

**Problem:** Console shows "Cross-Origin-Opener-Policy policy would block the window.postMessage call"

**Root Cause:** This is related to Google OAuth popup communication. May need COOP/COEP headers configured on the server.

**Potential Solutions:**
1. Add headers to Express server
2. Configure in render.yaml for the web service
3. May be related to the API URL issue (solved in #2)

**Status:** Not resolved.

---

### 6. Cookies Warning in Logs

**Problem:** "Profile scrape job starting without cookies - will wait for cookies to be imported before processing"

**Root Cause:** The profile scrape job expects Chaturbate session cookies in the database. These may not have been imported or the job isn't finding them.

**Note:** Cookies are stored in the `settings` table, not environment variables.

**Status:** Not investigated - may resolve after proper DB import.

---

### 7. Media Transfer Job Warning

**Problem:** "Media transfer job cannot start: no valid destination provider"

**Root Cause:** S3 configuration may not be set up correctly in Render env vars.

**Required env vars for S3:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET_NAME`

**Status:** Not verified.

---

## Commits Made During Migration

These commits contain Render-specific changes that may need to be reverted or cherry-picked:

1. `741cc4e` - Added `_redirects` file (doesn't work on Render)
2. `ff08002` - Fixed stats-collection.service.ts table names
3. `1fe5f9c` - Fixed priority_lookups and cbhours column names
4. `b07896c` - Fixed API client to use relative URLs
5. `19868eb` - Fixed TypeScript error (completed_24h)

## Pre-Migration Commit

To revert to pre-migration state:
```bash
git log --oneline | head -20  # Find the commit before 741cc4e
git checkout <pre-migration-commit> -- .
```

Or revert specific commits:
```bash
git revert 19868eb b07896c 1fe5f9c ff08002 741cc4e --no-commit
git commit -m "Revert Render migration changes"
```

## Render Service IDs

- Frontend (static site): `srv-d5rdbt6r433s738ioh10`
- Web service: `mhc-control-panel-web`
- Worker service: `mhc-control-panel-worker`
- Database: `dpg-d5c5ihpu0jms73a6gis0`

## Testing Checklist for Next Attempt

Before considering migration complete:

- [ ] `/people` page shows results (35k+ persons)
- [ ] `/gate` prompts for password after OAuth login
- [ ] Gate password ("gateway") grants access
- [ ] No cookie-related errors in web service logs
- [ ] No "column does not exist" errors in logs
- [ ] Profile scrape job starts without cookie warning
- [ ] Media transfer job starts without provider warning
- [ ] Google OAuth login works without CORS errors
- [ ] API calls use relative URLs (check Network tab)
- [ ] Image upload via shortcut works

## Next Steps

1. Revert local code to pre-migration state
2. Verify local Docker setup still works
3. Fresh import of local DB to Render
4. Deploy clean code to Render
5. Apply fixes one at a time from this document
6. Test after each fix
7. Final DB import when all features work
