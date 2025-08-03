import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import Database from './src/database.js';
import LocalVectorStore from './src/local-vector-store.js';
import MessageProcessor from './src/message-processor.js';

console.log('🔍 Starting debug WhatsApp listener...');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "whatsapp-indexer",
    dataPath: "./.wwebjs_auth"
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
    timeout: 60000,
  },
});

console.log('✅ WhatsApp client created');

const database = new Database();
const vectorStore = new LocalVectorStore();
const messageProcessor = new MessageProcessor();

console.log('✅ Components created');

try {
  console.log('🔄 Initializing database...');
  await database.initialize();
  console.log('✅ Database initialized');
  
  console.log('🔄 Initializing vector store...');
  await vectorStore.initialize();
  console.log('✅ Vector store initialized');
  
  console.log('🔄 Setting up WhatsApp client event handlers...');
  
  client.on('qr', (qr) => {
    console.log('📱 QR Code received - scan this with your WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
  });

  client.on('authenticated', () => {
    console.log('🔐 WhatsApp client authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp authentication failed:', msg);
  });

  client.on('disconnected', (reason) => {
    console.log('📱 WhatsApp client disconnected:', reason);
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`📱 Loading: ${percent}% - ${message}`);
  });

  console.log('✅ Event handlers set up');
  
  console.log('🔄 Initializing WhatsApp client...');
  console.log('⏳ This may take a moment and might show a QR code...');
  
  // Add timeout for client initialization
  const initTimeout = setTimeout(() => {
    console.log('❌ WhatsApp client initialization timed out after 2 minutes');
    process.exit(1);
  }, 120000); // 2 minutes
  
  await client.initialize();
  clearTimeout(initTimeout);
  
  console.log('✅ WhatsApp client initialized successfully!');
  console.log('🎉 Debug complete - the listener should work now');
  
} catch (error) {
  console.error('❌ Error during initialization:', error);
  process.exit(1);
}

// Keep the process running
console.log('🔄 Keeping process alive for testing...');
setTimeout(() => {
  console.log('✅ Test completed successfully');
  process.exit(0);
}, 10000); // Exit after 10 seconds if everything works
