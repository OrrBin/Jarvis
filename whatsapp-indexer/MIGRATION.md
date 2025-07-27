# Migration Guide: Decoupled Architecture

This document explains the changes made to decouple the WhatsApp MCP server from the WhatsApp client, creating a more robust and maintainable architecture.

## What Changed

### Before (Coupled Architecture)
- Single `mcp-server.js` that both connected to WhatsApp AND served MCP requests
- MCP server would fail if WhatsApp connection failed
- Couldn't query messages without an active WhatsApp connection
- Tight coupling between WhatsApp client and MCP functionality

### After (Decoupled Architecture)
- **WhatsApp Listener Service** (`whatsapp-listener.js`): Handles WhatsApp connection and message indexing
- **Standalone MCP Server** (`mcp-server-standalone.js`): Only reads from database/vector store
- Services can run independently
- MCP server works even if WhatsApp is disconnected
- Better reliability and maintainability

## New Components

### 1. WhatsApp Listener Service (`src/whatsapp-listener.js`)
- Connects to WhatsApp Web
- Processes incoming/outgoing messages
- Updates database and vector store
- Runs continuously in the background
- Can be restarted without affecting MCP queries

### 2. Standalone MCP Server (`src/mcp-server-standalone.js`)
- Provides MCP tools for querying messages
- Only reads from database and vector store
- No WhatsApp client dependency
- Can run multiple instances
- Fast startup (no WhatsApp authentication needed)

## New Startup Scripts

### `./start-listener.sh`
Starts the WhatsApp listener service:
- Connects to WhatsApp
- Indexes new messages
- Runs continuously

### `./start-mcp-standalone.sh`
Starts the standalone MCP server:
- Provides MCP tools
- Reads from indexed data
- No WhatsApp connection needed

### `./test-standalone.js`
Tests the decoupled components:
- Verifies database connectivity
- Tests vector store functionality
- Checks search capabilities

## Migration Steps

### For Existing Users

1. **Stop the old combined server** if running:
   ```bash
   # Stop any running MCP server
   pkill -f mcp-server.js
   ```

2. **Test the new architecture**:
   ```bash
   node test-standalone.js
   ```

3. **Start the new services**:
   ```bash
   # Terminal 1: Start WhatsApp listener
   ./start-listener.sh
   
   # Terminal 2: Start MCP server
   ./start-mcp-standalone.sh
   ```

### For New Users

Simply follow the updated README instructions:
1. Run `./start-listener.sh` and scan QR code
2. Run `./start-mcp-standalone.sh` in another terminal

## Benefits of the New Architecture

### 1. Reliability
- MCP server doesn't crash if WhatsApp disconnects
- Can query existing messages even without WhatsApp
- Independent service restarts

### 2. Performance
- MCP server starts instantly (no WhatsApp auth wait)
- Dedicated processes for different concerns
- Better resource utilization

### 3. Development
- Test MCP tools without WhatsApp setup
- Develop features using existing data
- Clear separation of concerns

### 4. Scalability
- Run multiple MCP servers reading same data
- WhatsApp listener runs independently
- Easy to add more data sources

## Backward Compatibility

The old combined mode is still available:
```bash
./start-mcp.sh  # Uses the original mcp-server.js
```

However, the new decoupled approach is recommended for all new deployments.

## File Changes Summary

### New Files
- `src/mcp-server-standalone.js` - Standalone MCP server
- `src/whatsapp-listener.js` - WhatsApp message listener
- `start-mcp-standalone.sh` - Startup script for MCP server
- `start-listener.sh` - Startup script for WhatsApp listener
- `test-standalone.js` - Test script for new architecture
- `MIGRATION.md` - This migration guide

### Modified Files
- `README.md` - Updated with new architecture documentation
- `package.json` - Added new npm scripts
- `src/database.js` - Added `getMessageCount()` and `getLastMessageTime()` methods

### Unchanged Files
- `src/database.js` - Core database functionality unchanged
- `src/local-vector-store.js` - Vector store functionality unchanged
- `src/message-processor.js` - Message processing unchanged
- `src/config.js` - Configuration unchanged
- All existing data files and authentication remain compatible

## Troubleshooting

### "WhatsApp indexer is not initialized"
- Make sure you're running `start-mcp-standalone.sh`, not the old script
- Check that database and vector store files exist in `./data/`

### "No messages found"
- Ensure the WhatsApp listener service is running: `./start-listener.sh`
- Check that messages are being indexed (watch listener logs)
- Verify WhatsApp connection is active

### MCP tools not working
- Restart the MCP server: `./start-mcp-standalone.sh`
- Check that the database file exists: `ls -la ./data/messages.db`
- Run the test script: `node test-standalone.js`

## Support

If you encounter issues with the migration:
1. Run `node test-standalone.js` to verify components
2. Check the logs from both services
3. Ensure all dependencies are installed: `npm install`
4. Try the legacy mode temporarily: `./start-mcp.sh`
