/**
 * Hebrew Processing Utility
 * Handles Hebrew date parsing and meeting term enhancement for WhatsApp messages
 */

export class HebrewProcessor {
  constructor() {
    this.hebrewDateMap = {
      'אתמול': 'yesterday',
      'מחר': 'tomorrow',
      'שלשום': '2 days ago',
      'לפני יומיים': '2 days ago',
      'לפני שלושה ימים': '3 days ago',
      'לפני ארבעה ימים': '4 days ago',
      'לפני חמישה ימים': '5 days ago',
      'השבוע': 'this week',
      'השבוע שעבר': 'last week',
      'חודש שעבר': 'last month',
      'השנה': 'this year',
      'השנה שעברה': 'last year'
    };

    this.hebrewMeetingTerms = {
      'נפגש': 'meet met meeting',
      'נפגשתי': 'met meeting',
      'נפגשנו': 'we met meeting',
      'פגישה': 'meeting appointment',
      'על האש': 'planned scheduled meeting on fire', // Your specific case!
      'תוכניות': 'plans',
      'מחר': 'tomorrow',
      'היום': 'today',
      'אתמול': 'yesterday',
      'בשעה': 'at time',
      'אצלי': 'at my place',
      'אצלך': 'at your place',
      'אצלו': 'at his place',
      'אצלה': 'at her place',
      'בקניון': 'at mall',
      'בבית קפה': 'at cafe',
      'במסעדה': 'at restaurant',
      'יש': 'there is have',
      'כן': 'yes',
      'בטח': 'sure definitely',
      'סבבה': 'okay good',
      'אוקיי': 'okay'
    };

    this.hebrewTimePatterns = [
      /בשעה\s+(\d{1,2})/g,  // "בשעה 8"
      /ב(\d{1,2})/g,        // "ב8"
      /(\d{1,2})\s*בערב/g,  // "8 בערב"
      /(\d{1,2})\s*בבוקר/g, // "8 בבוקר"
    ];
  }

  /**
   * Parse Hebrew dates and convert to English equivalents
   */
  parseHebrewDates(text) {
    let processedText = text;
    
    for (const [hebrew, english] of Object.entries(this.hebrewDateMap)) {
      const regex = new RegExp(hebrew, 'g');
      processedText = processedText.replace(regex, english);
    }
    
    return processedText;
  }

  /**
   * Enhance search query with Hebrew meeting terms
   */
  enhanceWithHebrewMeetingTerms(query) {
    let enhancedQuery = query;
    
    for (const [hebrew, english] of Object.entries(this.hebrewMeetingTerms)) {
      if (query.includes(hebrew)) {
        enhancedQuery += ` ${english}`;
      }
    }
    
    return enhancedQuery;
  }

  /**
   * Extract time information from Hebrew text
   */
  extractHebrewTimes(text) {
    const times = [];
    
    for (const pattern of this.hebrewTimePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        times.push({
          original: match[0],
          hour: match[1],
          context: text.substring(Math.max(0, match.index - 10), match.index + match[0].length + 10)
        });
      }
    }
    
    return times;
  }

  /**
   * Detect if text contains Hebrew meeting/planning language
   */
  detectMeetingContext(text) {
    const meetingIndicators = [
      'על האש',
      'נפגש',
      'פגישה',
      'תוכניות',
      'מחר',
      'בשעה',
      'אצל'
    ];

    const confirmationWords = [
      'כן',
      'בטח',
      'סבבה',
      'אוקיי',
      'יש'
    ];

    const hasMeetingTerms = meetingIndicators.some(term => text.includes(term));
    const hasConfirmation = confirmationWords.some(term => text.includes(term));
    
    return {
      isMeetingRelated: hasMeetingTerms,
      hasConfirmation: hasConfirmation,
      confidence: hasMeetingTerms ? (hasConfirmation ? 0.9 : 0.7) : 0.1
    };
  }

  /**
   * Process a search query to be Hebrew-aware
   */
  processSearchQuery(query) {
    // First, parse Hebrew dates
    let processedQuery = this.parseHebrewDates(query);
    
    // Then enhance with meeting terms
    processedQuery = this.enhanceWithHebrewMeetingTerms(processedQuery);
    
    return {
      originalQuery: query,
      processedQuery: processedQuery,
      hasHebrew: /[\u0590-\u05FF]/.test(query),
      meetingContext: this.detectMeetingContext(query)
    };
  }

  /**
   * Extract person names from Hebrew text (basic implementation)
   */
  extractPersonNames(text) {
    // Common Hebrew name patterns and your specific case
    const namePatterns = [
      /יהב/g,    // Yahav
      /יהב/g,    // Alternative spelling
      /עוז/g,     // Oz
      /רוני/g,    // Roni
    ];

    const names = [];
    for (const pattern of namePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        names.push(match[0]);
      }
    }

    return [...new Set(names)]; // Remove duplicates
  }

  /**
   * Check if a message is likely a meeting confirmation
   */
  isMeetingConfirmation(message) {
    const confirmationPatterns = [
      /כן/,
      /בטח/,
      /סבבה/,
      /אוקיי/,
      /יש.*על.*האש/,
      /אם.*יהיה.*שינוי/
    ];

    return confirmationPatterns.some(pattern => pattern.test(message));
  }
}

export default HebrewProcessor;
