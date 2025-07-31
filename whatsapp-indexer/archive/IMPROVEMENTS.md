# WhatsApp Indexer Improvements Plan

## Issues Identified

1. **Group chat context loss** - When asking about meeting with "Yahav", system doesn't search group conversations
2. **Hebrew/English mixed language support** - Semantic search struggles with Hebrew
3. **Date interpretation** - "2 days ago" not properly mapped to specific dates
4. **Person-specific filtering in group contexts** - Can't find what user discussed with specific person in group chats
5. **Meeting/event detection** - Failed to identify meeting arrangements in Hebrew

## Proposed Solutions

### 1. Enhanced Database Schema

Add new tables and columns to better capture context:

```sql
-- Add person-message mapping for group chats
CREATE TABLE message_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    person_name TEXT,
    person_phone TEXT,
    is_sender BOOLEAN,
    FOREIGN KEY (message_id) REFERENCES messages (id)
);

-- Add meeting/event detection
CREATE TABLE detected_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    event_type TEXT, -- 'meeting', 'appointment', 'plan'
    event_date TEXT,
    event_time TEXT,
    location TEXT,
    participants TEXT, -- JSON array
    confidence_score REAL,
    FOREIGN KEY (message_id) REFERENCES messages (id)
);

-- Add better language detection
ALTER TABLE messages ADD COLUMN detected_language TEXT;
ALTER TABLE messages ADD COLUMN contains_hebrew BOOLEAN DEFAULT 0;
ALTER TABLE messages ADD COLUMN contains_english BOOLEAN DEFAULT 0;
```

### 2. Improved Message Processing

#### A. Language-Aware Processing
- Detect Hebrew vs English content
- Use Hebrew-specific NLP models for Hebrew text
- Create separate vector embeddings for Hebrew and English
- Implement Hebrew date/time parsing

#### B. Event Detection
- Hebrew meeting keywords: "נפגש", "פגישה", "מחר", "היום", "בשעה", "במקום"
- English meeting keywords: "meet", "meeting", "tomorrow", "today", "at", "pm", "am"
- Time pattern recognition: "20:00", "8 PM", "בשעה 7"
- Location detection: "קניון" (mall), "בית קפה", "אצלי", "אצלך"

#### C. Person-Context Mapping
- Track who said what in group chats
- Create person-specific conversation threads
- Map phone numbers to contact names more reliably

### 3. Enhanced MCP Tools

#### New Tools:

```javascript
// Find conversations with specific person across all chats
async function find_person_conversations(person_name, date_range, include_groups = true) {
    // Search both individual and group chats for messages involving this person
}

// Hebrew-aware date search
async function search_by_hebrew_date(date_query) {
    // Parse Hebrew dates: "אתמול", "מחר", "שלשום", "יום שלישי"
}

// Event-specific search
async function find_events_with_person(person_name, event_type = 'meeting') {
    // Find meetings, appointments, plans with specific person
}

// Context-aware search
async function search_with_context(query, context = {}) {
    // context can include: person, group, date_range, language
}
```

#### Enhanced Existing Tools:

```javascript
// Improved search_messages
async function search_messages(query, options = {}) {
    const {
        person_filter,      // Search for messages involving this person
        group_context,      // Include group chat context
        language_hint,      // 'hebrew', 'english', 'mixed'
        date_interpretation, // Auto-parse relative dates
        event_focus        // Focus on meetings/events
    } = options;
}
```

### 4. Vector Store Improvements

#### Multi-language Embeddings
- Use multilingual models: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- Create separate indices for Hebrew and English
- Implement language-specific preprocessing

#### Context-Enhanced Embeddings
- Include speaker information in embeddings
- Add temporal context (day of week, time)
- Include group chat context

### 5. Search Query Processing

#### Hebrew Query Processing
```javascript
function processHebrewQuery(query) {
    // Translate common Hebrew time expressions
    const hebrewTimeMap = {
        'אתמול': 'yesterday',
        'מחר': 'tomorrow', 
        'שלשום': '2 days ago',
        'לפני יומיים': '2 days ago',
        'השבוע': 'this week',
        'השבוע שעבר': 'last week'
    };
    
    // Translate Hebrew meeting terms
    const hebrewMeetingMap = {
        'נפגשתי': 'met',
        'פגישה': 'meeting',
        'נפגש': 'meet',
        'ביום': 'on day'
    };
}
```

#### Smart Date Resolution
```javascript
function resolveDateQuery(query, currentDate) {
    // "2 days ago" -> specific date
    // "יום שלישי" -> last/next Tuesday
    // "מחר" -> tomorrow's date
}
```

### 6. Implementation Priority

#### Phase 1: Critical Fixes
1. Add person-message mapping for group chats
2. Implement Hebrew date parsing
3. Add event detection for meeting keywords
4. Create person-specific search across all chats

#### Phase 2: Enhanced Search
1. Multi-language vector embeddings
2. Context-aware search tools
3. Improved MCP tool interfaces
4. Better query preprocessing

#### Phase 3: Advanced Features
1. Automatic event extraction and calendar integration
2. Conversation threading by topic
3. Smart contact name resolution
4. Predictive meeting suggestions

### 7. Testing Scenarios

Create test cases for:
- Hebrew meeting arrangements: "נפגש מחר בשעה 8"
- Mixed language conversations
- Group chat person-specific queries
- Relative date queries in Hebrew and English
- Cross-chat person conversation tracking

### 8. Configuration Updates

```env
# Language support
ENABLE_HEBREW_PROCESSING=true
HEBREW_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENABLE_EVENT_DETECTION=true

# Search improvements  
ENABLE_PERSON_CONTEXT_MAPPING=true
ENABLE_SMART_DATE_RESOLUTION=true
DEFAULT_SEARCH_LANGUAGE=mixed
```

## Expected Outcomes

After implementing these improvements:

1. ✅ Query: "when did I meet with Yahav" → Finds group chat discussion about meeting plans
2. ✅ Query: "מתי נפגשתי עם יהב" → Same result in Hebrew
3. ✅ Query: "what did Yahav send me" → Finds URLs and messages from Yahav across all chats
4. ✅ Query: "plans for tomorrow" → Finds Hebrew discussions about "מחר"
5. ✅ Better contact name resolution for phone numbers
6. ✅ Context-aware search that understands group vs individual conversations
