#!/bin/bash

# Use system libstdc++ (mise's bundled one lacks GLIBCXX_3.4.29 needed by faiss-node)
export LD_PRELOAD=/usr/lib64/libstdc++.so.6

# Enhanced WhatsApp MCP Server Startup Script
# This version includes Hebrew support and person-specific search

echo "🚀 Starting Enhanced WhatsApp MCP Server..."
echo "📝 Features: Hebrew support, person search, meeting detection"
echo ""

# Check if data directory exists
if [ ! -d "data" ]; then
    echo "❌ Error: data directory not found. Please run the WhatsApp listener first."
    exit 1
fi

# Check if database exists
if [ ! -f "data/messages.db" ]; then
    echo "❌ Error: messages.db not found. Please run the WhatsApp listener first."
    exit 1
fi

# Check if vector store exists
if [ ! -d "data/vectors" ]; then
    echo "⚠️  Warning: Vector store not found. Creating new one..."
fi

echo "✅ Starting Enhanced MCP Server..."
echo "🔍 New capabilities:"
echo "   • find_person_conversations - Find all chats with a specific person"
echo "   • Hebrew date parsing (אתמול, מחר, לפני יומיים)"
echo "   • Hebrew meeting detection (על האש, נפגש, פגישה)"
echo "   • Enhanced search with meeting context"
echo ""
echo "💡 Try asking: 'when did I meet with Yahav' or 'מתי נפגשתי עם יהב'"
echo ""

# Run the enhanced MCP server
node src/mcp-server-enhanced.js
