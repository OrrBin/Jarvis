import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import WhatsAppClient from './whatsapp-client.js';
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
    
    this.whatsappClient = new WhatsAppClient();
    this.setupTools();
  }

  setupTools() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'whatsapp_status',
            description: 'Check the status of the WhatsApp client connection',
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
              },
              required: ['query'],
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
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'whatsapp_status':
            return await this.handleWhatsAppStatus(args);
          
          case 'search_messages':
            return await this.handleSearchMessages(args);
          
          case 'get_urls_by_sender':
            return await this.handleGetUrlsBySender(args);
          
          case 'get_messages_by_date':
            return await this.handleGetMessagesByDate(args);
          
          case 'find_schedule_with_person':
            return await this.handleFindScheduleWithPerson(args);
          
          case 'check_plans_for_day':
            return await this.handleCheckPlansForDay(args);
          
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
    const status = this.whatsappClient.isReady ? 'Connected and ready' : 'Not ready (authenticating or disconnected)';
    
    return {
      content: [
        {
          type: 'text',
          text: `WhatsApp Client Status: ${status}`,
        },
      ],
    };
  }

  async handleSearchMessages(args) {
    if (!this.whatsappClient.isReady) {
      return {
        content: [
          {
            type: 'text',
            text: 'WhatsApp client is not ready yet. Please wait for authentication to complete.',
          },
        ],
      };
    }

    const { query, limit = 10 } = args;
    
    const results = await this.whatsappClient.searchMessages(query, { limit });
    
    if (results.results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No messages found for query: "${query}"`,
          },
        ],
      };
    }

    const formattedResults = results.results.map(msg => {
      const date = new Date(msg.timestamp).toLocaleString();
      const urls = msg.urls ? msg.urls.split('|').join(', ') : '';
      
      return `**From:** ${msg.senderName || msg.sender_name}
**Date:** ${date}
**Message:** ${msg.content}
${urls ? `**URLs:** ${urls}` : ''}
**Relevance Score:** ${msg.relevanceScore?.toFixed(3) || 'N/A'}
---`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${results.results.length} messages for "${query}":\n\n${formattedResults}`,
        },
      ],
    };
  }

  async handleGetUrlsBySender(args) {
    if (!this.whatsappClient.isReady) {
      return {
        content: [
          {
            type: 'text',
            text: 'WhatsApp client is not ready yet. Please wait for authentication to complete.',
          },
        ],
      };
    }

    const { sender_name, limit = 20 } = args;
    
    const urls = await this.whatsappClient.getUrlsBySender(sender_name, limit);
    
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
  }

  async handleGetMessagesByDate(args) {
    if (!this.whatsappClient.isReady) {
      return {
        content: [
          {
            type: 'text',
            text: 'WhatsApp client is not ready yet. Please wait for authentication to complete.',
          },
        ],
      };
    }

    const { date_query, sender_name } = args;
    
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

    const messages = await this.whatsappClient.getMessagesByDateRange(
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
  }

  async handleFindScheduleWithPerson(args) {
    if (!this.whatsappClient.isReady) {
      return {
        content: [
          {
            type: 'text',
            text: 'WhatsApp client is not ready yet. Please wait for authentication to complete.',
          },
        ],
      };
    }

    const { person_name, time_period = 'this week' } = args;
    
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

    const results = await this.whatsappClient.searchMessages(schedulingQuery, {
      limit: 20,
    });

    // Filter results for the specific person and scheduling content
    const schedulingMessages = results.results.filter(msg => {
      const senderMatch = msg.senderName?.toLowerCase().includes(person_name.toLowerCase()) ||
                         msg.sender_name?.toLowerCase().includes(person_name.toLowerCase());
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
      return `**${date} - ${msg.senderName || msg.sender_name}:** ${msg.content}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${schedulingMessages.length} scheduling-related messages with ${person_name} for ${time_period}:\n\n${formattedMessages}`,
        },
      ],
    };
  }

  async handleCheckPlansForDay(args) {
    if (!this.whatsappClient.isReady) {
      return {
        content: [
          {
            type: 'text',
            text: 'WhatsApp client is not ready yet. Please wait for authentication to complete.',
          },
        ],
      };
    }

    const { day } = args;
    
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
    
    const results = await this.whatsappClient.searchMessages(planQuery, {
      limit: 50,
    });

    // Filter for messages on the specific day that mention plans
    const dayPlans = results.results.filter(msg => {
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
      return `**${time} - ${msg.senderName || msg.sender_name}:** ${msg.content}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${dayPlans.length} plan-related messages for ${day}:\n\n${formattedPlans}`,
        },
      ],
    };
  }

  async start() {
    console.log('🚀 Starting WhatsApp MCP Server...');
    
    // Start MCP server first
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.log('✅ WhatsApp MCP Server is running');
    
    // Initialize WhatsApp client in background (non-blocking) with timeout
    Promise.race([
      this.whatsappClient.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('WhatsApp initialization timeout')), 30000)
      )
    ]).catch(error => {
      console.error('❌ Failed to initialize WhatsApp client:', error);
      console.log('💡 MCP server will continue running. WhatsApp tools will show "not ready" status.');
    });
  }

  async stop() {
    console.log('🛑 Stopping WhatsApp MCP Server...');
    await this.whatsappClient.shutdown();
    console.log('✅ WhatsApp MCP Server stopped');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (global.mcpServer) {
    await global.mcpServer.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
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
