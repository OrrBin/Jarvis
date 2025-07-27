import urlRegex from 'url-regex';
import * as chrono from 'chrono-node';

class EnhancedMessageProcessor {
  constructor() {
    this.urlPattern = urlRegex({ strict: false });
    
    // Hebrew-English mixed text patterns
    this.hebrewPattern = /[\u0590-\u05FF]/;
    this.englishPattern = /[a-zA-Z]/;
    
    // Enhanced scheduling keywords (Hebrew + English)
    this.schedulingKeywords = {
      hebrew: [
        'נפגש', 'נפגשים', 'נראה', 'נתראה', 'בואו', 'תבוא', 'תבואי', 'אבוא',
        'מחר', 'היום', 'הערב', 'בערב', 'בבוקר', 'אחר הצהריים', 'בלילה',
        'יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת',
        'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי',
        'פגישה', 'ארוחה', 'ארוחת ערב', 'ארוחת צהריים', 'קפה', 'שתייה',
        'יום הולדת', 'חגיגה', 'מסיבה', 'אירוע',
        'באזור', 'נגיע', 'נסיעה', 'נלך', 'נבוא'
      ],
      english: [
        'meet', 'meeting', 'see you', 'let\'s meet', 'come', 'go', 'visit',
        'today', 'tomorrow', 'tonight', 'morning', 'afternoon', 'evening', 'night',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'lunch', 'dinner', 'coffee', 'drink', 'meal',
        'birthday', 'party', 'celebration', 'event',
        'appointment', 'schedule', 'plan', 'calendar'
      ]
    };
    
    // Common Hebrew names and relationship terms
    this.hebrewNames = [
      'רוני', 'מיכאל', 'עוז', 'רועי', 'שני', 'יהב', 'רותם', 'איתי', 'ארתור',
      'אמא', 'אבא', 'אח', 'אחות', 'חבר', 'חברה', 'בן זוג', 'בת זוג'
    ];
    
    // Activity/venue types
    this.venueTypes = {
      hebrew: ['מסעדה', 'בית קפה', 'פאב', 'בר', 'קולנוע', 'תיאטרון', 'חדר כושר', 'פארק', 'חוף', 'קניון'],
      english: ['restaurant', 'cafe', 'pub', 'bar', 'cinema', 'theater', 'gym', 'park', 'beach', 'mall']
    };
  }

  detectLanguages(text) {
    const hasHebrew = this.hebrewPattern.test(text);
    const hasEnglish = this.englishPattern.test(text);
    
    if (hasHebrew && hasEnglish) return ['mixed', 'hebrew', 'english'];
    if (hasHebrew) return ['hebrew'];
    if (hasEnglish) return ['english'];
    return ['unknown'];
  }

  extractUrls(text) {
    const urls = text.match(this.urlPattern) || [];
    return urls.map(url => {
      const urlIndex = text.indexOf(url);
      const contextBefore = text.substring(Math.max(0, urlIndex - 50), urlIndex).trim();
      const contextAfter = text.substring(urlIndex + url.length, urlIndex + url.length + 50).trim();
      
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const purpose = this.inferUrlPurpose(contextBefore + ' ' + contextAfter, domain);
        
        return {
          url: url,
          domain: domain,
          title: null,
          description: null,
          contextBefore: contextBefore,
          contextAfter: contextAfter,
          purpose: purpose,
          position: urlIndex
        };
      } catch (error) {
        return {
          url: url,
          domain: null,
          title: null,
          description: null,
          contextBefore: contextBefore,
          contextAfter: contextAfter,
          purpose: 'unknown',
          position: urlIndex
        };
      }
    });
  }

  inferUrlPurpose(context, domain) {
    const contextLower = context.toLowerCase();
    
    // Domain-based inference
    if (domain) {
      if (domain.includes('rottentomatoes') || domain.includes('imdb')) return 'movie';
      if (domain.includes('restaurant') || domain.includes('zomato') || domain.includes('wolt')) return 'restaurant';
      if (domain.includes('youtube') || domain.includes('spotify')) return 'media';
      if (domain.includes('maps') || domain.includes('waze')) return 'location';
      if (domain.includes('facebook') || domain.includes('instagram')) return 'social';
    }
    
    // Context-based inference
    if (contextLower.includes('restaurant') || contextLower.includes('מסעדה') || 
        contextLower.includes('eat') || contextLower.includes('אוכל')) return 'restaurant';
    if (contextLower.includes('movie') || contextLower.includes('film') || contextLower.includes('סרט')) return 'movie';
    if (contextLower.includes('music') || contextLower.includes('song') || contextLower.includes('מוזיקה')) return 'media';
    if (contextLower.includes('location') || contextLower.includes('address') || contextLower.includes('כתובת')) return 'location';
    
    return 'general';
  }

  extractEntities(text) {
    const entities = {
      people: this.extractPeople(text),
      places: this.extractPlaces(text),
      times: this.extractTimeReferences(text),
      activities: this.extractActivities(text),
      confirmations: this.extractConfirmations(text)
    };
    
    return entities;
  }

  extractPeople(text) {
    const people = [];
    const textLower = text.toLowerCase();
    
    // Hebrew names
    this.hebrewNames.forEach(name => {
      if (text.includes(name)) {
        people.push(name);
      }
    });
    
    // English names (capitalized words that might be names)
    const words = text.split(/\s+/);
    words.forEach(word => {
      if (/^[A-Z][a-z]+$/.test(word) && word.length > 2) {
        people.push(word);
      }
    });
    
    // Pronouns and relationship terms
    const relationships = ['אמא', 'אבא', 'אח', 'אחות', 'חבר', 'חברה', 'mom', 'dad', 'brother', 'sister', 'friend'];
    relationships.forEach(rel => {
      if (textLower.includes(rel.toLowerCase())) {
        people.push(rel);
      }
    });
    
    return [...new Set(people)]; // Remove duplicates
  }

  extractPlaces(text) {
    const places = [];
    const textLower = text.toLowerCase();
    
    // Venue types
    [...this.venueTypes.hebrew, ...this.venueTypes.english].forEach(venue => {
      if (textLower.includes(venue.toLowerCase())) {
        places.push(venue);
      }
    });
    
    // Specific place names (capitalized sequences)
    const placePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = text.match(placePattern) || [];
    matches.forEach(match => {
      if (match.length > 3 && !this.hebrewNames.includes(match)) {
        places.push(match);
      }
    });
    
    // Hebrew place indicators
    const hebrewPlaces = text.match(/ב[א-ת]+|ל[א-ת]+/g) || [];
    places.push(...hebrewPlaces);
    
    return [...new Set(places)];
  }

  extractTimeReferences(text) {
    const times = [];
    const textLower = text.toLowerCase();
    
    // Chrono.js dates
    const chronoDates = chrono.parse(text);
    times.push(...chronoDates.map(d => ({
      text: d.text,
      date: d.start.date(),
      type: 'absolute'
    })));
    
    // Hebrew time expressions
    const hebrewTimes = [
      'הערב', 'בערב', 'היום', 'מחר', 'מחרתיים', 'השבוע', 'השבוע הבא',
      'בבוקר', 'בצהריים', 'אחר הצהריים', 'בלילה', 'עכשיו', 'אחר כך', 'לאחר מכן'
    ];
    
    hebrewTimes.forEach(timeExpr => {
      if (textLower.includes(timeExpr)) {
        times.push({
          text: timeExpr,
          type: 'relative_hebrew'
        });
      }
    });
    
    // Time patterns (19:30, 7:30 PM, etc.)
    const timePattern = /\b(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?:\s*(?:AM|PM|am|pm))?\b/g;
    const timeMatches = text.match(timePattern) || [];
    times.push(...timeMatches.map(time => ({
      text: time,
      type: 'clock_time'
    })));
    
    return times;
  }

  extractActivities(text) {
    const activities = [];
    const textLower = text.toLowerCase();
    
    const activityKeywords = {
      hebrew: [
        'ארוחה', 'ארוחת ערב', 'ארוחת צהריים', 'ארוחת בוקר', 'קפה', 'שתייה',
        'פגישה', 'ישיבה', 'פגישת עבודה', 'ראיון', 'פגישת עסקים',
        'יום הולדת', 'חגיגה', 'מסיבה', 'אירוע', 'חתונה',
        'סרט', 'קולנוע', 'הצגה', 'תיאטרון', 'קונצרט',
        'ספורט', 'כושר', 'ריצה', 'שחייה', 'טניס',
        'קניות', 'שופינג', 'קניון', 'שוק',
        'טיול', 'נסיעה', 'חופשה', 'נופש'
      ],
      english: [
        'dinner', 'lunch', 'breakfast', 'meal', 'coffee', 'drink', 'drinks',
        'meeting', 'appointment', 'interview', 'business meeting',
        'birthday', 'party', 'celebration', 'event', 'wedding',
        'movie', 'cinema', 'theater', 'show', 'concert',
        'sport', 'gym', 'workout', 'running', 'swimming', 'tennis',
        'shopping', 'mall', 'market',
        'trip', 'travel', 'vacation', 'holiday'
      ]
    };
    
    [...activityKeywords.hebrew, ...activityKeywords.english].forEach(activity => {
      if (textLower.includes(activity.toLowerCase())) {
        activities.push(activity);
      }
    });
    
    return [...new Set(activities)];
  }

  extractConfirmations(text) {
    const confirmations = [];
    const textLower = text.toLowerCase();
    
    const confirmationPatterns = {
      positive: ['כן', 'בסדר', 'אוקיי', 'טוב', 'מעולה', 'נהדר', 'סגור', 'yes', 'ok', 'okay', 'sure', 'great', 'perfect', 'done'],
      negative: ['לא', 'לא יכול', 'לא אוכל', 'אי אפשר', 'no', 'can\'t', 'cannot', 'unable', 'impossible'],
      maybe: ['אולי', 'יכול להיות', 'נראה לי', 'אני חושב', 'maybe', 'perhaps', 'might', 'possibly']
    };
    
    Object.entries(confirmationPatterns).forEach(([type, patterns]) => {
      patterns.forEach(pattern => {
        if (textLower.includes(pattern.toLowerCase())) {
          confirmations.push({ type, pattern });
        }
      });
    });
    
    return confirmations;
  }

  extractSchedulingDetails(text) {
    const isScheduling = this.detectSchedulingIntent(text);
    
    if (!isScheduling) {
      return { isScheduling: false };
    }
    
    return {
      isScheduling: true,
      timeReferences: this.extractTimeReferences(text),
      participants: this.extractPeople(text),
      locations: this.extractPlaces(text),
      activities: this.extractActivities(text),
      confirmations: this.extractConfirmations(text),
      urgency: this.detectUrgency(text)
    };
  }

  detectSchedulingIntent(text) {
    const textLower = text.toLowerCase();
    
    // Check for scheduling keywords
    const allSchedulingKeywords = [
      ...this.schedulingKeywords.hebrew,
      ...this.schedulingKeywords.english
    ];
    
    const hasSchedulingKeyword = allSchedulingKeywords.some(keyword => 
      textLower.includes(keyword.toLowerCase())
    );
    
    // Check for question patterns about availability
    const questionPatterns = [
      /\?/, // Any question mark
      /יכול/, /אפשר/, /זמין/, // Hebrew availability
      /can you/, /are you/, /available/, /free/ // English availability
    ];
    
    const hasQuestionPattern = questionPatterns.some(pattern => pattern.test(textLower));
    
    // Check for time references
    const hasTimeReference = this.extractTimeReferences(text).length > 0;
    
    return hasSchedulingKeyword || (hasQuestionPattern && hasTimeReference);
  }

  detectUrgency(text) {
    const urgentPatterns = [
      'דחוף', 'מיידי', 'עכשיו', 'מהר', 'בהקדם',
      'urgent', 'asap', 'immediately', 'now', 'quickly'
    ];
    
    const textLower = text.toLowerCase();
    return urgentPatterns.some(pattern => textLower.includes(pattern.toLowerCase()));
  }

  detectMessageType(message) {
    // Enhanced message type detection
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
    const entities = this.extractEntities(body);
    const schedulingInfo = this.extractSchedulingDetails(body);
    
    // Priority-based classification
    if (schedulingInfo.isScheduling) return 'scheduling';
    if (this.urlPattern.test(body)) return 'link';
    if (entities.confirmations.length > 0) return 'confirmation';
    if (body.includes('?') || body.toLowerCase().match(/^(what|when|where|how|why|מה|מתי|איפה|איך|למה)/)) return 'question';
    
    return 'text';
  }

  createSearchableText(messageData, entities) {
    // Create comprehensive searchable text
    const searchableComponents = [
      messageData.content,
      entities.people.join(' '),
      entities.places.join(' '),
      entities.activities.join(' '),
      entities.times.map(t => t.text).join(' '),
      messageData.urls.map(u => `${u.contextBefore} ${u.contextAfter} ${u.purpose}`).join(' ')
    ];
    
    return searchableComponents.filter(Boolean).join(' ');
  }

  async processMessage(message, chat, contact) {
    const body = message.body || '';
    
    // Skip empty messages
    if (!body.trim()) {
      console.log('⏭️ Skipping empty message');
      return null;
    }
    
    // Enhanced URL extraction with context
    const urls = this.extractUrls(body);
    
    // Extract entities
    const entities = this.extractEntities(body);
    
    // Extract scheduling information
    const schedulingInfo = this.extractSchedulingDetails(body);
    
    // Detect languages
    const languages = this.detectLanguages(body);
    
    // Enhanced message type detection
    const messageType = this.detectMessageType(message);
    
    // Get sender information
    let senderName = 'Unknown';
    let senderNumber = message.from || 'unknown';
    
    if (message.fromMe) {
      senderName = 'Me';
      senderNumber = 'me';
      console.log('📤 Processing sent message');
    } else {
      try {
        if (contact) {
          senderName = contact.pushname || contact.name || contact.number || 'Unknown';
          senderNumber = contact.number || message.from || 'unknown';
        } else {
          senderName = message.from || 'Unknown';
          senderNumber = message.from || 'unknown';
        }
        console.log('📥 Processing received message');
      } catch (error) {
        console.log('⚠️ Could not get contact info, using fallback');
        senderName = message.from || 'Unknown';
        senderNumber = message.from || 'unknown';
      }
    }
    
    // Get chat information
    let chatId = 'unknown';
    try {
      if (chat) {
        chatId = chat.id._serialized || chat.id.user || message.from || 'unknown';
      } else {
        chatId = message.from || 'unknown';
      }
    } catch (error) {
      console.log('⚠️ Could not get chat info, using fallback');
      chatId = message.from || 'unknown';
    }
    
    const processedMessage = {
      id: message.id?.id || message.id || `msg_${Date.now()}_${Math.random()}`,
      chatId,
      senderName,
      senderNumber,
      content: body.trim(),
      timestamp: (message.timestamp || Date.now() / 1000) * 1000,
      messageType,
      urls,
      entities,
      schedulingInfo,
      languages,
      hasMedia: message.hasMedia || false,
      mediaType: message.type || 'text',
      isFromMe: message.fromMe || false,
      
      // Enhanced searchable text
      searchableText: this.createSearchableText({ content: body, urls }, entities)
    };
    
    return processedMessage;
  }

  // Enhanced search query processing
  processSearchQuery(query) {
    const processed = {
      originalQuery: query,
      languages: this.detectLanguages(query),
      entities: this.extractEntities(query),
      senderFilter: null,
      dateRange: null,
      urlFilter: false,
      schedulingFilter: false,
      keywords: [],
    };
    
    // Extract sender information
    const senderMatch = query.match(/(?:from|by|sent by|מאת|של)\s+(\w+)/i);
    if (senderMatch) {
      processed.senderFilter = senderMatch[1];
      query = query.replace(senderMatch[0], '').trim();
    }
    
    // Extract date information
    const dates = chrono.parse(query);
    if (dates.length > 0) {
      const date = dates[0].start.date();
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      processed.dateRange = {
        start: startOfDay.getTime(),
        end: endOfDay.getTime(),
      };
      
      query = query.replace(dates[0].text, '').trim();
    }
    
    // Check for URL-related queries
    if (query.toLowerCase().includes('url') || query.toLowerCase().includes('link') || 
        query.toLowerCase().includes('קישור')) {
      processed.urlFilter = true;
    }
    
    // Check for scheduling-related queries
    if (this.detectSchedulingIntent(query)) {
      processed.schedulingFilter = true;
    }
    
    // Extract remaining keywords
    processed.keywords = query.split(' ').filter(word => word.length > 2);
    processed.cleanQuery = query;
    
    return processed;
  }
}

export default EnhancedMessageProcessor;
