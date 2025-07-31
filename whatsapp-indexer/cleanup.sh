#!/bin/bash

echo "🧹 WhatsApp Indexer Cleanup Script"
echo "=================================="
echo ""

# Create archive directory for files we might want to keep
mkdir -p archive

echo "📦 Archiving development files..."

# Archive development/test files (in case we need them later)
mv test-session.js archive/ 2>/dev/null
mv test-standalone.js archive/ 2>/dev/null
mv test-list-chats.js archive/ 2>/dev/null
mv test-backfill.js archive/ 2>/dev/null
mv debug-db.js archive/ 2>/dev/null
mv test-query.js archive/ 2>/dev/null
mv final-test.js archive/ 2>/dev/null
mv final-test-fixed.js archive/ 2>/dev/null
mv test-enhanced-fixed.js archive/ 2>/dev/null

echo "📝 Archiving development documentation..."

# Archive development documentation
mv SOLUTION_SUMMARY.md archive/ 2>/dev/null
mv MIGRATION.md archive/ 2>/dev/null
mv IMPROVEMENTS.md archive/ 2>/dev/null
mv IMPLEMENTATION_PLAN.md archive/ 2>/dev/null
mv README-ENHANCED.md archive/ 2>/dev/null

echo "🗑️  Removing obsolete scripts..."

# Remove obsolete scripts
rm -f start-mcp-standalone.sh
rm -f start-enhanced-mcp.sh
rm -f start-enhanced-listener.sh
rm -f start-indexer.sh

echo "🧹 Cleaning up log files..."

# Clean up old log files
rm -f whatsapp-listener.log
rm -f server.log

echo ""
echo "✅ Cleanup completed!"
echo ""
echo "📋 What was done:"
echo "  ✅ Archived development/test files to ./archive/"
echo "  ✅ Archived development documentation to ./archive/"
echo "  ✅ Removed obsolete scripts"
echo "  ✅ Cleaned up log files"
echo ""
echo "🚀 Your clean project now has:"
echo "  📁 Essential scripts:"
echo "    • start-mcp-enhanced.sh (MCP server)"
echo "    • start-listener.sh (WhatsApp listener)"
echo "    • start-backfill.sh (historical data)"
echo "    • list-chats.sh (chat discovery)"
echo "    • fix-contact-names.sh (contact fixing)"
echo "    • clear-session.sh (session reset)"
echo ""
echo "  📁 Essential files:"
echo "    • README.md (main documentation)"
echo "    • BACKFILL.md (backfill documentation)"
echo "    • src/ (source code)"
echo "    • data/ (database and vectors)"
echo ""
echo "  📁 Archived files:"
echo "    • archive/ (development files, safe to delete later)"
echo ""
