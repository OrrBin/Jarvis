#!/bin/bash

# WhatsApp Actions MCP Server Starter
# This script starts the WhatsApp Actions MCP server with message sending capabilities

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 WhatsApp Actions MCP Server${NC}"
echo -e "${BLUE}=================================${NC}"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed or not in PATH${NC}"
    exit 1
fi

# Check if the MCP server script exists
if [ ! -f "src/mcp-server-actions.js" ]; then
    echo -e "${RED}❌ WhatsApp Actions MCP server script not found at src/mcp-server-actions.js${NC}"
    exit 1
fi

# Check if required dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Node modules not found. Installing dependencies...${NC}"
    npm install
fi

echo -e "${YELLOW}📋 Server Information:${NC}"
echo -e "  Server Name: whatsapp-actions"
echo -e "  Version: 1.0.0"
echo -e "  Features: Read messages, send messages, mark as read, live indexing"
echo -e "  Hebrew Support: Enabled"
echo -e "  Transport: stdio"
echo ""

echo -e "${YELLOW}🔧 Capabilities:${NC}"
echo -e "  • Get latest messages from all chats or specific chat"
echo -e "  • Send messages to contacts and groups"
echo -e "  • Search messages with natural language queries"
echo -e "  • List all available chats"
echo -e "  • Get detailed chat information"
echo -e "  • Mark chats as read"
echo -e "  • Real-time message indexing"
echo ""

echo -e "${YELLOW}📱 WhatsApp Setup:${NC}"
echo -e "  • The server will initialize a WhatsApp Web client"
echo -e "  • You may need to scan a QR code on first run"
echo -e "  • Messages will be automatically indexed as they arrive"
echo -e "  • Authentication is saved for future runs"
echo ""

echo -e "${BLUE}🚀 Starting WhatsApp Actions MCP Server...${NC}"
echo -e "${BLUE}Press Ctrl+C to stop the server${NC}"
echo ""

# Start the MCP server
exec node src/mcp-server-actions-v2.js
