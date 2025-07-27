import sqlite3 from 'sqlite3';
import { config } from './config.js';
import path from 'path';
import fs from 'fs';

class EnhancedDatabase {
  constructor() {
    this.db = null;
  }

  async initialize() {
    // Ensure data directory exists
    const dataDir = path.dirname(config.database.path);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(config.database.path, (err) => {
        if (err) {
          reject(err);
        } else {
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_number TEXT NOT NULL,
        content TEXT NOT NULL,
        searchable_text TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        message_type TEXT NOT NULL,
        languages TEXT, -- JSON array of detected languages
        has_urls BOOLEAN DEFAULT FALSE,
        has_scheduling BOOLEAN DEFAULT FALSE,
        is_from_me BOOLEAN DEFAULT FALSE,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    const createUrlsTable = `
      CREATE TABLE IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        url TEXT NOT NULL,
        domain TEXT,
        title TEXT,
        description TEXT,
        context_before TEXT,
        context_after TEXT,
        purpose TEXT,
        position INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (message_id) REFERENCES messages (id)
      )
    `;

    const createEntitiesTable = `
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        entity_type TEXT NOT NULL, -- 'person', 'place', 'activity', 'time', 'confirmation'
        entity_value TEXT NOT NULL,
        entity_data TEXT, -- JSON with additional data
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (message_id) REFERENCES messages (id)
      )
    `;

    const createSchedulingTable = `
      CREATE TABLE IF NOT EXISTS scheduling (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        is_scheduling BOOLEAN NOT NULL,
        participants TEXT, -- JSON array
        locations TEXT, -- JSON array
        activities TEXT, -- JSON array
        time_references TEXT, -- JSON array
        confirmations TEXT, -- JSON array
        urgency BOOLEAN DEFAULT FALSE,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (message_id) REFERENCES messages (id)
      )
    `;

    // Enhanced indexes for better search performance
    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_name)',
      'CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_from_me ON messages(is_from_me)',
      'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type)',
      'CREATE INDEX IF NOT EXISTS idx_messages_scheduling ON messages(has_scheduling)',
      'CREATE INDEX IF NOT EXISTS idx_messages_urls ON messages(has_urls)',
      'CREATE INDEX IF NOT EXISTS idx_messages_searchable ON messages(searchable_text)',
      
      'CREATE INDEX IF NOT EXISTS idx_urls_message ON urls(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_urls_domain ON urls(domain)',
      'CREATE INDEX IF NOT EXISTS idx_urls_purpose ON urls(purpose)',
      
      'CREATE INDEX IF NOT EXISTS idx_entities_message ON entities(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type)',
      'CREATE INDEX IF NOT EXISTS idx_entities_value ON entities(entity_value)',
      
      'CREATE INDEX IF NOT EXISTS idx_scheduling_message ON scheduling(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_scheduling_is_scheduling ON scheduling(is_scheduling)',
      
      // Full-text search indexes
      'CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, searchable_text, sender_name, content=messages, content_rowid=rowid)',
    ];

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(createMessagesTable);
        this.db.run(createUrlsTable);
        this.db.run(createEntitiesTable);
        this.db.run(createSchedulingTable);
        
        // Migration for existing databases
        this.db.all("PRAGMA table_info(messages)", (err, columns) => {
          if (err) {
            console.log('Migration check error:', err.message);
          } else {
            const existingColumns = columns.map(col => col.name);
            const newColumns = [
              { name: 'searchable_text', type: 'TEXT NOT NULL DEFAULT ""' },
              { name: 'languages', type: 'TEXT' },
              { name: 'has_scheduling', type: 'BOOLEAN DEFAULT FALSE' }
            ];
            
            newColumns.forEach(col => {
              if (!existingColumns.includes(col.name)) {
                console.log(`🔄 Adding ${col.name} column to existing database...`);
                this.db.run(`ALTER TABLE messages ADD COLUMN ${col.name} ${col.type}`, (err) => {
                  if (err) {
                    console.log(`Migration error for ${col.name}:`, err.message);
                  } else {
                    console.log(`✅ Successfully added ${col.name} column`);
                  }
                });
              }
            });
          }
        });
        
        // Create indexes
        for (const index of createIndexes) {
          this.db.run(index, (err) => {
            if (err && !err.message.includes('already exists')) {
              console.log('Index creation error:', err.message);
            }
          });
        }
        
        resolve();
      });
    });
  }

  async saveMessage(messageData) {
    const { 
      id, chatId, senderName, senderNumber, content, searchableText, timestamp, 
      messageType, languages = [], urls = [], entities = {}, schedulingInfo = {}, 
      isFromMe = false 
    } = messageData;
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Insert message
        const insertMessage = `
          INSERT OR REPLACE INTO messages 
          (id, chat_id, sender_name, sender_number, content, searchable_text, timestamp, 
           message_type, languages, has_urls, has_scheduling, is_from_me)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        this.db.run(insertMessage, [
          id, chatId, senderName, senderNumber, content, searchableText, timestamp, 
          messageType, JSON.stringify(languages), urls.length > 0, 
          schedulingInfo.isScheduling || false, isFromMe
        ], function(err) {
          if (err) {
            reject(err);
            return;
          }

          // Insert URLs
          if (urls.length > 0) {
            const insertUrl = `
              INSERT INTO urls (message_id, url, domain, title, description, 
                               context_before, context_after, purpose, position)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            for (const urlData of urls) {
              this.run(insertUrl, [
                id, urlData.url, urlData.domain, urlData.title, urlData.description,
                urlData.contextBefore, urlData.contextAfter, urlData.purpose, urlData.position
              ]);
            }
          }

          // Insert entities
          if (entities && Object.keys(entities).length > 0) {
            const insertEntity = `
              INSERT INTO entities (message_id, entity_type, entity_value, entity_data)
              VALUES (?, ?, ?, ?)
            `;
            
            Object.entries(entities).forEach(([type, values]) => {
              if (Array.isArray(values)) {
                values.forEach(value => {
                  this.run(insertEntity, [id, type, value, JSON.stringify({ type, value })]);
                });
              }
            });
          }

          // Insert scheduling information
          if (schedulingInfo && schedulingInfo.isScheduling) {
            const insertScheduling = `
              INSERT INTO scheduling (message_id, is_scheduling, participants, locations, 
                                    activities, time_references, confirmations, urgency)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.run(insertScheduling, [
              id, schedulingInfo.isScheduling,
              JSON.stringify(schedulingInfo.participants || []),
              JSON.stringify(schedulingInfo.locations || []),
              JSON.stringify(schedulingInfo.activities || []),
              JSON.stringify(schedulingInfo.timeReferences || []),
              JSON.stringify(schedulingInfo.confirmations || []),
              schedulingInfo.urgency || false
            ]);
          }

          // Update FTS index
          this.run(`INSERT OR REPLACE INTO messages_fts(rowid, content, searchable_text, sender_name) 
                    VALUES ((SELECT rowid FROM messages WHERE id = ?), ?, ?, ?)`, 
                   [id, content, searchableText, senderName]);
          
          resolve(this.lastID);
        });
      });
    });
  }

  async searchMessages(query, options = {}) {
    const { limit = 50, senderFilter, dateRange, urlFilter, schedulingFilter } = options;
    
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT m.*, 
               GROUP_CONCAT(DISTINCT u.url) as urls,
               GROUP_CONCAT(DISTINCT e.entity_value) as entities,
               s.participants, s.activities, s.locations
        FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        LEFT JOIN entities e ON m.id = e.message_id
        LEFT JOIN scheduling s ON m.id = s.message_id
        WHERE 1=1
      `;
      
      const params = [];
      
      // Text search using FTS
      if (query && query.trim()) {
        sql += ` AND m.id IN (
          SELECT rowid FROM messages_fts 
          WHERE messages_fts MATCH ?
        )`;
        params.push(query);
      }
      
      // Sender filter
      if (senderFilter) {
        sql += ' AND m.sender_name LIKE ?';
        params.push(`%${senderFilter}%`);
      }
      
      // Date range filter
      if (dateRange) {
        sql += ' AND m.timestamp BETWEEN ? AND ?';
        params.push(dateRange.start, dateRange.end);
      }
      
      // URL filter
      if (urlFilter) {
        sql += ' AND m.has_urls = 1';
      }
      
      // Scheduling filter
      if (schedulingFilter) {
        sql += ' AND m.has_scheduling = 1';
      }
      
      sql += ' GROUP BY m.id ORDER BY m.timestamp DESC LIMIT ?';
      params.push(limit);
      
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async searchByEntity(entityType, entityValue, limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.*, e.entity_value, e.entity_data
        FROM messages m
        JOIN entities e ON m.id = e.message_id
        WHERE e.entity_type = ? AND e.entity_value LIKE ?
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      this.db.all(sql, [entityType, `%${entityValue}%`, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getSchedulingMessages(options = {}) {
    const { limit = 50, timeRange, participants, activities } = options;
    
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT m.*, s.*
        FROM messages m
        JOIN scheduling s ON m.id = s.message_id
        WHERE s.is_scheduling = 1
      `;
      
      const params = [];
      
      if (timeRange) {
        sql += ' AND m.timestamp BETWEEN ? AND ?';
        params.push(timeRange.start, timeRange.end);
      }
      
      if (participants) {
        sql += ' AND s.participants LIKE ?';
        params.push(`%${participants}%`);
      }
      
      if (activities) {
        sql += ' AND s.activities LIKE ?';
        params.push(`%${activities}%`);
      }
      
      sql += ' ORDER BY m.timestamp DESC LIMIT ?';
      params.push(limit);
      
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getUrlsBySender(senderName, limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT u.*, m.sender_name, m.timestamp, m.content, m.searchable_text
        FROM urls u
        JOIN messages m ON u.message_id = m.id
        WHERE m.sender_name LIKE ?
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      this.db.all(sql, [`%${senderName}%`, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getUrlsByPurpose(purpose, limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT u.*, m.sender_name, m.timestamp, m.content
        FROM urls u
        JOIN messages m ON u.message_id = m.id
        WHERE u.purpose = ?
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      this.db.all(sql, [purpose, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getMessagesByDateRange(startDate, endDate, senderName = null) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT m.*, GROUP_CONCAT(u.url) as urls
        FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        WHERE m.timestamp BETWEEN ? AND ?
      `;
      
      const params = [startDate, endDate];
      
      if (senderName) {
        sql += ' AND m.sender_name LIKE ?';
        params.push(`%${senderName}%`);
      }
      
      sql += ' GROUP BY m.id ORDER BY m.timestamp DESC';
      
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getMessageCount() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM messages';
      
      this.db.get(sql, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }

  async getLastMessageTime() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT MAX(timestamp) as last_timestamp FROM messages';
      
      this.db.get(sql, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.last_timestamp);
        }
      });
    });
  }

  async getStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_messages,
          COUNT(DISTINCT sender_name) as unique_senders,
          COUNT(*) FILTER (WHERE has_urls = 1) as messages_with_urls,
          COUNT(*) FILTER (WHERE has_scheduling = 1) as scheduling_messages,
          COUNT(*) FILTER (WHERE is_from_me = 1) as sent_messages,
          COUNT(*) FILTER (WHERE is_from_me = 0) as received_messages,
          COUNT(DISTINCT message_type) as message_types
        FROM messages
      `;
      
      this.db.get(sql, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Generic query method for custom SQL queries
  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(resolve);
      } else {
        resolve();
      }
    });
  }
}

export default EnhancedDatabase;
