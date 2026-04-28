#!/bin/bash

# Use system libstdc++ (mise's bundled one lacks GLIBCXX_3.4.29 needed by faiss-node)
export LD_PRELOAD=/usr/lib64/libstdc++.so.6

# WhatsApp Contact Name Fixer
# This script connects to WhatsApp and tries to resolve phone numbers to contact names

echo "🔧 WhatsApp Contact Name Fixer"
echo "================================"
echo ""
echo "This script will:"
echo "1. Connect to WhatsApp Web"
echo "2. Find all chat entries that are phone numbers"
echo "3. Try to resolve them to proper contact names"
echo "4. Update the database with the resolved names"
echo ""
echo "⚠️  Make sure your WhatsApp listener service is NOT running"
echo "   (only one WhatsApp connection is allowed at a time)"
echo ""

# Check if listener is running
if pgrep -f "whatsapp-listener.js" > /dev/null; then
    echo "❌ WhatsApp listener service is running!"
    echo "   Please stop it first with: pkill -f whatsapp-listener.js"
    echo "   Or press Ctrl+C in the listener terminal"
    exit 1
fi

read -p "Press Enter to continue or Ctrl+C to cancel..."

echo ""
echo "🚀 Starting contact name fixer..."
echo "📱 You may need to scan the QR code if not already authenticated"
echo ""

node fix-contact-names.js

echo ""
echo "✅ Contact name fixing complete!"
echo "   You can now restart your WhatsApp listener service"
