# Development Workflow

## Understanding Docker Volume Mounts

You asked great questions about the volume mount confusion. Here's the explanation:

### What Was Happening

The `:ro` (read-only) flag on volume mounts means:
- The **container** can't modify files on your host machine
- But the container **CAN** see changes you make on your host

### The Problem with `/app/dist`

When we had this in docker-compose.yml:
```yaml
volumes:
  - ./server:/app/server:ro  # Mount source code
  - /app/dist                 # Anonymous volume - THIS WAS THE PROBLEM
```

The issue was:
1. During `docker build`, TypeScript compiles your code and puts JavaScript in `/app/dist` **inside the Docker image**
2. The anonymous volume `/app/dist` creates an **empty overlay** that hides the compiled code
3. When Node tries to run `node dist/index.js`, it finds nothing there!

### The Solution

We now use two different setups:

## Development Mode (What You Use Daily)

Use the development script:
```bash
./scripts/dev.sh
```

This runs:
- **Web & Worker**: `tsx watch` - Automatically recompiles TypeScript when you save files
- **Frontend**: Serves pre-built static files via nginx
- **Volume mounts**: Your server source code is mounted so changes are picked up instantly
- **No `/app/dist` volume**: tsx compiles directly from source, no need for dist folder

### Making Code Changes in Development

**Backend (server/src/):**
1. Edit any file in `server/src/`
2. Save the file
3. The service automatically reloads via `tsx watch` (you'll see it in logs)
4. No rebuild needed!

**Frontend (client/src/):**
The frontend container serves pre-built static files. For frontend development with hot reload:
1. Open a separate terminal and run: `cd client && npm start`
2. This starts React's dev server on http://localhost:3001 with hot reload
3. Edit files in `client/src/` and see changes instantly
4. When ready to deploy changes: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml build frontend && docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart frontend`

### Viewing Logs

```bash
# All services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Just web server
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f web

# Just worker
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f worker
```

### Stopping Development

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Production-Like Builds

Use the deployment script when you want to test a full build:
```bash
./scripts/deploy.sh --build
```

This:
- Builds fresh Docker images with `--no-cache`
- Compiles TypeScript during build
- Runs compiled JavaScript (not tsx watch)
- No volume mounts - uses code baked into image
- **Use this when you want to ensure everything compiles correctly**

## When to Rebuild

### Don't Need to Rebuild:
- Changing code in `server/src/` or `client/src/` (just save, it auto-reloads)
- Tweaking logic, fixing bugs, adding features

### Need to Rebuild:
- Changing `package.json` (adding/removing dependencies)
- Changing `Dockerfile.*` files
- Changing `docker-compose*.yml` files
- Want to test that everything compiles cleanly

## Quick Reference

| Task | Command |
|------|---------|
| Start development | `./scripts/dev.sh` |
| Stop services | `docker-compose -f docker-compose.yml -f docker-compose.dev.yml down` |
| View logs | `docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f [service]` |
| Test production build | `./scripts/deploy.sh --build` |
| Rebuild after package.json change | `docker-compose -f docker-compose.yml -f docker-compose.dev.yml build` |

## The Answer to Your Questions

**Q: I thought we were only doing development since it's just me?**
A: Correct! Use `./scripts/dev.sh` for daily work. The `./scripts/deploy.sh` is for when you want to test a clean production-like build.

**Q: If they are read-only mounts how would that provide hot-reload?**
A: Read-only means the *container* can't write to *your host*, but it **can** see your changes. The confusion was the `/app/dist` anonymous volume hiding compiled code. Now we use `tsx watch` which compiles on-the-fly from your mounted source code directly - no dist folder needed in dev mode!
