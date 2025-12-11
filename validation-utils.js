#!/usr/bin/env node

/**
 * Validation Utilities
 * Centralized validation functions for OpenAI API keys and external server connections
 */

/**
 * Validate OpenAI API key by making a test API call
 * @param {string} openaiApiKey - OpenAI API key to validate
 * @throws {Error} If key is missing, invalid, or API call fails
 */
async function validateOpenAIKey(openaiApiKey) {
  if (!openaiApiKey) {
    throw new Error('❌ OpenAI API key is required. Please set OPENAI_API_KEY environment variable or provide it via --openai-key');
  }

  // Test API key with a minimal request (this will catch all issues: missing, invalid format, invalid key)
  console.log('🔍 Validating OpenAI API key...');
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: ['test'] // Minimal test input
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('❌ Invalid OpenAI API key. Please check your OPENAI_API_KEY and ensure it is valid');
      } else if (response.status === 429) {
        throw new Error('❌ OpenAI API rate limit exceeded. Please try again later');
      } else {
        throw new Error(`❌ OpenAI API error (${response.status}): ${data.error?.message || 'Unknown error'}`);
      }
    }

    console.log('✅ OpenAI API key validated successfully\n');
  } catch (error) {
    if (error.message.startsWith('❌')) {
      throw error; // Re-throw our formatted errors
    }
    throw new Error(`❌ Failed to validate OpenAI API key: ${error.message}`);
  }
}

/**
 * Validate external server connection and authentication
 * Wrapper around ExternalServerService.validateServer() with consistent error handling
 * @param {ExternalServerService} externalServer - External server service instance
 * @param {Object} options - Validation options
 * @param {boolean} options.skipIfNotSet - Skip validation if external server is not configured (default: true)
 * @param {boolean} options.cacheResult - Cache validation result to avoid re-validation (default: false)
 * @returns {Promise<void>}
 * @throws {Error} If server is unavailable or authentication fails
 */
async function validateExternalServer(externalServer, options = {}) {
  const { skipIfNotSet = true, cacheResult = false } = options;

  if (!externalServer) {
    if (skipIfNotSet) {
      return; // No external server, skip validation
    }
    throw new Error('External server is not configured');
  }

  // Cache validation result if requested (for commands that might validate multiple times)
  if (cacheResult && externalServer._serverValidated) {
    return;
  }

  try {
    await externalServer.validateServer();
    if (cacheResult) {
      externalServer._serverValidated = true;
    }
  } catch (error) {
    // All validation errors should stop processing
    // Error message already contains detailed guidance, just re-throw
    throw error;
  }
}

module.exports = {
  validateOpenAIKey,
  validateExternalServer
};

