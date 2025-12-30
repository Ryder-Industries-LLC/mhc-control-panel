# Affiliate API Polling Job

## Overview

Automated background worker that polls the Chaturbate Affiliate API every 30 minutes to collect broadcaster session data and profile information. Runs continuously and stores historical broadcast session snapshots for analytics.

## Features

- **Configurable Polling Interval**: Default 30 minutes (configurable via API)
- **Gender Filtering**: Male broadcasters only by default (configurable)
- **Batch Processing**: Processes up to 500 broadcasters per cycle
- **Rate Limiting**: 1 second delay between API calls to respect limits
- **Statistics Tracking**: Monitors enriched/failed counts
- **Pause/Resume/Stop**: Full control over job execution

## API Endpoints

### Job Control

#### Get Status
```bash
GET /api/job/affiliate/status

# Response
{
  "isRunning": true,
  "isPaused": false,
  "config": {
    "intervalMinutes": 30,
    "gender": "m",
    "limit": 500,
    "enabled": true
  },
  "stats": {
    "lastRun": "2025-12-23T05:45:00.000Z",
    "totalRuns": 3,
    "totalEnriched": 1247,
    "totalFailed": 5,
    "lastRunEnriched": 412,
    "lastRunFailed": 2
  }
}
```

#### Update Configuration
```bash
POST /api/job/affiliate/config
Content-Type: application/json

{
  "intervalMinutes": 30,        # Polling frequency (minutes)
  "gender": "m",                 # m, f, t, c, or combinations: "m,f"
  "limit": 500,                  # Max broadcasters per cycle
  "enabled": true                # Enable/disable job
}

# Example
curl -X POST http://localhost:3000/api/job/affiliate/config \
  -H "Content-Type: application/json" \
  -d '{"intervalMinutes":30,"gender":"m","limit":500,"enabled":true}'
```

#### Start Job
```bash
POST /api/job/affiliate/start

# Example
curl -X POST http://localhost:3000/api/job/affiliate/start
```

#### Pause Job
```bash
POST /api/job/affiliate/pause

# Pauses execution but keeps schedule intact
curl -X POST http://localhost:3000/api/job/affiliate/pause
```

#### Resume Job
```bash
POST /api/job/affiliate/resume

# Resumes from paused state
curl -X POST http://localhost:3000/api/job/affiliate/resume
```

#### Stop Job
```bash
POST /api/job/affiliate/stop

# Completely stops and clears schedule
curl -X POST http://localhost:3000/api/job/affiliate/stop
```

#### Reset Statistics
```bash
POST /api/job/affiliate/reset-stats

# Resets all counters
curl -X POST http://localhost:3000/api/job/affiliate/reset-stats
```

## Configuration Options

### Gender Filters
- `"m"` - Male broadcasters only (default)
- `"f"` - Female broadcasters only
- `"t"` - Trans broadcasters only
- `"c"` - Couple broadcasters only
- `"m,f"` - Male and female
- `"m,f,t,c"` - All genders

### Interval Guidelines
- **15 minutes**: Captures frequent updates, high storage usage
- **30 minutes**: Recommended - good balance of data coverage and storage (default)
- **60 minutes**: Lower storage, may miss short sessions
- **120+ minutes**: Minimal storage, significant gaps in data

### Limit Considerations
- **100-200**: Quick cycles, focused on top broadcasters
- **500**: Recommended - captures most active rooms (default)
- **Max**: 500 per API call (Chaturbate Affiliate API limitation)

## What Gets Collected

For each online broadcaster, the job captures:

### Profile Data (updated on change)
- Display name, age, birthday
- Gender, location, country
- Spoken languages
- New broadcaster flag
- Last seen online timestamp

### Session Data (every poll)
- Observation timestamp
- Seconds online (session duration)
- Calculated session start time
- Current show type (public/private/group/away)
- Room subject
- Tags
- Current viewer count
- Total follower count
- HD stream status
- Profile image URLs

## Data Storage Estimates

With default settings (30-minute intervals, male gender, 500 limit):

### Daily Volume
- **48 polls per day** (every 30 minutes)
- **~300-500 unique broadcasters** (varies by time of day)
- **~15,000 session records per day** (500 broadcasters × 30 polls, accounting for duplicates)

### Storage Growth
- **~1KB per session record**
- **~15MB per day**
- **~450MB per month**
- **~5.4GB per year**

### With 90-Day Retention
- **~1.35GB** total database size for broadcast_sessions table

## Retention Strategy

Recommended cleanup (not yet implemented):

```sql
-- Delete sessions older than 90 days
DELETE FROM broadcast_sessions
WHERE observed_at < NOW() - INTERVAL '90 days';
```

Run weekly or monthly via cron.

## Monitoring

### Check Current Status
```bash
curl http://localhost:3000/api/job/affiliate/status | jq '.stats'
```

### View Recent Logs
```bash
docker-compose logs web | grep -i "affiliate" | tail -50
```

### Check Database Growth
```sql
-- Total session records
SELECT COUNT(*) FROM broadcast_sessions;

-- Sessions per day (last 7 days)
SELECT
  DATE(observed_at) as date,
  COUNT(*) as sessions,
  COUNT(DISTINCT person_id) as unique_broadcasters
FROM broadcast_sessions
WHERE observed_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(observed_at)
ORDER BY date DESC;

-- Database size
SELECT pg_size_pretty(pg_total_relation_size('broadcast_sessions'));
```

## Typical Workflow

1. **Initial Setup**
```bash
# Configure for male broadcasters, 30-min interval
curl -X POST http://localhost:3000/api/job/affiliate/config \
  -H "Content-Type: application/json" \
  -d '{"intervalMinutes":30,"gender":"m","limit":500,"enabled":true}'

# Start the job
curl -X POST http://localhost:3000/api/job/affiliate/start
```

2. **Monitor Progress**
```bash
# Check status every few minutes
watch -n 300 'curl -s http://localhost:3000/api/job/affiliate/status | jq ".stats"'
```

3. **Adjust as Needed**
```bash
# Change interval to 60 minutes if storage grows too fast
curl -X POST http://localhost:3000/api/job/affiliate/config \
  -H "Content-Type: application/json" \
  -d '{"intervalMinutes":60}'

# Pause during high-load periods
curl -X POST http://localhost:3000/api/job/affiliate/pause

# Resume when ready
curl -X POST http://localhost:3000/api/job/affiliate/resume
```

## Troubleshooting

### Job Not Starting
- Check if `enabled: true` in config
- Verify service is running: `docker-compose ps`
- Check logs: `docker-compose logs web | grep -i error`

### High Failure Rate
- Check Affiliate API availability
- Verify rate limiting isn't too aggressive
- Review error logs for specific failures

### Slow Cycles
- Reduce `limit` to process fewer broadcasters
- Increase interval to run less frequently
- Check database performance

### Storage Growing Too Fast
- Reduce polling interval (30 → 60 minutes)
- Implement retention policy (delete old sessions)
- Monitor with: `SELECT pg_size_pretty(pg_total_relation_size('broadcast_sessions'));`

## Future Enhancements

1. **Auto-pause during low-activity hours** - Stop polling 2am-6am local time
2. **Smart filtering** - Only track broadcasters with >100 followers
3. **Retention policy automation** - Auto-delete sessions older than configurable days
4. **Performance metrics** - Track API response times, success rates
5. **Alert system** - Notify if job fails multiple consecutive cycles
6. **Batch size optimization** - Dynamically adjust based on available broadcasters
7. **Priority queuing** - Track high-value broadcasters more frequently

## Integration with UI (Planned)

The UI will provide:
- Visual job status dashboard
- Start/stop/pause controls
- Configuration form (interval, gender, limit)
- Real-time statistics display
- Session history charts
- Storage usage monitoring

API endpoints are ready - UI implementation pending.

## Related Documentation

- [CHATURBATE_AFFILIATE_API.md](./CHATURBATE_AFFILIATE_API.md) - Full Affiliate API integration docs
- [PROFILE_SCRAPING.md](./PROFILE_SCRAPING.md) - Phase 2 authenticated scraping plans
- Database migrations: `server/src/db/migrations/012_create_broadcast_sessions.sql`
- Job implementation: `server/src/jobs/affiliate-polling.job.ts`
- API routes: `server/src/routes/job.ts` (affiliate endpoints)
