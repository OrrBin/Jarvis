#!/usr/bin/env node

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import Database from './src/database.js';
import qrcode from 'qrcode-terminal';

class ContactNameFixer {
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
    this.isReady = false;
  }

  async initialize() {
    console.log('🚀 Initializing Contact Name Fixer...');
    
    try {
      await this.database.initialize();
      
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

      await this.client.initialize();
      
      // Wait for client to be ready
      while (!this.isReady) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('✅ Contact Name Fixer initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Contact Name Fixer:', error);
      throw error;
    }
  }

  async fixContactNames() {
    console.log('🔍 Finding phone number entries to fix...');
    
    // Get all chat names that look like phone numbers using the database query method
    const phoneNumberChats = await this.database.query(`
      SELECT DISTINCT chat_name, chat_id, COUNT(*) as message_count 
      FROM messages 
      WHERE chat_name LIKE '+%' 
      GROUP BY chat_name, chat_id
      ORDER BY message_count DESC
    `);
    
    console.log(`📞 Found ${phoneNumberChats.length} phone number entries to potentially fix`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const entry of phoneNumberChats) {
      try {
        console.log(`\n🔍 Processing: ${entry.chat_name} (${entry.message_count} messages)`);
        
        // Try to get the chat by ID
        let chat = null;
        try {
          // Convert phone number to WhatsApp chat ID format
          const phoneNumber = entry.chat_name.replace(/[^\d]/g, ''); // Remove all non-digits
          const chatId = `${phoneNumber}@c.us`;
          
          console.log(`   Trying chat ID: ${chatId}`);
          chat = await this.client.getChatById(chatId);
        } catch (error) {
          console.log(`   ⚠️ Could not find chat by ID: ${error.message}`);
          
          // Try using the stored chat_id
          try {
            chat = await this.client.getChatById(entry.chat_id);
          } catch (error2) {
            console.log(`   ⚠️ Could not find chat by stored ID: ${error2.message}`);
          }
        }
        
        if (chat) {
          let newName = null;
          
          // For individual chats, try to get contact info
          if (!chat.isGroup) {
            try {
              const contact = await chat.getContact();
              if (contact) {
                // Priority: contact.name > contact.pushname > contact.shortName
                newName = contact.name || contact.pushname || contact.shortName;
                
                // Make sure we got a real name, not just the phone number
                if (newName && newName !== contact.number && !newName.startsWith('+')) {
                  console.log(`   ✅ Found contact name: "${newName}"`);
                } else {
                  newName = null;
                  console.log(`   ⚠️ Contact name is still a phone number: "${newName}"`);
                }
              }
            } catch (error) {
              console.log(`   ⚠️ Could not get contact info: ${error.message}`);
            }
          }
          
          // If we found a better name, update the database
          if (newName) {
            console.log(`   🔄 Updating "${entry.chat_name}" → "${newName}"`);
            
            await this.database.query(`
              UPDATE messages 
              SET chat_name = ? 
              WHERE chat_name = ?
            `, [newName, entry.chat_name]);
            
            fixedCount++;
            console.log(`   ✅ Updated ${entry.message_count} messages`);
          } else {
            console.log(`   ⏭️ No better name found, keeping "${entry.chat_name}"`);
            skippedCount++;
          }
        } else {
          console.log(`   ⚠️ Could not find chat, skipping`);
          skippedCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`   ❌ Error processing ${entry.chat_name}:`, error);
        skippedCount++;
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Fixed: ${fixedCount} entries`);
    console.log(`   ⏭️ Skipped: ${skippedCount} entries`);
    console.log(`   📝 Total processed: ${phoneNumberChats.length} entries`);
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    await this.client.destroy();
    await this.database.close();
  }
}

// Main execution
async function main() {
  const fixer = new ContactNameFixer();
  
  try {
    await fixer.initialize();
    await fixer.fixContactNames();
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await fixer.cleanup();
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

main().catch(console.error);
