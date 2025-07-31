import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from './database.js';
import LocalVectorStore from './local-vector-store.js';
import HebrewProcessor from './hebrew-processor.js';
import * as chrono from 'chrono-node';

class EnhancedWhatsAppMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'whatsapp-indexer-enhanced',
        version: '1.1.0',
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
    this.setupTools();
  }

  async initialize() {
    console.error('🚀 Initializing Enhanced WhatsApp MCP Server...');
    
    try {
      await this.database.initialize();
      await this.vectorStore.initialize();
      
      this.isInitialized = true;
      console.error('✅ Enhanced WhatsApp MCP Server initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced WhatsApp MCP Server:', error);
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
            description: 'Check the status of the WhatsApp indexer service',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'find_person_conversations',
            description: 'Find all conversations with a specific person across individual chats and group chats. This is the best tool for queries like "when did I meet with [person]" or "what did [person] say".',
            inputSchema: {
              type: 'object',
              properties: {
                person_name: {
                  type: 'string',
                  description: 'Name of the person to find conversations with (works with Hebrew and English names)',
                },
                date_range: {
                  type: 'string',
                  description: 'Optional: Date range in natural language (e.g., "last week", "2 days ago", "אתמול", "השבוע שעבר")',
                },
                include_context: {
                  type: 'boolean',
                  description: 'Include surrounding messages for context (default: true)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 20)',
                }
              },
              required: ['person_name'],
            },
          },
          {
            name: 'search_messages',
            description: 'Search WhatsApp messages using natural language queries. Now supports Hebrew and English, with enhanced meeting/planning detection.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language search query in Hebrew or English (e.g., "נפגש עם יהב", "meeting with Yahav", "על האש מחר")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                },
                message_type: {
                  type: 'string',
                  enum: ['sent', 'received', 'all'],
                  description: 'Filter by message type: "sent" (messages you sent), "received" (messages you received), or "all" (default)',
                }
              },
              required: ['query'],
            },
          },
          {
            name: 'get_sent_messages',
            description: 'Get messages that you sent, optionally filtered by date or recipient',
            inputSchema: {
              type: 'object',
              properties: {
                date_query: {
                  type: 'string',
                  description: 'Optional: Date or date range in natural language (supports Hebrew: "אתמול", "מחר", "השבוע שעבר")',
                },
                chat_filter: {
                  type: 'string',
                  description: 'Optional: Filter by chat/recipient (partial match)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 20)',
                }
              },
            },
          },
          {
            name: 'get_received_messages',
            description: 'Get messages that you received, optionally filtered by date or sender',
            inputSchema: {
              type: 'object',
              properties: {
                date_query: {
                  type: 'string',
                  description: 'Optional: Date or date range in natural language (supports Hebrew: "אתמול", "מחר", "השבוע שעבר")',
                },
                sender_filter: {
                  type: 'string',
                  description: 'Optional: Filter by sender name (partial match)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 20)',
                }
              },
            },
          },
          {
            name: 'get_urls_by_sender',
            description: 'Get all URLs shared by a specific person',
            inputSchema: {
              type: 'object',
              properties: {
                sender_name: {
                  type: 'string',
                  description: 'Name of the person who sent the URLs',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of URLs to return (default: 20)',
                }
              },
              required: ['sender_name'],
            },
          },
          {
            name: 'get_messages_by_date',
            description: 'Get messages from a specific date or date range (supports Hebrew dates)',
            inputSchema: {
              type: 'object',
              properties: {
                date_query: {
                  type: 'string',
                  description: 'Date or date range in natural language (e.g., "today", "this week", "last Monday", "אתמול", "מחר", "השבוע שעבר")',
                },
                sender_name: {
                  type: 'string',
                  description: 'Optional: filter by specific sender',
                }
              },
              required: ['date_query'],
            },
          },
          {
            name: 'find_schedule_with_person',
            description: 'Find scheduling-related messages with a specific person (enhanced with Hebrew support)',
            inputSchema: {
              type: 'object',
              properties: {
                person_name: {
                  type: 'string',
                  description: 'Name of the person to find scheduling messages with',
                },
                time_period: {
                  type: 'string',
                  description: 'Time period to search (default: "this week", supports Hebrew: "השבוע", "השבוع שעבר")',
                }
              },
              required: ['person_name'],
            },
          },
          {
            name: 'check_plans_for_day',
            description: 'Check if there are any plans or appointments for a specific day',
            inputSchema: {
              type: 'object',
              properties: {
                day: {
                  type: 'string',
                  description: 'Day to check for plans (e.g., "Wednesday", "tomorrow", "מחר", "אתמול")',
                }
              },
              required: ['day'],
            },
          },
          {
            name: 'list_groups',
            description: 'List all WhatsApp groups with message counts and activity',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_group_messages',
            description: 'Get messages from a specific WhatsApp group',
            inputSchema: {
              type: 'object',
              properties: {
                group_name: {
                  type: 'string',
                  description: 'Name of the group to get messages from',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 20)',
                }
              },
              required: ['group_name'],
            },
          },
          {
            name: 'search_in_group',
            description: 'Search for messages within a specific WhatsApp group',
            inputSchema: {
              type: 'object',
              properties: {
                group_name: {
                  type: 'string',
                  description: 'Name of the group to search in',
                },
                query: {
                  type: 'string',
                  description: 'Search query for messages within the group (supports Hebrew)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                }
              },
              required: ['group_name', 'query'],
            },
          },
          {
            name: 'get_individual_messages',
            description: 'Get messages from individual (non-group) chats only',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 20)',
                }
              },
            },
          },
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
          case 'find_person_conversations':
            return await this.handleFindPersonConversations(args);
          case 'search_messages':
            return await this.handleSearchMessages(args);
          case 'get_sent_messages':
            return await this.handleGetSentMessages(args);
          case 'get_received_messages':
            return await this.handleGetReceivedMessages(args);
          case 'get_urls_by_sender':
            return await this.handleGetUrlsBySender(args);
          case 'get_messages_by_date':
            return await this.handleGetMessagesByDate(args);
          case 'find_schedule_with_person':
            return await this.handleFindScheduleWithPerson(args);
          case 'check_plans_for_day':
            return await this.handleCheckPlansForDay(args);
          case 'list_groups':
            return await this.handleListGroups();
          case 'get_group_messages':
            return await this.handleGetGroupMessages(args);
          case 'search_in_group':
            return await this.handleSearchInGroup(args);
          case 'get_individual_messages':
            return await this.handleGetIndividualMessages(args);
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

  // NEW: Enhanced person-specific search across all chats
  async handleFindPersonConversations(args) {
    const { person_name, date_range, include_context = true, limit = 20 } = args;
    
    try {
      // Process Hebrew in the person name and date range
      const processedDateRange = date_range ? this.hebrewProcessor.parseHebrewDates(date_range) : null;
      
      // Find messages involving this person
      const messages = await this.database.findPersonInAllChats(person_name, processedDateRange, limit);
      
      if (messages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No conversations found with "${person_name}"${date_range ? ` in the time period "${date_range}"` : ''}.`,
            },
          ],
        };
      }

      // Group messages by chat and analyze for meeting context
      const chatGroups = {};
      const meetingMessages = [];
      
      for (const message of messages) {
        const chatKey = message.chat_name || 'Unknown Chat';
        if (!chatGroups[chatKey]) {
          chatGroups[chatKey] = [];
        }
        chatGroups[chatKey].push(message);
        
        // Check if this message has meeting context
        const meetingContext = this.hebrewProcessor.detectMeetingContext(message.content || '');
        if (meetingContext.isMeetingRelated) {
          meetingMessages.push({
            ...message,
            meetingContext
          });
        }
      }

      let result = `Found ${messages.length} conversations with "${person_name}":\n\n`;
      
      // Show meeting-related messages first
      if (meetingMessages.length > 0) {
        result += `🗓️ **Meeting/Planning Related Messages:**\n\n`;
        for (const msg of meetingMessages.slice(0, 5)) {
          const date = new Date(msg.timestamp).toLocaleString();
          const chatType = msg.is_group_message ? '👥 Group' : '💬 Individual';
          const sender = msg.sender_name === 'Me' ? '📤 (Sent)' : '📥 (Received)';
          
          result += `**${chatType}: ${msg.chat_name}**\n`;
          result += `**${date} - ${msg.sender_name} ${sender}**\n`;
          result += `**Message:** ${msg.content}\n`;
          if (msg.urls) {
            result += `**URLs:** ${msg.urls}\n`;
          }
          result += `**Meeting Confidence:** ${(msg.meetingContext.confidence * 100).toFixed(0)}%\n`;
          result += `---\n\n`;
        }
      }
      
      // Show other messages grouped by chat
      result += `💬 **All Conversations:**\n\n`;
      for (const [chatName, chatMessages] of Object.entries(chatGroups)) {
        const chatType = chatMessages[0].is_group_message ? '👥 Group' : '💬 Individual';
        result += `**${chatType}: ${chatName}** (${chatMessages.length} messages)\n\n`;
        
        for (const message of chatMessages.slice(0, 3)) {
          const date = new Date(message.timestamp).toLocaleString();
          const sender = message.sender_name === 'Me' ? '📤 (Sent)' : '📥 (Received)';
          
          result += `**${date} - ${message.sender_name} ${sender}**\n`;
          result += `**Message:** ${message.content}\n`;
          if (message.urls) {
            result += `**URLs:** ${message.urls}\n`;
          }
          result += `---\n\n`;
        }
        
        if (chatMessages.length > 3) {
          result += `... and ${chatMessages.length - 3} more messages in this chat\n\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      console.error('Error in handleFindPersonConversations:', error);
      throw error;
    }
  }

  // ENHANCED: Search messages with Hebrew support
  async handleSearchMessages(args) {
    let { query, limit = 10, message_type = 'all' } = args;
    
    try {
      // Process the query with Hebrew support
      const processedQuery = this.hebrewProcessor.processSearchQuery(query);
      
      console.error(`🔍 Searching for: "${query}" -> "${processedQuery.processedQuery}"`);
      
      // If the query mentions a person, use person-specific search
      const personMatch = query.match(/(?:with|עם|של)\s+(\w+)/i) || 
                         query.match(/(\w+)(?:\s+(?:said|אמר|שלח))/i);
      
      if (personMatch) {
        const personName = personMatch[1];
        console.error(`🔍 Detected person query for: ${personName}`);
        return await this.handleFindPersonConversations({
          person_name: personName,
          limit: limit
        });
      }
      
      // Use enhanced query for vector search
      const results = await this.vectorStore.search(processedQuery.processedQuery, limit);
      
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

      let resultText = `Found ${results.length} messages for "${query}":\n\n`;
      
      for (const result of results) {
        const date = new Date(result.timestamp).toLocaleString();
        const chatType = result.is_group_message ? '👥 Group' : '💬 Individual';
        const sender = result.sender_name === 'Me' ? '📤 (Sent)' : '📥 (Received)';
        const chatName = result.chat_name || 'Unknown Chat';
        
        // Check for meeting context
        const meetingContext = this.hebrewProcessor.detectMeetingContext(result.content || '');
        const meetingIndicator = meetingContext.isMeetingRelated ? '🗓️ ' : '';
        
        resultText += `**${meetingIndicator}${chatType}: ${chatName}** ${sender}\n`;
        resultText += `**Date:** ${date}\n`;
        resultText += `**Message:** ${result.content}\n`;
        
        if (result.urls) {
          resultText += `**URLs:** ${result.urls}\n`;
        }
        
        if (result.score) {
          resultText += `\n**Relevance Score:** ${result.score.toFixed(3)}\n`;
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
      console.error('Error in handleSearchMessages:', error);
      throw error;
    }
  }

  // Continue with other methods... (I'll add them in the next part)
  async handleStatus() {
    try {
      const totalMessages = await this.database.getTotalMessageCount();
      const lastMessage = await this.database.getLastMessage();
      
      let statusText = `📊 **WhatsApp Indexer Status**\n\n`;
      statusText += `✅ **Status:** Ready\n`;
      statusText += `📨 **Total Messages:** ${totalMessages}\n`;
      statusText += `🔍 **Hebrew Support:** Enabled\n`;
      statusText += `🤖 **Enhanced Features:** Person search, meeting detection\n`;
      
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

  // Remaining methods from original MCP server, enhanced where needed
  
  async handleGetSentMessages(args) {
    const { date_query, chat_filter, limit = 20 } = args;
    
    try {
      let whereClause = 'WHERE is_from_me = 1';
      let params = [];
      
      if (date_query) {
        // Process Hebrew dates
        const processedDateQuery = this.hebrewProcessor.parseHebrewDates(date_query);
        const parsedDates = chrono.parse(processedDateQuery);
        if (parsedDates.length > 0) {
          const date = parsedDates[0].start.date();
          const startOfDay = new Date(date);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(date);
          endOfDay.setHours(23, 59, 59, 999);
          
          whereClause += ' AND timestamp BETWEEN ? AND ?';
          params.push(startOfDay.getTime(), endOfDay.getTime());
        }
      }
      
      if (chat_filter) {
        whereClause += ' AND (chat_name LIKE ? OR sender_name LIKE ?)';
        params.push(`%${chat_filter}%`, `%${chat_filter}%`);
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
          content: [{ type: 'text', text: 'No sent messages found matching your criteria' }],
        };
      }

      let result = `Found ${messages.length} sent messages:\n\n`;
      for (const msg of messages) {
        const date = new Date(msg.timestamp).toLocaleString();
        const chatType = msg.is_group_message ? '👥 Group' : '💬 Individual';
        result += `**📤 ${chatType}: ${msg.chat_name || msg.chat_id}**\n`;
        result += `**Date:** ${date}\n`;
        result += `**Message:** ${msg.content}\n`;
        if (msg.urls) result += `**URLs:** ${msg.urls}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get sent messages: ${error.message}`);
    }
  }

  async handleGetReceivedMessages(args) {
    const { date_query, sender_filter, limit = 20 } = args;
    
    try {
      let whereClause = 'WHERE is_from_me = 0';
      let params = [];
      
      if (date_query) {
        const processedDateQuery = this.hebrewProcessor.parseHebrewDates(date_query);
        const parsedDates = chrono.parse(processedDateQuery);
        if (parsedDates.length > 0) {
          const date = parsedDates[0].start.date();
          const startOfDay = new Date(date);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(date);
          endOfDay.setHours(23, 59, 59, 999);
          
          whereClause += ' AND timestamp BETWEEN ? AND ?';
          params.push(startOfDay.getTime(), endOfDay.getTime());
        }
      }
      
      if (sender_filter) {
        whereClause += ' AND sender_name LIKE ?';
        params.push(`%${sender_filter}%`);
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
          content: [{ type: 'text', text: 'No received messages found matching your criteria' }],
        };
      }

      let result = `Found ${messages.length} received messages:\n\n`;
      for (const msg of messages) {
        const date = new Date(msg.timestamp).toLocaleString();
        const chatType = msg.is_group_message ? '👥 Group' : '💬 Individual';
        result += `**📥 ${chatType}: ${msg.chat_name || msg.sender_name}**\n`;
        result += `**Date:** ${date}\n`;
        result += `**Message:** ${msg.content}\n`;
        if (msg.urls) result += `**URLs:** ${msg.urls}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get received messages: ${error.message}`);
    }
  }

  async handleGetUrlsBySender(args) {
    const { sender_name, limit = 20 } = args;
    
    try {
      const urls = await this.database.getUrlsBySender(sender_name, limit);
      
      if (urls.length === 0) {
        return {
          content: [{ type: 'text', text: `No URLs found from "${sender_name}".` }],
        };
      }

      let result = `Found ${urls.length} URLs from "${sender_name}":\n\n`;
      for (const urlData of urls) {
        const date = new Date(urlData.timestamp).toLocaleString();
        result += `**${date}**\n`;
        result += `**URL:** ${urlData.url}\n`;
        result += `**Message:** ${urlData.content}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get URLs: ${error.message}`);
    }
  }

  async handleGetMessagesByDate(args) {
    const { date_query, sender_name } = args;
    
    try {
      const processedDateQuery = this.hebrewProcessor.parseHebrewDates(date_query);
      const messages = await this.database.getMessagesByDate(processedDateQuery, sender_name);
      
      if (messages.length === 0) {
        return {
          content: [{ type: 'text', text: `No messages found for "${date_query}".` }],
        };
      }

      let result = `Found ${messages.length} messages for "${date_query}":\n\n`;
      for (const msg of messages) {
        const date = new Date(msg.timestamp).toLocaleString();
        const chatType = msg.is_group_message ? '👥 Group' : '💬 Individual';
        const direction = msg.is_from_me ? '📤 (Sent)' : '📥 (Received)';
        
        result += `**${chatType}: ${msg.chat_name || msg.sender_name}** ${direction}\n`;
        result += `**Date:** ${date}\n`;
        result += `**Message:** ${msg.content}\n`;
        if (msg.urls) result += `**URLs:** ${msg.urls}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get messages by date: ${error.message}`);
    }
  }

  async handleFindScheduleWithPerson(args) {
    const { person_name, time_period = 'this week' } = args;
    
    try {
      const processedTimePeriod = this.hebrewProcessor.parseHebrewDates(time_period);
      
      // Enhanced search for scheduling terms
      const scheduleQuery = `${person_name} ${processedTimePeriod} meeting schedule plan`;
      const enhancedQuery = this.hebrewProcessor.enhanceWithHebrewMeetingTerms(scheduleQuery);
      
      const results = await this.vectorStore.search(enhancedQuery, 10);
      const scheduleMessages = results.filter(msg => {
        const meetingContext = this.hebrewProcessor.detectMeetingContext(msg.content || '');
        return meetingContext.isMeetingRelated && 
               (msg.content?.includes(person_name) || msg.sender_name?.includes(person_name));
      });

      if (scheduleMessages.length === 0) {
        return {
          content: [{ type: 'text', text: `No scheduling messages found with ${person_name} for ${time_period}` }],
        };
      }

      let result = `Found ${scheduleMessages.length} scheduling messages with ${person_name}:\n\n`;
      for (const msg of scheduleMessages) {
        const date = new Date(msg.timestamp).toLocaleString();
        const chatType = msg.is_group_message ? '👥 Group' : '💬 Individual';
        const direction = msg.is_from_me ? '📤 (Sent)' : '📥 (Received)';
        
        result += `**🗓️ ${chatType}: ${msg.chat_name || msg.sender_name}** ${direction}\n`;
        result += `**Date:** ${date}\n`;
        result += `**Message:** ${msg.content}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to find schedule: ${error.message}`);
    }
  }

  async handleCheckPlansForDay(args) {
    const { day } = args;
    
    try {
      const processedDay = this.hebrewProcessor.parseHebrewDates(day);
      const enhancedQuery = this.hebrewProcessor.enhanceWithHebrewMeetingTerms(`plans ${processedDay}`);
      
      const results = await this.vectorStore.search(enhancedQuery, 20);
      const planMessages = results.filter(msg => {
        const meetingContext = this.hebrewProcessor.detectMeetingContext(msg.content || '');
        return meetingContext.isMeetingRelated;
      });

      if (planMessages.length === 0) {
        return {
          content: [{ type: 'text', text: `No plans found for ${day}` }],
        };
      }

      let result = `Found ${planMessages.length} plans for ${day}:\n\n`;
      for (const msg of planMessages) {
        const date = new Date(msg.timestamp).toLocaleString();
        const chatType = msg.is_group_message ? '👥 Group' : '💬 Individual';
        
        result += `**🗓️ ${chatType}: ${msg.chat_name || msg.sender_name}**\n`;
        result += `**Date:** ${date}\n`;
        result += `**Message:** ${msg.content}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to check plans: ${error.message}`);
    }
  }

  async handleListGroups() {
    try {
      const groups = await this.database.listGroups();
      
      if (groups.length === 0) {
        return {
          content: [{ type: 'text', text: 'No groups found.' }],
        };
      }

      let result = `Found ${groups.length} groups:\n\n`;
      for (const group of groups) {
        const lastMessageDate = new Date(group.last_message_time).toLocaleString();
        result += `**👥 ${group.chat_name}**\n`;
        result += `**Messages:** ${group.message_count}\n`;
        result += `**Participants:** ${group.participant_count}\n`;
        result += `**Last Activity:** ${lastMessageDate}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to list groups: ${error.message}`);
    }
  }

  async handleGetGroupMessages(args) {
    const { group_name, limit = 20 } = args;
    
    try {
      const messages = await this.database.getGroupMessages(group_name, limit);
      
      if (messages.length === 0) {
        return {
          content: [{ type: 'text', text: `No messages found in group "${group_name}".` }],
        };
      }

      let result = `Found ${messages.length} messages in group "${group_name}":\n\n`;
      for (const msg of messages) {
        const date = new Date(msg.timestamp).toLocaleString();
        result += `**${date} - ${msg.sender_name}:** ${msg.content}\n`;
        if (msg.urls) result += `**URLs:** ${msg.urls}\n`;
        result += `\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get group messages: ${error.message}`);
    }
  }

  async handleSearchInGroup(args) {
    const { group_name, query, limit = 10 } = args;
    
    try {
      const processedQuery = this.hebrewProcessor.processSearchQuery(query);
      const messages = await this.database.searchInGroup(group_name, processedQuery.processedQuery, limit);
      
      if (messages.length === 0) {
        return {
          content: [{ type: 'text', text: `No messages found matching "${query}" in group "${group_name}".` }],
        };
      }

      let result = `Found ${messages.length} messages matching "${query}" in group "${group_name}":\n\n`;
      for (const msg of messages) {
        const date = new Date(msg.timestamp).toLocaleString();
        const meetingContext = this.hebrewProcessor.detectMeetingContext(msg.content || '');
        const indicator = meetingContext.isMeetingRelated ? '🗓️ ' : '';
        
        result += `**${indicator}${date} - ${msg.sender_name}:** ${msg.content}\n`;
        if (msg.urls) result += `**URLs:** ${msg.urls}\n`;
        result += `\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to search in group: ${error.message}`);
    }
  }

  async handleGetIndividualMessages(args) {
    const { limit = 20 } = args;
    
    try {
      const messages = await this.database.getIndividualMessages(limit);
      
      if (messages.length === 0) {
        return {
          content: [{ type: 'text', text: 'No individual messages found.' }],
        };
      }

      let result = `Found ${messages.length} individual messages:\n\n`;
      for (const msg of messages) {
        const date = new Date(msg.timestamp).toLocaleString();
        const direction = msg.is_from_me ? '📤 (Sent)' : '📥 (Received)';
        
        result += `**💬 ${msg.sender_name}** ${direction}\n`;
        result += `**Date:** ${date}\n`;
        result += `**Message:** ${msg.content}\n`;
        if (msg.urls) result += `**URLs:** ${msg.urls}\n`;
        result += `---\n\n`;
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      throw new Error(`Failed to get individual messages: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Enhanced WhatsApp MCP Server running on stdio');
  }
}

// Create and run the server
const server = new EnhancedWhatsAppMCPServer();
await server.initialize();
await server.run();
