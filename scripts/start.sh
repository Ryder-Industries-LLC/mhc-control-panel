#!/bin/bash
# Start MHC Control Panel with optional SSD storage
#
# Usage:
#   ./scripts/start.sh          # Start without SSD
#   ./scripts/start.sh --ssd    # Start with SSD storage enabled
#   ./scripts/start.sh --check  # Check if SSD is available

set -e
cd "$(dirname "$0")/.."

SSD_PATH="/Volumes/Imago/MHC-Control_Panel/media"

check_ssd() {
    if [ -d "$SSD_PATH" ] && [ -w "$SSD_PATH" ]; then
        echo "✓ SSD available and writable at $SSD_PATH"
        return 0
    else
        echo "✗ SSD not available at $SSD_PATH"
        return 1
    fi
}

case "$1" in
    --check)
        check_ssd
        ;;
    --ssd)
        if check_ssd; then
            echo "Starting with SSD storage..."
            docker-compose -f docker-compose.yml -f docker-compose.ssd.yml up -d
        else
            echo "Error: SSD not available. Start without --ssd or mount your SSD."
            exit 1
        fi
        ;;
    --stop)
        echo "Stopping containers..."
        docker-compose down
        ;;
    *)
        echo "Starting without SSD storage..."
        docker-compose up -d
        ;;
esac
