# Quick Reference Card

## Daily Development Workflow

### Starting Development
```bash
./scripts/dev.sh
```
- Frontend: <http://localhost:8080>
- API: <http://localhost:3000>
- Backend hot reload: ✅ Automatic via tsx watch

### Making Backend Changes
1. Edit files in `server/src/`
2. Save
3. Watch logs: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f web`
4. Changes auto-reload - no rebuild needed!

### Making Frontend Changes
```bash
# In separate terminal
cd client
npm start
# Opens http://localhost:3001 with hot reload
```

### Viewing Logs
```bash
# All services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Specific service
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f web
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f worker
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f frontend
```

### Stopping Services
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## When You Need to Rebuild

### After Changing package.json
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml build
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### After Changing Frontend Code (to update Docker container)
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml build frontend
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart frontend
```

### Production-Like Build (clean compile)
```bash
./scripts/deploy.sh --build
```

## Database Operations

### Running Migrations
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec web npm run migrate
```

### Direct Database Access
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec db psql -U mhc_user -d mhc_control_panel
```

## Common Issues

### "Site can't be reached"
- Check service status: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps`
- Check logs: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs frontend`
- Restart services: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart`

### Backend changes not showing
- Verify tsx watch is running: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs web | grep tsx`
- Check for syntax errors in logs
- Restart web service: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart web`

### Frontend not updating
- Frontend serves pre-built static files in Docker
- For development: Run `cd client && npm start` in separate terminal
- To update Docker container: Rebuild frontend (see "When You Need to Rebuild" above)

## Key Files

| File | Purpose |
|------|---------|
| `server/src/app.ts` | Express app setup, routes |
| `server/src/routes/` | API endpoint handlers |
| `client/src/pages/` | React page components |
| `docker-compose.yml` | Production-like service config |
| `docker-compose.dev.yml` | Development overrides (hot reload) |
| `scripts/dev.sh` | Development startup script |
| `scripts/deploy.sh` | Production-like deployment |

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/lookup` | POST | Statbate data lookup |
| `/api/profile/:username` | GET | Merged profile data (all sources) |
| `/api/person` | GET/POST | Person CRUD |
| `/api/session` | GET/POST | Session CRUD |
| `/api/job` | GET/POST/PUT/DELETE | Job configuration |
| `/api/affiliate/online-broadcasters` | GET | Live Affiliate API data |

## Documentation

- [DEVELOPMENT.md](DEVELOPMENT.md) - Full development workflow
- [README.md](README.md) - Project overview
- [SCHEMA.md](SCHEMA.md) - Database schema
- [.env.example](.env.example) - Environment variables

## Support

For issues or questions, see the GitHub repository issues page.
