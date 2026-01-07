#!/bin/bash
# Start MHC Control Panel with optional SSD storage
#
# Usage:
#   ./scripts/start.sh          # Start without SSD
#   ./scripts/start.sh --ssd    # Start with SSD storage enabled
#   ./scripts/start.sh --check  # Check if SSD is available

set -e
cd "$(dirname "$0")/.."

SSD_REAL_PATH="/Volumes/Imago/MHC-Control_Panel/media"
SSD_SYMLINK="/Users/tracysmith/mhc-ssd-storage"

check_ssd() {
    if [ -d "$SSD_REAL_PATH" ] && [ -w "$SSD_REAL_PATH" ]; then
        # Ensure symlink exists
        if [ ! -L "$SSD_SYMLINK" ]; then
            echo "Creating symlink: $SSD_SYMLINK -> $SSD_REAL_PATH"
            ln -sfn "$SSD_REAL_PATH" "$SSD_SYMLINK"
        fi
        echo "✓ SSD available and writable at $SSD_REAL_PATH"
        echo "  (Docker mount via symlink: $SSD_SYMLINK)"
        return 0
    else
        echo "✗ SSD not available at $SSD_REAL_PATH"
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
