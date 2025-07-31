#!/usr/bin/env node

import WhatsAppBackfillScript from './src/backfill-script.js';

async function testBackfill() {
  console.log('🧪 Testing WhatsApp Backfill Script');
  
  // Test with dry run mode for safety
  const options = {
    daysBack: 1, // Just test 1 day
    maxMessagesPerChat: 10, // Limit messages for testing
    dryRun: true, // Don't actually save anything
    verbose: true, // Show detailed output
  };
  
  const backfill = new WhatsAppBackfillScript(options);
  
  try {
    await backfill.initialize();
    
    // Wait for client to be ready
    console.log('⏳ Waiting for WhatsApp client to be ready...');
    while (!backfill.isReady) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('✅ Client ready, starting test backfill...');
    await backfill.startBackfill();
    
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await backfill.shutdown();
  }
}

testBackfill().catch(console.error);
