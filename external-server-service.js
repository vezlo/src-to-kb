#!/usr/bin/env node

const { EXTERNAL_SERVER_CONFIG, buildPayload, buildEmbeddingsPayload, validateConfig, isExternalServerEnabled } = require('./external-server-config');

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
    
    // Only show detailed logs for non-validation requests
    const isValidationRequest = document.title === '__validation_test__';
    if (!isValidationRequest) {
      console.log(`📤 Sending to external server: ${document.relativePath}`);
      console.log(`   Size: ${document.size} bytes`);
      console.log(`   Language: ${document.metadata.language}`);
      console.log(`   ⏳ Processing...`);
    }

    // Retry logic
    let lastError;
    for (let attempt = 1; attempt <= this.config.retry.attempts; attempt++) {
      try {
        const response = await this.makeRequest(payload);
        
        if (!isValidationRequest) {
          console.log(`   ✅ Sent successfully (${response.status} ${response.statusText})`);
        }
        
        return await response.json();
        
      } catch (error) {
        lastError = error;
        
        // Check for authentication errors - stop immediately, don't retry
        if (error.message.includes('401') || error.message.includes('403') || error.message.includes('Unauthorized')) {
          throw new Error(`External server authentication failed: ${error.message}`);
        }
        
        if (!isValidationRequest) {
          console.warn(`⚠️  Attempt ${attempt}/${this.config.retry.attempts} failed: ${error.message}`);
        }
        
        if (attempt < this.config.retry.attempts) {
          if (!isValidationRequest) {
            console.log(`   🔄 Retrying in ${this.config.retry.delay}ms...`);
          }
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
        // Provide clearer error messages for auth failures
        if (response.status === 401 || response.status === 403) {
          throw new Error(`HTTP ${response.status} Unauthorized: ${errorText || 'Invalid or missing API key'}`);
        }
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

  async sendEmbeddings(document, options = {}) {
    // Validate embeddings exist
    if (!document.chunks || document.chunks.length === 0) {
      throw new Error('Document must have chunks to send embeddings');
    }

    const hasEmbeddings = document.chunks.some(chunk => chunk.embedding);
    if (!hasEmbeddings) {
      throw new Error('Document chunks must have embeddings to send');
    }

    // Build embeddings payload
    const payload = buildEmbeddingsPayload(document, options);
    
    console.log(`📤 Sending embeddings to external server: ${document.relativePath}`);
    console.log(`   Chunks: ${document.chunks.length}`);
    console.log(`   ⏳ Processing...`);

    // Retry logic
    let lastError;
    for (let attempt = 1; attempt <= this.config.retry.attempts; attempt++) {
      try {
        const response = await this.makeRequest(payload);
        
        console.log(`   ✅ Sent successfully (${response.status} ${response.statusText})`);
        
        return await response.json();
        
      } catch (error) {
        lastError = error;
        
        // Check for authentication errors - stop immediately, don't retry
        if (error.message.includes('401') || error.message.includes('403') || error.message.includes('Unauthorized')) {
          throw new Error(`External server authentication failed: ${error.message}`);
        }
        
        console.warn(`⚠️  Attempt ${attempt}/${this.config.retry.attempts} failed: ${error.message}`);
        
        if (attempt < this.config.retry.attempts) {
          console.log(`   🔄 Retrying in ${this.config.retry.delay}ms...`);
          await this.sleep(this.config.retry.delay);
        }
      }
    }
    
    throw new Error(`External server failed after ${this.config.retry.attempts} attempts: ${lastError.message}`);
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

  /**
   * Validate external server availability and authentication
   * 1. Checks /health endpoint to verify server is running
   * 2. Tests /api/knowledge/search endpoint to verify auth
   * Throws error if server unavailable or auth fails
   */
  async validateServer() {
    const baseUrl = this.config.url;
    if (!baseUrl) {
      throw new Error('EXTERNAL_KB_URL is not configured');
    }

    // Extract base URL (remove /items, /search, /process, etc.)
    let healthUrl = baseUrl;
    if (healthUrl.endsWith('/items') || healthUrl.endsWith('/search') || healthUrl.endsWith('/process')) {
      // Remove the endpoint path to get base URL
      const urlObj = new URL(healthUrl);
      healthUrl = `${urlObj.protocol}//${urlObj.host}`;
    }
    // Ensure /health endpoint
    healthUrl = healthUrl.endsWith('/') ? healthUrl + 'health' : healthUrl + '/health';

    console.log('🔍 Validating external server...');
    
    // Step 1: Check server health
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      const healthResponse = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'src-to-kb/1.5.0'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!healthResponse.ok) {
        throw new Error(`Server health check failed: ${healthResponse.status} ${healthResponse.statusText}`);
      }
      console.log('   ✅ Server is available');
    } catch (error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new Error(`Server is not responding at ${baseUrl}\n   → Please check if the server is running\n   → Verify the EXTERNAL_KB_URL is correct`);
      }
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND') || error.message.includes('fetch failed')) {
        throw new Error(`Cannot connect to server at ${baseUrl}\n   → Please check if the server is running\n   → Verify the EXTERNAL_KB_URL path is correct\n   → Check network connectivity`);
      }
      throw new Error(`Server health check failed: ${error.message}\n   → Please verify the server is running at ${baseUrl}\n   → Check the EXTERNAL_KB_URL path is correct`);
    }

    // Step 2: Test authentication with search endpoint (only if search URL is configured)
    try {
      const searchUrl = this.config.searchUrl;
      if (!searchUrl) {
        console.log('   ⚠️  EXTERNAL_KB_SEARCH_URL not set (search functionality will not be available)');
        console.log('   ✅ External server validated for document upload\n');
        return; // Skip search validation if URL not provided
      }

      const headers = { ...this.config.headers };
      if (process.env.EXTERNAL_KB_API_KEY) {
        headers['x-api-key'] = process.env.EXTERNAL_KB_API_KEY;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      const testResponse = await fetch(searchUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ query: '__validation_test__' }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (testResponse.status === 401 || testResponse.status === 403) {
        throw new Error(`HTTP ${testResponse.status} Unauthorized: Invalid or missing API key`);
      }

      if (!testResponse.ok) {
        // For non-auth errors, we still consider validation passed (server is up and auth works)
        // The actual search might fail, but that's okay for validation
        console.log('   ✅ Authentication validated');
      } else {
        console.log('   ✅ Authentication validated');
      }
    } catch (error) {
      if (error.message.includes('401') || error.message.includes('403') || error.message.includes('Unauthorized')) {
        throw new Error(`External server authentication failed\n   → Please check your EXTERNAL_KB_API_KEY environment variable\n   → Verify the API key is valid and has proper permissions`);
      }
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new Error(`Server request timeout at ${baseUrl}\n   → Please check if the server is accessible\n   → Verify network connectivity`);
      }
      // For other errors, we still consider it a validation failure
      throw new Error(`External server validation failed: ${error.message}\n   → Please verify the server is running\n   → Check EXTERNAL_KB_URL and EXTERNAL_KB_API_KEY settings`);
    }

    console.log('✅ External server validated successfully\n');
  }
}

module.exports = { ExternalServerService };

