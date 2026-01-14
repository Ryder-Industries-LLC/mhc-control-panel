# Runbook

## Overview
Operational procedures for MHC Control Panel.

## Deployment

### Production (Render.com)
```bash
# Automatic deployment via GitHub push to main branch
git push origin main
```

### Local Development
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Rebuild after code changes
docker-compose up -d --build
```

## Database Operations

### Run Migrations
```bash
docker-compose exec web npm run migrate
```

### Access Database Shell
```bash
docker-compose exec db psql -U mhc_user -d mhc_control_panel
```

### Backup Database
```bash
docker-compose exec db pg_dump -U mhc_user mhc_control_panel > backup_$(date +%Y%m%d).sql
```

## Background Jobs

Jobs are managed through the Admin UI at `/admin`.

| Job | Start | Stop |
|-----|-------|------|
| Profile Capture | Admin UI → Jobs → Start | Admin UI → Jobs → Stop |
| Affiliate Polling | Admin UI → Jobs → Start | Admin UI → Jobs → Stop |
| CBHours Polling | Admin UI → Jobs → Start | Admin UI → Jobs → Stop |
| Statbate API | Admin UI → Jobs → Start | Admin UI → Jobs → Stop |

## Troubleshooting

### Service Not Starting
1. Check logs: `docker-compose logs -f [service]`
2. Verify environment variables in `.env`
3. Check database connectivity

### Database Connection Issues
1. Verify `DATABASE_URL` in `.env`
2. Ensure PostgreSQL container is running: `docker-compose ps`
3. Check database logs: `docker-compose logs db`

### API Rate Limits
- Chaturbate Events API: Monitor usage in Admin UI
- Statbate API: Check token validity
- CBHours API: Verify endpoint availability
