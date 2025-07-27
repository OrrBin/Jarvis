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
        sender_name TEXT NOT NULL,
        sender_number TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        message_type TEXT NOT NULL,
        has_urls BOOLEAN DEFAULT FALSE,
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
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (message_id) REFERENCES messages (id)
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_name)',
      'CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_from_me ON messages(is_from_me)',
      'CREATE INDEX IF NOT EXISTS idx_urls_message ON urls(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_urls_domain ON urls(domain)',
    ];

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(createMessagesTable);
        this.db.run(createUrlsTable);
        
        // Add migration for existing databases - check if column exists first
        this.db.all("PRAGMA table_info(messages)", (err, columns) => {
          if (err) {
            console.log('Migration check error:', err.message);
          } else {
            const hasIsFromMeColumn = columns.some(col => col.name === 'is_from_me');
            if (!hasIsFromMeColumn) {
              console.log('🔄 Adding is_from_me column to existing database...');
              this.db.run(`ALTER TABLE messages ADD COLUMN is_from_me BOOLEAN DEFAULT FALSE`, (err) => {
                if (err) {
                  console.log('Migration error (this is normal if column already exists):', err.message);
                } else {
                  console.log('✅ Successfully added is_from_me column');
                }
              });
            }
          }
        });
        
        for (const index of createIndexes) {
          this.db.run(index);
        }
        
        resolve();
      });
    });
  }

  async saveMessage(messageData) {
    const { id, chatId, senderName, senderNumber, content, timestamp, messageType, urls = [], isFromMe = false } = messageData;
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Insert message
        const insertMessage = `
          INSERT OR REPLACE INTO messages 
          (id, chat_id, sender_name, sender_number, content, timestamp, message_type, has_urls, is_from_me)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        this.db.run(insertMessage, [
          id, chatId, senderName, senderNumber, content, timestamp, messageType, urls.length > 0, isFromMe
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
            
            for (const urlData of urls) {
              this.run(insertUrl, [
                id, urlData.url, urlData.domain, urlData.title, urlData.description
              ]);
            }
          }
          
          resolve(this.lastID);
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
