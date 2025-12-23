#!/bin/bash

# Build and Push Docker Images to Refineo Account
# Usage: ./scripts/build-and-push.sh [version]
# Example: ./scripts/build-and-push.sh v1.0.0

set -e

# Configuration
REGISTRY_USER="refineo"
VERSION="${1:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== MHC Control Panel - Docker Build & Push ===${NC}"
echo -e "Registry: ${YELLOW}${REGISTRY_USER}${NC}"
echo -e "Version: ${YELLOW}${VERSION}${NC}"
echo ""

# Check if logged in to Docker Hub
echo -e "${YELLOW}Checking Docker Hub authentication...${NC}"
if ! docker info | grep -q "Username: ${REGISTRY_USER}"; then
  echo -e "${RED}Not logged in to Docker Hub as ${REGISTRY_USER}${NC}"
  echo "Please run: docker login"
  exit 1
fi
echo -e "${GREEN}✓ Authenticated${NC}"
echo ""

# Build Web Service
echo -e "${YELLOW}Building web service...${NC}"
docker build \
  -f Dockerfile.web \
  -t ${REGISTRY_USER}/mhc-web:latest \
  -t ${REGISTRY_USER}/mhc-web:${VERSION} \
  .
echo -e "${GREEN}✓ Web service built${NC}"
echo ""

# Build Worker Service
echo -e "${YELLOW}Building worker service...${NC}"
docker build \
  -f Dockerfile.worker \
  -t ${REGISTRY_USER}/mhc-worker:latest \
  -t ${REGISTRY_USER}/mhc-worker:${VERSION} \
  .
echo -e "${GREEN}✓ Worker service built${NC}"
echo ""

# Build Frontend Service
echo -e "${YELLOW}Building frontend service...${NC}"
docker build \
  -f client/Dockerfile \
  --build-arg REACT_APP_API_URL=http://localhost:3000 \
  -t ${REGISTRY_USER}/mhc-frontend:latest \
  -t ${REGISTRY_USER}/mhc-frontend:${VERSION} \
  ./client
echo -e "${GREEN}✓ Frontend service built${NC}"
echo ""

# Push images
echo -e "${YELLOW}Pushing images to Docker Hub...${NC}"

echo "Pushing web:latest..."
docker push ${REGISTRY_USER}/mhc-web:latest

echo "Pushing web:${VERSION}..."
docker push ${REGISTRY_USER}/mhc-web:${VERSION}

echo "Pushing worker:latest..."
docker push ${REGISTRY_USER}/mhc-worker:latest

echo "Pushing worker:${VERSION}..."
docker push ${REGISTRY_USER}/mhc-worker:${VERSION}

echo "Pushing frontend:latest..."
docker push ${REGISTRY_USER}/mhc-frontend:latest

echo "Pushing frontend:${VERSION}..."
docker push ${REGISTRY_USER}/mhc-frontend:${VERSION}

echo ""
echo -e "${GREEN}=== Build and Push Complete! ===${NC}"
echo ""
echo "Images published:"
echo "  - ${REGISTRY_USER}/mhc-web:latest"
echo "  - ${REGISTRY_USER}/mhc-web:${VERSION}"
echo "  - ${REGISTRY_USER}/mhc-worker:latest"
echo "  - ${REGISTRY_USER}/mhc-worker:${VERSION}"
echo "  - ${REGISTRY_USER}/mhc-frontend:latest"
echo "  - ${REGISTRY_USER}/mhc-frontend:${VERSION}"
echo ""
echo "To deploy on a server:"
echo "  1. Ensure .env file is configured"
echo "  2. Run: docker-compose pull"
echo "  3. Run: docker-compose up -d"
