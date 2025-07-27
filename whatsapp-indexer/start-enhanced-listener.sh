#!/bin/bash

echo "🚀 Starting Enhanced WhatsApp Listener..."
echo "📱 This will connect to WhatsApp and index messages with enhanced multilingual support"
echo "🔍 Features: Hebrew+English support, entity extraction, enhanced URL context, advanced scheduling detection"
echo ""

# Set NODE_ENV for better error handling
export NODE_ENV=development

# Start the enhanced listener
node -e "
import EnhancedWhatsAppClient from './src/enhanced-whatsapp-client.js';

const client = new EnhancedWhatsAppClient();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\n🛑 Shutting down Enhanced WhatsApp Listener...');
  await client.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\\n🛑 Shutting down Enhanced WhatsApp Listener...');
  await client.shutdown();
  process.exit(0);
});

// Start the client
try {
  await client.initialize();
  console.log('✅ Enhanced WhatsApp Listener is running...');
  console.log('📝 Press Ctrl+C to stop');
} catch (error) {
  console.error('❌ Failed to start Enhanced WhatsApp Listener:', error);
  process.exit(1);
}
"
