import LocalVectorStore from '../src/local-vector-store.js';
import { config } from '../src/config.js';

async function setupLocalStore() {
  console.log('🚀 Setting up local vector store...');
  
  try {
    const vectorStore = new LocalVectorStore();
    await vectorStore.initialize();
    
    const stats = await vectorStore.getStats();
    console.log('📊 Vector store stats:', stats);
    
    console.log('✅ Local vector store setup complete!');
    console.log(`📁 Vector store location: ${config.vectorStore.path}`);
    console.log(`🤖 Using model: ${config.vectorStore.modelName}`);
    console.log(`📐 Vector dimension: ${config.vectorStore.dimension}`);
    
  } catch (error) {
    console.error('❌ Error setting up local vector store:', error);
    process.exit(1);
  }
}

setupLocalStore();
