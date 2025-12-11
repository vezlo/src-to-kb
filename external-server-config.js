// External Server Configuration
// This file contains configuration for external server integration

const baseUrl = process.env.EXTERNAL_KB_URL;
const searchUrl = process.env.EXTERNAL_KB_SEARCH_URL;

const EXTERNAL_SERVER_CONFIG = {
  // Server endpoints
  url: baseUrl,
  searchUrl: searchUrl || null,
  
  // Request configuration
  timeout: parseInt(process.env.EXTERNAL_KB_TIMEOUT) || 30000, // 30 seconds
  maxFileSize: parseInt(process.env.EXTERNAL_KB_MAX_FILE_SIZE) || 2 * 1024 * 1024, // 2MB
  
  // Payload configuration
  payload: {
    type: process.env.EXTERNAL_KB_DOCUMENT_TYPE || 'document'
  },
  
  // Headers configuration
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'src-to-kb/1.5.0'
  },
  
  // Retry configuration
  retry: {
    attempts: parseInt(process.env.EXTERNAL_KB_RETRY_ATTEMPTS) || 3,
    delay: parseInt(process.env.EXTERNAL_KB_RETRY_DELAY) || 1000 // 1 second
  }
};

// Helper function to build payload
function buildPayload(document, options = {}) {
  const payload = {
    title: document.title || document.fileName || document.relativePath,
    type: EXTERNAL_SERVER_CONFIG.payload.type,
    metadata: {
      // File metadata
      relativePath: document.relativePath,
      fileName: document.fileName,
      extension: document.extension,
      size: document.size,
      checksum: document.checksum,
      
      // Processing metadata
      language: document.metadata?.language,
      type: document.metadata?.type,
      lines: document.metadata?.lines,
      createdAt: document.metadata?.createdAt,
      modifiedAt: document.metadata?.modifiedAt,
      
      // Notion-specific metadata (if present)
      source: document.metadata?.source,
      notionPageId: document.metadata?.notionPageId,
      notionUrl: document.metadata?.notionUrl,
      lastEditedTime: document.metadata?.lastEditedTime,
      createdTime: document.metadata?.createdTime,
      
      // Processing options
      chunkSize: options.chunkSize || 1000,
      chunkOverlap: options.chunkOverlap || 200,
      generateEmbeddings: options.generateEmbeddings || false,
      sendEmbeddings: options.sendEmbeddings || false,
      
      // Additional metadata
      documentId: document.id,
      processedAt: new Date().toISOString()
    }
  };

  // If sending chunks (with or without embeddings)
  if (options.sendChunks && document.chunks && document.chunks.length > 0) {
    // Extract chunks (without embeddings for chunks-only mode)
    const chunks = document.chunks.map(chunk => ({
      id: chunk.id,
      index: chunk.index,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      size: chunk.size
      // Note: embeddings are NOT included here (only in buildEmbeddingsPayload)
    }));

    payload.chunks = chunks;
    payload.hasEmbeddings = false;
  } else {
    // Default: Send raw content
    payload.content = document.content;
  }

  return payload;
}

// Helper function to build embeddings payload
function buildEmbeddingsPayload(document, options = {}) {
  if (!document.chunks || document.chunks.length === 0) {
    throw new Error('Document must have chunks to send embeddings');
  }

  // Extract chunks with embeddings
  const chunks = document.chunks.map(chunk => ({
    id: chunk.id,
    index: chunk.index,
    content: chunk.content,
    embedding: chunk.embedding,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    size: chunk.size
  }));

  return {
    title: document.title || document.fileName || document.relativePath,
    type: EXTERNAL_SERVER_CONFIG.payload.type,
    chunks: chunks,
    hasEmbeddings: true,
    metadata: {
      // File metadata
      relativePath: document.relativePath,
      fileName: document.fileName,
      extension: document.extension,
      size: document.size,
      checksum: document.checksum,
      
      // Processing metadata
      language: document.metadata?.language,
      type: document.metadata?.type,
      lines: document.metadata?.lines,
      createdAt: document.metadata?.createdAt,
      modifiedAt: document.metadata?.modifiedAt,
      
      // Notion-specific metadata (if present)
      source: document.metadata?.source,
      notionPageId: document.metadata?.notionPageId,
      notionUrl: document.metadata?.notionUrl,
      lastEditedTime: document.metadata?.lastEditedTime,
      createdTime: document.metadata?.createdTime,
      
      // Processing options
      chunkSize: options.chunkSize || 1000,
      chunkOverlap: options.chunkOverlap || 200,
      generateEmbeddings: false, // Already generated
      sendEmbeddings: true,
      
      // Additional metadata
      documentId: document.id,
      processedAt: new Date().toISOString()
    }
  };
}

// Helper function to check if external server is enabled (URL is set)
function isExternalServerEnabled() {
  return !!process.env.EXTERNAL_KB_URL && process.env.EXTERNAL_KB_URL.trim() !== '';
}

// Helper function to validate configuration
function validateConfig() {
  const errors = [];
  
  // Only validate if external server is enabled (URL is set)
  if (isExternalServerEnabled()) {
    if (!EXTERNAL_SERVER_CONFIG.url || EXTERNAL_SERVER_CONFIG.url.trim() === '') {
      errors.push('EXTERNAL_KB_URL must be a valid URL when provided');
    }
    
    if (EXTERNAL_SERVER_CONFIG.maxFileSize <= 0) {
      errors.push('EXTERNAL_KB_MAX_FILE_SIZE must be greater than 0');
    }
  }
  
  return errors;
}

module.exports = {
  EXTERNAL_SERVER_CONFIG,
  buildPayload,
  buildEmbeddingsPayload,
  validateConfig,
  isExternalServerEnabled
};

