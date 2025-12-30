# Running MHC Control Panel with Docker

This guide explains how to run the entire MHC Control Panel stack locally using Docker.

## What Gets Deployed

Docker Compose will start 4 services:

1. **PostgreSQL Database** (`db`) - Port 5432
2. **Backend Web Server** (`web`) - Port 3000
3. **Background Worker** (`worker`) - Listens to Chaturbate Events API
4. **React Frontend** (`frontend`) - Port 8080

## Prerequisites

- Docker Desktop installed ([download here](https://www.docker.com/products/docker-desktop))
- Your API tokens from Chaturbate and Statbate

## Quick Start

### 1. Create .env file

Copy the example and fill in your tokens:

```bash
cp .env.example .env
```

Edit `.env` and set your actual values:

```env
CHATURBATE_USERNAME=hudson_cage
CHATURBATE_EVENTS_TOKEN=your_actual_events_token
CHATURBATE_STATS_TOKEN=your_actual_stats_token
STATBATE_API_TOKEN=your_actual_statbate_token
```

### 2. Start all services

```bash
docker-compose up -d
```

This will:
- Build all Docker images (first time only, takes ~5 minutes)
- Start PostgreSQL and wait for it to be healthy
- Run database migrations
- Start the web server, worker, and frontend

### 3. Access the application

- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3000
- **Database**: localhost:5432

### 4. View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f web
docker-compose logs -f worker
docker-compose logs -f frontend
```

## Common Commands

### Stop all services
```bash
docker-compose down
```

### Stop and remove all data (including database)
```bash
docker-compose down -v
```

### Rebuild after code changes
```bash
docker-compose up -d --build
```

### Restart a specific service
```bash
docker-compose restart web
docker-compose restart worker
```

### Run database migrations manually
```bash
docker-compose exec web npm run migrate
```

### Access PostgreSQL database
```bash
docker-compose exec db psql -U mhc_user -d mhc_control_panel
```

### View container status
```bash
docker-compose ps
```

## Troubleshooting

### Database connection errors

If you see "database connection failed":
```bash
# Check if database is healthy
docker-compose ps

# View database logs
docker-compose logs db

# Restart database
docker-compose restart db
```

### Web server won't start

```bash
# Check logs for specific error
docker-compose logs web

# Common issue: migrations failed
docker-compose exec web npm run migrate

# Rebuild if needed
docker-compose up -d --build web
```

### Worker not receiving events

```bash
# Check worker logs
docker-compose logs -f worker

# Verify CHATURBATE_EVENTS_TOKEN is set correctly
docker-compose exec worker env | grep CHATURBATE

# Restart worker
docker-compose restart worker
```

### Frontend shows "API connection failed"

The frontend expects the backend at `http://localhost:3000`. If you need to change this:

1. Edit `docker-compose.yml` frontend service:
   ```yaml
   args:
     REACT_APP_API_URL: http://your-backend-url
   ```
2. Rebuild: `docker-compose up -d --build frontend`

## Development Workflow

### Option 1: Full Docker Stack (recommended for testing)
```bash
docker-compose up -d
# Edit code
docker-compose up -d --build
```

### Option 2: Hybrid (database in Docker, code running locally)
```bash
# Start only database
docker-compose up -d db

# Run backend locally
cd server
npm install
npm run migrate
npm run dev

# Run frontend locally
cd client
npm install
npm start
```

## Data Persistence

The PostgreSQL database stores data in a Docker volume named `postgres_data`. This persists even when you stop containers.

To completely reset:
```bash
docker-compose down -v  # Removes volumes
docker-compose up -d    # Fresh start
```

## Production Considerations

This Docker setup is optimized for local development. For production:

1. **Use environment-specific secrets** - Don't commit `.env` to git
2. **Configure proper backups** - Set up PostgreSQL backup strategy
3. **Use managed database** - Consider using Render's PostgreSQL instead
4. **Monitor resources** - Set memory/CPU limits in docker-compose.yml
5. **Use reverse proxy** - Add nginx/traefik for HTTPS and load balancing

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                  Your Computer                   │
│                                                  │
│  ┌──────────────┐         ┌─────────────────┐   │
│  │   Frontend   │────────▶│   Web Server    │   │
│  │ (React:8080) │         │  (Express:3000) │   │
│  └──────────────┘         └─────────────────┘   │
│                                    │             │
│                                    ▼             │
│  ┌──────────────┐         ┌─────────────────┐   │
│  │    Worker    │────────▶│   PostgreSQL    │   │
│  │ (Events API) │         │    (:5432)      │   │
│  └──────────────┘         └─────────────────┘   │
│         │                                        │
│         ▼                                        │
│  Chaturbate Events API                          │
└─────────────────────────────────────────────────┘
```

## Monitoring

### Check service health
```bash
docker-compose ps
```

### Resource usage
```bash
docker stats
```

### Database size
```bash
docker-compose exec db psql -U mhc_user -d mhc_control_panel -c "\l+"
```

## Backup and Restore

### Backup database
```bash
docker-compose exec db pg_dump -U mhc_user mhc_control_panel > backup.sql
```

### Restore database
```bash
cat backup.sql | docker-compose exec -T db psql -U mhc_user -d mhc_control_panel
```

## Next Steps

1. ✅ Start services: `docker-compose up -d`
2. ✅ Check logs: `docker-compose logs -f`
3. ✅ Open frontend: http://localhost:8080
4. ✅ Test Hudson dashboard: http://localhost:8080/hudson
5. ✅ Verify worker is listening to events: `docker-compose logs -f worker`
