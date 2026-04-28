import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import express from 'express';
import Database from './database.js';
import LocalVectorStore from './local-vector-store.js';
import MessageProcessor from './message-processor.js';

class WhatsAppListener {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "whatsapp-indexer",
        dataPath: "./.wwebjs_auth"
      }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
    this.apiServer = null;
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
      
      // Start HTTP API server
      await this.startApiServer();
      
      console.log('✅ WhatsApp Listener Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp Listener Service:', error);
      throw error;
    }
  }

  async startApiServer() {
    const app = express();
    app.use(express.json());

    // Status endpoint
    app.get('/status', (req, res) => {
      res.json({
        isReady: this.isReady,
        isShuttingDown: this.isShuttingDown,
        clientState: this.client?.info?.wid ? 'authenticated' : 'not_authenticated',
      });
    });

    // Send message endpoint
    app.post('/send-message', async (req, res) => {
      try {
        const { recipient, message, reply_to_message_id } = req.body;
        
        if (!this.isReady) {
          return res.status(503).json({ error: 'WhatsApp client is not ready' });
        }

        // Find the chat by name or number
        const chats = await this.client.getChats();
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
          const contacts = await this.client.getContacts();
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
          return res.status(404).json({ error: `Could not find chat with "${recipient}"` });
        }

        // Send the message
        let sentMessage;
        if (reply_to_message_id) {
          const messages = await targetChat.fetchMessages({ limit: 50 });
          const messageToReply = messages.find(msg => msg.id.id === reply_to_message_id);
          
          if (messageToReply) {
            sentMessage = await messageToReply.reply(message);
          } else {
            sentMessage = await targetChat.sendMessage(message);
          }
        } else {
          sentMessage = await targetChat.sendMessage(message);
        }

        // Index the sent message
        const processedMessage = {
          id: sentMessage.id.id,
          chatId: targetChat.id._serialized,
          chatName: targetChat.name || recipient,
          senderName: 'Me',
          senderNumber: 'me', // Add the missing sender_number field
          content: message,
          timestamp: sentMessage.timestamp * 1000,
          isFromMe: true,
          isGroupMessage: targetChat.isGroup,
          messageType: sentMessage.type
        };

        await this.database.saveMessage(processedMessage);
        await this.vectorStore.indexMessage(processedMessage);

        res.json({ 
          success: true, 
          message: `Message sent to "${targetChat.name || recipient}"`,
          messageId: sentMessage.id.id
        });
      } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List chats endpoint
    app.get('/chats', async (req, res) => {
      try {
        if (!this.isReady) {
          return res.status(503).json({ error: 'WhatsApp client is not ready' });
        }

        const { limit = 20, groups_only, contacts_only } = req.query;
        const chats = await this.client.getChats();
        
        let filteredChats = chats;
        if (groups_only === 'true') {
          filteredChats = chats.filter(chat => chat.isGroup);
        } else if (contacts_only === 'true') {
          filteredChats = chats.filter(chat => !chat.isGroup);
        }
        
        // Sort by last message time and limit
        filteredChats = filteredChats
          .sort((a, b) => b.lastMessage?.timestamp - a.lastMessage?.timestamp)
          .slice(0, parseInt(limit));

        const chatList = filteredChats.map(chat => ({
          id: chat.id._serialized,
          name: chat.name,
          isGroup: chat.isGroup,
          unreadCount: chat.unreadCount,
          lastMessageTime: chat.lastMessage ? chat.lastMessage.timestamp * 1000 : null,
          participantCount: chat.isGroup ? chat.participants?.length : null
        }));

        res.json({ chats: chatList });
      } catch (error) {
        console.error('Error listing chats:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Mark as read endpoint
    app.post('/mark-as-read', async (req, res) => {
      try {
        const { chat_name } = req.body;
        
        if (!this.isReady) {
          return res.status(503).json({ error: 'WhatsApp client is not ready' });
        }

        const chats = await this.client.getChats();
        const chat = chats.find(c => 
          c.name === chat_name || 
          c.name?.toLowerCase().includes(chat_name.toLowerCase())
        );
        
        if (!chat) {
          return res.status(404).json({ error: `Chat "${chat_name}" not found` });
        }

        await chat.sendSeen();
        res.json({ success: true, message: `Marked chat "${chat.name}" as read` });
      } catch (error) {
        console.error('Error marking as read:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Backfill endpoint — reuses the running client, no separate Chromium needed
    app.post('/backfill', async (req, res) => {
      if (!this.isReady) {
        return res.status(503).json({ error: 'WhatsApp client is not ready' });
      }
      if (this._backfillRunning) {
        return res.status(409).json({ error: 'Backfill already in progress' });
      }

      const { days = 7, maxMessages = 1000, chats: specificChats, exclude = [], dryRun = false, force = false } = req.body;
      this._backfillRunning = true;

      // Run in background so we can respond immediately
      const stats = { totalChats: 0, processedChats: 0, totalMessages: 0, newMessages: 0, skippedMessages: 0, errors: 0 };
      res.json({ status: 'started', days, dryRun });

      try {
        const allChats = await this.client.getChats();
        let chatsToProcess = allChats;

        if (specificChats?.length) {
          chatsToProcess = chatsToProcess.filter(c =>
            specificChats.some(n => c.name?.toLowerCase().includes(n.toLowerCase()) || c.id._serialized === n)
          );
        }
        if (exclude.length) {
          chatsToProcess = chatsToProcess.filter(c =>
            !exclude.some(n => c.name?.toLowerCase().includes(n.toLowerCase()))
          );
        }

        stats.totalChats = chatsToProcess.length;
        const startDate = new Date(Date.now() - days * 86400000);
        const endDate = new Date();

        // Only process chats with activity in the backfill window
        chatsToProcess = chatsToProcess.filter(c => {
          const lastMsg = c.lastMessage?.timestamp;
          return lastMsg && (lastMsg * 1000) >= startDate.getTime();
        });

        console.log(`🔄 Backfill started: ${chatsToProcess.length}/${stats.totalChats} active chats, ${days} days back${dryRun ? ' (DRY RUN)' : ''}`);

        for (const chat of chatsToProcess) {
          const chatName = chat.name || chat.id._serialized;
          try {
            // Check existing messages
            const existing = await this.database.getMessagesByDateRange(startDate.getTime(), endDate.getTime(), null, chat.id._serialized);
            if (existing.length > 0 && !force) {
              console.log(`⏭️  Skipping ${chatName} — ${existing.length} messages already exist`);
              stats.processedChats++;
              continue;
            }

            const messages = await chat.fetchMessages({ limit: Math.min(50, maxMessages) });
            const filtered = messages.filter(m => {
              const t = m.timestamp * 1000;
              return t >= startDate.getTime() && t <= endDate.getTime();
            });

            let newCount = 0;
            for (const msg of filtered) {
              try {
                if (await this.database.messageExists(msg.id.id)) { stats.skippedMessages++; continue; }
                const processed = await this.messageProcessor.processMessage(msg, chat, null);
                if (!processed) { stats.skippedMessages++; continue; }
                if (!dryRun) {
                  await this.database.saveMessage(processed);
                  await this.vectorStore.indexMessage(processed);
                }
                newCount++;
                stats.newMessages++;
              } catch (e) { stats.errors++; }
            }
            stats.totalMessages += filtered.length;
            stats.skippedMessages += filtered.length - newCount - stats.errors;
            console.log(`  📊 ${chatName}: ${newCount} new, ${filtered.length - newCount} skipped`);
          } catch (e) {
            console.error(`❌ Error processing ${chatName}:`, e.message);
            stats.errors++;
          }
          stats.processedChats++;
          await new Promise(r => setTimeout(r, 1000));
        }
        console.log(`✅ Backfill complete:`, stats);
      } catch (e) {
        console.error('❌ Backfill failed:', e);
      } finally {
        this._backfillRunning = false;
      }
    });

    const port = process.env.WHATSAPP_API_PORT || 3001;
    this.apiServer = app.listen(port, () => {
      console.log(`🌐 WhatsApp API server running on port ${port}`);
    });
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

    this.client.on('disconnected', async (reason) => {
      console.log('📱 WhatsApp client disconnected:', reason);
      this.isReady = false;
      
      if (this.isShuttingDown) return;

      // LOGOUT means credentials are revoked — session is wiped, reconnect would just show QR again
      if (reason === 'LOGOUT') {
        console.log('⚠️ Session was logged out by WhatsApp. Restart manually to re-scan QR.');
        return;
      }

      // For transient disconnects (network blips), destroy old client first to prevent stacking
      console.log('🔄 Attempting to reconnect in 10s...');
      try {
        await this.client.destroy();
      } catch (e) {
        console.warn('⚠️ Error destroying old client (continuing):', e.message);
      }
      setTimeout(() => {
        this.client.initialize().catch(err => {
          console.error('❌ Reconnect failed:', err.message);
        });
      }, 10000);
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
        
        // Create a descriptive log message showing both chat and sender
        const chatDisplay = processedMessage.isGroupMessage 
          ? `group "${processedMessage.chatName}"` 
          : `"${processedMessage.chatName}"`;
        const senderDisplay = processedMessage.isFromMe 
          ? "Me" 
          : processedMessage.senderName;
        
        console.log(`📝 Indexed message in ${chatDisplay} from ${senderDisplay}: ${processedMessage.content.substring(0, 50)}...`);
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
      if (this.apiServer) {
        this.apiServer.close();
        console.log('🌐 API server closed');
      }
      
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
