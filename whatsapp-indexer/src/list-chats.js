#!/usr/bin/env node

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

class WhatsAppChatLister {
  constructor(options = {}) {
    this.options = {
      showGroups: options.showGroups !== false, // Default true
      showIndividual: options.showIndividual !== false, // Default true
      limit: options.limit || null,
      verbose: options.verbose || false,
      ...options
    };

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "whatsapp-indexer-chat-lister",
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
    
    this.isReady = false;
  }

  async initialize() {
    console.log('🚀 Initializing WhatsApp Chat Lister...');
    
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

  async listChats() {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    console.log('📋 Fetching all chats...');
    
    try {
      // Get all chats
      const chats = await this.client.getChats();
      
      console.log(`📊 Found ${chats.length} total chats`);
      
      // Process and enrich chat data
      const enrichedChats = await this.enrichChatData(chats);
      
      // Filter based on options
      const filteredChats = this.filterChats(enrichedChats);
      
      // Sort by most recent activity (timestamp descending)
      const sortedChats = filteredChats.sort((a, b) => b.timestamp - a.timestamp);
      
      // Apply limit if specified
      const finalChats = this.options.limit ? sortedChats.slice(0, this.options.limit) : sortedChats;
      
      // Display results
      this.displayChats(finalChats);
      
      return finalChats;
      
    } catch (error) {
      console.error('❌ Failed to list chats:', error);
      throw error;
    }
  }

  async enrichChatData(chats) {
    console.log('🔍 Enriching chat data...');
    
    const enrichedChats = [];
    
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      
      try {
        // Show progress for verbose mode
        if (this.options.verbose && i % 10 === 0) {
          console.log(`  Processing chat ${i + 1}/${chats.length}...`);
        }
        
        // Get basic chat info
        const enrichedChat = {
          id: chat.id._serialized,
          name: chat.name || 'Unknown',
          isGroup: chat.isGroup,
          timestamp: chat.timestamp || 0,
          unreadCount: chat.unreadCount || 0,
          archived: chat.archived || false,
          pinned: chat.pinned || false,
          muteExpiration: chat.muteExpiration || 0,
        };
        
        // Try to get additional info safely
        try {
          // Get participant count for groups
          if (chat.isGroup && chat.participants) {
            enrichedChat.participantCount = chat.participants.length;
          }
          
          // Get last message info if available
          if (chat.lastMessage) {
            enrichedChat.lastMessageTime = chat.lastMessage.timestamp;
            enrichedChat.lastMessagePreview = chat.lastMessage.body ? 
              chat.lastMessage.body.substring(0, 50) + (chat.lastMessage.body.length > 50 ? '...' : '') : 
              '[No text content]';
            enrichedChat.lastMessageFrom = chat.lastMessage.from;
          }
          
        } catch (error) {
          // Ignore errors getting additional info
          if (this.options.verbose) {
            console.log(`    ⚠️ Could not get additional info for ${enrichedChat.name}: ${error.message}`);
          }
        }
        
        enrichedChats.push(enrichedChat);
        
      } catch (error) {
        console.error(`❌ Error processing chat: ${error.message}`);
        // Add basic info even if enrichment fails
        enrichedChats.push({
          id: chat.id._serialized,
          name: chat.name || 'Unknown',
          isGroup: chat.isGroup,
          timestamp: chat.timestamp || 0,
          error: error.message
        });
      }
    }
    
    return enrichedChats;
  }

  filterChats(chats) {
    let filtered = chats;
    
    // Filter by type
    if (!this.options.showGroups) {
      filtered = filtered.filter(chat => !chat.isGroup);
    }
    
    if (!this.options.showIndividual) {
      filtered = filtered.filter(chat => chat.isGroup);
    }
    
    return filtered;
  }

  displayChats(chats) {
    console.log('\n📋 Chat List (sorted by most recent activity):');
    console.log('=' .repeat(80));
    
    if (chats.length === 0) {
      console.log('No chats found matching your criteria.');
      return;
    }
    
    chats.forEach((chat, index) => {
      const number = (index + 1).toString().padStart(3, ' ');
      const type = chat.isGroup ? '👥 GROUP' : '👤 INDIVIDUAL';
      const name = chat.name.padEnd(30, ' ').substring(0, 30);
      
      // Format timestamp
      const lastActivity = chat.timestamp ? 
        new Date(chat.timestamp * 1000).toLocaleString() : 
        'Unknown';
      
      // Basic info line
      console.log(`${number}. ${type} | ${name} | ${lastActivity}`);
      
      // Chat ID (for use in backfill commands)
      console.log(`     ID: ${chat.id}`);
      
      // Additional info if verbose
      if (this.options.verbose) {
        if (chat.isGroup && chat.participantCount) {
          console.log(`     Participants: ${chat.participantCount}`);
        }
        
        if (chat.unreadCount > 0) {
          console.log(`     Unread: ${chat.unreadCount} messages`);
        }
        
        if (chat.archived) {
          console.log(`     📦 Archived`);
        }
        
        if (chat.pinned) {
          console.log(`     📌 Pinned`);
        }
        
        if (chat.muteExpiration > 0) {
          console.log(`     🔇 Muted`);
        }
        
        if (chat.lastMessagePreview) {
          console.log(`     Last: ${chat.lastMessagePreview}`);
        }
        
        if (chat.error) {
          console.log(`     ⚠️ Error: ${chat.error}`);
        }
      }
      
      console.log(''); // Empty line between chats
    });
    
    // Summary
    const groupCount = chats.filter(c => c.isGroup).length;
    const individualCount = chats.filter(c => !c.isGroup).length;
    
    console.log('=' .repeat(80));
    console.log(`📊 Summary: ${chats.length} chats total (${groupCount} groups, ${individualCount} individual)`);
    
    if (this.options.limit && chats.length === this.options.limit) {
      console.log(`⚠️ Results limited to ${this.options.limit} chats. Use --limit 0 to see all.`);
    }
  }

  async shutdown() {
    console.log('🛑 Shutting down chat lister...');
    
    if (this.client) {
      await this.client.destroy();
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
      case '--groups-only':
        options.showIndividual = false;
        break;
      case '--individual-only':
        options.showGroups = false;
        break;
      case '--limit':
      case '-l':
        const limitValue = parseInt(args[++i]);
        options.limit = limitValue === 0 ? null : limitValue;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`❌ Unknown option: ${arg}`);
        console.log('Use -h or --help for usage information');
        process.exit(1);
    }
  }
  
  const lister = new WhatsAppChatLister(options);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received interrupt signal, shutting down gracefully...');
    await lister.shutdown();
    process.exit(0);
  });
  
  try {
    await lister.initialize();
    
    // Wait for client to be ready
    while (!lister.isReady) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const chats = await lister.listChats();
    
    // Output usage examples
    console.log('\n💡 Usage Examples:');
    console.log('To backfill specific chats, use their names or IDs:');
    
    if (chats.length > 0) {
      const exampleChat = chats[0];
      console.log(`  ./start-backfill.sh --chat "${exampleChat.name}" --days 7`);
      console.log(`  ./start-backfill.sh --chat "${exampleChat.id}" --days 7`);
    }
    
    console.log('\nTo exclude chats:');
    if (chats.length > 1) {
      const exampleChat = chats[1];
      console.log(`  ./start-backfill.sh --exclude "${exampleChat.name}" --days 7`);
    }
    
    await lister.shutdown();
    
  } catch (error) {
    console.error('❌ Chat listing failed:', error);
    await lister.shutdown();
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
WhatsApp Chat Lister

Usage: node src/list-chats.js [options]

Options:
  --groups-only                 Show only group chats
  --individual-only             Show only individual chats
  -l, --limit <number>          Limit number of chats shown (0 = no limit)
  -v, --verbose                 Show detailed chat information
  -h, --help                    Show this help message

Examples:
  # List all chats
  node src/list-chats.js

  # Show only groups with details
  node src/list-chats.js --groups-only --verbose

  # Show top 20 most recent chats
  node src/list-chats.js --limit 20

  # Show only individual chats
  node src/list-chats.js --individual-only
`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default WhatsAppChatLister;
