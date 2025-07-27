import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  vectorStore: {
    path: process.env.VECTOR_STORE_PATH || './data/vector_store',
    modelName: process.env.MODEL_NAME || 'Xenova/all-MiniLM-L6-v2',
    dimension: 384, // Dimension for all-MiniLM-L6-v2
  },
  database: {
    path: process.env.DATABASE_PATH || './data/messages.db',
  },
  mcp: {
    port: process.env.MCP_SERVER_PORT || 3000,
  },
};

console.error('✅ Using local vector store configuration');
