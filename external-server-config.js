// External Server Configuration
// This file contains configuration for external server integration

// Helper function to generate search URL from base URL
function generateSearchUrl(baseUrl) {
  if (process.env.EXTERNAL_KB_SEARCH_URL) {
    return process.env.EXTERNAL_KB_SEARCH_URL;
  }
  
  // If base URL already ends with /search, use it as is
  if (baseUrl.endsWith('/search')) {
    return baseUrl;
  }
  
  // If base URL ends with /process, replace with /search
  if (baseUrl.endsWith('/process')) {
    return baseUrl.replace('/process', '/search');
  }
  
  // If base URL ends with /items, replace with /search
  if (baseUrl.endsWith('/items')) {
    return baseUrl.replace('/items', '/search');
  }
  
  // Otherwise, append /search
  return baseUrl.endsWith('/') ? baseUrl + 'search' : baseUrl + '/search';
}

const baseUrl = process.env.EXTERNAL_KB_URL || 'https://api.example.com/kb/process';

const EXTERNAL_SERVER_CONFIG = {
  // Server endpoints
  url: baseUrl,
  searchUrl: generateSearchUrl(baseUrl),
  
  // Request configuration
  timeout: parseInt(process.env.EXTERNAL_KB_TIMEOUT) || 30000, // 30 seconds
  maxFileSize: parseInt(process.env.EXTERNAL_KB_MAX_FILE_SIZE) || 2 * 1024 * 1024, // 2MB
  
  // Payload configuration
  payload: {
    company_uuid: parseInt(process.env.EXTERNAL_KB_COMPANY_UUID) || 1,
    created_by_uuid: parseInt(process.env.EXTERNAL_KB_CREATED_BY_UUID) || 1,
    type: process.env.EXTERNAL_KB_DOCUMENT_TYPE || 'document'
  },
  
  // Headers configuration
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'src-to-kb/1.3.1'
  },
  
  // Retry configuration
  retry: {
    attempts: parseInt(process.env.EXTERNAL_KB_RETRY_ATTEMPTS) || 3,
    delay: parseInt(process.env.EXTERNAL_KB_RETRY_DELAY) || 1000 // 1 second
  }
};

// Helper function to build payload
function buildPayload(document, options = {}) {
  return {
    company_uuid: EXTERNAL_SERVER_CONFIG.payload.company_uuid,
    title: document.fileName || document.relativePath,
    type: EXTERNAL_SERVER_CONFIG.payload.type,
    content: document.content,
    metadata: {
      // File metadata
      relativePath: document.relativePath,
      fileName: document.fileName,
      extension: document.extension,
      size: document.size,
      checksum: document.checksum,
      
      // Processing metadata
      language: document.metadata.language,
      type: document.metadata.type,
      lines: document.metadata.lines,
      createdAt: document.metadata.createdAt,
      modifiedAt: document.metadata.modifiedAt,
      
      // Processing options
      chunkSize: options.chunkSize || 1000,
      chunkOverlap: options.chunkOverlap || 200,
      generateEmbeddings: options.generateEmbeddings || false,
      
      // Additional metadata
      documentId: document.id,
      processedAt: new Date().toISOString()
    },
    created_by_uuid: EXTERNAL_SERVER_CONFIG.payload.created_by_uuid
  };
}

// Helper function to validate configuration
function validateConfig() {
  const errors = [];
  
  if (!EXTERNAL_SERVER_CONFIG.url) {
    errors.push('EXTERNAL_KB_URL is required');
  }
  
  if (EXTERNAL_SERVER_CONFIG.maxFileSize <= 0) {
    errors.push('EXTERNAL_KB_MAX_FILE_SIZE must be greater than 0');
  }
  
  return errors;
}

module.exports = {
  EXTERNAL_SERVER_CONFIG,
  buildPayload,
  validateConfig
};

