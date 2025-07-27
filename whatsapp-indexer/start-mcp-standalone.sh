#!/bin/bash

# Start the standalone WhatsApp MCP Server
# This server only reads from the database/vector store and doesn't connect to WhatsApp

echo "🚀 Starting WhatsApp MCP Server (Standalone)..."
echo "📝 This server only reads from the indexed data and doesn't connect to WhatsApp"
echo "🔄 Make sure the WhatsApp Listener Service is running separately to index new messages"
echo ""

# Set NODE_ENV if not set
export NODE_ENV=${NODE_ENV:-production}

# Start the MCP server
node src/mcp-server-standalone.js
