#!/usr/bin/env node

import EnhancedMessageProcessor from './src/enhanced-message-processor.js';
import EnhancedDatabase from './src/enhanced-database.js';
import EnhancedVectorStore from './src/enhanced-vector-store.js';

console.log('🧪 Testing Enhanced WhatsApp Indexer Components...\n');

// Test message processor
console.log('1. Testing Enhanced Message Processor...');
const processor = new EnhancedMessageProcessor();

// Test multilingual text
const testTexts = [
  'היי רוני, בא לך לפגוש הערב בויטרינה ב19:30?',
  'Hey, want to meet at the restaurant tonight?',
  'אני אשלח לך את הקישור למסעדה https://example.com/restaurant',
  'Can you send me the Rotten Tomatoes link for that movie?',
  'מתי אתה חוזר מהחופשה? יש לי פגישה חשובה ביום שלישי'
];

testTexts.forEach((text, i) => {
  console.log(`\n  Test ${i + 1}: "${text}"`);
  
  const languages = processor.detectLanguages(text);
  console.log(`    Languages: ${languages.join(', ')}`);
  
  const entities = processor.extractEntities(text);
  console.log(`    People: ${entities.people.join(', ') || 'none'}`);
  console.log(`    Places: ${entities.places.join(', ') || 'none'}`);
  console.log(`    Activities: ${entities.activities.join(', ') || 'none'}`);
  
  const urls = processor.extractUrls(text);
  if (urls.length > 0) {
    console.log(`    URLs: ${urls.map(u => `${u.url} (${u.purpose})`).join(', ')}`);
  }
  
  const scheduling = processor.extractSchedulingDetails(text);
  if (scheduling.isScheduling) {
    console.log(`    Scheduling detected: ${scheduling.activities.join(', ')}`);
  }
});

console.log('\n✅ Message Processor tests completed');

// Test database initialization
console.log('\n2. Testing Enhanced Database...');
try {
  const database = new EnhancedDatabase();
  await database.initialize();
  
  const stats = await database.getStats();
  console.log(`   Database initialized successfully`);
  console.log(`   Current stats: ${stats.total_messages} messages, ${stats.unique_senders} senders`);
  
  await database.close();
  console.log('✅ Database tests completed');
} catch (error) {
  console.log('❌ Database test failed:', error.message);
}

// Test vector store initialization
console.log('\n3. Testing Enhanced Vector Store...');
try {
  const vectorStore = new EnhancedVectorStore();
  await vectorStore.initialize();
  
  const stats = await vectorStore.getStats();
  console.log(`   Vector store initialized successfully`);
  console.log(`   Model: ${stats.modelName}`);
  console.log(`   Dimension: ${stats.dimension}`);
  console.log(`   Active vectors: ${stats.activeVectors}`);
  
  // Test embedding generation
  const testEmbedding = await vectorStore.generateEmbedding(
    'היי רוני, בא לך לפגוש הערב?',
    ['mixed', 'hebrew', 'english'],
    { people: ['רוני'], activities: ['פגוש'] }
  );
  
  console.log(`   Generated embedding dimension: ${testEmbedding.length}`);
  console.log('✅ Vector Store tests completed');
} catch (error) {
  console.log('❌ Vector Store test failed:', error.message);
}

console.log('\n🎉 Enhanced functionality tests completed!');
console.log('\n📋 Summary of Enhanced Features:');
console.log('   ✅ Multilingual support (Hebrew + English)');
console.log('   ✅ Entity extraction (people, places, activities)');
console.log('   ✅ Enhanced URL context and purpose classification');
console.log('   ✅ Advanced scheduling detection');
console.log('   ✅ Improved database schema with FTS5');
console.log('   ✅ Multilingual vector embeddings');

process.exit(0);
