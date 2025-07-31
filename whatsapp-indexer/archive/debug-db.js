#!/usr/bin/env node

import Database from './src/database.js';

async function debugDatabase() {
  const database = new Database();
  
  try {
    await database.initialize();
    
    console.log('🔍 Debug: Testing database queries...\n');
    
    // Test 1: Find all Yahav messages without date filter
    console.log('1. All Yahav messages:');
    const allYahav = await database.query(`
      SELECT chat_name, sender_name, content, datetime(timestamp/1000, 'unixepoch') as date 
      FROM messages 
      WHERE (sender_name LIKE '%Yahav%' OR content LIKE '%Yahav%' OR content LIKE '%יהב%')
      ORDER BY timestamp DESC 
      LIMIT 5
    `);
    
    for (const msg of allYahav) {
      console.log(`  ${msg.date} - ${msg.sender_name}: "${msg.content}"`);
    }
    console.log();
    
    // Test 2: Test date range calculation
    console.log('2. Date range calculation:');
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
    console.log(`  Now: ${now.toISOString()}`);
    console.log(`  2 days ago: ${twoDaysAgo.toISOString()}`);
    console.log(`  Now (ms): ${now.getTime()}`);
    console.log(`  2 days ago (ms): ${twoDaysAgo.getTime()}`);
    console.log();
    
    // Test 3: Find Yahav messages with correct date range
    console.log('3. Yahav messages from last 3 days:');
    const recentYahav = await database.query(`
      SELECT chat_name, sender_name, content, datetime(timestamp/1000, 'unixepoch') as date, timestamp
      FROM messages 
      WHERE (sender_name LIKE '%Yahav%' OR content LIKE '%Yahav%' OR content LIKE '%יהב%')
        AND timestamp >= ?
      ORDER BY timestamp DESC 
      LIMIT 10
    `, [twoDaysAgo.getTime()]);
    
    console.log(`  Found ${recentYahav.length} messages:`);
    for (const msg of recentYahav) {
      console.log(`  ${msg.date} - ${msg.sender_name}: "${msg.content}"`);
    }
    console.log();
    
    // Test 4: Test the actual findPersonInAllChats method
    console.log('4. Testing findPersonInAllChats method:');
    const methodResult = await database.findPersonInAllChats('Yahav', null, 10);
    console.log(`  Method returned ${methodResult.length} results`);
    for (const msg of methodResult.slice(0, 3)) {
      const date = new Date(msg.timestamp).toLocaleString();
      console.log(`  ${date} - ${msg.sender_name}: "${msg.content}"`);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await database.close();
  }
}

debugDatabase();
