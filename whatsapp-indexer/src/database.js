import sqlite3 from 'sqlite3';
import { config } from './config.js';
import path from 'path';
import fs from 'fs';

class Database {
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
        chat_name TEXT,
        sender_name TEXT NOT NULL,
        sender_number TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        message_type TEXT NOT NULL,
        has_urls BOOLEAN DEFAULT FALSE,
        is_from_me BOOLEAN DEFAULT FALSE,
        is_group_message BOOLEAN DEFAULT FALSE,
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
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (message_id) REFERENCES messages (id)
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_name)',
      'CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_chat_name ON messages(chat_name)',
      'CREATE INDEX IF NOT EXISTS idx_messages_from_me ON messages(is_from_me)',
      'CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(is_group_message)',
      'CREATE INDEX IF NOT EXISTS idx_urls_message ON urls(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_urls_domain ON urls(domain)',
    ];

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(createMessagesTable);
        this.db.run(createUrlsTable);
        
        // Add migration for existing databases - check if columns exist first
        this.db.all("PRAGMA table_info(messages)", (err, columns) => {
          if (err) {
            console.log('Migration check error:', err.message);
            // Create indexes and resolve even if migration check fails
            for (const index of createIndexes) {
              this.db.run(index);
            }
            resolve();
          } else {
            const columnNames = columns.map(col => col.name);
            let migrationsCompleted = 0;
            const totalMigrations = 3;
            
            const checkMigrationComplete = () => {
              migrationsCompleted++;
              if (migrationsCompleted === totalMigrations) {
                // Create indexes after migrations are complete
                for (const index of createIndexes) {
                  this.db.run(index);
                }
                resolve();
              }
            };
            
            // Check and add is_from_me column
            if (!columnNames.includes('is_from_me')) {
              console.log('🔄 Adding is_from_me column to existing database...');
              this.db.run(`ALTER TABLE messages ADD COLUMN is_from_me BOOLEAN DEFAULT FALSE`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  console.log('Migration error for is_from_me:', err.message);
                } else {
                  console.log('✅ Successfully added is_from_me column');
                }
                checkMigrationComplete();
              });
            } else {
              checkMigrationComplete();
            }
            
            // Check and add chat_name column
            if (!columnNames.includes('chat_name')) {
              console.log('🔄 Adding chat_name column to existing database...');
              this.db.run(`ALTER TABLE messages ADD COLUMN chat_name TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  console.log('Migration error for chat_name:', err.message);
                } else {
                  console.log('✅ Successfully added chat_name column');
                }
                checkMigrationComplete();
              });
            } else {
              checkMigrationComplete();
            }
            
            // Check and add is_group_message column
            if (!columnNames.includes('is_group_message')) {
              console.log('🔄 Adding is_group_message column to existing database...');
              this.db.run(`ALTER TABLE messages ADD COLUMN is_group_message BOOLEAN DEFAULT FALSE`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                  console.log('Migration error for is_group_message:', err.message);
                } else {
                  console.log('✅ Successfully added is_group_message column');
                }
                checkMigrationComplete();
              });
            } else {
              checkMigrationComplete();
            }
          }
        });
      });
    });
  }

  async saveMessage(messageData) {
    const { 
      id, 
      chatId, 
      chatName, 
      senderName, 
      senderNumber, 
      content, 
      timestamp, 
      messageType, 
      urls = [], 
      isFromMe = false,
      isGroupMessage = false 
    } = messageData;
    
    return new Promise((resolve, reject) => {
      const db = this.db; // Capture database reference
      
      db.serialize(() => {
        // Insert message
        const insertMessage = `
          INSERT OR REPLACE INTO messages 
          (id, chat_id, chat_name, sender_name, sender_number, content, timestamp, message_type, has_urls, is_from_me, is_group_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(insertMessage, [
          id, chatId, chatName, senderName, senderNumber, content, timestamp, messageType, urls.length > 0, isFromMe, isGroupMessage
        ], function(err) {
          if (err) {
            reject(err);
            return;
          }

          // Insert URLs if any
          if (urls.length > 0) {
            const insertUrl = `
              INSERT INTO urls (message_id, url, domain, title, description)
              VALUES (?, ?, ?, ?, ?)
            `;
            
            let urlsProcessed = 0;
            const totalUrls = urls.length;
            
            for (const urlData of urls) {
              db.run(insertUrl, [
                id, urlData.url, urlData.domain, urlData.title, urlData.description
              ], function(urlErr) {
                if (urlErr) {
                  console.error('Error inserting URL:', urlErr);
                }
                
                urlsProcessed++;
                if (urlsProcessed === totalUrls) {
                  resolve(this.lastID);
                }
              });
            }
          } else {
            resolve(this.lastID);
          }
        });
      });
    });
  }

  async searchMessages(query, limit = 50) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.*, GROUP_CONCAT(u.url) as urls
        FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        WHERE m.content LIKE ? OR m.sender_name LIKE ?
        GROUP BY m.id
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      this.db.all(sql, [`%${query}%`, `%${query}%`, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getMessagesByDateRange(startDate, endDate, senderName = null, chatId = null) {
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
      
      if (chatId) {
        sql += ' AND m.chat_id = ?';
        params.push(chatId);
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

  async getUrlsBySender(senderName, limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT u.*, m.sender_name, m.timestamp, m.content
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

  async messageExists(messageId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT 1 FROM messages WHERE id = ? LIMIT 1';
      
      this.db.get(sql, [messageId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  async getGroupMessages(groupName, limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.*, GROUP_CONCAT(u.url) as urls
        FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        WHERE m.is_group_message = TRUE AND m.chat_name LIKE ?
        GROUP BY m.id
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      this.db.all(sql, [`%${groupName}%`, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async listGroups() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          chat_name,
          chat_id,
          COUNT(*) as message_count,
          MAX(timestamp) as last_message_time,
          COUNT(DISTINCT sender_name) as participant_count
        FROM messages 
        WHERE is_group_message = TRUE AND chat_name IS NOT NULL
        GROUP BY chat_id, chat_name
        ORDER BY last_message_time DESC
      `;
      
      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async searchInGroup(groupName, query, limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.*, GROUP_CONCAT(u.url) as urls
        FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        WHERE m.is_group_message = TRUE 
          AND m.chat_name LIKE ? 
          AND (m.content LIKE ? OR m.sender_name LIKE ?)
        GROUP BY m.id
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      this.db.all(sql, [`%${groupName}%`, `%${query}%`, `%${query}%`, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getIndividualMessages(limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.*, GROUP_CONCAT(u.url) as urls
        FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        WHERE m.is_group_message = FALSE
        GROUP BY m.id
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Find all conversations with a specific person across all chats
  async findPersonInAllChats(personName, dateRange = null, limit = 50) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          m.*,
          m.chat_name,
          m.is_group_message,
          GROUP_CONCAT(u.url) as urls,
          CASE 
            WHEN m.is_group_message = TRUE THEN 'group'
            ELSE 'individual'
          END as chat_type
        FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        WHERE (
          m.sender_name LIKE ? OR 
          m.content LIKE ? OR
          m.chat_name LIKE ?
        )
      `;
      
      const params = [`%${personName}%`, `%${personName}%`, `%${personName}%`];
      
      if (dateRange) {
        // Parse date range with correct timestamp handling (milliseconds)
        const now = new Date();
        let startDate, endDate;
        
        if (dateRange.includes('days ago') || dateRange.includes('2 days ago')) {
          const days = parseInt(dateRange.match(/(\d+)\s*days?\s*ago/)?.[1] || '1');
          startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
          endDate = now;
        } else if (dateRange.includes('yesterday')) {
          startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
          endDate = new Date(now.getTime() - (12 * 60 * 60 * 1000)); // Until noon today
        } else if (dateRange.includes('week')) {
          const weeks = dateRange.includes('last week') ? 2 : 1;
          startDate = new Date(now.getTime() - (weeks * 7 * 24 * 60 * 60 * 1000));
          endDate = now;
        } else {
          // Default to last 7 days
          startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          endDate = now;
        }
        
        // Convert to milliseconds for database comparison
        sql += ` AND m.timestamp BETWEEN ? AND ?`;
        params.push(startDate.getTime(), endDate.getTime());
      }
      
      sql += `
        GROUP BY m.id
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
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

  // Get context messages around a specific message (for better understanding)
  async getMessageContext(messageId, contextSize = 3) {
    return new Promise((resolve, reject) => {
      const sql = `
        WITH target_message AS (
          SELECT chat_id, timestamp FROM messages WHERE id = ?
        )
        SELECT m.*, GROUP_CONCAT(u.url) as urls
        FROM messages m
        LEFT JOIN urls u ON m.id = u.message_id
        CROSS JOIN target_message tm
        WHERE m.chat_id = tm.chat_id
          AND m.timestamp BETWEEN 
            datetime(tm.timestamp, '-' || ? || ' minutes') AND 
            datetime(tm.timestamp, '+' || ? || ' minutes')
        GROUP BY m.id
        ORDER BY m.timestamp ASC
      `;
      
      this.db.all(sql, [messageId, contextSize * 5, contextSize * 5], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
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

export default Database;
