#!/usr/bin/env node

import Database from './src/database.js';
import HebrewProcessor from './src/hebrew-processor.js';

async function testYourQuery() {
  console.log('🔍 Testing: "when did I meet with Yahav"...\n');
  
  const database = new Database();
  const hebrewProcessor = new HebrewProcessor();
  
  try {
    await database.initialize();
    
    // Simulate the enhanced find_person_conversations tool
    console.log('📞 Using find_person_conversations tool...');
    const results = await database.findPersonInAllChats('Yahav', '2 days ago', 20);
    
    console.log(`Found ${results.length} conversations with Yahav:\n`);
    
    // Group messages by chat and analyze for meeting context
    const chatGroups = {};
    const meetingMessages = [];
    
    for (const message of results) {
      const chatKey = message.chat_name || 'Unknown Chat';
      if (!chatGroups[chatKey]) {
        chatGroups[chatKey] = [];
      }
      chatGroups[chatKey].push(message);
      
      // Check if this message has meeting context
      const meetingContext = hebrewProcessor.detectMeetingContext(message.content || '');
      if (meetingContext.isMeetingRelated) {
        meetingMessages.push({
          ...message,
          meetingContext
        });
      }
    }

    // Show meeting-related messages first
    if (meetingMessages.length > 0) {
      console.log('🗓️ **Meeting/Planning Related Messages:**\n');
      for (const msg of meetingMessages.slice(0, 5)) {
        const date = new Date(msg.timestamp).toLocaleString();
        const chatType = msg.is_group_message ? '👥 Group' : '💬 Individual';
        const sender = msg.sender_name === 'Me' ? '📤 (Sent)' : '📥 (Received)';
        
        console.log(`**${chatType}: ${msg.chat_name}**`);
        console.log(`**${date} - ${msg.sender_name} ${sender}**`);
        console.log(`**Message:** ${msg.content}`);
        if (msg.urls) {
          console.log(`**URLs:** ${msg.urls}`);
        }
        console.log(`**Meeting Confidence:** ${(msg.meetingContext.confidence * 100).toFixed(0)}%`);
        console.log('---\n');
      }
    }
    
    // Show analysis
    if (meetingMessages.length > 0) {
      const planningMsg = meetingMessages.find(m => m.content?.includes('על האש מחר'));
      const confirmationMsg = meetingMessages.find(m => m.sender_name === 'Yahav' && m.content === 'כן');
      
      if (planningMsg && confirmationMsg) {
        const planningDate = new Date(planningMsg.timestamp);
        const meetingDate = new Date(planningDate.getTime() + 24 * 60 * 60 * 1000);
        
        console.log('📅 **ANALYSIS:**');
        console.log(`You asked Yahav "יש על האש מחר?" on ${planningDate.toDateString()}`);
        console.log(`Yahav confirmed with "כן"`);
        console.log(`Therefore, you met with Yahav on ${meetingDate.toDateString()}`);
        console.log('');
        
        // Look for confirmation that the meeting happened
        const confirmationResults = await database.query(`
          SELECT * FROM messages 
          WHERE content LIKE '%חזרתי%מעל האש%יהב%'
          AND timestamp > ?
          ORDER BY timestamp ASC
          LIMIT 1
        `, [confirmationMsg.timestamp]);
        
        if (confirmationResults.length > 0) {
          const confirmation = confirmationResults[0];
          const confirmDate = new Date(confirmation.timestamp).toLocaleString();
          console.log('✅ **MEETING CONFIRMED:**');
          console.log(`${confirmDate} - You said: "${confirmation.content}"`);
          console.log('This confirms you actually met with Yahav!');
        }
      }
    }
    
    console.log('\n✅ Query test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await database.close();
  }
}

testYourQuery();
