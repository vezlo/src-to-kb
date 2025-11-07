# Source-to-KB REST API Documentation

## Overview

The Source-to-KB REST API provides programmatic access to all functionality for converting source code repositories into searchable knowledge bases. The API supports authentication, rate limiting, and provides comprehensive Swagger documentation.

## Quick Start

### Starting the API Server

```bash
# Using npm package (if installed globally)
src-to-kb-api

# Or using npx
npx @vezlo/src-to-kb src-to-kb-api

# Or directly with node
node api-server.js

# With environment variables
PORT=8080 API_KEY=your-secret-key node api-server.js
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `API_KEY` - Optional API key for authentication
- `OPENAI_API_KEY` - OpenAI API key for AI-powered search

### API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:3000/api/v1/docs`
- Health Check: `http://localhost:3000/health`

## Authentication

If `API_KEY` environment variable is set, include it in all requests:

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:3000/api/v1/knowledge-bases
```

## Core Endpoints

### Knowledge Base Management

#### Create Knowledge Base
```http
POST /api/v1/knowledge-bases
Content-Type: application/json

{
  "name": "My Project KB",
  "sourcePath": "/path/to/project",
  "options": {
    "chunkSize": 1500,
    "chunkOverlap": 300,
    "generateEmbeddings": true,
    "excludePaths": ["node_modules", "dist"]
  }
}
```

**Response:**
```json
{
  "id": "abc123",
  "message": "Knowledge base generation started",
  "statusUrl": "/api/v1/knowledge-bases/abc123/status"
}
```

#### List Knowledge Bases
```http
GET /api/v1/knowledge-bases
```

#### Get Knowledge Base Details
```http
GET /api/v1/knowledge-bases/{id}
```

#### Check Generation Status
```http
GET /api/v1/knowledge-bases/{id}/status
```

**Response:**
```json
{
  "status": "processing|completed|failed",
  "progress": 75,
  "startedAt": "2024-01-01T00:00:00Z",
  "completedAt": "2024-01-01T00:05:00Z"
}
```

#### Delete Knowledge Base
```http
DELETE /api/v1/knowledge-bases/{id}
```

### Search Operations

#### Search Knowledge Base
```http
POST /api/v1/search
Content-Type: application/json

{
  "query": "authentication implementation",
  "knowledgeBaseId": "abc123",
  "mode": "developer",
  "limit": 10,
  "useAI": true
}
```

**Response:**
```json
{
  "answer": "The authentication is implemented using JWT tokens...",
  "confidence": 0.85,
  "totalMatches": 15,
  "mode": "developer",
  "topFiles": [
    "src/auth/login.js",
    "src/middleware/auth.js"
  ]
}
```

#### Find Similar Files
```http
POST /api/v1/similar-files
Content-Type: application/json

{
  "knowledgeBaseId": "abc123",
  "filePath": "src/auth/login.js"
}
```

### Answer Modes

#### List Available Modes
```http
GET /api/v1/modes
```

**Response:**
```json
[
  {
    "key": "enduser",
    "name": "End User",
    "description": "Simplified answers for non-technical users"
  },
  {
    "key": "developer",
    "name": "Developer",
    "description": "Technical details with architecture information"
  },
  {
    "key": "copilot",
    "name": "Copilot",
    "description": "Code-focused answers with examples"
  }
]
```

#### Get Mode Details
```http
GET /api/v1/modes/{mode}
```

### File Processing

#### Process Single File
```http
POST /api/v1/process-file
Content-Type: multipart/form-data

file: <binary>
chunkSize: 1000
chunkOverlap: 200
```

**Response:**
```json
{
  "originalName": "app.js",
  "size": 2048,
  "chunks": 3,
  "content": "// First 500 chars...",
  "chunksData": [...]
}
```

### Statistics

#### Get Knowledge Base Statistics
```http
GET /api/v1/statistics/{knowledgeBaseId}
```

**Response:**
```json
{
  "totalDocuments": 150,
  "totalChunks": 1500,
  "totalSize": 5242880,
  "languages": {
    "JavaScript": 80,
    "TypeScript": 50,
    "Python": 20
  },
  "types": {
    "code": 120,
    "config": 20,
    "documentation": 10
  }
}
```

## Example Workflows

### Complete Knowledge Base Creation and Search

```javascript
const axios = require('axios');

const API_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'your-api-key';

// 1. Create knowledge base
async function createKnowledgeBase() {
  const response = await axios.post(
    `${API_URL}/knowledge-bases`,
    {
      name: 'My Project',
      sourcePath: '/path/to/project',
      options: {
        chunkSize: 1500,
        generateEmbeddings: true
      }
    },
    {
      headers: { 'X-API-Key': API_KEY }
    }
  );

  return response.data.id;
}

// 2. Wait for completion
async function waitForCompletion(kbId) {
  let status = 'processing';

  while (status === 'processing') {
    const response = await axios.get(
      `${API_URL}/knowledge-bases/${kbId}/status`
    );
    status = response.data.status;

    if (status === 'processing') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  return status === 'completed';
}

// 3. Search the knowledge base
async function search(kbId, query, mode = 'developer') {
  const response = await axios.post(
    `${API_URL}/search`,
    {
      query,
      knowledgeBaseId: kbId,
      mode,
      useAI: true
    },
    {
      headers: { 'X-API-Key': API_KEY }
    }
  );

  return response.data;
}

// Main workflow
async function main() {
  try {
    // Create KB
    const kbId = await createKnowledgeBase();
    console.log(`Knowledge base created: ${kbId}`);

    // Wait for it to complete
    const success = await waitForCompletion(kbId);
    if (!success) {
      throw new Error('Knowledge base generation failed');
    }

    // Search with different modes
    const endUserAnswer = await search(kbId, 'how to login?', 'enduser');
    console.log('End User Answer:', endUserAnswer.answer);

    const devAnswer = await search(kbId, 'authentication architecture', 'developer');
    console.log('Developer Answer:', devAnswer.answer);

    const codeAnswer = await search(kbId, 'login implementation', 'copilot');
    console.log('Code Examples:', codeAnswer.answer);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

### Python Example

```python
import requests
import time

API_URL = 'http://localhost:3000/api/v1'
API_KEY = 'your-api-key'

headers = {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
}

# Create knowledge base
response = requests.post(
    f'{API_URL}/knowledge-bases',
    json={
        'name': 'Python Project',
        'sourcePath': '/path/to/project',
        'options': {
            'chunkSize': 1500
        }
    },
    headers=headers
)

kb_id = response.json()['id']

# Wait for completion
while True:
    status_response = requests.get(
        f'{API_URL}/knowledge-bases/{kb_id}/status'
    )
    status = status_response.json()['status']

    if status != 'processing':
        break

    time.sleep(5)

# Search
search_response = requests.post(
    f'{API_URL}/search',
    json={
        'query': 'database connections',
        'knowledgeBaseId': kb_id,
        'mode': 'developer'
    },
    headers=headers
)

print(search_response.json()['answer'])
```

### cURL Examples

```bash
# Create knowledge base
curl -X POST http://localhost:3000/api/v1/knowledge-bases \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "sourcePath": "/path/to/project"
  }'

# Search
curl -X POST http://localhost:3000/api/v1/search \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how does authentication work?",
    "knowledgeBaseId": "abc123",
    "mode": "developer"
  }'

# Get statistics
curl -X GET http://localhost:3000/api/v1/statistics/abc123 \
  -H "X-API-Key: your-api-key"

# Process a file
curl -X POST http://localhost:3000/api/v1/process-file \
  -H "X-API-Key: your-api-key" \
  -F "file=@/path/to/file.js" \
  -F "chunkSize=1000"
```

## Rate Limiting

The API implements rate limiting:
- 100 requests per 15 minutes per IP address
- Returns 429 status code when limit exceeded

## Error Handling

All errors follow this format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "code": 400
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `202` - Accepted (async operation started)
- `204` - No Content (successful delete)
- `400` - Bad Request
- `401` - Unauthorized (invalid API key)
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

## WebSocket Support (Coming Soon)

Future versions will support WebSocket connections for:
- Real-time generation progress
- Live search results
- Streaming responses

## SDK Support

SDKs are planned for:
- JavaScript/TypeScript
- Python
- Go
- Java
- Ruby

## Security Best Practices

1. **Always use API keys in production**
   ```bash
   API_KEY=$(openssl rand -hex 32) node api-server.js
   ```

2. **Use HTTPS in production**
   - Deploy behind a reverse proxy (nginx, Apache)
   - Use SSL certificates (Let's Encrypt)

3. **Implement CORS restrictions**
   - Configure allowed origins
   - Restrict methods and headers

4. **Monitor and log API usage**
   - Track request patterns
   - Set up alerts for anomalies

5. **Regular security updates**
   ```bash
   npm audit
   npm update
   ```

## Performance Optimization

1. **Enable compression**
   - Already enabled via middleware
   - Reduces response size by ~70%

2. **Use caching**
   - Cache knowledge base metadata
   - Cache frequent search results

3. **Optimize chunk sizes**
   - Larger chunks = fewer requests
   - Smaller chunks = better search precision

4. **Database integration**
   - For production, consider PostgreSQL/MongoDB
   - Store embeddings in vector database

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "api-server.js"]
```

### PM2

```bash
pm2 start api-server.js --name src-to-kb-api
pm2 save
pm2 startup
```

### Systemd

```ini
[Unit]
Description=Source-to-KB API
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/path/to/src-to-kb
ExecStart=/usr/bin/node api-server.js
Restart=on-failure
Environment=PORT=3000
Environment=API_KEY=your-secret-key

[Install]
WantedBy=multi-user.target
```

## Support

- GitHub Issues: https://github.com/vezlo/src-to-kb/issues
- Documentation: https://github.com/vezlo/src-to-kb
- Email: support@example.com