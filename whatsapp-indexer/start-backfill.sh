#!/bin/bash

# WhatsApp Message Backfill Script Runner
# This script provides an easy way to run the backfill script with common options

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 WhatsApp Message Backfill Script${NC}"
echo -e "${BLUE}====================================${NC}"

# Use system libstdc++ (mise's bundled one lacks GLIBCXX_3.4.29 needed by faiss-node)
export LD_PRELOAD=/usr/lib64/libstdc++.so.6

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed or not in PATH${NC}"
    exit 1
fi

# Check if the listener is already running (can't share Chromium session simultaneously)
if pgrep -f "whatsapp-listener.js" > /dev/null 2>&1; then
    echo -e "${RED}❌ WhatsApp listener is currently running.${NC}"
    echo -e "${YELLOW}Stop it first (pkill -f whatsapp-listener.js) — they share the same session.${NC}"
    exit 1
fi

# Check if the backfill script exists
if [ ! -f "src/backfill-script.js" ]; then
    echo -e "${RED}❌ Backfill script not found at src/backfill-script.js${NC}"
    exit 1
fi

# Default options
DAYS=7
DRY_RUN=""
VERBOSE=""
FORCE=""
SPECIFIC_CHATS=""
EXCLUDE_CHATS=""
MAX_MESSAGES=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--days)
            DAYS="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        -v|--verbose)
            VERBOSE="--verbose"
            shift
            ;;
        -f|--force)
            FORCE="--force"
            shift
            ;;
        -c|--chat)
            SPECIFIC_CHATS="$SPECIFIC_CHATS --chat $2"
            shift 2
            ;;
        -e|--exclude)
            EXCLUDE_CHATS="$EXCLUDE_CHATS --exclude $2"
            shift 2
            ;;
        -m|--max-messages)
            MAX_MESSAGES="--max-messages $2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -d, --days <number>           Number of days back to fetch (default: 7)"
            echo "  -m, --max-messages <number>   Max messages per chat (default: 1000)"
            echo "  -c, --chat <name>             Specific chat to process (can be used multiple times)"
            echo "  -e, --exclude <name>          Chat to exclude (can be used multiple times)"
            echo "  --dry-run                     Don't save messages, just show what would be done"
            echo "  -v, --verbose                 Show detailed progress"
            echo "  -f, --force                   Process chats even if they have existing messages"
            echo "  -h, --help                    Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                    # Backfill last 7 days"
            echo "  $0 --days 30 --dry-run              # Dry run for 30 days"
            echo "  $0 --chat \"Family Group\" --days 14   # Specific chat only"
            echo "  $0 --exclude \"Work\" --days 7         # Exclude work chats"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Show configuration
echo -e "${YELLOW}📋 Configuration:${NC}"
echo -e "  Days back: ${DAYS}"
if [ -n "$DRY_RUN" ]; then
    echo -e "  Mode: ${YELLOW}DRY RUN${NC} (no messages will be saved)"
else
    echo -e "  Mode: ${GREEN}LIVE${NC} (messages will be saved)"
fi
if [ -n "$VERBOSE" ]; then
    echo -e "  Verbose: ${GREEN}ON${NC}"
fi
if [ -n "$FORCE" ]; then
    echo -e "  Force: ${GREEN}ON${NC}"
fi
if [ -n "$SPECIFIC_CHATS" ]; then
    echo -e "  Specific chats: ${SPECIFIC_CHATS#--chat }"
fi
if [ -n "$EXCLUDE_CHATS" ]; then
    echo -e "  Excluded chats: ${EXCLUDE_CHATS#--exclude }"
fi
if [ -n "$MAX_MESSAGES" ]; then
    echo -e "  Max messages per chat: ${MAX_MESSAGES#--max-messages }"
fi

echo ""

# Confirm before running (unless dry run)
if [ -z "$DRY_RUN" ]; then
    echo -e "${YELLOW}⚠️  This will modify your message database.${NC}"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🛑 Cancelled by user${NC}"
        exit 0
    fi
fi

# Build the command
CMD="node src/backfill-script.js --days $DAYS $DRY_RUN $VERBOSE $FORCE $SPECIFIC_CHATS $EXCLUDE_CHATS $MAX_MESSAGES"

echo -e "${BLUE}🚀 Starting backfill...${NC}"
echo -e "${BLUE}Command: $CMD${NC}"
echo ""

# Run the backfill script
if eval $CMD; then
    echo ""
    echo -e "${GREEN}✅ Backfill completed successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Backfill failed!${NC}"
    exit 1
fi
