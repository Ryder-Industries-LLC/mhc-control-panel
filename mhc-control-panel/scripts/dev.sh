#!/bin/bash

# Development mode startup for MHC Control Panel
# This uses docker-compose.dev.yml for live reload during development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== MHC Control Panel - Development Mode ===${NC}"
echo ""

# Check for .env file
if [ ! -f .env ]; then
  echo -e "${RED}ERROR: .env file not found${NC}"
  echo "Please create .env file with required variables. See .env.example"
  exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"
echo ""

# Stop existing containers
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down || true
echo -e "${GREEN}✓ Containers stopped${NC}"
echo ""

# Build images (only needs to be done once or when dependencies change)
echo -e "${YELLOW}Building development images...${NC}"
echo -e "${BLUE}Note: This installs dependencies. Only rebuilds if package.json changes.${NC}"
docker-compose -f docker-compose.yml -f docker-compose.dev.yml build
echo -e "${GREEN}✓ Images built${NC}"
echo ""

# Start services in development mode
echo -e "${YELLOW}Starting services in development mode...${NC}"
echo -e "${BLUE}Your code changes will be watched and auto-reload!${NC}"
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 5

# Check service status
echo ""
echo -e "${BLUE}Service Status:${NC}"
docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps

# Check database health
echo ""
echo -e "${YELLOW}Checking database health...${NC}"
if docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec -T db pg_isready -U mhc_user -d mhc_control_panel > /dev/null 2>&1; then
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
  docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs --tail=20 web
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
echo -e "${GREEN}=== Development Mode Active ===${NC}"
echo ""
echo "Services:"
echo "  - Frontend: http://localhost:8080"
echo "  - API: http://localhost:3000"
echo "  - Database: localhost:5432"
echo ""
echo -e "${BLUE}📝 Your code changes will automatically reload!${NC}"
echo ""
echo "Useful commands:"
echo "  - View logs: docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f [service]"
echo "  - Restart service: docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart [service]"
echo "  - Stop all: docker-compose -f docker-compose.yml -f docker-compose.dev.yml down"
echo "  - Enter container: docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec [service] sh"
echo ""
echo -e "${YELLOW}💡 Tip: Use './scripts/deploy.sh --build' for production-like builds${NC}"
