#!/usr/bin/env node

const { EXTERNAL_SERVER_CONFIG, buildPayload, validateConfig, isExternalServerEnabled } = require('./external-server-config');

class ExternalServerService {
  constructor(config = {}) {
    // Merge with external config
    this.config = {
      ...EXTERNAL_SERVER_CONFIG,
      ...config
    };
    
    // Validate configuration
    const errors = validateConfig();
    if (errors.length > 0) {
      console.warn('⚠️  External server configuration issues:');
      errors.forEach(error => console.warn(`   - ${error}`));
    }
  }

  async sendDocument(document, options = {}) {
    // Check file size limit
    if (document.size > this.config.maxFileSize) {
      throw new Error(`File too large: ${document.size} bytes (max: ${this.config.maxFileSize} bytes)`);
    }

    // Build payload according to your specification
    const payload = buildPayload(document, options);
    
    console.log(`📤 Sending to external server: ${document.relativePath}`);
    console.log(`   Size: ${document.size} bytes`);
    console.log(`   Language: ${document.metadata.language}`);
    console.log(`   ⏳ Processing...`);

    // Retry logic
    let lastError;
    for (let attempt = 1; attempt <= this.config.retry.attempts; attempt++) {
      try {
        const response = await this.makeRequest(payload);
        
        console.log(`✅ External server processed: ${document.relativePath}`);
        console.log(`   Response: ${response.status} ${response.statusText}`);
        console.log(`   ────────────────────────────────────────────────`);
        
        return await response.json();
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Attempt ${attempt}/${this.config.retry.attempts} failed: ${error.message}`);
        
        if (attempt < this.config.retry.attempts) {
          console.log(`   🔄 Retrying in ${this.config.retry.delay}ms...`);
          await this.sleep(this.config.retry.delay);
        }
      }
    }
    
    throw new Error(`External server failed after ${this.config.retry.attempts} attempts: ${lastError.message}`);
  }

  async makeRequest(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    // Build headers with API key if provided
    const headers = { ...this.config.headers };
    if (process.env.EXTERNAL_KB_API_KEY) {
      headers['x-api-key'] = process.env.EXTERNAL_KB_API_KEY;
    }
    
    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }

  async sendBatch(documents, options = {}) {
    console.log(`📤 Sending batch of ${documents.length} documents to external server`);
    
    const promises = documents.map((doc, index) => {
      return this.sendDocument(doc, options).catch(error => {
        console.error(`❌ Failed to send document ${index + 1}/${documents.length}: ${doc.relativePath}`);
        console.error(`   Error: ${error.message}`);
        return { error: error.message, document: doc };
      });
    });
    
    const results = await Promise.all(promises);
    
    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);
    
    console.log(`✅ Batch completed: ${successful.length} successful, ${failed.length} failed`);
    
    return {
      successful,
      failed,
      total: documents.length
    };
  }

  async search(query, options = {}) {
    const searchPayload = {
      query: query
    };

    console.log(`🔍 Searching external server: "${query}"`);
    console.log(`   URL: ${this.config.searchUrl}`);
    console.log(`   Payload:`, JSON.stringify(searchPayload, null, 2));

    // Build headers with API key if provided
    const headers = { ...this.config.headers };
    if (process.env.EXTERNAL_KB_API_KEY) {
      headers['x-api-key'] = process.env.EXTERNAL_KB_API_KEY;
    }

    const response = await fetch(this.config.searchUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(searchPayload),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Search failed: HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  }

  async getStatistics() {
    const statsUrl = this.config.url.replace('/process', '/stats');
    
    // Build headers with API key if provided
    const headers = { ...this.config.headers };
    if (process.env.EXTERNAL_KB_API_KEY) {
      headers['x-api-key'] = process.env.EXTERNAL_KB_API_KEY;
    }
    
    const response = await fetch(statsUrl, {
      method: 'GET',
      headers: headers,
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Stats failed: HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  }

  // Utility method for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get configuration info (for debugging)
  getConfig() {
    return {
      url: this.config.url,
      searchUrl: this.config.searchUrl,
      maxFileSize: this.config.maxFileSize,
      timeout: this.config.timeout,
      payload: this.config.payload
    };
  }
}

module.exports = { ExternalServerService };

