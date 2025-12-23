#!/bin/bash

# Deploy MHC Control Panel from Refineo Docker Registry
# Usage: ./scripts/deploy.sh [--build]
# Options:
#   --build   Build images locally instead of pulling from registry

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== MHC Control Panel - Deployment ===${NC}"
echo ""

# Check for .env file
if [ ! -f .env ]; then
  echo -e "${RED}ERROR: .env file not found${NC}"
  echo "Please create .env file with required variables. See .env.example"
  exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"

# Parse arguments
BUILD_LOCAL=false
if [ "$1" == "--build" ]; then
  BUILD_LOCAL=true
  echo -e "${YELLOW}Mode: Local Build${NC}"
else
  echo -e "${YELLOW}Mode: Pull from Registry${NC}"
fi
echo ""

# Stop existing containers
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker-compose down || true
echo -e "${GREEN}✓ Containers stopped${NC}"
echo ""

if [ "$BUILD_LOCAL" = true ]; then
  # Build locally with no cache to ensure fresh build
  echo -e "${YELLOW}Building images locally (no cache)...${NC}"
  docker-compose build --no-cache web worker frontend
  echo -e "${GREEN}✓ Images built${NC}"
else
  # Pull from registry
  echo -e "${YELLOW}Pulling images from Refineo registry...${NC}"
  docker-compose pull web worker frontend
  echo -e "${GREEN}✓ Images pulled${NC}"
fi
echo ""

# Start services
echo -e "${YELLOW}Starting services...${NC}"
docker-compose up -d
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 5

# Check service status
echo ""
echo -e "${BLUE}Service Status:${NC}"
docker-compose ps

# Check database health
echo ""
echo -e "${YELLOW}Checking database health...${NC}"
if docker-compose exec -T db pg_isready -U mhc_user -d mhc_control_panel > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Database is healthy${NC}"
else
  echo -e "${RED}✗ Database is not ready${NC}"
fi

# Test web service
echo ""
echo -e "${YELLOW}Testing web service...${NC}"
sleep 2
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Web service is responding${NC}"
else
  echo -e "${RED}✗ Web service is not responding${NC}"
  echo "Checking logs..."
  docker-compose logs --tail=20 web
fi

# Test frontend
echo ""
echo -e "${YELLOW}Testing frontend...${NC}"
if curl -s http://localhost:8080 > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Frontend is responding${NC}"
else
  echo -e "${RED}✗ Frontend is not responding${NC}"
fi

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Services:"
echo "  - Frontend: http://localhost:8080"
echo "  - API: http://localhost:3000"
echo "  - Database: localhost:5432"
echo ""
echo "Useful commands:"
echo "  - View logs: docker-compose logs -f [service]"
echo "  - Restart service: docker-compose restart [service]"
echo "  - Stop all: docker-compose down"
echo "  - Enter container: docker-compose exec [service] sh"
