#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import EnhancedDatabase from './enhanced-database.js';
import EnhancedVectorStore from './enhanced-vector-store.js';
import EnhancedMessageProcessor from './enhanced-message-processor.js';
import * as chrono from 'chrono-node';

class EnhancedMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'enhanced-whatsapp-indexer',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.database = new EnhancedDatabase();
    this.vectorStore = new EnhancedVectorStore();
    this.messageProcessor = new EnhancedMessageProcessor();
    this.isInitialized = false;

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  async initialize() {
    console.error('🚀 Initializing Enhanced MCP Server...');
    
    try {
      await this.database.initialize();
      await this.vectorStore.initialize();
      this.isInitialized = true;
      console.error('✅ Enhanced MCP Server initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced MCP Server:', error);
      throw error;
    }
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'whatsapp_status',
            description: 'Check the status of the enhanced WhatsApp indexer service',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'search_messages',
            description: 'Search messages using natural language queries with enhanced multilingual support',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language search query (supports Hebrew and English)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10,
                },
                message_type: {
                  type: 'string',
                  enum: ['sent', 'received', 'all'],
                  description: 'Filter by message type',
                  default: 'all',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'search_by_entity',
            description: 'Search messages by specific entities (people, places, activities)',
            inputSchema: {
              type: 'object',
              properties: {
                entity_type: {
                  type: 'string',
                  enum: ['people', 'places', 'activities', 'times'],
                  description: 'Type of entity to search for',
                },
                entity_value: {
                  type: 'string',
                  description: 'Value of the entity to search for',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10,
                },
              },
              required: ['entity_type', 'entity_value'],
            },
          },
          {
            name: 'search_scheduling',
            description: 'Search for scheduling-related messages with enhanced detection',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for scheduling messages',
                },
                participants: {
                  type: 'string',
                  description: 'Filter by participants in the scheduling',
                },
                activities: {
                  type: 'string',
                  description: 'Filter by activities mentioned',
                },
                time_period: {
                  type: 'string',
                  description: 'Time period to search (e.g., "this week", "today")',
                  default: 'this week',
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
            description: 'Get all URLs shared by a specific person with enhanced context',
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
            name: 'get_urls_by_purpose',
            description: 'Get URLs by their inferred purpose (restaurant, movie, etc.)',
            inputSchema: {
              type: 'object',
              properties: {
                purpose: {
                  type: 'string',
                  enum: ['restaurant', 'movie', 'media', 'location', 'social', 'general'],
                  description: 'Purpose/category of URLs to retrieve',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of URLs to return (default: 20)',
                  default: 20,
                },
              },
              required: ['purpose'],
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
                  description: 'Date in natural language (e.g., "today", "last Monday")',
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
            name: 'get_received_messages',
            description: 'Get messages that you received, with enhanced filtering',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 20)',
                  default: 20,
                },
                sender_filter: {
                  type: 'string',
                  description: 'Optional: Filter by sender name (partial match)',
                },
                date_query: {
                  type: 'string',
                  description: 'Optional: Date or date range in natural language',
                },
              },
            },
          },
          {
            name: 'get_sent_messages',
            description: 'Get messages that you sent, with enhanced filtering',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 20)',
                  default: 20,
                },
                chat_filter: {
                  type: 'string',
                  description: 'Optional: Filter by chat/recipient (partial match)',
                },
                date_query: {
                  type: 'string',
                  description: 'Optional: Date or date range in natural language',
                },
              },
            },
          },
          {
            name: 'find_schedule_with_person',
            description: 'Find enhanced scheduling-related messages with a specific person',
            inputSchema: {
              type: 'object',
              properties: {
                person_name: {
                  type: 'string',
                  description: 'Name of the person to find scheduling messages with',
                },
                time_period: {
                  type: 'string',
                  description: 'Time period to search (default: "this week")',
                  default: 'this week',
                },
              },
              required: ['person_name'],
            },
          },
          {
            name: 'check_plans_for_day',
            description: 'Check for plans or appointments on a specific day with enhanced detection',
            inputSchema: {
              type: 'object',
              properties: {
                day: {
                  type: 'string',
                  description: 'Day to check for plans (e.g., "Wednesday", "tomorrow")',
                },
              },
              required: ['day'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.isInitialized) {
        throw new McpError(ErrorCode.InternalError, 'Server not initialized');
      }

      try {
        switch (name) {
          case 'whatsapp_status':
            return await this.handleWhatsAppStatus();
          
          case 'search_messages':
            return await this.handleSearchMessages(args);
          
          case 'search_by_entity':
            return await this.handleSearchByEntity(args);
          
          case 'search_scheduling':
            return await this.handleSearchScheduling(args);
          
          case 'get_urls_by_sender':
            return await this.handleGetUrlsBySender(args);
          
          case 'get_urls_by_purpose':
            return await this.handleGetUrlsByPurpose(args);
          
          case 'get_messages_by_date':
            return await this.handleGetMessagesByDate(args);
          
          case 'get_received_messages':
            return await this.handleGetReceivedMessages(args);
          
          case 'get_sent_messages':
            return await this.handleGetSentMessages(args);
          
          case 'find_schedule_with_person':
            return await this.handleFindScheduleWithPerson(args);
          
          case 'check_plans_for_day':
            return await this.handleCheckPlansForDay(args);
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error in tool ${name}:`, error);
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
      }
    });
  }

  async handleWhatsAppStatus() {
    const stats = await this.database.getStats();
    const vectorStats = await this.vectorStore.getStats();
    
    return {
      content: [
        {
          type: 'text',
          text: `Enhanced WhatsApp Indexer Status:

📊 **Database Statistics:**
- Total messages: ${stats.total_messages}
- Unique senders: ${stats.unique_senders}
- Messages with URLs: ${stats.messages_with_urls}
- Scheduling messages: ${stats.scheduling_messages}
- Sent messages: ${stats.sent_messages}
- Received messages: ${stats.received_messages}

🧠 **Vector Store Statistics:**
- Active vectors: ${vectorStats.activeVectors}
- Model: ${vectorStats.modelName}
- Dimension: ${vectorStats.dimension}
- Language distribution: ${JSON.stringify(vectorStats.languageDistribution)}

✨ **Enhanced Features:**
- Multilingual support (Hebrew + English)
- Entity extraction (people, places, activities)
- Enhanced URL context and purpose classification
- Advanced scheduling detection
- Full-text search with FTS5
- Semantic vector search

🟢 **Status: Ready**`,
        },
      ],
    };
  }

  async handleSearchMessages(args) {
    const { query, limit = 10, message_type = 'all' } = args;
    
    // Process query with enhanced processor
    const processedQuery = this.messageProcessor.processSearchQuery(query);
    
    // Search using enhanced vector store
    const vectorResults = await this.vectorStore.searchSimilar(query, {
      topK: limit,
      senderFilter: processedQuery.senderFilter,
      dateRange: processedQuery.dateRange,
      includeUrls: processedQuery.urlFilter ? true : null,
      schedulingFilter: processedQuery.schedulingFilter,
      entityFilter: processedQuery.entities,
      languages: processedQuery.languages,
    });

    // Also search database for comprehensive results
    const dbResults = await this.database.searchMessages(query, {
      limit,
      senderFilter: processedQuery.senderFilter,
      dateRange: processedQuery.dateRange,
      urlFilter: processedQuery.urlFilter,
      schedulingFilter: processedQuery.schedulingFilter,
    });

    // Combine results
    const combinedResults = this.combineResults(vectorResults, dbResults);

    // Filter by message type
    const filteredResults = this.filterByMessageType(combinedResults, message_type);

    return {
      content: [
        {
          type: 'text',
          text: this.formatSearchResults(filteredResults, query, {
            languages: processedQuery.languages,
            entities: processedQuery.entities,
            vectorCount: vectorResults.length,
            dbCount: dbResults.length,
          }),
        },
      ],
    };
  }

  async handleSearchByEntity(args) {
    const { entity_type, entity_value, limit = 10 } = args;
    
    const results = await this.vectorStore.searchByEntity(entity_type, entity_value, { topK: limit });
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatEntitySearchResults(results, entity_type, entity_value),
        },
      ],
    };
  }

  async handleSearchScheduling(args) {
    const { query, participants, activities, time_period = 'this week', limit = 10 } = args;
    
    // Parse time period
    const timeRange = this.parseTimeRange(time_period);
    
    const results = await this.vectorStore.searchScheduling(query, {
      topK: limit,
      timeRange,
      participants,
      activities,
    });
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatSchedulingResults(results, query),
        },
      ],
    };
  }

  async handleGetUrlsBySender(args) {
    const { sender_name, limit = 20 } = args;
    
    const results = await this.database.getUrlsBySender(sender_name, limit);
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatUrlResults(results, `URLs from ${sender_name}`),
        },
      ],
    };
  }

  async handleGetUrlsByPurpose(args) {
    const { purpose, limit = 20 } = args;
    
    const results = await this.database.getUrlsByPurpose(purpose, limit);
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatUrlResults(results, `${purpose} URLs`),
        },
      ],
    };
  }

  async handleGetMessagesByDate(args) {
    const { date_query, sender_name } = args;
    
    const timeRange = this.parseTimeRange(date_query);
    if (!timeRange) {
      throw new McpError(ErrorCode.InvalidParams, `Could not parse date: ${date_query}`);
    }
    
    const results = await this.database.getMessagesByDateRange(
      timeRange.start,
      timeRange.end,
      sender_name
    );
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatMessageResults(results, `Messages for ${date_query}`),
        },
      ],
    };
  }

  async handleGetReceivedMessages(args) {
    const { limit = 20, sender_filter, date_query } = args;
    
    let timeRange = null;
    if (date_query) {
      timeRange = this.parseTimeRange(date_query);
    }
    
    const results = await this.database.searchMessages('', {
      limit,
      senderFilter: sender_filter,
      dateRange: timeRange,
    });
    
    // Filter for received messages only
    const receivedMessages = results.filter(msg => !msg.is_from_me);
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatMessageResults(receivedMessages, 'Received messages'),
        },
      ],
    };
  }

  async handleGetSentMessages(args) {
    const { limit = 20, chat_filter, date_query } = args;
    
    let timeRange = null;
    if (date_query) {
      timeRange = this.parseTimeRange(date_query);
    }
    
    const results = await this.database.searchMessages('', {
      limit,
      senderFilter: chat_filter,
      dateRange: timeRange,
    });
    
    // Filter for sent messages only
    const sentMessages = results.filter(msg => msg.is_from_me);
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatMessageResults(sentMessages, 'Sent messages'),
        },
      ],
    };
  }

  async handleFindScheduleWithPerson(args) {
    const { person_name, time_period = 'this week' } = args;
    
    const timeRange = this.parseTimeRange(time_period);
    
    const results = await this.vectorStore.searchScheduling(`schedule with ${person_name}`, {
      topK: 10,
      timeRange,
      participants: person_name,
    });
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatSchedulingResults(results, `Scheduling with ${person_name}`),
        },
      ],
    };
  }

  async handleCheckPlansForDay(args) {
    const { day } = args;
    
    const timeRange = this.parseTimeRange(day);
    if (!timeRange) {
      throw new McpError(ErrorCode.InvalidParams, `Could not parse day: ${day}`);
    }
    
    const results = await this.database.getSchedulingMessages({
      limit: 20,
      timeRange,
    });
    
    return {
      content: [
        {
          type: 'text',
          text: this.formatSchedulingResults(results, `Plans for ${day}`),
        },
      ],
    };
  }

  // Helper methods
  combineResults(vectorResults, dbResults) {
    const resultMap = new Map();
    
    vectorResults.forEach(result => {
      resultMap.set(result.messageId || result.id, {
        ...result,
        source: 'vector',
        relevanceScore: result.score || 0,
      });
    });
    
    dbResults.forEach(result => {
      const existing = resultMap.get(result.id);
      if (existing) {
        resultMap.set(result.id, { ...existing, ...result, source: 'both' });
      } else {
        resultMap.set(result.id, { ...result, source: 'database', relevanceScore: 0 });
      }
    });
    
    return Array.from(resultMap.values())
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  filterByMessageType(results, messageType) {
    if (messageType === 'all') return results;
    
    return results.filter(msg => {
      if (messageType === 'sent') return msg.is_from_me;
      if (messageType === 'received') return !msg.is_from_me;
      return true;
    });
  }

  parseTimeRange(timeQuery) {
    try {
      const parsed = chrono.parse(timeQuery);
      if (parsed.length === 0) return null;
      
      const date = parsed[0].start.date();
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      return {
        start: startOfDay.getTime(),
        end: endOfDay.getTime(),
      };
    } catch (error) {
      return null;
    }
  }

  formatSearchResults(results, query, metadata = {}) {
    if (results.length === 0) {
      return `No messages found for "${query}"`;
    }

    let output = `Found ${results.length} messages for "${query}"`;
    
    if (metadata.languages && metadata.languages.length > 0) {
      output += ` (Languages: ${metadata.languages.join(', ')})`;
    }
    
    if (metadata.vectorCount || metadata.dbCount) {
      output += `\n(Vector: ${metadata.vectorCount}, Database: ${metadata.dbCount})`;
    }
    
    output += ':\n\n';

    results.forEach(msg => {
      const date = new Date(msg.timestamp).toLocaleString();
      const direction = msg.is_from_me ? '📤' : '📥';
      const sender = msg.is_from_me ? 'Me' : msg.sender_name;
      
      output += `**${direction} From:** ${sender}\n`;
      output += `**Date:** ${date}\n`;
      output += `**Message:** ${msg.content}\n`;
      
      if (msg.relevanceScore) {
        output += `**Relevance Score:** ${msg.relevanceScore.toFixed(3)}\n`;
      }
      
      output += '---\n\n';
    });

    return output;
  }

  formatEntitySearchResults(results, entityType, entityValue) {
    if (results.length === 0) {
      return `No messages found with ${entityType}: "${entityValue}"`;
    }

    let output = `Found ${results.length} messages with ${entityType}: "${entityValue}":\n\n`;

    results.forEach(msg => {
      const date = new Date(msg.timestamp).toLocaleString();
      const direction = msg.isFromMe ? '📤' : '📥';
      
      output += `**${direction} From:** ${msg.senderName}\n`;
      output += `**Date:** ${date}\n`;
      output += `**Message:** ${msg.content}\n`;
      output += `**Score:** ${msg.score?.toFixed(3)}\n`;
      output += '---\n\n';
    });

    return output;
  }

  formatSchedulingResults(results, title) {
    if (results.length === 0) {
      return `No scheduling messages found for "${title}"`;
    }

    let output = `${title} - Found ${results.length} scheduling messages:\n\n`;

    results.forEach(msg => {
      const date = new Date(msg.timestamp).toLocaleString();
      const direction = msg.is_from_me ? '📤' : '📥';
      const sender = msg.is_from_me ? 'Me' : msg.sender_name;
      
      output += `**${direction} From:** ${sender}\n`;
      output += `**Date:** ${date}\n`;
      output += `**Message:** ${msg.content}\n`;
      
      if (msg.participants) {
        const participants = JSON.parse(msg.participants || '[]');
        if (participants.length > 0) {
          output += `**Participants:** ${participants.join(', ')}\n`;
        }
      }
      
      if (msg.activities) {
        const activities = JSON.parse(msg.activities || '[]');
        if (activities.length > 0) {
          output += `**Activities:** ${activities.join(', ')}\n`;
        }
      }
      
      output += '---\n\n';
    });

    return output;
  }

  formatUrlResults(results, title) {
    if (results.length === 0) {
      return `No URLs found for "${title}"`;
    }

    let output = `${title} - Found ${results.length} URLs:\n\n`;

    results.forEach(url => {
      const date = new Date(url.timestamp).toLocaleString();
      
      output += `**URL:** ${url.url}\n`;
      output += `**From:** ${url.sender_name}\n`;
      output += `**Date:** ${date}\n`;
      output += `**Domain:** ${url.domain || 'Unknown'}\n`;
      output += `**Purpose:** ${url.purpose || 'General'}\n`;
      
      if (url.context_before || url.context_after) {
        output += `**Context:** ${url.context_before || ''} ... ${url.context_after || ''}\n`;
      }
      
      output += `**Message:** ${url.content}\n`;
      output += '---\n\n';
    });

    return output;
  }

  formatMessageResults(results, title) {
    if (results.length === 0) {
      return `No messages found for "${title}"`;
    }

    let output = `${title} - Found ${results.length} messages:\n\n`;

    results.forEach(msg => {
      const date = new Date(msg.timestamp).toLocaleString();
      const direction = msg.is_from_me ? '📤' : '📥';
      const sender = msg.is_from_me ? 'Me' : msg.sender_name;
      
      output += `**${direction} From:** ${sender}\n`;
      output += `**Date:** ${date}\n`;
      output += `**Message:** ${msg.content}\n`;
      output += '---\n\n';
    });

    return output;
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Enhanced WhatsApp Indexer MCP server running on stdio');
  }
}

// Initialize and run the server
const server = new EnhancedMCPServer();
await server.initialize();
await server.run();
