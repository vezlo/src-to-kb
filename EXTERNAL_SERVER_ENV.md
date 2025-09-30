# External Server Integration Guide

This guide explains how to configure and use external server integration with src-to-kb.

## 🚀 Quick Demo

Try external server integration immediately with our production-ready assistant-server:

**Assistant Server**: [vezlo/assistant-server](https://github.com/vezlo/assistant-server) - Complete Node.js/TypeScript API server with vector search, Docker deployment, and database migrations.

```bash
# Using npm package (recommended)
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items src-to-kb ./your-repo

# Search using npm package
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=https://your-assistant-server.com/api/search src-to-kb-search search "authentication implementation"

# Using npx (no installation)
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items npx @vezlo/src-to-kb ./your-repo

# Local development (if cloned from GitHub)
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=https://your-assistant-server.com/api/search node kb-generator.js ./your-repo
```

## Usage Examples

### Installation Options

#### Option 1: NPM Package (Recommended)
```bash
# Install globally
npm install -g @vezlo/src-to-kb

# Generate KB with external server
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items src-to-kb ./my-repo

# Search with external server
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=http://localhost:3000/api/search src-to-kb-search search "authentication"
```

#### Option 2: NPX (No Installation)
```bash
# Generate KB with external server
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items npx @vezlo/src-to-kb ./my-repo

# Search with external server
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=http://localhost:3000/api/search npx @vezlo/src-to-kb-search search "authentication"
```

#### Option 3: Local Development
```bash
# Clone repository
git clone https://github.com/vezlo/src-to-kb.git
cd src-to-kb
npm install

# Generate KB with external server
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=http://localhost:3000/api/knowledge/items node kb-generator.js ./my-repo

# Search with external server
USE_EXTERNAL_KB=true EXTERNAL_KB_URL=http://localhost:3000/api/search node search.js search "authentication"
```

## Environment Variables

This document describes all environment variables for external server integration.

## Required Variables (when USE_EXTERNAL_KB=true)

### `USE_EXTERNAL_KB`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable external server mode
- **Example**: `USE_EXTERNAL_KB=true`

### `EXTERNAL_KB_URL`
- **Type**: String
- **Default**: `https://api.example.com/kb/process`
- **Description**: External server endpoint for processing documents
- **Example**: `EXTERNAL_KB_URL=https://your-api.com/kb/process`

## Optional Variables

### `EXTERNAL_KB_SEARCH_URL`
- **Type**: String
- **Default**: Auto-generated from `EXTERNAL_KB_URL`
- **Description**: External server endpoint for search
- **Example**: `EXTERNAL_KB_SEARCH_URL=https://your-api.com/kb/search`

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

### `EXTERNAL_KB_COMPANY_UUID`
- **Type**: Number
- **Default**: `1`
- **Description**: Company UUID for payload
- **Example**: `EXTERNAL_KB_COMPANY_UUID=123`

### `EXTERNAL_KB_CREATED_BY_UUID`
- **Type**: Number
- **Default**: `1`
- **Description**: Created by UUID for payload
- **Example**: `EXTERNAL_KB_CREATED_BY_UUID=456`

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
export USE_EXTERNAL_KB=true
export EXTERNAL_KB_URL=https://api.example.com/kb/process

# Run the tool
src-to-kb ./my-repo
```

### Advanced Configuration
```bash
export USE_EXTERNAL_KB=true
export EXTERNAL_KB_URL=https://api.example.com/kb/process
export EXTERNAL_KB_MAX_FILE_SIZE=5242880  # 5MB
export EXTERNAL_KB_TIMEOUT=60000          # 60 seconds
export EXTERNAL_KB_COMPANY_UUID=123
export EXTERNAL_KB_CREATED_BY_UUID=456
export EXTERNAL_KB_RETRY_ATTEMPTS=5

# Run the tool
src-to-kb ./my-repo
```

### Docker Environment
```bash
docker run -e USE_EXTERNAL_KB=true \
           -e EXTERNAL_KB_URL=https://api.example.com/kb/process \
           src-to-kb ./my-repo
```

## Payload Formats

### Document Processing Payload

When external server is enabled, documents are sent with this payload format:

```json
{
  "company_uuid": 1,
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
    "createdAt": "2024-01-01T00:00:00.000Z",
    "modifiedAt": "2024-01-01T00:00:00.000Z",
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "generateEmbeddings": false,
    "documentId": "doc_123",
    "processedAt": "2024-01-01T00:00:00.000Z"
  },
  "created_by_uuid": 1
}
```

### Search Payload

When searching, the external server receives this payload format:

```json
{
  "query": "tell me about required fields for createUserMessage function?",
  "company_uuid": 1
}
```

## Troubleshooting

### Common Issues

1. **"External server not enabled"**
   - Set `USE_EXTERNAL_KB=true`

2. **"EXTERNAL_KB_URL is required"**
   - Set `EXTERNAL_KB_URL=https://your-api.com/kb/process`

3. **"Request timeout"**
   - Increase `EXTERNAL_KB_TIMEOUT` value
   - Check network connectivity

4. **"File too large"**
   - Increase `EXTERNAL_KB_MAX_FILE_SIZE` value
   - Or implement file splitting (future feature)

### Debug Mode

Set `DEBUG=true` to see detailed request/response information:

```bash
export DEBUG=true
export USE_EXTERNAL_KB=true
export EXTERNAL_KB_URL=https://api.example.com/kb/process

src-to-kb ./my-repo
```

