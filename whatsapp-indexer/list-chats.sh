#!/bin/bash

# WhatsApp Chat Lister Script Runner
# This script provides an easy way to list all your WhatsApp chats

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 WhatsApp Chat Lister${NC}"
echo -e "${BLUE}======================${NC}"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed or not in PATH${NC}"
    exit 1
fi

# Check if the chat lister script exists
if [ ! -f "src/list-chats.js" ]; then
    echo -e "${RED}❌ Chat lister script not found at src/list-chats.js${NC}"
    exit 1
fi

# Default options
GROUPS_ONLY=""
INDIVIDUAL_ONLY=""
LIMIT=""
VERBOSE=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --groups-only)
            GROUPS_ONLY="--groups-only"
            shift
            ;;
        --individual-only)
            INDIVIDUAL_ONLY="--individual-only"
            shift
            ;;
        -l|--limit)
            LIMIT="--limit $2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE="--verbose"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --groups-only                 Show only group chats"
            echo "  --individual-only             Show only individual chats"
            echo "  -l, --limit <number>          Limit number of chats shown (0 = no limit)"
            echo "  -v, --verbose                 Show detailed chat information"
            echo "  -h, --help                    Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                            # List all chats"
            echo "  $0 --groups-only --verbose    # Show only groups with details"
            echo "  $0 --limit 20                 # Show top 20 most recent chats"
            echo "  $0 --individual-only          # Show only individual chats"
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
if [ -n "$GROUPS_ONLY" ]; then
    echo -e "  Filter: ${GREEN}Groups only${NC}"
elif [ -n "$INDIVIDUAL_ONLY" ]; then
    echo -e "  Filter: ${GREEN}Individual chats only${NC}"
else
    echo -e "  Filter: ${GREEN}All chats${NC}"
fi

if [ -n "$LIMIT" ]; then
    echo -e "  Limit: ${LIMIT#--limit }"
else
    echo -e "  Limit: ${GREEN}No limit${NC}"
fi

if [ -n "$VERBOSE" ]; then
    echo -e "  Verbose: ${GREEN}ON${NC}"
else
    echo -e "  Verbose: ${GREEN}OFF${NC}"
fi

echo ""

# Build the command
CMD="node src/list-chats.js $GROUPS_ONLY $INDIVIDUAL_ONLY $LIMIT $VERBOSE"

echo -e "${BLUE}🚀 Listing chats...${NC}"
echo -e "${BLUE}Command: $CMD${NC}"
echo ""

# Run the chat lister
if eval $CMD; then
    echo ""
    echo -e "${GREEN}✅ Chat listing completed successfully!${NC}"
    echo ""
    echo -e "${YELLOW}💡 Next steps:${NC}"
    echo -e "  • Copy chat names or IDs from the list above"
    echo -e "  • Use them in backfill commands:"
    echo -e "    ${BLUE}./start-backfill.sh --chat \"Chat Name\" --days 7${NC}"
    echo -e "    ${BLUE}./start-backfill.sh --exclude \"Noisy Group\" --days 30${NC}"
else
    echo ""
    echo -e "${RED}❌ Chat listing failed!${NC}"
    exit 1
fi
