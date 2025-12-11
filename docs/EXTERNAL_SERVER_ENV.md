# External Server Integration Guide

This guide explains how to configure and use external server integration with src-to-kb.

## 🚀 Quick Demo

Try external server integration immediately with our production-ready assistant-server:

**Assistant Server**: [vezlo/assistant-server](https://github.com/vezlo/assistant-server) - Complete Node.js/TypeScript API server with vector search, Docker deployment, and database migrations.

```bash
# Using npm package (recommended)
EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items src-to-kb ./your-repo

# With API key authentication
EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items EXTERNAL_KB_API_KEY=your-api-key src-to-kb ./your-repo

# Search using npm package
EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items \
EXTERNAL_KB_SEARCH_URL=https://your-assistant-server.com/api/search \
src-to-kb-search search "authentication implementation"

# Search with API key
EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items \
EXTERNAL_KB_SEARCH_URL=https://your-assistant-server.com/api/search \
EXTERNAL_KB_API_KEY=your-api-key \
src-to-kb-search search "authentication implementation"

# Using npx (no installation)
EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items npx @vezlo/src-to-kb ./your-repo

# Local development (if cloned from GitHub)
EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items node kb-generator.js ./your-repo
```

## Usage Examples

### Installation Options

#### Option 1: NPM Package (Recommended)
```bash
# Install globally
npm install -g @vezlo/src-to-kb

# Generate KB with external server (automatically enabled when URL is set)
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items src-to-kb ./my-repo

# With API key authentication
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items EXTERNAL_KB_API_KEY=your-api-key src-to-kb ./my-repo

# Search with external server
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items \
EXTERNAL_KB_SEARCH_URL=http://localhost:3000/api/search \
src-to-kb-search search "authentication"

# Search with API key
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items \
EXTERNAL_KB_SEARCH_URL=http://localhost:3000/api/search \
EXTERNAL_KB_API_KEY=your-api-key \
src-to-kb-search search "authentication"
```

#### Option 2: NPX (No Installation)
```bash
# Generate KB with external server
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items npx @vezlo/src-to-kb ./my-repo

# With API key
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items EXTERNAL_KB_API_KEY=your-api-key npx @vezlo/src-to-kb ./my-repo

# Search with external server
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items \
EXTERNAL_KB_SEARCH_URL=http://localhost:3000/api/search \
npx @vezlo/src-to-kb-search search "authentication"
```

#### Option 3: Local Development
```bash
# Clone repository
git clone https://github.com/vezlo/src-to-kb.git
cd src-to-kb
npm install

# Generate KB with external server
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items node kb-generator.js ./my-repo

# With API key
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items EXTERNAL_KB_API_KEY=your-api-key node kb-generator.js ./my-repo

# Search with external server
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items \
EXTERNAL_KB_SEARCH_URL=http://localhost:3000/api/search \
node search.js search "authentication"

# Upload existing local KB to external server
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items src-to-kb-upload --kb ./knowledge-base

# Upload chunks only
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items src-to-kb-upload --kb ./knowledge-base --chunks-only

# Upload chunks with embeddings
EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items src-to-kb-upload --kb ./knowledge-base --with-embeddings
```

## Environment Variables

This document describes all environment variables for external server integration.

## How External Server Mode Works

External server mode is **automatically enabled** when `EXTERNAL_KB_URL` is set. There is no separate enable flag. If the URL is not set, the tool falls back to local processing.

## Required Variables (when using external server)

### `EXTERNAL_KB_URL`
- **Type**: String
- **Default**: `undefined` (local mode)
- **Description**: External server endpoint for processing documents. When set, automatically enables external server mode
- **Example**: `EXTERNAL_KB_URL=https://your-api.com/api/knowledge/items`

### `EXTERNAL_KB_SEARCH_URL`
- **Type**: String
- **Default**: `undefined`
- **Description**: External server endpoint for search operations. **Required** when using external server for search commands
- **Example**: `EXTERNAL_KB_SEARCH_URL=https://your-api.com/api/search`
- **Note**: Must be set when using `src-to-kb-search` with external server enabled

## Optional Variables

### `EXTERNAL_KB_API_KEY`
- **Type**: String
- **Default**: `undefined`
- **Description**: API key for authenticating with the external server. When provided, this key is sent in the `x-api-key` header with all requests
- **Example**: `EXTERNAL_KB_API_KEY=your-secret-api-key-here`


### `EXTERNAL_KB_MAX_FILE_SIZE`
- **Type**: Number (bytes)
- **Default**: `2097152` (2MB)
- **Description**: Maximum file size to send to external server
- **Example**: `EXTERNAL_KB_MAX_FILE_SIZE=5242880` (5MB)

### `EXTERNAL_KB_TIMEOUT`
- **Type**: Number (milliseconds)
- **Default**: `30000` (30 seconds)
- **Description**: Request timeout for external server calls
- **Example**: `EXTERNAL_KB_TIMEOUT=60000` (60 seconds)

### `EXTERNAL_KB_DOCUMENT_TYPE`
- **Type**: String
- **Default**: `document`
- **Description**: Document type for payload
- **Example**: `EXTERNAL_KB_DOCUMENT_TYPE=code`

### `EXTERNAL_KB_RETRY_ATTEMPTS`
- **Type**: Number
- **Default**: `3`
- **Description**: Number of retry attempts for failed requests
- **Example**: `EXTERNAL_KB_RETRY_ATTEMPTS=5`

### `EXTERNAL_KB_RETRY_DELAY`
- **Type**: Number (milliseconds)
- **Default**: `1000` (1 second)
- **Description**: Delay between retry attempts
- **Example**: `EXTERNAL_KB_RETRY_DELAY=2000` (2 seconds)

## Usage Examples

### Basic External Server Setup
```bash
export EXTERNAL_KB_URL=https://api.example.com/kb/process

# Run the tool (external server automatically enabled)
src-to-kb ./my-repo
```

### With API Key Authentication
```bash
export EXTERNAL_KB_URL=https://api.example.com/kb/process
export EXTERNAL_KB_API_KEY=your-secret-api-key

# Run the tool
src-to-kb ./my-repo
```

### Advanced Configuration
```bash
export EXTERNAL_KB_URL=https://api.example.com/kb/process
export EXTERNAL_KB_API_KEY=your-api-key
export EXTERNAL_KB_MAX_FILE_SIZE=5242880  # 5MB
export EXTERNAL_KB_TIMEOUT=60000          # 60 seconds
export EXTERNAL_KB_RETRY_ATTEMPTS=5

# Run the tool
src-to-kb ./my-repo
```

### Docker Environment
```bash
docker run -e EXTERNAL_KB_URL=https://api.example.com/kb/process \
           -e EXTERNAL_KB_API_KEY=your-api-key \
           src-to-kb ./my-repo
```

## Payload Formats

### Document Processing Payload

When `EXTERNAL_KB_URL` is set, documents can be sent in three formats:

#### 1. Raw Content (Default)

```json
{
  "title": "src/components/Button.js",
  "type": "document",
  "content": "// File content here...",
  "metadata": {
    "relativePath": "src/components/Button.js",
    "fileName": "Button.js",
    "extension": ".js",
    "size": 2048,
    "checksum": "sha256-hash",
    "language": "JavaScript",
    "type": "code",
    "lines": 100,
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "documentId": "doc_123",
    "processedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 2. Chunks Only (`--chunks-only` flag)

```json
{
  "title": "src/components/Button.js",
  "type": "document",
  "chunks": [
    {
      "id": "doc_123_chunk_0",
      "index": 0,
      "content": "chunk content...",
      "startLine": 0,
      "endLine": 10,
      "size": 100
    }
  ],
  "hasEmbeddings": false,
  "metadata": {
    "relativePath": "src/components/Button.js",
    "fileName": "Button.js",
    "extension": ".js",
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "documentId": "doc_123",
    "processedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 3. Chunks with Embeddings (`--with-embeddings` flag)

```json
{
  "title": "src/components/Button.js",
  "type": "document",
  "chunks": [
    {
      "id": "doc_123_chunk_0",
      "index": 0,
      "content": "chunk content...",
      "embedding": [0.123, 0.456, ...],
      "startLine": 0,
      "endLine": 10,
      "size": 100
    }
  ],
  "hasEmbeddings": true,
  "metadata": {
    "relativePath": "src/components/Button.js",
    "fileName": "Button.js",
    "extension": ".js",
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "documentId": "doc_123",
    "processedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Note**: Company and user information are automatically detected from the `x-api-key` header when `EXTERNAL_KB_API_KEY` is provided. Embeddings use `text-embedding-3-large` model (3072 dimensions).

### Search Payload

When searching, the external server receives this payload format:

```json
{
  "query": "tell me about required fields for createUserMessage function?"
}
```

**Note**: Company information is automatically detected from the `x-api-key` header when `EXTERNAL_KB_API_KEY` is provided. No need to include `company_uuid` in the payload.

## Troubleshooting

### Common Issues

1. **"External server not enabled" or using local mode when expecting external**
   - Make sure `EXTERNAL_KB_URL` is set and not empty
   - Check that the URL is a valid format (starts with http:// or https://)
   - Example: `export EXTERNAL_KB_URL=https://your-api.com/kb/process`

2. **"Authentication failed" or "401 Unauthorized"**
   - If your server requires authentication, set `EXTERNAL_KB_API_KEY`
   - The API key is sent in the `x-api-key` header
   - Example: `export EXTERNAL_KB_API_KEY=your-secret-key`

3. **"Request timeout"**
   - Increase `EXTERNAL_KB_TIMEOUT` value (default is 30000ms / 30 seconds)
   - Check network connectivity to the external server
   - Verify the server URL is correct and accessible

4. **"File too large"**
   - Increase `EXTERNAL_KB_MAX_FILE_SIZE` value (default is 2MB)
   - Or split large files manually before processing

### Debug Mode

Set `DEBUG=true` to see detailed request/response information:

```bash
export DEBUG=true
export EXTERNAL_KB_URL=https://api.example.com/kb/process
export EXTERNAL_KB_API_KEY=your-api-key  # Optional, if required

src-to-kb ./my-repo
```

### API Key Header

When `EXTERNAL_KB_API_KEY` is provided, it is automatically included in the `x-api-key` header for all requests:
- Document processing requests (POST to `EXTERNAL_KB_URL`)
- Search requests (POST to search endpoint)
- Statistics requests (GET to stats endpoint)

