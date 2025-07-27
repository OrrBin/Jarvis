import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from './database.js';
import LocalVectorStore from './local-vector-store.js';
import * as chrono from 'chrono-node';

class WhatsAppMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'whatsapp-indexer',
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
    this.isInitialized = false;
    this.setupTools();
  }

  async initialize() {
    console.error('🚀 Initializing WhatsApp MCP Server...');
    
    try {
      // Initialize database and vector store
      await this.database.initialize();
      await this.vectorStore.initialize();
      
      this.isInitialized = true;
      console.error('✅ WhatsApp MCP Server initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp MCP Server:', error);
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
            name: 'search_messages',
            description: 'Search WhatsApp messages using natural language queries. Supports semantic search and filters by sender, date, and content type.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language search query (e.g., "get me the url Roni sent me for the thai restaurant")',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10,
                },
                message_type: {
                  type: 'string',
                  description: 'Filter by message type: "sent" (messages you sent), "received" (messages you received), or "all" (default)',
                  enum: ['sent', 'received', 'all'],
                  default: 'all',
                },
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
                  description: 'Optional: Date or date range in natural language (e.g., "today", "this week", "last Monday")',
                },
                chat_filter: {
                  type: 'string',
                  description: 'Optional: Filter by chat/recipient (partial match)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 20)',
                  default: 20,
                },
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
                  description: 'Optional: Date or date range in natural language (e.g., "today", "this week", "last Monday")',
                },
                sender_filter: {
                  type: 'string',
                  description: 'Optional: Filter by sender name (partial match)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 20)',
                  default: 20,
                },
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
                  default: 20,
                },
              },
              required: ['sender_name'],
            },
          },
          {
            name: 'get_messages_by_date',
            description: 'Get messages from a specific date or date range',
            inputSchema: {
              type: 'object',
              properties: {
                date_query: {
                  type: 'string',
                  description: 'Date or date range in natural language (e.g., "today", "this week", "last Monday", "January 15")',
                },
                sender_name: {
                  type: 'string',
                  description: 'Optional: filter by specific sender',
                },
              },
              required: ['date_query'],
            },
          },
          {
            name: 'find_schedule_with_person',
            description: 'Find scheduling-related messages with a specific person',
            inputSchema: {
              type: 'object',
              properties: {
                person_name: {
                  type: 'string',
                  description: 'Name of the person to find scheduling messages with',
                },
                time_period: {
                  type: 'string',
                  description: 'Time period to search (e.g., "this week", "next week", "today")',
                  default: 'this week',
                },
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
                  description: 'Day to check for plans (e.g., "Wednesday", "tomorrow", "January 20")',
                },
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
                  default: 20,
                },
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
                  description: 'Search query for messages within the group',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10,
                },
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
                  default: 20,
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!this.isInitialized) {
          return {
            content: [
              {
                type: 'text',
                text: 'WhatsApp indexer is not initialized yet. Please wait for initialization to complete.',
              },
            ],
          };
        }

        switch (name) {
          case 'whatsapp_status':
            return await this.handleWhatsAppStatus(args);
          
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
            return await this.handleListGroups(args);
          
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

  async handleWhatsAppStatus(args) {
    try {
      // Check if we have any messages in the database
      const messageCount = await this.database.getMessageCount();
      const lastMessageTime = await this.database.getLastMessageTime();
      
      let status = `WhatsApp Indexer Status: Ready
📊 Total messages indexed: ${messageCount}`;

      if (lastMessageTime) {
        const lastMessageDate = new Date(lastMessageTime).toLocaleString();
        status += `
🕒 Last message indexed: ${lastMessageDate}`;
      }

      if (messageCount === 0) {
        status += `
⚠️  No messages found. Make sure the WhatsApp listener service is running and has processed messages.`;
      }

      return {
        content: [
          {
            type: 'text',
            text: status,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error checking status: ${error.message}`,
          },
        ],
      };
    }
  }

  async handleSearchMessages(args) {
    const { query, limit = 10, message_type = 'all' } = args;
    
    try {
      const results = await this.vectorStore.searchSimilar(query, { topK: limit * 2 }); // Get more results to filter
      
      // Filter by message type if specified
      let filteredResults = results;
      if (message_type === 'sent') {
        filteredResults = results.filter(result => result.isFromMe === 1 || result.isFromMe === true);
      } else if (message_type === 'received') {
        filteredResults = results.filter(result => result.isFromMe === 0 || result.isFromMe === false || !result.isFromMe);
      }
      
      // Limit the results after filtering
      filteredResults = filteredResults.slice(0, limit);
      
      if (filteredResults.length === 0) {
        const typeText = message_type === 'all' ? '' : ` (${message_type} messages only)`;
        return {
          content: [
            {
              type: 'text',
              text: `No messages found for query: "${query}"${typeText}`,
            },
          ],
        };
      }

      const formattedResults = filteredResults.map(result => {
        const date = new Date(result.timestamp).toLocaleString();
        const urls = result.urls ? result.urls.split('|').join(', ') : '';
        const messageDirection = result.isFromMe ? '📤 (Sent)' : '📥 (Received)';
        
        return `**From:** ${result.senderName} ${messageDirection}
**Date:** ${date}
**Message:** ${result.content}
${urls ? `**URLs:** ${urls}` : ''}
**Relevance Score:** ${result.score?.toFixed(3) || 'N/A'}
---`;
      }).join('\n\n');

      const typeText = message_type === 'all' ? '' : ` (${message_type} messages only)`;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${filteredResults.length} messages for "${query}"${typeText}:\n\n${formattedResults}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async handleGetSentMessages(args) {
    const { date_query, chat_filter, limit = 20 } = args;
    
    try {
      let whereClause = 'WHERE is_from_me = 1';
      let params = [];
      
      // Add date filter if provided
      if (date_query) {
        const parsedDates = chrono.parse(date_query);
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
      
      // Add chat filter if provided
      if (chat_filter) {
        whereClause += ' AND chat_id LIKE ?';
        params.push(`%${chat_filter}%`);
      }
      
      const query = `
        SELECT * FROM messages 
        ${whereClause}
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      params.push(limit);
      
      const messages = await this.database.query(query, params);
      
      if (messages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No sent messages found matching your criteria',
            },
          ],
        };
      }

      const formattedMessages = messages.map(msg => {
        const date = new Date(msg.timestamp).toLocaleString();
        return `**📤 To:** ${msg.chat_id}
**Date:** ${date}
**Message:** ${msg.content}
---`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${messages.length} sent messages:\n\n${formattedMessages}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get sent messages: ${error.message}`);
    }
  }

  async handleGetReceivedMessages(args) {
    const { date_query, sender_filter, limit = 20 } = args;
    
    try {
      let whereClause = 'WHERE (is_from_me = 0 OR is_from_me IS NULL)';
      let params = [];
      
      // Add date filter if provided
      if (date_query) {
        const parsedDates = chrono.parse(date_query);
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
      
      // Add sender filter if provided
      if (sender_filter) {
        whereClause += ' AND sender_name LIKE ?';
        params.push(`%${sender_filter}%`);
      }
      
      const query = `
        SELECT * FROM messages 
        ${whereClause}
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      params.push(limit);
      
      const messages = await this.database.query(query, params);
      
      if (messages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No received messages found matching your criteria',
            },
          ],
        };
      }

      const formattedMessages = messages.map(msg => {
        const date = new Date(msg.timestamp).toLocaleString();
        return `**📥 From:** ${msg.sender_name}
**Date:** ${date}
**Message:** ${msg.content}
---`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${messages.length} received messages:\n\n${formattedMessages}`,
          },
        ],
      };
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
          content: [
            {
              type: 'text',
              text: `No URLs found from ${sender_name}`,
            },
          ],
        };
      }

      const formattedUrls = urls.map(urlData => {
        const date = new Date(urlData.timestamp).toLocaleString();
        return `**URL:** ${urlData.url}
**Domain:** ${urlData.domain || 'Unknown'}
**Date:** ${date}
**Context:** ${urlData.content.substring(0, 100)}...
---`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${urls.length} URLs from ${sender_name}:\n\n${formattedUrls}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get URLs: ${error.message}`);
    }
  }

  async handleGetMessagesByDate(args) {
    const { date_query, sender_name } = args;
    
    try {
      // Parse the date query
      const parsedDates = chrono.parse(date_query);
      if (parsedDates.length === 0) {
        throw new Error(`Could not parse date: "${date_query}"`);
      }

      const date = parsedDates[0].start.date();
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const messages = await this.database.getMessagesByDateRange(
        startOfDay.getTime(),
        endOfDay.getTime(),
        sender_name
      );

      if (messages.length === 0) {
        const senderText = sender_name ? ` from ${sender_name}` : '';
        return {
          content: [
            {
              type: 'text',
              text: `No messages found${senderText} for ${date_query}`,
            },
          ],
        };
      }

      const formattedMessages = messages.map(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const urls = msg.urls ? ` [URLs: ${msg.urls}]` : '';
        
        return `**${time} - ${msg.sender_name}:** ${msg.content}${urls}`;
      }).join('\n');

      const senderText = sender_name ? ` from ${sender_name}` : '';
      return {
        content: [
          {
            type: 'text',
            text: `Found ${messages.length} messages${senderText} for ${date_query}:\n\n${formattedMessages}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get messages by date: ${error.message}`);
    }
  }

  async handleFindScheduleWithPerson(args) {
    const { person_name, time_period = 'this week' } = args;
    
    try {
      // Create a search query that looks for scheduling-related messages
      const schedulingQuery = `${person_name} meet meeting schedule appointment plan when time`;
      
      // Parse time period to get date range
      const parsedDates = chrono.parse(time_period);
      let dateRange = null;
      
      if (parsedDates.length > 0) {
        const date = parsedDates[0].start.date();
        // For "this week", create a week range
        if (time_period.toLowerCase().includes('week')) {
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          
          dateRange = {
            start: startOfWeek.getTime(),
            end: endOfWeek.getTime(),
          };
        }
      }

      const results = await this.vectorStore.searchSimilar(schedulingQuery, { topK: 20 });

      // Filter results for the specific person and scheduling content
      const schedulingMessages = results.filter(msg => {
        const senderMatch = msg.sender_name?.toLowerCase().includes(person_name.toLowerCase());
        const contentMatch = /\b(meet|meeting|schedule|appointment|plan|when|time|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(msg.content);
        
        return senderMatch && contentMatch;
      });

      if (schedulingMessages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No scheduling messages found with ${person_name} for ${time_period}`,
            },
          ],
        };
      }

      const formattedMessages = schedulingMessages.map(msg => {
        const date = new Date(msg.timestamp).toLocaleString();
        return `**${date} - ${msg.sender_name}:** ${msg.content}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${schedulingMessages.length} scheduling-related messages with ${person_name} for ${time_period}:\n\n${formattedMessages}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find schedule messages: ${error.message}`);
    }
  }

  async handleCheckPlansForDay(args) {
    const { day } = args;
    
    try {
      // Parse the day
      const parsedDates = chrono.parse(day);
      if (parsedDates.length === 0) {
        throw new Error(`Could not parse day: "${day}"`);
      }

      const date = parsedDates[0].start.date();
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Search for plan-related messages on that day
      const planQuery = 'plan plans meeting appointment schedule busy free available';
      
      const results = await this.vectorStore.searchSimilar(planQuery, { topK: 50 });

      // Filter for messages on the specific day that mention plans
      const dayPlans = results.filter(msg => {
        const messageDate = new Date(msg.timestamp);
        const isOnDay = messageDate >= startOfDay && messageDate <= endOfDay;
        const hasPlanContent = /\b(plan|plans|meeting|appointment|schedule|busy|free|available)\b/i.test(msg.content);
        
        return isOnDay && hasPlanContent;
      });

      if (dayPlans.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No plans found for ${day}`,
            },
          ],
        };
      }

      const formattedPlans = dayPlans.map(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        return `**${time} - ${msg.sender_name}:** ${msg.content}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${dayPlans.length} plan-related messages for ${day}:\n\n${formattedPlans}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to check plans: ${error.message}`);
    }
  }

  async handleListGroups(args) {
    try {
      const groups = await this.database.listGroups();
      
      if (groups.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No groups found in the database.',
            },
          ],
        };
      }

      const formattedGroups = groups.map(group => {
        const lastMessageDate = new Date(group.last_message_time).toLocaleDateString();
        return `**${group.chat_name}**\n- Messages: ${group.message_count}\n- Participants: ${group.participant_count}\n- Last activity: ${lastMessageDate}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${groups.length} groups:\n\n${formattedGroups}`,
          },
        ],
      };
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
          content: [
            {
              type: 'text',
              text: `No messages found in group "${group_name}".`,
            },
          ],
        };
      }

      const formattedMessages = messages.map(msg => {
        const date = new Date(msg.timestamp).toLocaleString();
        const urls = msg.urls ? `\nURLs: ${msg.urls}` : '';
        return `**${date} - ${msg.sender_name}:** ${msg.content}${urls}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${messages.length} messages in group "${group_name}":\n\n${formattedMessages}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get group messages: ${error.message}`);
    }
  }

  async handleSearchInGroup(args) {
    const { group_name, query, limit = 10 } = args;
    
    try {
      const messages = await this.database.searchInGroup(group_name, query, limit);
      
      if (messages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No messages found matching "${query}" in group "${group_name}".`,
            },
          ],
        };
      }

      const formattedMessages = messages.map(msg => {
        const date = new Date(msg.timestamp).toLocaleString();
        const urls = msg.urls ? `\nURLs: ${msg.urls}` : '';
        return `**${date} - ${msg.sender_name}:** ${msg.content}${urls}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${messages.length} messages matching "${query}" in group "${group_name}":\n\n${formattedMessages}`,
          },
        ],
      };
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
          content: [
            {
              type: 'text',
              text: 'No individual messages found.',
            },
          ],
        };
      }

      const formattedMessages = messages.map(msg => {
        const date = new Date(msg.timestamp).toLocaleString();
        const urls = msg.urls ? `\nURLs: ${msg.urls}` : '';
        return `**${date} - ${msg.sender_name}:** ${msg.content}${urls}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${messages.length} individual messages:\n\n${formattedMessages}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get individual messages: ${error.message}`);
    }
  }

  async start() {
    console.error('🚀 Starting WhatsApp MCP Server...');
    
    // Initialize database and vector store first
    await this.initialize();
    
    // Start MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('✅ WhatsApp MCP Server is running and ready');
  }

  async stop() {
    console.error('🛑 Stopping WhatsApp MCP Server...');
    // No WhatsApp client to shutdown, just cleanup if needed
    console.error('✅ WhatsApp MCP Server stopped');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('\n🛑 Received SIGINT, shutting down gracefully...');
  if (global.mcpServer) {
    await global.mcpServer.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (global.mcpServer) {
    await global.mcpServer.stop();
  }
  process.exit(0);
});

// Start the server
const mcpServer = new WhatsAppMCPServer();
global.mcpServer = mcpServer;

mcpServer.start().catch(error => {
  console.error('❌ Failed to start MCP server:', error);
  process.exit(1);
});
