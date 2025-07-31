# Immediate Implementation Plan for WhatsApp Indexer

## Problem Analysis

Your query "when did I meet with Yahav" failed because:

1. **Missing group context**: The meeting discussion was in "פיפא" group, but search didn't check group chats when asking about a specific person
2. **Hebrew language processing**: The conversation was in Hebrew ("יש על האש מחר?" / "כן") but semantic search struggled
3. **Date interpretation**: "2 days ago" should have mapped to July 29, 2025, but the system didn't find the July 28 planning conversation
4. **Event detection**: Failed to recognize "יש על האש מחר?" as meeting planning

## Immediate Fixes (Priority 1)

### 1. Enhanced Person-Specific Search Tool

Create a new MCP tool that searches for a person across ALL chats (individual + groups):

```javascript
// New tool: find_person_conversations
{
  name: 'find_person_conversations',
  description: 'Find all conversations with a specific person across individual chats and group chats',
  inputSchema: {
    type: 'object',
    properties: {
      person_name: {
        type: 'string',
        description: 'Name of the person to find conversations with'
      },
      date_range: {
        type: 'string', 
        description: 'Optional: Date range in natural language (e.g., "last week", "2 days ago")'
      },
      include_context: {
        type: 'boolean',
        description: 'Include surrounding messages for context (default: true)'
      }
    },
    required: ['person_name']
  }
}
```

### 2. Hebrew Date Processing

Add Hebrew date parsing to the existing date processing:

```javascript
function parseHebrewDates(query) {
  const hebrewDateMap = {
    'אתמול': 'yesterday',
    'מחר': 'tomorrow',
    'שלשום': '2 days ago', 
    'לפני יומיים': '2 days ago',
    'לפני שלושה ימים': '3 days ago',
    'השבוע': 'this week',
    'השבוע שעבר': 'last week',
    'חודש שעבר': 'last month'
  };
  
  let processedQuery = query;
  for (const [hebrew, english] of Object.entries(hebrewDateMap)) {
    processedQuery = processedQuery.replace(new RegExp(hebrew, 'g'), english);
  }
  return processedQuery;
}
```

### 3. Hebrew Meeting Keywords Detection

Enhance the search to recognize Hebrew meeting/planning terms:

```javascript
function enhanceSearchWithHebrewMeetingTerms(query) {
  const hebrewMeetingTerms = {
    'נפגש': 'meet met meeting',
    'נפגשתי': 'met meeting',
    'פגישה': 'meeting appointment',
    'על האש': 'planned scheduled meeting', // Your specific case!
    'תוכניות': 'plans',
    'מחר': 'tomorrow',
    'היום': 'today',
    'בשעה': 'at time',
    'אצלי': 'at my place',
    'אצלך': 'at your place'
  };
  
  // Add Hebrew terms as additional search context
  let enhancedQuery = query;
  for (const [hebrew, english] of Object.entries(hebrewMeetingTerms)) {
    if (query.includes(hebrew)) {
      enhancedQuery += ` ${english}`;
    }
  }
  return enhancedQuery;
}
```

### 4. Improved search_messages Tool

Modify the existing search to be Hebrew-aware:

```javascript
async handleSearchMessages(args) {
  let { query, limit = 10, message_type = 'all' } = args;
  
  // Process Hebrew dates and meeting terms
  query = parseHebrewDates(query);
  query = enhanceSearchWithHebrewMeetingTerms(query);
  
  // If query mentions a person, search across all chats including groups
  const personMatch = query.match(/(?:with|עם)\s+(\w+)/i);
  if (personMatch) {
    const personName = personMatch[1];
    return await this.findPersonConversations(personName, query, limit);
  }
  
  // Regular search with enhanced query
  return await this.vectorStore.search(query, limit);
}
```

## Implementation Steps

### Step 1: Update MCP Server (30 minutes)

1. Add Hebrew date parsing function
2. Add Hebrew meeting terms enhancement
3. Create `find_person_conversations` tool
4. Modify existing `search_messages` to be Hebrew-aware

### Step 2: Update Database Queries (20 minutes)

Add method to search for person across all chats:

```javascript
// In database.js
async findPersonInAllChats(personName, dateRange = null) {
  let query = `
    SELECT m.*, c.name as chat_name, c.is_group
    FROM messages m
    JOIN chats c ON m.chat_id = c.id
    WHERE (m.sender_name LIKE ? OR m.body LIKE ?)
  `;
  
  const params = [`%${personName}%`, `%${personName}%`];
  
  if (dateRange) {
    const dates = this.parseDateRange(dateRange);
    query += ` AND m.timestamp BETWEEN ? AND ?`;
    params.push(dates.start, dates.end);
  }
  
  query += ` ORDER BY m.timestamp DESC`;
  
  return this.db.all(query, params);
}
```

### Step 3: Test with Your Specific Case

After implementation, these queries should work:

1. "when did I meet with Yahav" → Finds group chat discussion
2. "מתי נפגשתי עם יהב" → Same result in Hebrew  
3. "יש על האש מחר עם יהב" → Finds the specific planning message
4. "what did we plan 2 days ago" → Maps to July 29 and finds July 28 planning

## Quick Implementation

Let me create the enhanced MCP server with these fixes:

```bash
# Create backup
cp src/mcp-server-standalone.js src/mcp-server-standalone.js.backup

# Implement the fixes
# (I'll create the updated file)
```

Would you like me to implement these changes right now? The key improvements are:

1. **Person-specific search across all chats** - This will find Yahav in group chats
2. **Hebrew date/meeting term processing** - This will understand "על האש מחר" 
3. **Better date mapping** - "2 days ago" will properly map to July 29
4. **Context-aware results** - Show surrounding messages for better understanding

This should solve your immediate issue where you asked about meeting with Yahav and it failed to find the group chat discussion about plans.
