#!/bin/bash

# Start the WhatsApp Listener Service
# This service connects to WhatsApp, receives messages, and updates the index

echo "🚀 Starting WhatsApp Listener Service..."
echo "📱 This service will connect to WhatsApp and index new messages"
echo "🔍 The MCP server can be run separately to query the indexed data"
echo ""

# Set NODE_ENV if not set
export NODE_ENV=${NODE_ENV:-production}

# Use Playwright's arm64 Chromium (Puppeteer doesn't ship arm64 Linux builds)
export PUPPETEER_EXECUTABLE_PATH=${PUPPETEER_EXECUTABLE_PATH:-/home/orrb/.cache/ms-playwright/chromium-1217/chrome-linux/chrome}

# Start the listener service
node src/whatsapp-listener.js
