# WhatsApp Indexer

A WhatsApp message indexer that provides semantic search capabilities through a Model Context Protocol (MCP) server. The system is designed with a decoupled architecture where the MCP server only reads from the indexed data, while a separate service handles WhatsApp message listening and indexing.

## Architecture

The system consists of two main components:

### 1. WhatsApp Listener Service (`whatsapp-listener.js`)
- Connects to WhatsApp Web using `whatsapp-web.js`
- Receives and processes incoming/outgoing messages
- Extracts URLs and metadata from messages
- Stores messages in SQLite database
- Indexes messages in a local vector store for semantic search
- Runs independently and continuously processes messages

### 2. MCP Server (`mcp-server-standalone.js`)
- Provides MCP tools for querying indexed messages
- Only reads from the database and vector store
- Does not connect to WhatsApp directly
- Can run independently of the WhatsApp connection
- Provides semantic search, URL extraction, and date-based queries

## Features

- **Semantic Search**: Find messages using natural language queries
- **URL Extraction**: Automatically extract and index URLs from messages
- **Date-based Queries**: Search messages by date ranges
- **Sender Filtering**: Filter messages by specific senders
- **Schedule Detection**: Find scheduling-related conversations
- **Plan Checking**: Check for plans on specific days
- **Chat Discovery**: List all chats with identifiers for selective indexing
- **Historical Backfill**: Index messages from past days/weeks/months
- **Persistent Storage**: SQLite database with full-text search
- **Vector Search**: Local FAISS-based semantic search using Transformers.js

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment configuration:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your preferred settings (optional - defaults work fine)

## Usage

### Option 1: Run Both Services (Recommended)

1. **Start the WhatsApp Listener Service** (in one terminal):
   ```bash
   ./start-listener.sh
   ```
   - Scan the QR code with your WhatsApp mobile app
   - Wait for "WhatsApp client is ready!" message
   - Leave this running to continuously index new messages

2. **Start the MCP Server** (in another terminal):
   ```bash
   ./start-mcp-standalone.sh
   ```
   - This provides the MCP tools for querying messages
   - Can be restarted without affecting WhatsApp connection

### Option 2: MCP Server Only (Query Existing Data)

If you already have indexed messages and just want to query them:

```bash
./start-mcp-standalone.sh
```

## Chat Discovery

Before running backfill operations, you can list all your WhatsApp chats to identify which ones you want to include or exclude:

### List All Chats
```bash
./list-chats.sh
```

This shows all your chats sorted by most recent activity, with their names and IDs.

### Filter Options
```bash
# Show only group chats
./list-chats.sh --groups-only

# Show only individual chats  
./list-chats.sh --individual-only

# Show top 20 most recent chats
./list-chats.sh --limit 20

# Show detailed information
./list-chats.sh --verbose
```

### Using Chat Information for Backfill
After listing chats, you can use their names or IDs in backfill commands:

```bash
# Backfill specific chats by name
./start-backfill.sh --chat "Family Group" --chat "Work Team" --days 7

# Exclude specific chats
./start-backfill.sh --exclude "Noisy Group" --exclude "Spam" --days 30
```

## Historical Backfill

Index messages from the past using the backfill script:

### Basic Usage
```bash
# Backfill last 7 days (default)
./start-backfill.sh

# Backfill specific time period
./start-backfill.sh --days 30

# Test without saving (dry run)
./start-backfill.sh --dry-run --verbose --days 7
```

### Advanced Options
```bash
# Specific chats only
./start-backfill.sh --chat "Important Group" --days 14

# Exclude certain chats
./start-backfill.sh --exclude "Work" --exclude "Notifications" --days 30

# Limit messages per chat
./start-backfill.sh --max-messages 500 --days 60

# Force re-indexing
./start-backfill.sh --force --days 7
```

See [BACKFILL.md](BACKFILL.md) for detailed backfill documentation.

## MCP Tools

The MCP server provides the following tools:

### `whatsapp_status`
Check the status of the WhatsApp indexer service
- Shows total indexed messages
- Shows last message timestamp
- Indicates if the system is ready

### `search_messages`
Search messages using natural language queries
- **query** (required): Natural language search query
- **limit** (optional): Maximum results to return (default: 10)

Example: "find the restaurant recommendation from John"

### `get_urls_by_sender`
Get all URLs shared by a specific person
- **sender_name** (required): Name of the sender
- **limit** (optional): Maximum URLs to return (default: 20)

### `get_messages_by_date`
Get messages from a specific date or date range
- **date_query** (required): Date in natural language (e.g., "today", "last Monday")
- **sender_name** (optional): Filter by specific sender

### `find_schedule_with_person`
Find scheduling-related messages with a specific person
- **person_name** (required): Name of the person
- **time_period** (optional): Time period to search (default: "this week")

### `check_plans_for_day`
Check for plans or appointments on a specific day
- **day** (required): Day to check (e.g., "Wednesday", "tomorrow")

## Configuration

Edit `.env` to customize:

```env
# Database
DATABASE_PATH=./data/messages.db

# Vector Store
VECTOR_STORE_PATH=./data/vectors
VECTOR_MODEL=Xenova/all-MiniLM-L6-v2
VECTOR_DIMENSION=384

# Logging
LOG_LEVEL=info
```

## Data Storage

- **SQLite Database**: `./data/messages.db` - Stores message content, metadata, and URLs
- **Vector Store**: `./data/vectors/` - FAISS index and metadata for semantic search
- **WhatsApp Session**: `./.wwebjs_auth/` - WhatsApp Web authentication data

## Architecture Benefits

### Decoupled Design
- MCP server can run without WhatsApp connection
- WhatsApp listener can restart without affecting queries
- Better reliability and maintainability

### Scalability
- Multiple MCP servers can read from the same data
- WhatsApp listener runs independently
- Easy to add more data sources

### Development
- Test MCP tools without WhatsApp setup
- Develop features using existing data
- Clear separation of concerns

## Troubleshooting

### WhatsApp Connection Issues
- Make sure only the listener service connects to WhatsApp
- Check QR code scanning in the listener terminal
- Restart only the listener service if connection fails

### MCP Server Issues
- MCP server doesn't need WhatsApp connection
- Check if database and vector store files exist
- Restart MCP server independently

### No Messages Found
- Ensure WhatsApp listener service is running
- Check that messages are being indexed (watch listener logs)
- Verify database has data: check `./data/messages.db`

### Performance
- Vector search may be slow on first run (model download)
- Subsequent searches are much faster
- Consider adjusting `VECTOR_DIMENSION` for speed vs accuracy

## Development

### Project Structure
```
src/
├── mcp-server-standalone.js    # Standalone MCP server (recommended)
├── whatsapp-listener.js        # WhatsApp message listener
├── database.js                 # SQLite database operations
├── local-vector-store.js       # FAISS vector store
├── message-processor.js        # Message processing logic
├── config.js                   # Configuration management
└── backfill-script.js          # Historical message backfill
```

### Adding New Features
1. Add database schema changes in `database.js`
2. Update message processing in `message-processor.js`
3. Add new MCP tools in `mcp-server-standalone.js`
4. Update vector indexing if needed in `local-vector-store.js`

## License

MIT License
