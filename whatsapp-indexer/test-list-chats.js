#!/usr/bin/env node

import WhatsAppChatLister from './src/list-chats.js';

async function testChatLister() {
  console.log('🧪 Testing WhatsApp Chat Lister');
  
  // Test with limited results for quick testing
  const options = {
    limit: 10, // Just show top 10 chats
    verbose: true, // Show detailed output
  };
  
  const lister = new WhatsAppChatLister(options);
  
  try {
    await lister.initialize();
    
    // Wait for client to be ready
    console.log('⏳ Waiting for WhatsApp client to be ready...');
    while (!lister.isReady) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('✅ Client ready, listing chats...');
    const chats = await lister.listChats();
    
    console.log(`✅ Test completed successfully! Found ${chats.length} chats.`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await lister.shutdown();
  }
}

testChatLister().catch(console.error);
