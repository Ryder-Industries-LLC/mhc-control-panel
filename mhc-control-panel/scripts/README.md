# MHC Control Panel - Deployment Scripts

This directory contains scripts for building, deploying, and managing the MHC Control Panel Docker infrastructure.

## Scripts Overview

### `build-and-push.sh`
Builds all Docker images and pushes them to the Refineo Docker Hub account.

**Usage:**
```bash
# Build and push with 'latest' tag
./scripts/build-and-push.sh

# Build and push with specific version
./scripts/build-and-push.sh v1.0.0

# Build and push with git commit SHA
./scripts/build-and-push.sh $(git rev-parse --short HEAD)
```

**Prerequisites:**
- Docker installed and running
- Logged in to Docker Hub: `docker login`
- Write access to the refineo Docker Hub organization

**What it does:**
1. Verifies Docker Hub authentication
2. Builds three images: web, worker, frontend
3. Tags each image with both `latest` and the specified version
4. Pushes all images to Docker Hub registry

### `deploy.sh`
Deploys the MHC Control Panel using Docker Compose.

**Usage:**
```bash
# Deploy using images from registry (production)
./scripts/deploy.sh

# Deploy using local builds (development)
./scripts/deploy.sh --build
```

**Prerequisites:**
- Docker and Docker Compose installed
- `.env` file configured (see `.env.example`)
- For registry deployment: Images must be available on Docker Hub

**What it does:**
1. Validates `.env` file exists
2. Stops existing containers
3. Pulls images from registry OR builds locally
4. Starts all services
5. Runs health checks
6. Displays service status

## Workflow Examples

### Initial Setup on New Server

```bash
# 1. Clone repository
git clone <repository-url>
cd mhc-control-panel

# 2. Create .env file
cp .env.example .env
nano .env  # Edit with your credentials

# 3. Deploy
./scripts/deploy.sh
```

### Development Workflow

```bash
# Make code changes
# ...

# Build and test locally
./scripts/deploy.sh --build

# When ready to release:
./scripts/build-and-push.sh v1.1.0

# Deploy on production server
ssh user@production-server
cd mhc-control-panel
git pull
./scripts/deploy.sh
```

### Production Deployment

```bash
# On your local machine - build and publish
git tag v1.2.0
./scripts/build-and-push.sh v1.2.0

# On production server - deploy
ssh user@production-server
cd mhc-control-panel
./scripts/deploy.sh
```

## Manual Docker Commands

If you prefer manual control:

### Build Images
```bash
# Web service
docker build -f Dockerfile.web -t refineo/mhc-web:latest .

# Worker service
docker build -f Dockerfile.worker -t refineo/mhc-worker:latest .

# Frontend service
docker build -f client/Dockerfile -t refineo/mhc-frontend:latest ./client
```

### Push Images
```bash
docker push refineo/mhc-web:latest
docker push refineo/mhc-worker:latest
docker push refineo/mhc-frontend:latest
```

### Deploy
```bash
# Pull images
docker-compose pull

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

## Troubleshooting

### Authentication Issues
```bash
# Check current login
docker info | grep Username

# Login to Docker Hub
docker login
# Username: refineo
# Password: [your Docker Hub access token]
```

### Image Not Found
```bash
# Verify image exists on Docker Hub
docker pull refineo/mhc-web:latest

# Check available tags
# Visit: https://hub.docker.com/r/refineo/mhc-web/tags
```

### Service Won't Start
```bash
# Check logs
docker-compose logs [service-name]

# Common services:
docker-compose logs web
docker-compose logs worker
docker-compose logs frontend
docker-compose logs db

# Restart specific service
docker-compose restart web

# Rebuild specific service
docker-compose up -d --build web
```

### Database Issues
```bash
# Check database health
docker-compose exec db pg_isready -U mhc_user -d mhc_control_panel

# Connect to database
docker-compose exec db psql -U mhc_user -d mhc_control_panel

# View database logs
docker-compose logs db
```

### Port Conflicts
```bash
# Check what's using the port
lsof -i :3000
lsof -i :8080
lsof -i :5432

# Kill the process or change ports in docker-compose.yml
```

## Environment Variables

Required variables in `.env`:

```env
# Chaturbate Credentials
CHATURBATE_USERNAME=your_username
CHATURBATE_STATS_TOKEN=your_stats_token
CHATURBATE_EVENTS_TOKEN=your_events_token

# Statbate API
STATBATE_API_TOKEN=your_api_token

# Optional Statbate Plus (for enhanced features)
STATBATE_PLUS_SESSION_COOKIE=your_session_cookie
STATBATE_PLUS_XSRF_TOKEN=your_xsrf_token
```

## Health Checks

After deployment, verify all services:

```bash
# Web API
curl http://localhost:3000/health

# Frontend
curl http://localhost:8080

# Database
docker-compose exec db pg_isready -U mhc_user

# All services status
docker-compose ps
```

## Logs

View logs for debugging:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f web
docker-compose logs -f worker

# Last N lines
docker-compose logs --tail=100 web

# Since timestamp
docker-compose logs --since="2024-01-01T00:00:00" web
```

## Cleanup

Remove old images and containers:

```bash
# Stop all services
docker-compose down

# Remove volumes (WARNING: deletes database)
docker-compose down -v

# Clean up unused images
docker image prune -a

# Full cleanup
docker system prune -a --volumes
```
