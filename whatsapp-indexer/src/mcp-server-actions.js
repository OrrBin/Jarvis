import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import Database from './database.js';
import LocalVectorStore from './local-vector-store.js';
import HebrewProcessor from './hebrew-processor.js';
import * as chrono from 'chrono-node';

class WhatsAppActionsMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'whatsapp-actions',
        version: '1.0.0',
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
    this.whatsappClient = null;
    this.isInitialized = false;
    this.isWhatsAppReady = false;
    this.setupTools();
  }

  async initialize() {
    console.error('🚀 Initializing WhatsApp Actions MCP Server...');
    
    try {
      await this.database.initialize();
      await this.vectorStore.initialize();
      await this.initializeWhatsAppClient();
      
      this.isInitialized = true;
      console.error('✅ WhatsApp Actions MCP Server initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp Actions MCP Server:', error);
      throw error;
    }
  }

  async initializeWhatsAppClient() {
    console.error('📱 Initializing WhatsApp client...');
    
    this.whatsappClient = new Client({
      authStrategy: new LocalAuth({
        clientId: "whatsapp-actions-mcp",
        dataPath: "./.wwebjs_auth_actions"
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        timeout: 60000,
      }
    });

    this.whatsappClient.on('qr', (qr) => {
      console.error('📱 Scan this QR code with your WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    this.whatsappClient.on('ready', () => {
      console.error('✅ WhatsApp client is ready!');
      this.isWhatsAppReady = true;
    });

    this.whatsappClient.on('authenticated', () => {
      console.error('🔐 WhatsApp client authenticated');
    });

    this.whatsappClient.on('auth_failure', (msg) => {
      console.error('❌ Authentication failed:', msg);
    });

    this.whatsappClient.on('disconnected', (reason) => {
      console.error('📱 WhatsApp client disconnected:', reason);
      this.isWhatsAppReady = false;
    });

    // Listen for new messages and index them
    this.whatsappClient.on('message', async (message) => {
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        console.error('Error handling incoming message:', error);
      }
    });

    await this.whatsappClient.initialize();
  }

  async handleIncomingMessage(message) {
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      // Process and save the message to database
      const processedMessage = {
        id: message.id.id,
        chat_id: chat.id._serialized,
        chat_name: chat.name || contact.name || contact.number,
        sender_name: message.fromMe ? 'Me' : (contact.name || contact.number),
        content: message.body,
        timestamp: message.timestamp * 1000,
        is_from_me: message.fromMe,
        is_group_message: chat.isGroup,
        message_type: message.type
      };

      // Save to database
      await this.database.saveMessage(processedMessage);
      
      // Index in vector store
      await this.vectorStore.indexMessage(processedMessage);
      
      console.error(`📨 New message indexed: ${processedMessage.sender_name} in ${processedMessage.chat_name}`);
    } catch (error) {
      console.error('Error processing incoming message:', error);
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
      const totalMessages = await this.database.getMessageCount();
      const lastMessage = await this.database.getLastMessageTime();
      
      let statusText = `📊 **WhatsApp Actions MCP Server Status**\n\n`;
      statusText += `✅ **Server Status:** ${this.isInitialized ? 'Ready' : 'Initializing'}\n`;
      statusText += `📱 **WhatsApp Client:** ${this.isWhatsAppReady ? 'Connected' : 'Disconnected'}\n`;
      statusText += `📨 **Total Messages:** ${totalMessages}\n`;
      statusText += `🔍 **Hebrew Support:** Enabled\n`;
      statusText += `🤖 **Actions:** Send messages, mark as read, live indexing\n`;
      
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
    
    if (!this.isWhatsAppReady) {
      throw new Error('WhatsApp client is not ready. Please wait for connection or scan QR code.');
    }

    try {
      // Find the chat by name or number
      const chats = await this.whatsappClient.getChats();
      let targetChat = null;
      
      // Try to find chat by exact name match first
      targetChat = chats.find(chat => 
        chat.name === recipient || 
        chat.name?.toLowerCase() === recipient.toLowerCase()
      );
      
      // If not found, try partial match
      if (!targetChat) {
        targetChat = chats.find(chat => 
          chat.name?.toLowerCase().includes(recipient.toLowerCase())
        );
      }
      
      // If still not found, try to find by phone number
      if (!targetChat) {
        const contacts = await this.whatsappClient.getContacts();
        const contact = contacts.find(c => 
          c.number === recipient || 
          c.name === recipient ||
          c.name?.toLowerCase().includes(recipient.toLowerCase())
        );
        
        if (contact) {
          targetChat = await contact.getChat();
        }
      }
      
      if (!targetChat) {
        throw new Error(`Could not find chat with "${recipient}". Please check the name or phone number.`);
      }

      // Send the message
      let sentMessage;
      if (reply_to_message_id) {
        // Find the message to reply to
        const messages = await targetChat.fetchMessages({ limit: 50 });
        const messageToReply = messages.find(msg => msg.id.id === reply_to_message_id);
        
        if (messageToReply) {
          sentMessage = await messageToReply.reply(message);
        } else {
          // If can't find the message to reply to, send as regular message
          sentMessage = await targetChat.sendMessage(message);
        }
      } else {
        sentMessage = await targetChat.sendMessage(message);
      }

      // Index the sent message
      const processedMessage = {
        id: sentMessage.id.id,
        chat_id: targetChat.id._serialized,
        chat_name: targetChat.name || recipient,
        sender_name: 'Me',
        content: message,
        timestamp: sentMessage.timestamp * 1000,
        is_from_me: true,
        is_group_message: targetChat.isGroup,
        message_type: sentMessage.type
      };

      await this.database.saveMessage(processedMessage);
      await this.vectorStore.indexMessage(processedMessage);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Message sent successfully to "${targetChat.name || recipient}":\n\n"${message}"`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async handleListChats(args) {
    const { limit = 20, groups_only = false, contacts_only = false } = args;
    
    if (!this.isWhatsAppReady) {
      throw new Error('WhatsApp client is not ready. Please wait for connection.');
    }

    try {
      const chats = await this.whatsappClient.getChats();
      
      let filteredChats = chats;
      if (groups_only) {
        filteredChats = chats.filter(chat => chat.isGroup);
      } else if (contacts_only) {
        filteredChats = chats.filter(chat => !chat.isGroup);
      }
      
      // Sort by last message time and limit
      filteredChats = filteredChats
        .sort((a, b) => b.lastMessage?.timestamp - a.lastMessage?.timestamp)
        .slice(0, limit);

      if (filteredChats.length === 0) {
        return {
          content: [{ type: 'text', text: 'No chats found.' }],
        };
      }

      let result = `📋 **Available Chats (${filteredChats.length}):**\n\n`;
      for (const chat of filteredChats) {
        const chatType = chat.isGroup ? '👥 Group' : '💬 Individual';
        const unreadCount = chat.unreadCount > 0 ? ` (${chat.unreadCount} unread)` : '';
        const lastMessageTime = chat.lastMessage ? 
          new Date(chat.lastMessage.timestamp * 1000).toLocaleString() : 'No messages';
        
        result += `**${chatType}: ${chat.name}**${unreadCount}\n`;
        result += `**Last Activity:** ${lastMessageTime}\n`;
        if (chat.isGroup) {
          result += `**Participants:** ${chat.participants?.length || 'Unknown'}\n`;
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
    
    if (!this.isWhatsAppReady) {
      throw new Error('WhatsApp client is not ready. Please wait for connection.');
    }

    try {
      const chats = await this.whatsappClient.getChats();
      const chat = chats.find(c => 
        c.name === chat_name || 
        c.name?.toLowerCase().includes(chat_name.toLowerCase())
      );
      
      if (!chat) {
        throw new Error(`Chat "${chat_name}" not found.`);
      }

      let result = `📋 **Chat Information: ${chat.name}**\n\n`;
      result += `**Type:** ${chat.isGroup ? '👥 Group Chat' : '💬 Individual Chat'}\n`;
      result += `**ID:** ${chat.id._serialized}\n`;
      result += `**Unread Messages:** ${chat.unreadCount}\n`;
      
      if (chat.lastMessage) {
        const lastMessageTime = new Date(chat.lastMessage.timestamp * 1000).toLocaleString();
        result += `**Last Message:** ${lastMessageTime}\n`;
        result += `**Last Message From:** ${chat.lastMessage.author || 'Unknown'}\n`;
      }
      
      if (chat.isGroup) {
        result += `**Participants:** ${chat.participants?.length || 'Unknown'}\n`;
        if (chat.participants && chat.participants.length > 0) {
          result += `**Group Members:**\n`;
          for (const participant of chat.participants.slice(0, 10)) {
            const contact = await this.whatsappClient.getContactById(participant.id._serialized);
            result += `  • ${contact.name || contact.number}\n`;
          }
          if (chat.participants.length > 10) {
            result += `  ... and ${chat.participants.length - 10} more\n`;
          }
        }
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get chat info: ${error.message}`);
    }
  }

  async handleMarkAsRead(args) {
    const { chat_name } = args;
    
    if (!this.isWhatsAppReady) {
      throw new Error('WhatsApp client is not ready. Please wait for connection.');
    }

    try {
      const chats = await this.whatsappClient.getChats();
      const chat = chats.find(c => 
        c.name === chat_name || 
        c.name?.toLowerCase().includes(chat_name.toLowerCase())
      );
      
      if (!chat) {
        throw new Error(`Chat "${chat_name}" not found.`);
      }

      await chat.sendSeen();

      return {
        content: [
          {
            type: 'text',
            text: `✅ Marked chat "${chat.name}" as read.`,
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
    console.error('WhatsApp Actions MCP Server running on stdio');
  }
}

// Create and run the server
const server = new WhatsAppActionsMCPServer();
await server.initialize();
await server.run();
