# WhatsApp Actions MCP Server

An enhanced Model Context Protocol (MCP) server that provides both **read** and **write** capabilities for WhatsApp messages. This server can read the latest messages, search through message history, and send new messages to contacts and groups.

## 🚀 Features

### Read Capabilities
- **Get Latest Messages**: Retrieve recent messages from all chats or specific conversations
- **Search Messages**: Natural language search with Hebrew and English support
- **Message History**: Access to indexed message database with vector search
- **Chat Information**: Get detailed info about contacts and groups

### Write Capabilities
- **Send Messages**: Send text messages to any contact or group
- **Reply to Messages**: Reply to specific messages
- **Mark as Read**: Mark conversations as read
- **Real-time Indexing**: Automatically index new incoming messages

### Advanced Features
- **Hebrew Language Support**: Full Hebrew text processing and search
- **Live Message Monitoring**: Real-time message indexing as they arrive
- **Smart Chat Finding**: Fuzzy matching for contact and group names
- **Vector Search**: Semantic search across message content
- **Meeting Detection**: Identify scheduling and meeting-related messages

## 🛠️ Installation

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the MCP Server**:
   ```bash
   ./start-mcp-actions.sh
   ```

3. **WhatsApp Authentication**:
   - On first run, scan the QR code with your WhatsApp mobile app
   - Authentication is saved for future runs
   - The server uses WhatsApp Web protocol

## 📋 Available Tools

### `whatsapp_status`
Check the status of the WhatsApp client and indexer service.

**Parameters**: None

**Example**:
```json
{
  "name": "whatsapp_status"
}
```

### `get_latest_messages`
Get the latest WhatsApp messages from all chats or a specific chat.

**Parameters**:
- `chat_name` (optional): Name of specific chat
- `limit` (optional): Maximum messages to return (default: 10)
- `include_sent` (optional): Include sent messages (default: true)

**Example**:
```json
{
  "name": "get_latest_messages",
  "arguments": {
    "chat_name": "My Love",
    "limit": 5
  }
}
```

### `send_message`
Send a WhatsApp message to a specific contact or group.

**Parameters**:
- `recipient` (required): Contact name, group name, or phone number
- `message` (required): Message content to send
- `reply_to_message_id` (optional): ID of message to reply to

**Example**:
```json
{
  "name": "send_message",
  "arguments": {
    "recipient": "Saar Nir",
    "message": "Hey! How are you doing?"
  }
}
```

### `list_chats`
List all available WhatsApp chats (contacts and groups).

**Parameters**:
- `limit` (optional): Maximum chats to return (default: 20)
- `groups_only` (optional): Only return groups (default: false)
- `contacts_only` (optional): Only return individual contacts (default: false)

**Example**:
```json
{
  "name": "list_chats",
  "arguments": {
    "limit": 10,
    "groups_only": false
  }
}
```

### `search_messages`
Search WhatsApp messages using natural language queries.

**Parameters**:
- `query` (required): Search query in Hebrew or English
- `limit` (optional): Maximum results (default: 10)
- `chat_name` (optional): Search within specific chat only

**Example**:
```json
{
  "name": "search_messages",
  "arguments": {
    "query": "meeting tomorrow",
    "limit": 5
  }
}
```

### `get_chat_info`
Get detailed information about a specific chat.

**Parameters**:
- `chat_name` (required): Name of the chat

**Example**:
```json
{
  "name": "get_chat_info",
  "arguments": {
    "chat_name": "Family Group"
  }
}
```

### `mark_as_read`
Mark messages in a chat as read.

**Parameters**:
- `chat_name` (required): Name of the chat to mark as read

**Example**:
```json
{
  "name": "mark_as_read",
  "arguments": {
    "chat_name": "Work Group"
  }
}
```

## 🔧 Configuration

### MCP Client Configuration

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "whatsapp-actions": {
      "command": "/path/to/whatsapp-indexer/start-mcp-actions.sh",
      "cwd": "/path/to/whatsapp-indexer"
    }
  }
}
```

### Environment Variables

The server uses the following directories:
- `./.wwebjs_auth_actions/` - WhatsApp Web authentication data
- `./data/` - SQLite database and vector store
- `./node_modules/` - Node.js dependencies

## 🔍 Usage Examples

### Reading Latest Messages
```javascript
// Get latest 5 messages from all chats
await use_mcp_tool("whatsapp-actions", "get_latest_messages", {
  "limit": 5
});

// Get latest messages from specific person
await use_mcp_tool("whatsapp-actions", "get_latest_messages", {
  "chat_name": "John Doe",
  "limit": 10
});
```

### Sending Messages
```javascript
// Send a simple message
await use_mcp_tool("whatsapp-actions", "send_message", {
  "recipient": "Mom",
  "message": "Hi Mom! Just checking in."
});

// Send message to a group
await use_mcp_tool("whatsapp-actions", "send_message", {
  "recipient": "Family Group",
  "message": "Happy birthday! 🎉"
});
```

### Searching Messages
```javascript
// Search for meeting-related messages
await use_mcp_tool("whatsapp-actions", "search_messages", {
  "query": "meeting next week",
  "limit": 10
});

// Search in Hebrew
await use_mcp_tool("whatsapp-actions", "search_messages", {
  "query": "פגישה מחר",
  "limit": 5
});
```

## 🔒 Security & Privacy

- **Local Processing**: All message processing happens locally
- **No Cloud Storage**: Messages are stored in local SQLite database
- **WhatsApp Web Protocol**: Uses official WhatsApp Web API
- **Authentication**: Secure local authentication storage
- **No Message Forwarding**: Server doesn't forward messages to external services

## 🐛 Troubleshooting

### WhatsApp Client Issues
- **QR Code Not Appearing**: Restart the server and check terminal output
- **Authentication Failed**: Delete `.wwebjs_auth_actions/` folder and restart
- **Connection Lost**: Server will automatically attempt to reconnect

### Message Sending Issues
- **Recipient Not Found**: Use exact contact/group names from `list_chats`
- **Message Failed**: Check WhatsApp Web connection status
- **Rate Limiting**: WhatsApp may limit message frequency

### Database Issues
- **Search Not Working**: Ensure vector store is initialized
- **Missing Messages**: Run backfill script to index historical messages
- **Database Corruption**: Delete `data/` folder and re-index

## 📊 Performance

- **Message Indexing**: ~100-500 messages per second
- **Search Response**: <1 second for most queries
- **Memory Usage**: ~50-200MB depending on message volume
- **Storage**: ~1MB per 1000 messages (including vectors)

## 🔄 Updates & Maintenance

### Updating the Server
```bash
git pull origin feature/whatsapp-actions-mcp
npm install
./start-mcp-actions.sh
```

### Database Maintenance
```bash
# Re-index all messages
./start-backfill.sh --days 30 --force

# Clean up old data
node src/cleanup-database.js
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review server logs in terminal
3. Create an issue in the repository
4. Check WhatsApp Web status

---

**Note**: This server requires an active WhatsApp account and uses WhatsApp Web protocol. Make sure to comply with WhatsApp's Terms of Service when using this tool.
