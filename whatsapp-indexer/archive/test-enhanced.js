#!/usr/bin/env node

import Database from './src/database.js';
import HebrewProcessor from './src/hebrew-processor.js';

async function testEnhancements() {
  console.log('🧪 Testing Enhanced WhatsApp Indexer...\n');
  
  const database = new Database();
  const hebrewProcessor = new HebrewProcessor();
  
  try {
    await database.initialize();
    
    // Test 1: Hebrew date processing
    console.log('📅 Test 1: Hebrew Date Processing');
    const hebrewDates = ['אתמול', 'מחר', 'לפני יומיים', 'השבוע שעבר'];
    for (const date of hebrewDates) {
      const processed = hebrewProcessor.parseHebrewDates(date);
      console.log(`  ${date} -> ${processed}`);
    }
    console.log();
    
    // Test 2: Meeting term enhancement
    console.log('🗓️ Test 2: Meeting Term Enhancement');
    const queries = [
      'נפגש עם יהב',
      'יש על האש מחר',
      'פגישה בשעה 8',
      'אצלי היום'
    ];
    for (const query of queries) {
      const enhanced = hebrewProcessor.enhanceWithHebrewMeetingTerms(query);
      console.log(`  "${query}" -> "${enhanced}"`);
    }
    console.log();
    
    // Test 3: Meeting context detection
    console.log('🔍 Test 3: Meeting Context Detection');
    const messages = [
      'יש על האש מחר?',
      'כן',
      'נפגש בשעה 8',
      'איך המזג אוויר?'
    ];
    for (const message of messages) {
      const context = hebrewProcessor.detectMeetingContext(message);
      console.log(`  "${message}" -> Meeting: ${context.isMeetingRelated}, Confidence: ${(context.confidence * 100).toFixed(0)}%`);
    }
    console.log();
    
    // Test 4: Person search in database
    console.log('👤 Test 4: Person Search');
    const personResults = await database.findPersonInAllChats('Yahav', '2 days ago', 10);
    console.log(`  Found ${personResults.length} messages involving "Yahav" from 2 days ago`);
    
    if (personResults.length > 0) {
      console.log('  Sample results:');
      for (const result of personResults.slice(0, 3)) {
        const date = new Date(result.timestamp).toLocaleDateString();
        const chatType = result.is_group_message ? 'Group' : 'Individual';
        console.log(`    ${date} - ${chatType}: ${result.chat_name} - ${result.sender_name}: "${result.content?.substring(0, 50)}..."`);
      }
    }
    console.log();
    
    // Test 5: Search for your specific case
    console.log('🎯 Test 5: Your Specific Case - "על האש" in פיפא group');
    const specificResults = await database.query(`
      SELECT * FROM messages 
      WHERE chat_name LIKE '%פיפא%' 
        AND (content LIKE '%על האש%' OR content LIKE '%מחר%')
        AND timestamp >= datetime('now', '-5 days')
      ORDER BY timestamp DESC
    `);
    
    console.log(`  Found ${specificResults.length} messages with "על האש" or "מחר" in פיפא group`);
    for (const result of specificResults) {
      const date = new Date(result.timestamp).toLocaleString();
      console.log(`    ${date} - ${result.sender_name}: "${result.content}"`);
    }
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await database.close();
  }
}

testEnhancements();
