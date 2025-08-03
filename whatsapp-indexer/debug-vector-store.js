import LocalVectorStore from './src/local-vector-store.js';

console.log('🔍 Testing vector store initialization...');

const vectorStore = new LocalVectorStore();

// Add timeout to detect hanging
const timeout = setTimeout(() => {
  console.log('❌ Vector store initialization timed out after 30 seconds');
  process.exit(1);
}, 30000);

try {
  await vectorStore.initialize();
  clearTimeout(timeout);
  console.log('✅ Vector store initialized successfully');
  
  // Test embedding generation
  console.log('🔍 Testing embedding generation...');
  const embedding = await vectorStore.generateEmbedding('test message');
  console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
  
} catch (error) {
  clearTimeout(timeout);
  console.error('❌ Error:', error);
}

process.exit(0);
