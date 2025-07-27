import { pipeline } from '@xenova/transformers';
import faiss from 'faiss-node';
import fs from 'fs-extra';
import path from 'path';
import { config } from './config.js';

const { IndexFlatIP } = faiss;

class EnhancedVectorStore {
  constructor() {
    this.embedder = null;
    this.index = null;
    this.metadata = [];
    this.isInitialized = false;
    this.vectorStorePath = config.vectorStore.path;
    this.indexPath = path.join(this.vectorStorePath, 'faiss.index');
    this.metadataPath = path.join(this.vectorStorePath, 'metadata.json');
    
    // Use multilingual model for better Hebrew-English support
    this.modelName = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
    this.dimension = 384; // This model outputs 384-dimensional vectors
  }

  async initialize() {
    try {
      console.error('🚀 Initializing enhanced multilingual vector store...');
      
      // Ensure vector store directory exists
      await fs.ensureDir(this.vectorStorePath);
      
      // Initialize the multilingual embedding model
      console.error('📥 Loading multilingual embedding model (this may take a moment on first run)...');
      this.embedder = await pipeline('feature-extraction', this.modelName, {
        quantized: false,
      });
      
      // Load or create FAISS index
      await this.loadOrCreateIndex();
      
      this.isInitialized = true;
      console.error('✅ Enhanced multilingual vector store initialized successfully');
      console.error(`📊 Index contains ${this.metadata.length} vectors`);
      
    } catch (error) {
      console.error('❌ Failed to initialize enhanced vector store:', error);
      throw error;
    }
  }

  async loadOrCreateIndex() {
    try {
      // Try to load existing index and metadata
      if (await fs.pathExists(this.indexPath) && await fs.pathExists(this.metadataPath)) {
        console.error('📂 Loading existing vector index...');
        
        // Load FAISS index
        this.index = IndexFlatIP.read(this.indexPath);
        
        // Load metadata
        const metadataContent = await fs.readFile(this.metadataPath, 'utf8');
        this.metadata = JSON.parse(metadataContent);
        
        console.error(`✅ Loaded existing index with ${this.metadata.length} vectors`);
      } else {
        console.error('🆕 Creating new vector index...');
        
        // Create new FAISS index
        this.index = new IndexFlatIP(this.dimension);
        this.metadata = [];
        
        // Save empty index
        await this.saveIndex();
        
        console.error('✅ Created new empty vector index');
      }
    } catch (error) {
      console.error('Error loading/creating index:', error);
      
      // Fallback: create new index
      console.error('🔄 Creating fallback index...');
      this.index = new IndexFlatIP(this.dimension);
      this.metadata = [];
    }
  }

  async saveIndex() {
    try {
      // Save FAISS index
      this.index.write(this.indexPath);
      
      // Save metadata
      await fs.writeFile(this.metadataPath, JSON.stringify(this.metadata, null, 2));
      
      console.error('💾 Vector index saved successfully');
    } catch (error) {
      console.error('Error saving index:', error);
      throw error;
    }
  }

  preprocessTextForEmbedding(text, languages = [], entities = {}) {
    // Enhanced text preprocessing for better multilingual embeddings
    let processedText = text;
    
    // Add entity context to improve semantic understanding
    const entityContext = [];
    
    if (entities.people && entities.people.length > 0) {
      entityContext.push(`People: ${entities.people.join(', ')}`);
    }
    
    if (entities.places && entities.places.length > 0) {
      entityContext.push(`Places: ${entities.places.join(', ')}`);
    }
    
    if (entities.activities && entities.activities.length > 0) {
      entityContext.push(`Activities: ${entities.activities.join(', ')}`);
    }
    
    // Combine original text with entity context
    if (entityContext.length > 0) {
      processedText = `${text} [Context: ${entityContext.join('; ')}]`;
    }
    
    return processedText;
  }

  async generateEmbedding(text, languages = [], entities = {}) {
    try {
      if (!this.embedder) {
        throw new Error('Embedder not initialized');
      }
      
      // Preprocess text with entity context
      const processedText = this.preprocessTextForEmbedding(text, languages, entities);
      
      // Generate embedding
      const output = await this.embedder(processedText, { pooling: 'mean', normalize: true });
      
      // Convert to array and ensure correct dimensions
      const embedding = Array.from(output.data);
      
      if (embedding.length !== this.dimension) {
        throw new Error(`Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`);
      }
      
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  async indexMessage(messageData) {
    const { 
      id, content, searchableText, senderName, senderNumber, timestamp, chatId, 
      urls = [], entities = {}, schedulingInfo = {}, languages = [], isFromMe = false 
    } = messageData;
    
    try {
      // Create enhanced searchable text for embedding
      const embeddingText = searchableText || content;
      
      // Generate embedding with entity context
      console.error(`🔄 Generating multilingual embedding for message from ${senderName}...`);
      const embedding = await this.generateEmbedding(embeddingText, languages, entities);
      
      if (!Array.isArray(embedding) || embedding.length !== this.dimension) {
        throw new Error(`Invalid embedding: expected array of length ${this.dimension}, got ${typeof embedding} of length ${embedding?.length}`);
      }
      
      // Check if message already exists
      const existingIndex = this.metadata.findIndex(meta => meta.messageId === id);
      
      if (existingIndex !== -1) {
        // Update existing message
        console.error(`🔄 Updating existing message from ${senderName}`);
        
        // Mark old vector as deleted
        this.metadata[existingIndex].deleted = true;
      }
      
      // Prepare enhanced metadata
      const metadata = {
        messageId: id,
        senderName,
        senderNumber,
        chatId,
        timestamp,
        content: content.substring(0, 1000), // Limit content size in metadata
        searchableText: searchableText?.substring(0, 1500) || '',
        languages: languages,
        hasUrls: urls.length > 0,
        urlCount: urls.length,
        hasScheduling: schedulingInfo.isScheduling || false,
        isFromMe: isFromMe,
        deleted: false,
        indexPosition: this.metadata.length,
        
        // Enhanced metadata for better search
        entities: {
          people: entities.people || [],
          places: entities.places || [],
          activities: entities.activities || [],
          times: entities.times || []
        },
        
        // Scheduling metadata
        scheduling: schedulingInfo.isScheduling ? {
          participants: schedulingInfo.participants || [],
          activities: schedulingInfo.activities || [],
          locations: schedulingInfo.locations || [],
          urgency: schedulingInfo.urgency || false
        } : null,
        
        // URL metadata
        urls: urls.map(u => ({
          url: u.url,
          domain: u.domain,
          purpose: u.purpose,
          contextBefore: u.contextBefore?.substring(0, 100),
          contextAfter: u.contextAfter?.substring(0, 100)
        }))
      };
      
      // Add to FAISS index
      console.error(`📊 Adding vector to FAISS index (dimension: ${embedding.length})...`);
      this.index.add(embedding);
      
      // Add metadata
      this.metadata.push(metadata);
      
      // Save periodically (every 10 messages)
      if (this.metadata.length % 10 === 0) {
        await this.saveIndex();
      }
      
      console.error(`✅ Indexed message from ${senderName} (total: ${this.metadata.length})`);
    } catch (error) {
      console.error('Error indexing message:', error);
      console.error('Message data:', { id, senderName, contentLength: content?.length });
      throw error;
    }
  }

  async searchSimilar(query, options = {}) {
    const {
      topK = 10,
      senderFilter = null,
      dateRange = null,
      includeUrls = null,
      schedulingFilter = null,
      entityFilter = null,
      threshold = 0.1,
      languages = []
    } = options;
    
    try {
      if (!this.isInitialized) {
        throw new Error('Vector store not initialized');
      }
      
      // Generate embedding for query with potential entity context
      const queryEmbedding = await this.generateEmbedding(query, languages, entityFilter || {});
      
      // Search in FAISS index
      const searchResults = this.index.search(queryEmbedding, Math.min(topK * 3, this.metadata.length));
      
      // Process results and apply filters
      const results = [];
      
      for (let i = 0; i < searchResults.labels.length && results.length < topK; i++) {
        const idx = searchResults.labels[i];
        const score = searchResults.distances[i];
        
        if (idx >= 0 && idx < this.metadata.length && score >= threshold) {
          const metadata = this.metadata[idx];
          
          // Skip deleted messages
          if (metadata.deleted) continue;
          
          // Apply filters
          if (senderFilter && !metadata.senderName.toLowerCase().includes(senderFilter.toLowerCase())) {
            continue;
          }
          
          if (dateRange && (metadata.timestamp < dateRange.start || metadata.timestamp > dateRange.end)) {
            continue;
          }
          
          if (includeUrls !== null && metadata.hasUrls !== includeUrls) {
            continue;
          }
          
          if (schedulingFilter && !metadata.hasScheduling) {
            continue;
          }
          
          // Entity-based filtering
          if (entityFilter) {
            let entityMatch = false;
            
            if (entityFilter.people && entityFilter.people.length > 0) {
              entityMatch = entityFilter.people.some(person => 
                metadata.entities.people.some(p => p.toLowerCase().includes(person.toLowerCase()))
              );
            }
            
            if (entityFilter.places && entityFilter.places.length > 0) {
              entityMatch = entityMatch || entityFilter.places.some(place => 
                metadata.entities.places.some(p => p.toLowerCase().includes(place.toLowerCase()))
              );
            }
            
            if (entityFilter.activities && entityFilter.activities.length > 0) {
              entityMatch = entityMatch || entityFilter.activities.some(activity => 
                metadata.entities.activities.some(a => a.toLowerCase().includes(activity.toLowerCase()))
              );
            }
            
            if (!entityMatch && (entityFilter.people || entityFilter.places || entityFilter.activities)) {
              continue;
            }
          }
          
          results.push({
            id: metadata.messageId,
            score: score,
            ...metadata,
          });
        }
      }
      
      // Sort by score (higher is better for cosine similarity)
      results.sort((a, b) => b.score - a.score);
      
      return results;
    } catch (error) {
      console.error('Error searching vectors:', error);
      throw error;
    }
  }

  async searchByEntity(entityType, entityValue, options = {}) {
    const { topK = 10, threshold = 0.0 } = options;
    
    try {
      // Create entity-focused query
      const entityQuery = `${entityType}: ${entityValue}`;
      const entityFilter = { [entityType]: [entityValue] };
      
      return await this.searchSimilar(entityQuery, {
        topK,
        threshold,
        entityFilter
      });
    } catch (error) {
      console.error('Error searching by entity:', error);
      throw error;
    }
  }

  async searchScheduling(query, options = {}) {
    const { topK = 10, timeRange, participants, activities } = options;
    
    try {
      const schedulingQuery = `scheduling: ${query}`;
      const entityFilter = {};
      
      if (participants) {
        entityFilter.people = Array.isArray(participants) ? participants : [participants];
      }
      
      if (activities) {
        entityFilter.activities = Array.isArray(activities) ? activities : [activities];
      }
      
      return await this.searchSimilar(schedulingQuery, {
        topK,
        schedulingFilter: true,
        dateRange: timeRange,
        entityFilter: Object.keys(entityFilter).length > 0 ? entityFilter : null
      });
    } catch (error) {
      console.error('Error searching scheduling:', error);
      throw error;
    }
  }

  async deleteMessage(messageId) {
    try {
      const index = this.metadata.findIndex(meta => meta.messageId === messageId);
      if (index !== -1) {
        // Mark as deleted (FAISS doesn't support direct removal)
        this.metadata[index].deleted = true;
        await this.saveIndex();
        console.error(`🗑️ Marked message ${messageId} as deleted`);
      }
    } catch (error) {
      console.error('Error deleting message from vector store:', error);
      throw error;
    }
  }

  async cleanup() {
    // Periodically rebuild index to remove deleted items
    const activeMetadata = this.metadata.filter(meta => !meta.deleted);
    
    if (activeMetadata.length < this.metadata.length * 0.8) {
      console.error('🧹 Rebuilding index to remove deleted items...');
      
      // Create new index
      const newIndex = new IndexFlatIP(this.dimension);
      const newMetadata = [];
      
      // Re-add active vectors
      for (const meta of activeMetadata) {
        if (!meta.deleted) {
          // Re-generate embedding and add to new index
          const searchableText = meta.searchableText || meta.content;
          const embedding = await this.generateEmbedding(
            searchableText, 
            meta.languages, 
            meta.entities
          );
          
          newIndex.add(embedding);
          meta.indexPosition = newMetadata.length;
          newMetadata.push(meta);
        }
      }
      
      // Replace old index
      this.index = newIndex;
      this.metadata = newMetadata;
      
      await this.saveIndex();
      console.error(`✅ Index rebuilt: ${newMetadata.length} active vectors`);
    }
  }

  async getStats() {
    const activeCount = this.metadata.filter(meta => !meta.deleted).length;
    const deletedCount = this.metadata.filter(meta => meta.deleted).length;
    const schedulingCount = this.metadata.filter(meta => !meta.deleted && meta.hasScheduling).length;
    const urlCount = this.metadata.filter(meta => !meta.deleted && meta.hasUrls).length;
    
    const languageStats = {};
    this.metadata.filter(meta => !meta.deleted).forEach(meta => {
      if (meta.languages) {
        meta.languages.forEach(lang => {
          languageStats[lang] = (languageStats[lang] || 0) + 1;
        });
      }
    });
    
    return {
      totalVectors: this.metadata.length,
      activeVectors: activeCount,
      deletedVectors: deletedCount,
      schedulingMessages: schedulingCount,
      messagesWithUrls: urlCount,
      languageDistribution: languageStats,
      indexSize: this.index ? this.index.ntotal() : 0,
      modelName: this.modelName,
      dimension: this.dimension
    };
  }
}

export default EnhancedVectorStore;
