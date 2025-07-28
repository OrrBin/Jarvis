# WhatsApp Message Backfill Guide

This guide explains how to use the WhatsApp message backfill script to index historical messages from your WhatsApp chats.

## Overview

The backfill script allows you to retroactively index WhatsApp messages from the past days/weeks/months. This is useful when:

- You're setting up the indexer for the first time
- You want to include historical context in your searches
- You've been away and want to catch up on missed messages
- You want to rebuild your index from scratch

## Quick Start

### 1. Basic Backfill (Last 7 Days)

```bash
./start-backfill.sh
```

This will backfill messages from the last 7 days from all your chats.

### 2. Dry Run (Test Without Saving)

```bash
./start-backfill.sh --dry-run
```

This shows you what would be indexed without actually saving anything to the database.

### 3. Specific Time Period

```bash
# Last 30 days
./start-backfill.sh --days 30

# Last 2 weeks
./start-backfill.sh --days 14
```

## Advanced Usage

### Specific Chats Only

```bash
# Backfill only family group
./start-backfill.sh --chat "Family Group" --days 14

# Multiple specific chats
./start-backfill.sh --chat "Work Team" --chat "Project Alpha" --days 7
```

### Exclude Certain Chats

```bash
# Exclude work-related chats
./start-backfill.sh --exclude "Work" --exclude "Team" --days 30

# Exclude noisy groups
./start-backfill.sh --exclude "Notifications" --exclude "Spam Group"
```

### Verbose Output

```bash
# See detailed progress
./start-backfill.sh --verbose --days 7
```

### Force Re-indexing

```bash
# Re-index chats even if they already have messages in the date range
./start-backfill.sh --force --days 7
```

### Limit Messages Per Chat

```bash
# Limit to 500 messages per chat (useful for very active groups)
./start-backfill.sh --max-messages 500 --days 30
```

## Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--days` | `-d` | Number of days back to fetch | 7 |
| `--max-messages` | `-m` | Maximum messages per chat | 1000 |
| `--chat` | `-c` | Specific chat to process (repeatable) | All chats |
| `--exclude` | `-e` | Chat to exclude (repeatable) | None |
| `--dry-run` | | Don't save messages, just show what would be done | false |
| `--verbose` | `-v` | Show detailed progress | false |
| `--force` | `-f` | Process chats even if they have existing messages | false |
| `--help` | `-h` | Show help message | |

## Examples

### Complete Setup for New Installation

```bash
# 1. First, do a dry run to see what you'll get
./start-backfill.sh --days 30 --dry-run --verbose

# 2. If it looks good, run for real
./start-backfill.sh --days 30 --verbose
```

### Selective Backfill

```bash
# Only important chats from the last month
./start-backfill.sh \
  --chat "Family" \
  --chat "Close Friends" \
  --chat "Important Work" \
  --days 30 \
  --verbose
```

### Large Archive Backfill

```bash
# For very large archives, limit messages and use verbose output
./start-backfill.sh \
  --days 90 \
  --max-messages 200 \
  --verbose \
  --exclude "Large Group 1" \
  --exclude "Large Group 2"
```

## How It Works

### 1. Authentication
- Uses the same WhatsApp Web session as your main indexer
- No need to scan QR code again if you're already authenticated

### 2. Chat Discovery
- Fetches all your chats from WhatsApp
- Filters based on your include/exclude criteria

### 3. Message Fetching
- For each chat, fetches messages within the specified date range
- Uses WhatsApp Web.js `fetchMessages()` API
- Respects rate limits with automatic delays

### 4. Processing
- Processes messages the same way as the live indexer
- Extracts URLs, dates, and other metadata
- Skips messages that already exist in the database

### 5. Indexing
- Saves messages to SQLite database
- Indexes in vector store for semantic search
- Updates statistics and progress

## Performance Considerations

### Rate Limiting
- The script includes automatic delays between requests
- WhatsApp may throttle if you fetch too aggressively
- Use `--max-messages` to limit per-chat fetching

### Memory Usage
- Large backfills may use significant memory
- Consider running in smaller batches for very large archives
- Monitor system resources during large operations

### Time Estimates
- ~1-2 seconds per chat (depending on message count)
- ~50-100 messages per second processing
- Large groups may take several minutes each

## Troubleshooting

### Authentication Issues
```bash
# Clear session and re-authenticate
./clear-session.sh
./start-backfill.sh --dry-run
```

### Rate Limiting
```bash
# Reduce batch size and add delays
./start-backfill.sh --max-messages 100 --days 7
```

### Memory Issues
```bash
# Process in smaller chunks
./start-backfill.sh --days 7 --max-messages 200
# Then run again for next 7 days
./start-backfill.sh --days 14 --max-messages 200
```

### Specific Chat Issues
```bash
# Skip problematic chats
./start-backfill.sh --exclude "Problematic Group" --days 7
```

## Safety Features

### Dry Run Mode
- Always test with `--dry-run` first
- Shows exactly what would be processed
- No database changes made

### Duplicate Prevention
- Automatically skips messages that already exist
- Uses message ID for deduplication
- Safe to run multiple times

### Graceful Shutdown
- Handles Ctrl+C gracefully
- Saves progress before exiting
- Doesn't corrupt database

### Error Handling
- Continues processing other chats if one fails
- Logs errors without stopping entire process
- Provides detailed error statistics

## Integration with Main Indexer

### Running Alongside Live Indexer
- Backfill script can run while live indexer is running
- Both use the same database safely
- No conflicts or data corruption

### After Backfill
- Live indexer will continue working normally
- New messages will be indexed as usual
- Search will include both historical and new messages

## Best Practices

### 1. Start Small
```bash
# Test with recent messages first
./start-backfill.sh --days 1 --dry-run --verbose
```

### 2. Use Dry Run
```bash
# Always dry run first for large operations
./start-backfill.sh --days 30 --dry-run
```

### 3. Monitor Progress
```bash
# Use verbose mode for long operations
./start-backfill.sh --days 30 --verbose
```

### 4. Handle Large Groups
```bash
# Limit messages from very active groups
./start-backfill.sh --max-messages 500 --days 30
```

### 5. Backup First
```bash
# Backup your database before large operations
cp data/messages.db data/messages.db.backup
```

## Monitoring and Statistics

The script provides detailed statistics:

- **Total chats found**: All chats in your WhatsApp
- **Chats processed**: Chats that matched your filters
- **Total messages found**: Messages in the date range
- **New messages indexed**: Messages actually added to database
- **Messages skipped**: Duplicates or empty messages
- **Errors encountered**: Any processing errors

## Scheduling Regular Backfills

You can set up regular backfills using cron:

```bash
# Add to crontab (crontab -e)
# Run daily backfill at 2 AM
0 2 * * * cd /path/to/whatsapp-indexer && ./start-backfill.sh --days 1 >> logs/backfill.log 2>&1

# Run weekly deeper backfill on Sundays at 3 AM
0 3 * * 0 cd /path/to/whatsapp-indexer && ./start-backfill.sh --days 7 --force >> logs/backfill-weekly.log 2>&1
```

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Run with `--verbose` to see detailed output
3. Try `--dry-run` to test without making changes
4. Check the logs for specific error messages
5. Consider reducing scope with `--max-messages` or `--days`
