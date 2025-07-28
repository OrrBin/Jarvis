#!/usr/bin/env node

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import Database from './database.js';
import LocalVectorStore from './local-vector-store.js';
import MessageProcessor from './message-processor.js';
import { config } from './config.js';

class WhatsAppBackfillScript {
  constructor(options = {}) {
    this.options = {
      daysBack: options.daysBack || 7,
      maxMessagesPerChat: options.maxMessagesPerChat || 1000,
      specificChats: options.specificChats || null, // Array of chat names/IDs
      excludeChats: options.excludeChats || [],
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      ...options
    };

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "whatsapp-indexer-backfill",
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
      }
    });
    
    this.database = new Database();
    this.vectorStore = new LocalVectorStore();
    this.messageProcessor = new MessageProcessor();
    this.isReady = false;
    this.stats = {
      totalChats: 0,
      processedChats: 0,
      totalMessages: 0,
      newMessages: 0,
      skippedMessages: 0,
      errors: 0
    };
  }

  async initialize() {
    console.log('🚀 Initializing WhatsApp Backfill Script...');
    console.log(`📅 Backfilling messages from the last ${this.options.daysBack} days`);
    
    if (this.options.dryRun) {
      console.log('🧪 DRY RUN MODE - No messages will be saved');
    }
    
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
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp client is ready!');
      this.isReady = true;
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp client authenticated');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ Authentication failed:', msg);
    });

    this.client.on('disconnected', (reason) => {
      console.log('📱 WhatsApp client disconnected:', reason);
      this.isReady = false;
    });
  }

  async startBackfill() {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    console.log('🔄 Starting backfill process...');
    
    try {
      // Get all chats
      const chats = await this.client.getChats();
      this.stats.totalChats = chats.length;
      
      console.log(`📊 Found ${chats.length} chats`);
      
      // Filter chats based on options
      const chatsToProcess = this.filterChats(chats);
      console.log(`📋 Processing ${chatsToProcess.length} chats`);
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - this.options.daysBack);
      
      console.log(`📅 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Process each chat
      for (const chat of chatsToProcess) {
        await this.processChat(chat, startDate, endDate);
        this.stats.processedChats++;
        
        // Add delay between chats to avoid rate limiting
        await this.sleep(1000);
      }
      
      console.log('✅ Backfill completed!');
      this.printStats();
      
    } catch (error) {
      console.error('❌ Backfill failed:', error);
      this.stats.errors++;
      throw error;
    }
  }

  filterChats(chats) {
    let filtered = chats;
    
    // Filter by specific chats if provided
    if (this.options.specificChats && this.options.specificChats.length > 0) {
      filtered = filtered.filter(chat => 
        this.options.specificChats.some(name => 
          // Try exact match first, then partial match, then ID match
          chat.name === name ||
          chat.name?.toLowerCase() === name.toLowerCase() ||
          chat.name?.toLowerCase().includes(name.toLowerCase()) ||
          chat.id._serialized === name ||
          chat.id._serialized.includes(name)
        )
      );
    }
    
    // Exclude specific chats
    if (this.options.excludeChats.length > 0) {
      filtered = filtered.filter(chat => 
        !this.options.excludeChats.some(name => 
          // Try exact match first, then partial match, then ID match
          chat.name === name ||
          chat.name?.toLowerCase() === name.toLowerCase() ||
          chat.name?.toLowerCase().includes(name.toLowerCase()) ||
          chat.id._serialized === name ||
          chat.id._serialized.includes(name)
        )
      );
    }
    
    return filtered;
  }

  async processChat(chat, startDate, endDate) {
    const chatName = chat.name || chat.id._serialized;
    console.log(`\n📂 Processing chat: ${chatName}`);
    
    try {
      // Check if we already have recent messages from this chat
      const existingMessages = await this.database.getMessagesByDateRange(
        startDate.getTime(),
        endDate.getTime(),
        null,
        chat.id._serialized
      );
      
      if (existingMessages.length > 0 && !this.options.force) {
        console.log(`⏭️  Skipping ${chatName} - already has ${existingMessages.length} messages in date range`);
        return;
      }
      
      // Fetch messages from WhatsApp
      const messages = await this.fetchChatMessages(chat, startDate, endDate);
      
      if (messages.length === 0) {
        console.log(`📭 No messages found in ${chatName} for the specified date range`);
        return;
      }
      
      console.log(`📨 Found ${messages.length} messages in ${chatName}`);
      
      // Process and save messages
      let newCount = 0;
      let skippedCount = 0;
      
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        
        try {
          // Show progress every 10 messages in verbose mode
          if (this.options.verbose && i > 0 && i % 10 === 0) {
            console.log(`    📊 Progress: ${i}/${messages.length} messages processed (${newCount} new, ${skippedCount} skipped)`);
          }
          
          // Check if message already exists
          const exists = await this.database.messageExists(message.id.id);
          if (exists) {
            skippedCount++;
            continue;
          }
          
          // Process the message
          const processedMessage = await this.messageProcessor.processMessage(message, chat, null);
          
          if (!processedMessage) {
            skippedCount++;
            continue;
          }
          
          if (!this.options.dryRun) {
            // Save to database
            await this.database.saveMessage(processedMessage);
            
            // Index in vector store
            await this.vectorStore.indexMessage(processedMessage);
          }
          
          newCount++;
          this.stats.newMessages++;
          
          // Only show individual messages in verbose mode and limit to first few
          if (this.options.verbose && newCount <= 5) {
            console.log(`    ✅ Processed: ${processedMessage.senderName}: ${processedMessage.content?.substring(0, 50)}...`);
          } else if (this.options.verbose && newCount === 6) {
            console.log(`    ... (showing progress every 10 messages)`);
          }
          
        } catch (error) {
          console.error(`    ❌ Error processing message ${message.id.id}:`, error.message);
          this.stats.errors++;
        }
      }
      
      console.log(`  📊 ${chatName}: ${newCount} new, ${skippedCount} skipped`);
      this.stats.totalMessages += messages.length;
      this.stats.skippedMessages += skippedCount;
      
    } catch (error) {
      console.error(`❌ Error processing chat ${chatName}:`, error.message);
      this.stats.errors++;
    }
  }

  async fetchChatMessages(chat, startDate, endDate) {
    const messages = [];
    const seenMessageIds = new Set(); // Track seen message IDs to avoid duplicates
    let hasMore = true;
    let lastMessageId = null;
    let consecutiveEmptyBatches = 0;
    
    console.log(`    📥 Fetching messages from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
    
    while (hasMore && messages.length < this.options.maxMessagesPerChat) {
      try {
        const fetchOptions = {
          limit: Math.min(50, this.options.maxMessagesPerChat - messages.length)
        };
        
        // Use proper pagination with fromMe and timestamp
        if (lastMessageId) {
          // This is a better way to paginate - we'll implement a different approach
          // For now, let's use a simpler but more reliable method
        }
        
        const batch = await chat.fetchMessages(fetchOptions);
        
        if (batch.length === 0) {
          consecutiveEmptyBatches++;
          if (consecutiveEmptyBatches >= 3) {
            console.log(`    📭 No more messages available`);
            hasMore = false;
            break;
          }
          continue;
        }
        
        consecutiveEmptyBatches = 0;
        
        // Filter out duplicates and messages outside date range
        const newMessages = [];
        let foundOlderMessage = false;
        
        for (const msg of batch) {
          // Skip if we've already seen this message
          if (seenMessageIds.has(msg.id.id)) {
            continue;
          }
          
          seenMessageIds.add(msg.id.id);
          
          const msgDate = new Date(msg.timestamp * 1000);
          
          // If message is older than our start date, we can stop
          if (msgDate < startDate) {
            foundOlderMessage = true;
            break;
          }
          
          // If message is in our date range, add it
          if (msgDate >= startDate && msgDate <= endDate) {
            newMessages.push(msg);
          }
        }
        
        messages.push(...newMessages);
        
        // If we found a message older than our start date, we can stop
        if (foundOlderMessage) {
          console.log(`    📅 Reached messages older than ${startDate.toLocaleDateString()}, stopping`);
          hasMore = false;
          break;
        }
        
        // If we got the same messages as last time, stop to avoid infinite loop
        if (batch.length > 0) {
          const currentLastId = batch[batch.length - 1].id.id;
          if (lastMessageId === currentLastId) {
            console.log(`    🔄 Same messages returned, stopping to avoid infinite loop`);
            hasMore = false;
            break;
          }
          lastMessageId = currentLastId;
        }
        
        // Show progress
        if (this.options.verbose && messages.length > 0) {
          console.log(`    📊 Fetched ${messages.length} messages so far...`);
        }
        
        // Add delay to avoid rate limiting
        await this.sleep(500);
        
      } catch (error) {
        console.error(`    ❌ Error fetching messages from chat:`, error.message);
        hasMore = false;
      }
    }
    
    // Sort messages by timestamp (oldest first) and remove any remaining duplicates
    const uniqueMessages = Array.from(
      new Map(messages.map(msg => [msg.id.id, msg])).values()
    ).sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`    ✅ Found ${uniqueMessages.length} unique messages in date range`);
    return uniqueMessages;
  }

  printStats() {
    console.log('\n📊 Backfill Statistics:');
    console.log(`  Total chats found: ${this.stats.totalChats}`);
    console.log(`  Chats processed: ${this.stats.processedChats}`);
    console.log(`  Total messages found: ${this.stats.totalMessages}`);
    console.log(`  New messages indexed: ${this.stats.newMessages}`);
    console.log(`  Messages skipped: ${this.stats.skippedMessages}`);
    console.log(`  Errors encountered: ${this.stats.errors}`);
    
    if (this.options.dryRun) {
      console.log('\n🧪 This was a dry run - no messages were actually saved');
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log('🛑 Shutting down backfill script...');
    
    if (this.client) {
      await this.client.destroy();
    }
    
    if (this.database) {
      await this.database.close();
    }
    
    console.log('✅ Shutdown complete');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--days':
      case '-d':
        options.daysBack = parseInt(args[++i]);
        break;
      case '--max-messages':
      case '-m':
        options.maxMessagesPerChat = parseInt(args[++i]);
        break;
      case '--chat':
      case '-c':
        options.specificChats = options.specificChats || [];
        options.specificChats.push(args[++i]);
        break;
      case '--exclude':
      case '-e':
        options.excludeChats = options.excludeChats || [];
        options.excludeChats.push(args[++i]);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }
  
  const backfill = new WhatsAppBackfillScript(options);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received interrupt signal, shutting down gracefully...');
    await backfill.shutdown();
    process.exit(0);
  });
  
  try {
    await backfill.initialize();
    
    // Wait for client to be ready
    while (!backfill.isReady) {
      await backfill.sleep(1000);
    }
    
    await backfill.startBackfill();
    await backfill.shutdown();
    
  } catch (error) {
    console.error('❌ Backfill script failed:', error);
    await backfill.shutdown();
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
WhatsApp Message Backfill Script

Usage: node src/backfill-script.js [options]

Options:
  -d, --days <number>           Number of days back to fetch (default: 7)
  -m, --max-messages <number>   Max messages per chat (default: 1000)
  -c, --chat <name>             Specific chat to process (can be used multiple times)
  -e, --exclude <name>          Chat to exclude (can be used multiple times)
  --dry-run                     Don't save messages, just show what would be done
  -v, --verbose                 Show detailed progress
  -f, --force                   Process chats even if they have existing messages
  -h, --help                    Show this help message

Examples:
  # Backfill last 7 days from all chats
  node src/backfill-script.js

  # Backfill last 30 days, dry run
  node src/backfill-script.js --days 30 --dry-run

  # Backfill specific chat only
  node src/backfill-script.js --chat "Family Group" --days 14

  # Backfill all except work chats
  node src/backfill-script.js --exclude "Work" --exclude "Team" --days 7

  # Verbose backfill with force
  node src/backfill-script.js --verbose --force --days 3
`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default WhatsAppBackfillScript;
