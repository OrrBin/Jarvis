import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import Database from './database.js';
import LocalVectorStore from './local-vector-store.js';
import MessageProcessor from './message-processor.js';

class WhatsAppClient {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "whatsapp-indexer",
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
    
    this.database = new Database();
    this.vectorStore = new LocalVectorStore();
    this.messageProcessor = new MessageProcessor();
    this.isReady = false;
  }

  async initialize() {
    console.log('🚀 Initializing WhatsApp Indexer...');
    
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
      console.log('✅ WhatsApp client is ready!');
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
      
      // If disconnected due to session issues, log helpful info
      if (reason === 'NAVIGATION') {
        console.log('💡 Session may have expired. You might need to scan QR code again.');
      }
    });

    // Add loading session event
    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
    });

    // Add session restoration event
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
    // Skip status messages, messages from self, and notification messages
    if (message.isStatus || message.fromMe || message.type === 'notification_template') {
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

      // Process the message
      const processedMessage = await this.messageProcessor.processMessage(message, chat, contact);
      
      // Skip if message processing returned null (empty messages, etc.)
      if (!processedMessage) {
        return;
      }
      
      console.log(`📨 New message from ${processedMessage.senderName}: ${processedMessage.content?.substring(0, 50) || '[no content]'}...`);
      
      // Save to database
      await this.database.saveMessage(processedMessage);
      
      // Index in vector store
      await this.vectorStore.indexMessage(processedMessage);
      
      // Log interesting messages
      if (processedMessage.urls.length > 0) {
        console.log(`🔗 Found ${processedMessage.urls.length} URL(s) in message`);
      }
      
      if (processedMessage.dates.length > 0) {
        console.log(`📅 Found ${processedMessage.dates.length} date(s) in message`);
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

    // Process the search query
    const processedQuery = this.messageProcessor.processSearchQuery(query);
    
    console.log('🔍 Processed search query:', processedQuery);
    
    // Search in vector store for semantic similarity
    const vectorResults = await this.vectorStore.searchSimilar(
      processedQuery.cleanQuery || processedQuery.originalQuery,
      {
        topK: options.limit || 10,
        senderFilter: processedQuery.senderFilter,
        dateRange: processedQuery.dateRange,
        includeUrls: processedQuery.urlFilter ? true : null,
      }
    );
    
    // Also search in database for exact matches
    const dbResults = await this.database.searchMessages(
      processedQuery.originalQuery,
      options.limit || 10
    );
    
    // Combine and deduplicate results
    const combinedResults = this.combineSearchResults(vectorResults, dbResults);
    
    return {
      query: processedQuery,
      results: combinedResults,
      vectorResultsCount: vectorResults.length,
      dbResultsCount: dbResults.length,
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
    
    // Convert to array and sort by relevance score (higher is better)
    return Array.from(resultMap.values())
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  async getUrlsBySender(senderName, limit = 20) {
    return await this.database.getUrlsBySender(senderName, limit);
  }

  async getMessagesByDateRange(startDate, endDate, senderName = null) {
    return await this.database.getMessagesByDateRange(startDate, endDate, senderName);
  }

  async shutdown() {
    console.log('🛑 Shutting down WhatsApp Indexer...');
    
    if (this.client) {
      await this.client.destroy();
    }
    
    if (this.database) {
      await this.database.close();
    }
    
    console.log('✅ Shutdown complete');
  }
}

export default WhatsAppClient;
