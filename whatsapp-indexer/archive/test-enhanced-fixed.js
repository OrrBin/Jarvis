#!/usr/bin/env node

import Database from './src/database.js';
import HebrewProcessor from './src/hebrew-processor.js';

async function testEnhancements() {
  console.log('🧪 Testing Enhanced WhatsApp Indexer (Fixed)...\n');
  
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
    
    // Test 4: Person search in database (fixed timestamp)
    console.log('👤 Test 4: Person Search (Fixed)');
    
    // First, let's see what we have for Yahav
    const yahavResults = await database.query(`
      SELECT chat_name, sender_name, content, datetime(timestamp/1000, 'unixepoch') as date 
      FROM messages 
      WHERE (sender_name LIKE '%Yahav%' OR content LIKE '%Yahav%' OR content LIKE '%יהב%')
      ORDER BY timestamp DESC 
      LIMIT 10
    `);
    
    console.log(`  Found ${yahavResults.length} messages involving "Yahav"`);
    for (const result of yahavResults.slice(0, 5)) {
      const chatType = result.chat_name?.includes('🎮') ? 'Group' : 'Individual';
      console.log(`    ${result.date} - ${chatType}: ${result.chat_name} - ${result.sender_name}: "${result.content}"`);
    }
    console.log();
    
    // Test 5: Your specific case - the exact conversation
    console.log('🎯 Test 5: Your Specific Case - The Meeting Planning Conversation');
    const meetingResults = await database.query(`
      SELECT chat_name, sender_name, content, datetime(timestamp/1000, 'unixepoch') as date 
      FROM messages 
      WHERE chat_name LIKE '%פיפא%' 
        AND (content LIKE '%על האש%' OR content LIKE '%כן%' OR content LIKE '%אעדכן%')
        AND timestamp >= (strftime('%s', 'now') - 5*24*60*60) * 1000
      ORDER BY timestamp ASC
    `);
    
    console.log(`  Found ${meetingResults.length} messages in the meeting planning conversation:`);
    for (const result of meetingResults) {
      const meetingContext = hebrewProcessor.detectMeetingContext(result.content);
      const indicator = meetingContext.isMeetingRelated ? '🗓️' : '💬';
      console.log(`    ${indicator} ${result.date} - ${result.sender_name}: "${result.content}" (Meeting: ${meetingContext.isMeetingRelated})`);
    }
    console.log();
    
    // Test 6: Simulate the query "when did I meet with Yahav"
    console.log('🔍 Test 6: Simulating "when did I meet with Yahav" query');
    
    // This should find the planning conversation
    const meetingPlanningResults = await database.query(`
      SELECT chat_name, sender_name, content, datetime(timestamp/1000, 'unixepoch') as date,
             is_group_message
      FROM messages 
      WHERE chat_name LIKE '%פיפא%' 
        AND timestamp >= (strftime('%s', 'now') - 7*24*60*60) * 1000
        AND (
          (sender_name = 'Me' AND content LIKE '%על האש%') OR
          (sender_name = 'Yahav' AND content IN ('כן', 'אם יהיה שינוי אעדכן'))
        )
      ORDER BY timestamp ASC
    `);
    
    console.log(`  Meeting planning conversation (${meetingPlanningResults.length} messages):`);
    for (const result of meetingPlanningResults) {
      console.log(`    ${result.date} - ${result.sender_name}: "${result.content}"`);
    }
    
    if (meetingPlanningResults.length > 0) {
      const planningDate = new Date(meetingPlanningResults[0].date);
      const meetingDate = new Date(planningDate.getTime() + 24 * 60 * 60 * 1000); // Next day
      console.log(`\n  📅 Analysis: You planned to meet with Yahav on ${meetingDate.toDateString()}`);
      console.log(`     (Based on conversation on ${planningDate.toDateString()})`);
    }
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await database.close();
  }
}

testEnhancements();
