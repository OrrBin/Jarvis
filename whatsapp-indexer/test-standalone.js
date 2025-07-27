#!/usr/bin/env node

// Test script to verify the standalone MCP server works without WhatsApp connection

import Database from './src/database.js';
import LocalVectorStore from './src/local-vector-store.js';

async function testStandaloneComponents() {
  console.log('🧪 Testing standalone components...\n');

  try {
    // Test Database
    console.log('📊 Testing Database...');
    const database = new Database();
    await database.initialize();
    
    const messageCount = await database.getMessageCount();
    const lastMessageTime = await database.getLastMessageTime();
    
    console.log(`✅ Database initialized successfully`);
    console.log(`   - Messages: ${messageCount}`);
    console.log(`   - Last message: ${lastMessageTime ? new Date(lastMessageTime).toLocaleString() : 'None'}`);
    
    // Test Vector Store
    console.log('\n🔍 Testing Vector Store...');
    const vectorStore = new LocalVectorStore();
    await vectorStore.initialize();
    
    console.log(`✅ Vector store initialized successfully`);
    
    // Test a simple search if we have data
    if (messageCount > 0) {
      console.log('\n🔎 Testing search functionality...');
      const searchResults = await vectorStore.searchSimilar('hello', { topK: 3 });
      console.log(`✅ Search completed: ${searchResults.length} results`);
      
      if (searchResults.length > 0) {
        console.log('   Sample result:');
        const sample = searchResults[0];
        console.log(`   - From: ${sample.sender_name}`);
        console.log(`   - Content: ${sample.content.substring(0, 50)}...`);
        console.log(`   - Score: ${sample.score?.toFixed(3)}`);
      }
    } else {
      console.log('⚠️  No messages found - start the WhatsApp listener to index messages');
    }
    
    // Cleanup
    await database.close();
    
    console.log('\n✅ All tests passed! The standalone architecture is working correctly.');
    console.log('\n📝 Next steps:');
    console.log('   1. Start the WhatsApp listener: ./start-listener.sh');
    console.log('   2. Start the MCP server: ./start-mcp-standalone.sh');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testStandaloneComponents();
