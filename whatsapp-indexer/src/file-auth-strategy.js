import fs from 'fs-extra';
import path from 'path';

class FileAuthStrategy {
  constructor(options = {}) {
    this.dataPath = options.dataPath || './.wwebjs_auth';
    this.clientId = options.clientId || 'default';
    this.sessionPath = path.join(this.dataPath, `session-${this.clientId}.json`);
  }

  async beforeBrowserInitialized() {
    // Ensure directory exists
    await fs.ensureDir(this.dataPath);
  }

  async logout() {
    // Remove session file on logout
    if (await fs.pathExists(this.sessionPath)) {
      await fs.remove(this.sessionPath);
    }
  }

  async destroy() {
    // Clean up on destroy
    await this.logout();
  }

  async getAuthEventPayload() {
    // Try to load existing session
    if (await fs.pathExists(this.sessionPath)) {
      try {
        const sessionData = await fs.readJson(this.sessionPath);
        console.log('📂 Loading existing WhatsApp session...');
        return sessionData;
      } catch (error) {
        console.log('⚠️ Failed to load session, will create new one');
        return null;
      }
    }
    return null;
  }

  async saveAuthEventPayload(payload) {
    // Save session data
    try {
      await fs.writeJson(this.sessionPath, payload, { spaces: 2 });
      console.log('💾 WhatsApp session saved successfully');
    } catch (error) {
      console.error('❌ Failed to save session:', error);
    }
  }
}

export default FileAuthStrategy;
