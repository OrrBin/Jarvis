#!/usr/bin/env node

import WhatsAppClient from './src/whatsapp-client.js';

console.log('🧪 Testing WhatsApp session persistence...');

const client = new WhatsAppClient();

// Add timeout to prevent hanging
const timeout = setTimeout(() => {
  console.log('⏰ Test timeout reached');
  process.exit(0);
}, 30000);

try {
  await client.initialize();
  
  // Wait a bit to see if session loads
  setTimeout(() => {
    if (client.isReady) {
      console.log('✅ Session loaded successfully - no QR code needed!');
    } else {
      console.log('📱 QR code required - session not found or expired');
    }
    
    clearTimeout(timeout);
    client.shutdown().then(() => process.exit(0));
  }, 10000);
  
} catch (error) {
  console.error('❌ Test failed:', error);
  clearTimeout(timeout);
  process.exit(1);
}
