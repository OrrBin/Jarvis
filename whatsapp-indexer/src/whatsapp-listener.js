import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import Database from './database.js';
import LocalVectorStore from './local-vector-store.js';
import MessageProcessor from './message-processor.js';

class WhatsAppListener {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        timeout: 60000,
      },
    });
    
    this.database = new Database();
    this.vectorStore = new LocalVectorStore();
    this.messageProcessor = new MessageProcessor();
    this.isReady = false;
    this.isShuttingDown = false;
  }

  async initialize() {
    console.log('🚀 Initializing WhatsApp Listener Service...');
    
    try {
      // Initialize database and vector store
      await this.database.initialize();
      await this.vectorStore.initialize();
      
      // Set up WhatsApp client event handlers
      this.setupEventHandlers();
      
      // Initialize WhatsApp client
      await this.client.initialize();
      
      console.log('✅ WhatsApp Listener Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp Listener Service:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    this.client.on('qr', (qr) => {
      console.log('📱 Scan this QR code with your WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp client is ready!');
      this.isReady = true;
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp client authenticated');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ WhatsApp authentication failed:', msg);
    });

    this.client.on('disconnected', (reason) => {
      console.log('📱 WhatsApp client disconnected:', reason);
      this.isReady = false;
      
      if (!this.isShuttingDown) {
        console.log('🔄 Attempting to reconnect...');
        setTimeout(() => {
          this.client.initialize().catch(console.error);
        }, 5000);
      }
    });

    this.client.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error('❌ Error handling message:', error);
      }
    });

    this.client.on('message_create', async (message) => {
      try {
        // Handle sent messages (from this account)
        if (message.fromMe) {
          await this.handleMessage(message);
        }
      } catch (error) {
        console.error('❌ Error handling sent message:', error);
      }
    });
  }

  async handleMessage(message) {
    if (!this.isReady) {
      return;
    }

    try {
      // Get chat and contact info
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      // Process the message
      const processedMessage = await this.messageProcessor.processMessage(message, chat, contact);
      
      if (processedMessage) {
        // Save to database
        await this.database.saveMessage(processedMessage);
        
        // Add to vector store for semantic search
        await this.vectorStore.indexMessage(processedMessage);
        
        console.log(`📝 Indexed message from ${processedMessage.senderName}: ${processedMessage.content.substring(0, 50)}...`);
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  }

  async getChats() {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    
    return await this.client.getChats();
  }

  async getChatById(chatId) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    
    return await this.client.getChatById(chatId);
  }

  async getContactById(contactId) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    
    return await this.client.getContactById(contactId);
  }

  async sendMessage(chatId, message) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    
    const chat = await this.getChatById(chatId);
    return await chat.sendMessage(message);
  }

  async shutdown() {
    console.log('🛑 Shutting down WhatsApp Listener Service...');
    this.isShuttingDown = true;
    
    try {
      if (this.client) {
        await this.client.destroy();
      }
      
      if (this.database) {
        await this.database.close();
      }
      
      console.log('✅ WhatsApp Listener Service shut down successfully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  // Health check method
  getStatus() {
    return {
      isReady: this.isReady,
      isShuttingDown: this.isShuttingDown,
      clientState: this.client?.info?.wid ? 'authenticated' : 'not_authenticated',
    };
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (global.whatsappListener) {
    await global.whatsappListener.shutdown();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (global.whatsappListener) {
    await global.whatsappListener.shutdown();
  }
  process.exit(0);
});

// Start the listener service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const listener = new WhatsAppListener();
  global.whatsappListener = listener;
  
  listener.initialize().catch(error => {
    console.error('❌ Failed to start WhatsApp Listener Service:', error);
    process.exit(1);
  });
}

export default WhatsAppListener;
