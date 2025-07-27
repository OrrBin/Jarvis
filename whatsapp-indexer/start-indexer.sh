#!/bin/bash

# WhatsApp Indexer Startup Script
echo "🚀 Starting WhatsApp Message Indexer with Local Vector Store..."
echo "📱 Make sure to scan the QR code with your WhatsApp mobile app"
echo "🛑 Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Start the indexer
exec npm start
