import { pipeline } from '@xenova/transformers';
import faiss from 'faiss-node';
import fs from 'fs-extra';
import path from 'path';
import { config } from './config.js';

const { IndexFlatIP } = faiss;

class LocalVectorStore {
  constructor() {
    this.embedder = null;
    this.index = null;
    this.metadata = [];
    this.isInitialized = false;
    this.vectorStorePath = config.vectorStore.path;
    this.indexPath = path.join(this.vectorStorePath, 'faiss.index');
    this.metadataPath = path.join(this.vectorStorePath, 'metadata.json');
  }

  async initialize() {
    try {
      console.error('🚀 Initializing local vector store...');
      
      // Ensure vector store directory exists
      await fs.ensureDir(this.vectorStorePath);
      
      // Initialize the embedding model
      console.error('📥 Loading embedding model (this may take a moment on first run)...');
      this.embedder = await pipeline('feature-extraction', config.vectorStore.modelName, {
        quantized: false,
      });
      
      // Load or create FAISS index
      await this.loadOrCreateIndex();
      
      this.isInitialized = true;
      console.error('✅ Local vector store initialized successfully');
      console.error(`📊 Index contains ${this.metadata.length} vectors`);
      
    } catch (error) {
      console.error('❌ Failed to initialize local vector store:', error);
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
        this.index = new IndexFlatIP(config.vectorStore.dimension);
        this.metadata = [];
        
        // Save empty index
        await this.saveIndex();
        
        console.error('✅ Created new empty vector index');
      }
    } catch (error) {
      console.error('Error loading/creating index:', error);
      
      // Fallback: create new index
      console.error('🔄 Creating fallback index...');
      this.index = new IndexFlatIP(config.vectorStore.dimension);
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

  async generateEmbedding(text) {
    try {
      if (!this.embedder) {
        throw new Error('Embedder not initialized');
      }
      
      // Generate embedding
      const output = await this.embedder(text, { pooling: 'mean', normalize: true });
      
      // Convert to array and ensure correct dimensions
      const embedding = Array.from(output.data);
      
      if (embedding.length !== config.vectorStore.dimension) {
        throw new Error(`Embedding dimension mismatch: expected ${config.vectorStore.dimension}, got ${embedding.length}`);
      }
      
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  async indexMessage(messageData) {
    const { 
      id, 
      content, 
      senderName, 
      senderNumber, 
      timestamp, 
      chatId, 
      chatName, 
      urls = [], 
      isFromMe = false,
      isGroupMessage = false 
    } = messageData;
    
    try {
      // Create searchable text combining message content and context
      const searchableText = `${content} from ${senderName}`;
      
      // Create descriptive display for logging
      const chatDisplay = isGroupMessage 
        ? `group "${chatName}"` 
        : `"${chatName}"`;
      const senderDisplay = isFromMe ? "Me" : senderName;
      
      // Generate embedding
      console.error(`🔄 Generating embedding for message in ${chatDisplay} from ${senderDisplay}...`);
      const embedding = await this.generateEmbedding(searchableText);
      
      if (!Array.isArray(embedding) || embedding.length !== config.vectorStore.dimension) {
        throw new Error(`Invalid embedding: expected array of length ${config.vectorStore.dimension}, got ${typeof embedding} of length ${embedding?.length}`);
      }
      
      // Check if message already exists
      const existingIndex = this.metadata.findIndex(meta => meta.messageId === id);
      
      if (existingIndex !== -1) {
        // Update existing message
        console.error(`🔄 Updating existing message in ${chatDisplay} from ${senderDisplay}`);
        
        // Remove old vector
        // Note: FAISS doesn't support direct removal, so we'll mark as deleted
        this.metadata[existingIndex].deleted = true;
      }
      
      // Prepare metadata
      const metadata = {
        messageId: id,
        senderName,
        senderNumber,
        chatId,
        chatName,
        timestamp,
        content: content.substring(0, 1000), // Limit content size in metadata
        hasUrls: urls.length > 0,
        urlCount: urls.length,
        isFromMe: isFromMe,
        isGroupMessage: isGroupMessage,
        deleted: false,
        indexPosition: this.metadata.length, // Track position in FAISS index
      };
      
      // Add URL information to metadata if present
      if (urls.length > 0) {
        metadata.urls = urls.map(u => u.url).join('|');
        metadata.domains = [...new Set(urls.map(u => u.domain))].join('|');
      }
      
      // Add to FAISS index - FAISS expects regular arrays
      console.error(`📊 Adding vector to FAISS index (dimension: ${embedding.length})...`);
      this.index.add(embedding); // Pass the embedding array directly
      
      // Add metadata
      this.metadata.push(metadata);
      
      // Save periodically (every 10 messages)
      if (this.metadata.length % 10 === 0) {
        await this.saveIndex();
      }
      
      console.error(`✅ Indexed message in ${chatDisplay} from ${senderDisplay} (total: ${this.metadata.length})`);
    } catch (error) {
      console.error('Error indexing message:', error);
      console.error('Message data:', { id, senderName, chatName, contentLength: content?.length });
      throw error;
    }
  }

  async searchSimilar(query, options = {}) {
    const {
      topK = 10,
      senderFilter = null,
      dateRange = null,
      includeUrls = null,
      threshold = 0.1, // Minimum similarity threshold
    } = options;
    
    try {
      if (!this.isInitialized) {
        throw new Error('Vector store not initialized');
      }
      
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Search in FAISS index - FAISS expects regular arrays
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
      const newIndex = new IndexFlatIP(config.vectorStore.dimension);
      const newMetadata = [];
      
      // Re-add active vectors
      for (const meta of activeMetadata) {
        if (!meta.deleted) {
          // Re-generate embedding and add to new index
          const searchableText = `${meta.content} from ${meta.senderName}`;
          const embedding = await this.generateEmbedding(searchableText);
          
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
    
    return {
      totalVectors: this.metadata.length,
      activeVectors: activeCount,
      deletedVectors: deletedCount,
      indexSize: this.index ? this.index.ntotal() : 0,
    };
  }
}

export default LocalVectorStore;
