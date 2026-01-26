# MHC Control Panel - Render Deployment Guide

This document describes the production deployment on Render.com.

## Architecture Overview

The application runs as three separate services on Render:

| Service | Type | Purpose |
|---------|------|---------|
| `mhc-control-panel-web` | Web Service (Docker) | Express API server |
| `mhc-control-panel-worker` | Background Worker (Docker) | Background job processing |
| `mhc-control-panel-frontend` | Static Site | React SPA |
| `mhc-db` | PostgreSQL | Managed database (Basic 256MB) |

## Service URLs

- **Frontend**: https://mhc-control-panel-frontend.onrender.com
- **API**: https://mhc-control-panel-web.onrender.com
- **Health Check**: https://mhc-control-panel-web.onrender.com/health

## Environment Variables

### Required for All Services

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (internal URL for web/worker) |
| `NODE_ENV` | Set to `production` |
| `TZ` | Timezone (e.g., `America/New_York`) |

### Web Service Only

| Variable | Description |
|----------|-------------|
| `RUN_MODE` | Set to `web` |
| `PORT` | Set to `3000` |
| `CHATURBATE_USERNAME` | Your Chaturbate username |
| `CHATURBATE_EVENTS_TOKEN` | Events API token from https://chaturbate.com/statsapi/authtoken/ |
| `CHATURBATE_STATS_TOKEN` | Stats API token |
| `STATBATE_API_TOKEN` | Statbate API authentication token |
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for S3 |
| `AWS_REGION` | AWS region (e.g., `us-east-2`) |
| `S3_BUCKET_NAME` | S3 bucket for media storage |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `OPENAI_MODEL` | Model to use (e.g., `gpt-4.1-mini`) |
| `OPENAI_MAX_TOKENS` | Max tokens per request |

### Worker Service Only

| Variable | Description |
|----------|-------------|
| `RUN_MODE` | Set to `worker` |

All other variables are the same as the web service.

## Docker Configuration

Both web and worker services use Docker runtime (`runtime: docker`) because:
- Puppeteer requires Chromium for browser automation
- Alpine Linux provides a minimal footprint

### Dockerfile.web

Uses `node:20-alpine` with Chromium and PostgreSQL client installed.

### Dockerfile.worker

Uses `node:20-alpine` without Chromium (worker doesn't need browser automation).

## Database

- **Plan**: Basic 256MB
- **Region**: Oregon (us-west-2)
- **Connection**: Use internal URL for services, external URL for migrations

### Running Migrations

Migrations run automatically on server startup. To run manually:

```bash
# Connect to the database
psql $DATABASE_URL

# Or use Render CLI
render shell --service mhc-control-panel-web
npm run migrate
```

## Deployment Process

### Automatic Deploys

All services are configured for automatic deployment on push to `main` branch.

### Manual Deploy

```bash
# Using Render CLI
render deploys create --service mhc-control-panel-web
render deploys create --service mhc-control-panel-worker
render deploys create --service mhc-control-panel-frontend
```

### Checking Status

```bash
# List services
render services list

# View logs
render logs -r srv-XXXXX --tail

# Check deploy status
render deploys list --service mhc-control-panel-web
```

## Troubleshooting

### Service Won't Start

1. Check logs: `render logs -r <service-id> --limit 100`
2. Verify environment variables are set
3. Check database connectivity

### 502 Bad Gateway

Usually indicates the service is still starting or crashed. Check logs for:
- Environment validation errors
- Database connection issues
- Port binding problems

### Database Connection Issues

- Ensure `DATABASE_URL` uses the **internal** connection string
- Format: `postgresql://user:pass@host/database` (no `?sslmode=require` needed internally)

## Costs

Current configuration (as of January 2026):

| Resource | Plan | Monthly Cost |
|----------|------|--------------|
| Web Service | Starter | $7 |
| Worker Service | Starter | $7 |
| Frontend | Free | $0 |
| Database | Basic 256MB | $7 |
| **Total** | | **~$21/month** |

## Backups

Database backups are configured with GFS (Grandfather-Father-Son) rotation:
- Hourly: Keep last 24
- Daily: Keep last 7
- Weekly: Keep last 4
- Monthly: Keep last 12
- Yearly: Keep forever

Backups are stored in S3 under `mhc/db-export/`.

## Security Notes

1. All environment variables with secrets are marked `sync: false` in render.yaml
2. Database IP access is restricted (configure in Render dashboard)
3. HTTPS is enforced on all services
4. API tokens should be rotated periodically
