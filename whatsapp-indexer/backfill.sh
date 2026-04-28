#!/bin/bash

# WhatsApp Backfill via Listener API
# Calls the running listener's /backfill endpoint — no separate Chromium needed

set -e

PORT=${WHATSAPP_API_PORT:-3001}
BASE_URL="http://localhost:$PORT"

# Check listener is running
if ! curl -s "$BASE_URL/status" > /dev/null 2>&1; then
    echo "❌ WhatsApp listener is not running on port $PORT"
    echo "Start it first: ./start-listener.sh"
    exit 1
fi

# Default options
DAYS=7
DRY_RUN=false
FORCE=false
CHATS=""
EXCLUDE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--days) DAYS="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        -f|--force) FORCE=true; shift ;;
        -c|--chat) CHATS="${CHATS:+$CHATS,}\"$2\""; shift 2 ;;
        -e|--exclude) EXCLUDE="${EXCLUDE:+$EXCLUDE,}\"$2\""; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "  -d, --days <n>      Days back (default: 7)"
            echo "  -c, --chat <name>   Specific chat (repeatable)"
            echo "  -e, --exclude <name> Exclude chat (repeatable)"
            echo "  --dry-run           Don't save, just log"
            echo "  -f, --force         Re-process existing chats"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Build JSON body
BODY="{\"days\":$DAYS,\"dryRun\":$DRY_RUN,\"force\":$FORCE"
[ -n "$CHATS" ] && BODY="$BODY,\"chats\":[$CHATS]"
[ -n "$EXCLUDE" ] && BODY="$BODY,\"exclude\":[$EXCLUDE]"
BODY="$BODY}"

echo "🚀 Starting backfill ($DAYS days back, dryRun=$DRY_RUN)"
RESPONSE=$(curl -s -X POST "$BASE_URL/backfill" -H "Content-Type: application/json" -d "$BODY")
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""
echo "📋 Backfill running in background. Check listener logs for progress."
