import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from './database.js';
import LocalVectorStore from './local-vector-store.js';
import HebrewProcessor from './hebrew-processor.js';

class WhatsAppActionsMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'whatsapp-actions',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.database = new Database();
    this.vectorStore = new LocalVectorStore();
    this.hebrewProcessor = new HebrewProcessor();
    this.isInitialized = false;
    this.listenerApiUrl = process.env.WHATSAPP_API_URL || 'http://localhost:3001';
    this.setupTools();
  }

  async initialize() {
    console.error('🚀 Initializing WhatsApp Actions MCP Server v2...');
    
    try {
      await this.database.initialize();
      await this.vectorStore.initialize();
      
      this.isInitialized = true;
      console.error('✅ WhatsApp Actions MCP Server v2 initialized successfully');
      console.error(`🔗 Connected to WhatsApp Listener API at ${this.listenerApiUrl}`);
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp Actions MCP Server v2:', error);
      throw error;
    }
  }

  async makeApiRequest(endpoint, method = 'GET', body = null) {
    try {
      const url = `${this.listenerApiUrl}${endpoint}`;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('WhatsApp Listener service is not running. Please start it first with ./start-listener.sh');
      }
      throw error;
    }
  }

  setupTools() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'whatsapp_status',
            description: 'Check the status of the WhatsApp client and indexer service',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_latest_messages',
            description: 'Get the latest WhatsApp messages from all chats or a specific chat',
            inputSchema: {
              type: 'object',
              properties: {
                chat_name: {
                  type: 'string',
                  description: 'Optional: Name of specific chat to get messages from',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 10)',
                },
                include_sent: {
                  type: 'boolean',
                  description: 'Include messages you sent (default: true)',
                }
              },
            },
          },
          {
            name: 'send_message',
            description: 'Send a WhatsApp message to a specific contact or group',
            inputSchema: {
              type: 'object',
              properties: {
                recipient: {
                  type: 'string',
                  description: 'Name or phone number of the recipient (contact name or group name)',
                },
                message: {
                  type: 'string',
                  description: 'Message content to send',
                },
                reply_to_message_id: {
                  type: 'string',
                  description: 'Optional: ID of message to reply to',
                }
              },
              required: ['recipient', 'message'],
            },
          },
          {
            name: 'list_chats',
            description: 'List all available WhatsApp chats (contacts and groups)',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of chats to return (default: 20)',
                },
                groups_only: {
                  type: 'boolean',
                  description: 'Only return group chats (default: false)',
                },
                contacts_only: {
                  type: 'boolean',
                  description: 'Only return individual contacts (default: false)',
                }
              },
            },
          },
          {
            name: 'search_messages',
            description: 'Search WhatsApp messages using natural language queries with Hebrew support',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language search query in Hebrew or English',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                },
                chat_name: {
                  type: 'string',
                  description: 'Optional: Search within specific chat only',
                }
              },
              required: ['query'],
            },
          },
          {
            name: 'get_chat_info',
            description: 'Get detailed information about a specific chat',
            inputSchema: {
              type: 'object',
              properties: {
                chat_name: {
                  type: 'string',
                  description: 'Name of the chat to get information about',
                }
              },
              required: ['chat_name'],
            },
          },
          {
            name: 'mark_as_read',
            description: 'Mark messages in a chat as read',
            inputSchema: {
              type: 'object',
              properties: {
                chat_name: {
                  type: 'string',
                  description: 'Name of the chat to mark as read',
                }
              },
              required: ['chat_name'],
            },
          }
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.isInitialized) {
        throw new Error('Server not initialized. Please wait for initialization to complete.');
      }

      try {
        switch (name) {
          case 'whatsapp_status':
            return await this.handleStatus();
          case 'get_latest_messages':
            return await this.handleGetLatestMessages(args);
          case 'send_message':
            return await this.handleSendMessage(args);
          case 'list_chats':
            return await this.handleListChats(args);
          case 'search_messages':
            return await this.handleSearchMessages(args);
          case 'get_chat_info':
            return await this.handleGetChatInfo(args);
          case 'mark_as_read':
            return await this.handleMarkAsRead(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error handling ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async handleStatus() {
    try {
      // Get status from listener API
      const listenerStatus = await this.makeApiRequest('/status');
      
      // Get database stats
      const totalMessages = await this.database.getMessageCount();
      const lastMessage = await this.database.getLastMessageTime();
      
      let statusText = `📊 **WhatsApp Actions MCP Server Status**\n\n`;
      statusText += `✅ **Server Status:** ${this.isInitialized ? 'Ready' : 'Initializing'}\n`;
      statusText += `📱 **WhatsApp Client:** ${listenerStatus.isReady ? 'Connected' : 'Disconnected'}\n`;
      statusText += `📨 **Total Messages:** ${totalMessages}\n`;
      statusText += `🔍 **Hebrew Support:** Enabled\n`;
      statusText += `🤖 **Actions:** Send messages, mark as read, live indexing\n`;
      statusText += `🔗 **API Connection:** ${this.listenerApiUrl}\n`;
      
      if (lastMessage) {
        const lastDate = new Date(lastMessage.timestamp).toLocaleString();
        statusText += `⏰ **Last Message:** ${lastDate}\n`;
        statusText += `👤 **From:** ${lastMessage.sender_name}\n`;
        statusText += `💬 **Chat:** ${lastMessage.chat_name || 'Unknown'}\n`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: statusText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error checking status: ${error.message}`,
          },
        ],
      };
    }
  }

  async handleGetLatestMessages(args) {
    const { chat_name, limit = 10, include_sent = true } = args;
    
    try {
      let whereClause = 'WHERE 1=1';
      let params = [];
      
      if (chat_name) {
        whereClause += ' AND chat_name LIKE ?';
        params.push(`%${chat_name}%`);
      }
      
      if (!include_sent) {
        whereClause += ' AND is_from_me = 0';
      }
      
      const query = `
        SELECT *, GROUP_CONCAT(u.url) as urls FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        ${whereClause}
        GROUP BY m.id
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      params.push(limit);
      
      const messages = await this.database.query(query, params);
      
      if (messages.length === 0) {
        return {
          content: [{ type: 'text', text: 'No recent messages found.' }],
        };
      }

      let result = `📨 **Latest ${messages.length} Messages:**\n\n`;
      for (const msg of messages) {
        const date = new Date(msg.timestamp).toLocaleString();
        const chatType = msg.is_group_message ? '👥 Group' : '💬 Individual';
        const direction = msg.is_from_me ? '📤 (Sent)' : '📥 (Received)';
        
        result += `**${chatType}: ${msg.chat_name}** ${direction}\n`;
        result += `**${date} - ${msg.sender_name}**\n`;
        result += `**Message:** ${msg.content}\n`;
        if (msg.urls) result += `**URLs:** ${msg.urls}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get latest messages: ${error.message}`);
    }
  }

  async handleSendMessage(args) {
    const { recipient, message, reply_to_message_id } = args;
    
    try {
      // Add sender_number field to prevent database constraint error
      const response = await this.makeApiRequest('/send-message', 'POST', {
        recipient,
        message,
        reply_to_message_id,
        sender_number: 'me' // Add this field to fix the constraint error
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${response.message}:\n\n"${message}"`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async handleListChats(args) {
    const { limit = 20, groups_only = false, contacts_only = false } = args;
    
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        groups_only: groups_only.toString(),
        contacts_only: contacts_only.toString()
      });
      
      const response = await this.makeApiRequest(`/chats?${params}`);
      
      if (response.chats.length === 0) {
        return {
          content: [{ type: 'text', text: 'No chats found.' }],
        };
      }

      let result = `📋 **Available Chats (${response.chats.length}):**\n\n`;
      for (const chat of response.chats) {
        const chatType = chat.isGroup ? '👥 Group' : '💬 Individual';
        const unreadCount = chat.unreadCount > 0 ? ` (${chat.unreadCount} unread)` : '';
        const lastMessageTime = chat.lastMessageTime ? 
          new Date(chat.lastMessageTime).toLocaleString() : 'No messages';
        
        result += `**${chatType}: ${chat.name}**${unreadCount}\n`;
        result += `**Last Activity:** ${lastMessageTime}\n`;
        if (chat.isGroup && chat.participantCount) {
          result += `**Participants:** ${chat.participantCount}\n`;
        }
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to list chats: ${error.message}`);
    }
  }

  async handleSearchMessages(args) {
    const { query, limit = 10, chat_name } = args;
    
    try {
      const processedQuery = this.hebrewProcessor.processSearchQuery(query);
      
      let results;
      if (chat_name) {
        // Search within specific chat
        results = await this.database.searchInChat(chat_name, processedQuery.processedQuery, limit);
      } else {
        // Search across all messages
        results = await this.vectorStore.searchSimilar(processedQuery.processedQuery, { topK: limit });
      }
      
      if (!results || results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No messages found for "${query}".`,
            },
          ],
        };
      }

      let resultText = `🔍 **Found ${results.length} messages for "${query}":**\n\n`;
      
      for (const result of results) {
        const date = new Date(result.timestamp).toLocaleString();
        const chatType = result.is_group_message ? '👥 Group' : '💬 Individual';
        const sender = result.sender_name === 'Me' ? '📤 (Sent)' : '📥 (Received)';
        const chatName = result.chat_name || 'Unknown Chat';
        
        resultText += `**${chatType}: ${chatName}** ${sender}\n`;
        resultText += `**${date} - ${result.sender_name}**\n`;
        resultText += `**Message:** ${result.content}\n`;
        
        if (result.urls) {
          resultText += `**URLs:** ${result.urls}\n`;
        }
        
        if (result.score) {
          resultText += `**Relevance:** ${result.score.toFixed(3)}\n`;
        }
        
        resultText += `---\n\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to search messages: ${error.message}`);
    }
  }

  async handleGetChatInfo(args) {
    const { chat_name } = args;
    
    try {
      // Get chat list and find the specific chat
      const response = await this.makeApiRequest('/chats?limit=100');
      const chat = response.chats.find(c => 
        c.name === chat_name || 
        c.name?.toLowerCase().includes(chat_name.toLowerCase())
      );
      
      if (!chat) {
        throw new Error(`Chat "${chat_name}" not found.`);
      }

      let result = `📋 **Chat Information: ${chat.name}**\n\n`;
      result += `**Type:** ${chat.isGroup ? '👥 Group Chat' : '💬 Individual Chat'}\n`;
      result += `**ID:** ${chat.id}\n`;
      result += `**Unread Messages:** ${chat.unreadCount}\n`;
      
      if (chat.lastMessageTime) {
        const lastMessageTime = new Date(chat.lastMessageTime).toLocaleString();
        result += `**Last Message:** ${lastMessageTime}\n`;
      }
      
      if (chat.isGroup && chat.participantCount) {
        result += `**Participants:** ${chat.participantCount}\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get chat info: ${error.message}`);
    }
  }

  async handleMarkAsRead(args) {
    const { chat_name } = args;
    
    try {
      const response = await this.makeApiRequest('/mark-as-read', 'POST', {
        chat_name
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${response.message}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to mark as read: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('WhatsApp Actions MCP Server v2 running on stdio');
  }
}

// Create and run the server
const server = new WhatsAppActionsMCPServer();
await server.initialize();
await server.run();
