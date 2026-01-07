# Docker Migration to Refineo Account

## Overview
This guide outlines the process to migrate MHC Control Panel Docker images from local builds to the Refineo Docker Hub account.

## Current Setup
- Images are built locally using `docker-compose build`
- No image registry is currently configured
- Services: web, worker, frontend, db (PostgreSQL from Docker Hub)

## Migration Steps

### 1. Docker Hub Setup
Ensure you have access to the Refineo Docker Hub account:
```bash
docker login
# Username: refineo (or your Refineo account name)
# Password: [your Docker Hub token]
```

### 2. Build and Tag Images

Build all images with Refineo tags:
```bash
# Build web service
docker build -f Dockerfile.web -t refineo/mhc-web:latest -t refineo/mhc-web:v1.0.0 .

# Build worker service
docker build -f Dockerfile.worker -t refineo/mhc-worker:latest -t refineo/mhc-worker:v1.0.0 .

# Build frontend service
docker build -f client/Dockerfile -t refineo/mhc-frontend:latest -t refineo/mhc-frontend:v1.0.0 \
  --build-arg REACT_APP_API_URL=http://localhost:3000 ./client
```

### 3. Push Images to Docker Hub

Push all images to the Refineo account:
```bash
# Push web images
docker push refineo/mhc-web:latest
docker push refineo/mhc-web:v1.0.0

# Push worker images
docker push refineo/mhc-worker:latest
docker push refineo/mhc-worker:v1.0.0

# Push frontend images
docker push refineo/mhc-frontend:latest
docker push refineo/mhc-frontend:v1.0.0
```

### 4. Update docker-compose.yml

The docker-compose.yml has been updated to support both local builds and registry pulls. You can now choose:

**Option A: Use pre-built images from Refineo (recommended for production)**
```bash
docker-compose pull
docker-compose up -d
```

**Option B: Build locally (for development)**
```bash
docker-compose build
docker-compose up -d
```

### 5. Verify Deployment

After pulling/building and starting services:
```bash
# Check all services are running
docker-compose ps

# Check logs
docker-compose logs -f web
docker-compose logs -f worker
docker-compose logs -f frontend

# Test the application
curl http://localhost:3000/health
curl http://localhost:8080
```

## Image Naming Convention

- **Repository**: refineo/mhc-{service}
- **Tags**:
  - `latest` - Most recent stable build
  - `v{major}.{minor}.{patch}` - Semantic versioning (e.g., v1.0.0)
  - `{git-sha}` - Optional: Tag with git commit SHA for traceability

## Update Process

When deploying updates:

1. Build new images with version tags:
```bash
docker build -f Dockerfile.web -t refineo/mhc-web:latest -t refineo/mhc-web:v1.1.0 .
```

2. Push to Docker Hub:
```bash
docker push refineo/mhc-web:latest
docker push refineo/mhc-web:v1.1.0
```

3. Update on server:
```bash
docker-compose pull
docker-compose up -d
```

## CI/CD Integration (Future)

For automated builds and deployments:

```yaml
# Example GitHub Actions workflow
name: Build and Push Docker Images

on:
  push:
    branches: [main]
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_TOKEN }}

      - name: Build and push web
        uses: docker/build-push-action@v4
        with:
          context: .
          file: Dockerfile.web
          push: true
          tags: |
            refineo/mhc-web:latest
            refineo/mhc-web:${{ github.sha }}
```

## Environment Variables

Make sure your `.env` file is configured on the deployment server:
```env
CHATURBATE_USERNAME=your_username
CHATURBATE_STATS_TOKEN=your_stats_token
CHATURBATE_EVENTS_TOKEN=your_events_token
STATBATE_API_TOKEN=your_api_token
STATBATE_PLUS_SESSION_COOKIE=your_session_cookie
STATBATE_PLUS_XSRF_TOKEN=your_xsrf_token
```

## Troubleshooting

**Images not found:**
```bash
# Ensure you're logged in
docker login

# Pull specific version
docker pull refineo/mhc-web:v1.0.0
```

**Build args not working:**
```bash
# Frontend requires API URL build arg
docker build -f client/Dockerfile \
  --build-arg REACT_APP_API_URL=http://your-api-url:3000 \
  -t refineo/mhc-frontend:latest ./client
```

**Permission issues:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

## Rollback

If you need to rollback to a previous version:
```bash
# Pull specific version
docker-compose pull
docker tag refineo/mhc-web:v1.0.0 refineo/mhc-web:latest

# Restart services
docker-compose up -d
```

## Storage Cleanup

Periodically clean up old images:
```bash
# Remove unused images
docker image prune -a

# Remove old versions (keep last 3)
docker images refineo/mhc-web --format "{{.Repository}}:{{.Tag}}" | tail -n +4 | xargs docker rmi
```
