import urlRegex from 'url-regex';
import * as chrono from 'chrono-node';

class MessageProcessor {
  constructor() {
    this.urlPattern = urlRegex({ strict: false });
  }

  extractUrls(text) {
    const urls = text.match(this.urlPattern) || [];
    return urls.map(url => {
      try {
        const urlObj = new URL(url);
        return {
          url: url,
          domain: urlObj.hostname,
          title: null, // Could be enhanced with web scraping
          description: null,
        };
      } catch (error) {
        return {
          url: url,
          domain: null,
          title: null,
          description: null,
        };
      }
    });
  }

  extractDates(text) {
    try {
      const results = chrono.parse(text);
      return results.map(result => ({
        text: result.text,
        date: result.start.date(),
        confidence: result.start.isCertain() ? 'high' : 'low',
      }));
    } catch (error) {
      console.error('Error extracting dates:', error);
      return [];
    }
  }

  detectMessageType(message) {
    // Detect different types of messages
    if (message.hasMedia) {
      if (message.type === 'image') return 'image';
      if (message.type === 'video') return 'video';
      if (message.type === 'audio' || message.type === 'ptt') return 'audio';
      if (message.type === 'document') return 'document';
      return 'media';
    }
    
    if (message.type === 'location') return 'location';
    if (message.type === 'vcard') return 'contact';
    
    const body = message.body || '';
    
    // Check for scheduling/meeting keywords
    const schedulingKeywords = [
      'meet', 'meeting', 'appointment', 'schedule', 'calendar',
      'tomorrow', 'today', 'next week', 'this week', 'monday', 'tuesday',
      'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ];
    
    if (schedulingKeywords.some(keyword => 
      body.toLowerCase().includes(keyword.toLowerCase())
    )) {
      return 'scheduling';
    }
    
    // Check for URLs
    if (this.urlPattern.test(body)) {
      return 'link';
    }
    
    // Check for questions
    if (body.includes('?') || body.toLowerCase().startsWith('what') || 
        body.toLowerCase().startsWith('when') || body.toLowerCase().startsWith('where') ||
        body.toLowerCase().startsWith('how') || body.toLowerCase().startsWith('why')) {
      return 'question';
    }
    
    return 'text';
  }

  async processMessage(message, chat, contact) {
    const body = message.body || '';
    
    // Skip empty messages
    if (!body.trim()) {
      console.log('⏭️ Skipping empty message');
      return null;
    }
    
    const urls = this.extractUrls(body);
    const dates = this.extractDates(body);
    const messageType = this.detectMessageType(message);
    
    // Get chat information first so we can use it in logging
    let chatInfo = {
      id: 'unknown',
      name: 'Unknown',
      isGroup: false
    };
    
    try {
      if (chat) {
        chatInfo = {
          id: chat.id._serialized || chat.id.user || message.from || 'unknown',
          name: chat.name || chat.id.user || 'Unknown',
          isGroup: chat.isGroup || false
        };
        
        // For individual chats, try to get a better name from the contact
        if (!chat.isGroup && contact) {
          // Priority: contact.name > contact.pushname > contact.shortName > chat.name
          const contactName = contact.name || contact.pushname || contact.shortName;
          if (contactName && contactName !== contact.number && !contactName.startsWith('+')) {
            chatInfo.name = contactName;
          }
        }
      } else {
        chatInfo.id = message.from || 'unknown';
      }
    } catch (error) {
      console.log('⚠️ Could not get chat info, using fallback');
      chatInfo.id = message.from || 'unknown';
    }

    // Get sender information - handle both sent and received messages
    let senderName = 'Unknown';
    let senderNumber = message.from || 'unknown';
    
    // Create descriptive display for logging
    const chatDisplay = chatInfo.isGroup 
      ? `group "${chatInfo.name}"` 
      : `"${chatInfo.name}"`;
    
    if (message.fromMe) {
      // This is a message sent by the user
      senderName = 'Me';
      senderNumber = 'me';
      console.log(`📤 Processing sent message in ${chatDisplay}`);
    } else {
      // This is a received message
      try {
        if (contact) {
          senderName = contact.pushname || contact.name || contact.number || 'Unknown';
          senderNumber = contact.number || message.from || 'unknown';
        } else {
          // Fallback for group messages or when contact is not available
          senderName = message.from || 'Unknown';
          senderNumber = message.from || 'unknown';
        }
        console.log(`📥 Processing received message in ${chatDisplay} from ${senderName}`);
      } catch (error) {
        console.log('⚠️ Could not get contact info, using fallback');
        senderName = message.from || 'Unknown';
        senderNumber = message.from || 'unknown';
      }
    }
    
    return {
      id: message.id?.id || message.id || `msg_${Date.now()}_${Math.random()}`,
      chatId: chatInfo.id,
      chatName: chatInfo.name,
      senderName,
      senderNumber,
      content: body.trim(),
      timestamp: (message.timestamp || Date.now() / 1000) * 1000, // Convert to milliseconds
      messageType,
      urls,
      dates,
      hasMedia: message.hasMedia || false,
      mediaType: message.type || 'text',
      isFromMe: message.fromMe || false,
      isGroupMessage: chatInfo.isGroup,
    };
  }

  // Enhanced search query processing
  processSearchQuery(query) {
    const processed = {
      originalQuery: query,
      senderFilter: null,
      dateRange: null,
      urlFilter: false,
      keywords: [],
    };
    
    // Extract sender information
    const senderMatch = query.match(/(?:from|by|sent by)\s+(\w+)/i);
    if (senderMatch) {
      processed.senderFilter = senderMatch[1];
      query = query.replace(senderMatch[0], '').trim();
    }
    
    // Extract date information
    const dates = chrono.parse(query);
    if (dates.length > 0) {
      const date = dates[0].start.date();
      // Create date range for the day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      processed.dateRange = {
        start: startOfDay.getTime(),
        end: endOfDay.getTime(),
      };
      
      // Remove date text from query
      query = query.replace(dates[0].text, '').trim();
    }
    
    // Check for URL-related queries
    if (query.toLowerCase().includes('url') || query.toLowerCase().includes('link')) {
      processed.urlFilter = true;
    }
    
    // Extract remaining keywords
    processed.keywords = query.split(' ').filter(word => word.length > 2);
    processed.cleanQuery = query;
    
    return processed;
  }
}

export default MessageProcessor;
