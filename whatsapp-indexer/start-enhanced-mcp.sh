#!/bin/bash

echo "🚀 Starting Enhanced WhatsApp MCP Server..."
echo "🧠 This provides enhanced multilingual search capabilities for Amazon Q"
echo "🔍 Features: Hebrew+English support, entity search, enhanced URL context, advanced scheduling detection"
echo ""

# Set NODE_ENV for better error handling
export NODE_ENV=development

# Start the enhanced MCP server
node src/enhanced-mcp-server.js
