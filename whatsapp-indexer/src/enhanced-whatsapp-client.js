import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import EnhancedDatabase from './enhanced-database.js';
import EnhancedVectorStore from './enhanced-vector-store.js';
import EnhancedMessageProcessor from './enhanced-message-processor.js';

class EnhancedWhatsAppClient {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "whatsapp-indexer-enhanced",
        dataPath: "./.wwebjs_auth"
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
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      }
    });
    
    this.database = new EnhancedDatabase();
    this.vectorStore = new EnhancedVectorStore();
    this.messageProcessor = new EnhancedMessageProcessor();
    this.isReady = false;
  }

  async initialize() {
    console.log('🚀 Initializing Enhanced WhatsApp Indexer...');
    
    // Initialize database and vector store
    await this.database.initialize();
    await this.vectorStore.initialize();
    
    // Set up WhatsApp client event handlers
    this.setupEventHandlers();
    
    // Initialize WhatsApp client
    await this.client.initialize();
  }

  setupEventHandlers() {
    this.client.on('qr', (qr) => {
      console.log('📱 Scan this QR code with your WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log('💡 After scanning, the session will be saved for future use');
    });

    this.client.on('ready', () => {
      console.log('✅ Enhanced WhatsApp client is ready!');
      this.isReady = true;
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp client authenticated - session saved');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ Authentication failed:', msg);
      console.log('🔄 You may need to scan the QR code again');
    });

    this.client.on('disconnected', (reason) => {
      console.log('📱 WhatsApp client disconnected:', reason);
      this.isReady = false;
      
      if (reason === 'NAVIGATION') {
        console.log('💡 Session may have expired. You might need to scan QR code again.');
      }
    });

    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
    });

    this.client.on('change_state', (state) => {
      console.log('🔄 WhatsApp state changed:', state);
    });

    // Main message handler
    this.client.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    // Handle message edits
    this.client.on('message_edit', async (message, newBody, prevBody) => {
      try {
        console.log('📝 Message edited, updating index...');
        await this.handleMessage(message);
      } catch (error) {
        console.error('Error handling message edit:', error);
      }
    });

    // Handle message deletions
    this.client.on('message_revoke_everyone', async (message) => {
      try {
        console.log('🗑️ Message deleted, removing from index...');
        await this.vectorStore.deleteMessage(message.id.id);
      } catch (error) {
        console.error('Error handling message deletion:', error);
      }
    });
  }

  async handleMessage(message) {
    // Skip status messages and notification messages
    if (message.isStatus || message.type === 'notification_template') {
      return;
    }

    try {
      // Get chat and contact information
      let chat = null;
      let contact = null;
      
      try {
        chat = await message.getChat();
        if (!message.fromMe) {
          contact = await message.getContact();
        }
      } catch (error) {
        console.log('⚠️ Could not get chat/contact info:', error.message);
      }

      // Process the message with enhanced processor
      const processedMessage = await this.messageProcessor.processMessage(message, chat, contact);
      
      // Skip if message processing returned null
      if (!processedMessage) {
        return;
      }
      
      console.log(`📨 Enhanced processing: ${processedMessage.senderName} (${processedMessage.languages.join(', ')}): ${processedMessage.content?.substring(0, 50) || '[no content]'}...`);
      
      // Save to enhanced database
      await this.database.saveMessage(processedMessage);
      
      // Index in enhanced vector store
      await this.vectorStore.indexMessage(processedMessage);
      
      // Log enhanced features
      if (processedMessage.urls.length > 0) {
        console.log(`🔗 Found ${processedMessage.urls.length} URL(s) with context and purpose classification`);
        processedMessage.urls.forEach(url => {
          console.log(`   - ${url.url} (${url.purpose})`);
        });
      }
      
      if (processedMessage.schedulingInfo.isScheduling) {
        console.log(`📅 Scheduling detected: ${processedMessage.schedulingInfo.activities.join(', ')}`);
        if (processedMessage.schedulingInfo.participants.length > 0) {
          console.log(`   - Participants: ${processedMessage.schedulingInfo.participants.join(', ')}`);
        }
      }
      
      if (processedMessage.entities.people.length > 0) {
        console.log(`👥 People mentioned: ${processedMessage.entities.people.join(', ')}`);
      }
      
      if (processedMessage.entities.places.length > 0) {
        console.log(`📍 Places mentioned: ${processedMessage.entities.places.join(', ')}`);
      }
      
    } catch (error) {
      console.error('Error processing message:', error);
      console.error('Raw message data:', {
        id: message.id,
        from: message.from,
        body: message.body?.substring(0, 100),
        type: message.type,
      });
    }
  }

  async searchMessages(query, options = {}) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    // Process the search query with enhanced processor
    const processedQuery = this.messageProcessor.processSearchQuery(query);
    
    console.log('🔍 Enhanced search query processing:', {
      originalQuery: processedQuery.originalQuery,
      languages: processedQuery.languages,
      entities: processedQuery.entities,
      schedulingFilter: processedQuery.schedulingFilter
    });
    
    // Search in enhanced vector store
    const vectorResults = await this.vectorStore.searchSimilar(
      processedQuery.cleanQuery || processedQuery.originalQuery,
      {
        topK: options.limit || 10,
        senderFilter: processedQuery.senderFilter,
        dateRange: processedQuery.dateRange,
        includeUrls: processedQuery.urlFilter ? true : null,
        schedulingFilter: processedQuery.schedulingFilter,
        entityFilter: processedQuery.entities,
        languages: processedQuery.languages,
      }
    );
    
    // Also search in enhanced database
    const dbResults = await this.database.searchMessages(
      processedQuery.originalQuery,
      {
        limit: options.limit || 10,
        senderFilter: processedQuery.senderFilter,
        dateRange: processedQuery.dateRange,
        urlFilter: processedQuery.urlFilter,
        schedulingFilter: processedQuery.schedulingFilter,
      }
    );
    
    // Combine and deduplicate results
    const combinedResults = this.combineSearchResults(vectorResults, dbResults);
    
    return {
      query: processedQuery,
      results: combinedResults,
      vectorResultsCount: vectorResults.length,
      dbResultsCount: dbResults.length,
      enhancedFeatures: {
        languageDetection: processedQuery.languages,
        entityExtraction: processedQuery.entities,
        schedulingDetection: processedQuery.schedulingFilter,
      }
    };
  }

  combineSearchResults(vectorResults, dbResults) {
    const resultMap = new Map();
    
    // Add vector results with scores
    vectorResults.forEach(result => {
      resultMap.set(result.messageId || result.id, {
        ...result,
        source: 'vector',
        relevanceScore: result.score,
      });
    });
    
    // Add database results, merging with vector results if they exist
    dbResults.forEach(result => {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Merge database data with vector result
        resultMap.set(result.id, {
          ...existing,
          ...result,
          source: 'both',
        });
      } else {
        resultMap.set(result.id, {
          ...result,
          source: 'database',
          relevanceScore: 0,
        });
      }
    });
    
    // Convert to array and sort by relevance score
    return Array.from(resultMap.values())
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  async searchByEntity(entityType, entityValue, options = {}) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    // Search in vector store by entity
    const vectorResults = await this.vectorStore.searchByEntity(entityType, entityValue, options);
    
    // Search in database by entity
    const dbResults = await this.database.searchByEntity(entityType, entityValue, options.limit || 20);
    
    return this.combineSearchResults(vectorResults, dbResults);
  }

  async searchScheduling(query, options = {}) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    // Search scheduling in vector store
    const vectorResults = await this.vectorStore.searchScheduling(query, options);
    
    // Search scheduling in database
    const dbResults = await this.database.getSchedulingMessages(options);
    
    return this.combineSearchResults(vectorResults, dbResults);
  }

  async getUrlsBySender(senderName, limit = 20) {
    return await this.database.getUrlsBySender(senderName, limit);
  }

  async getUrlsByPurpose(purpose, limit = 20) {
    return await this.database.getUrlsByPurpose(purpose, limit);
  }

  async getMessagesByDateRange(startDate, endDate, senderName = null) {
    return await this.database.getMessagesByDateRange(startDate, endDate, senderName);
  }

  async getStats() {
    const dbStats = await this.database.getStats();
    const vectorStats = await this.vectorStore.getStats();
    
    return {
      database: dbStats,
      vectorStore: vectorStats,
      enhanced: true,
      features: [
        'Multilingual support (Hebrew + English)',
        'Entity extraction (people, places, activities)',
        'Enhanced URL context and purpose classification',
        'Advanced scheduling detection',
        'Full-text search with FTS5',
        'Semantic vector search with multilingual embeddings'
      ]
    };
  }

  async shutdown() {
    console.log('🛑 Shutting down Enhanced WhatsApp Indexer...');
    
    if (this.client) {
      await this.client.destroy();
    }
    
    if (this.database) {
      await this.database.close();
    }
    
    // Save vector store before shutdown
    if (this.vectorStore) {
      await this.vectorStore.saveIndex();
    }
    
    console.log('✅ Enhanced shutdown complete');
  }
}

export default EnhancedWhatsAppClient;
