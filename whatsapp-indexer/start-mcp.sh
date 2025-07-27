#!/bin/bash

# WhatsApp Indexer MCP Server Startup Script
cd "$(dirname "$0")"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Start the MCP server
exec node src/mcp-server.js
