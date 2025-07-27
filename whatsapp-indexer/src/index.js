import WhatsAppClient from './whatsapp-client.js';

async function main() {
  console.log('🚀 Starting WhatsApp Message Indexer...');
  
  const client = new WhatsAppClient();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await client.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await client.shutdown();
    process.exit(0);
  });

  try {
    await client.initialize();
    console.log('✅ WhatsApp Indexer is running. Press Ctrl+C to stop.');
    
    // Keep the process running
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ Failed to start WhatsApp Indexer:', error);
    process.exit(1);
  }
}

main();
