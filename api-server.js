#!/usr/bin/env node

// Parse CLI arguments for help
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📚 Source-to-KB REST API Server

Usage:
  src-to-kb-api [options]
  node api-server.js [options]

Options:
  --help, -h          Show this help message
  --port, -p          Server port (default: 3000)
  --api-key           Set API key for authentication
  --version, -v       Show version

Environment Variables:
  PORT                Server port (default: 3000)
  API_KEY             API key for authentication (optional)
  OPENAI_API_KEY      OpenAI API key for AI-powered search

Examples:
  # Start with defaults
  src-to-kb-api

  # Start with custom port
  PORT=8080 src-to-kb-api

  # Start with API key authentication
  API_KEY=secret-key src-to-kb-api

  # Start with all options
  PORT=8080 API_KEY=secret OPENAI_API_KEY=sk-... src-to-kb-api

API Documentation:
  Once started, visit http://localhost:3000/api/v1/docs for Swagger UI

For more information, see API_DOCUMENTATION.md
  `);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const package = require('./package.json');
  console.log(`v${package.version}`);
  process.exit(0);
}

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

// Import core functionality
const { KnowledgeBaseGenerator } = require('./kb-generator');
const { AnswerModeManager, ANSWER_MODES } = require('./modes');

// We'll load the search module dynamically to avoid circular dependencies
let KnowledgeBaseSearch;
try {
  // Try to load the search module
  const searchModule = require('./search');
  KnowledgeBaseSearch = searchModule.KnowledgeBaseSearch || searchModule;
} catch (e) {
  // Fallback to a mock if not available
  KnowledgeBaseSearch = class {
    constructor() { this.documents = new Map(); this.chunks = new Map(); }
    search() { return []; }
    generateAnswer() { return { answer: 'Search module not available', confidence: 0 }; }
    generateAnswerWithAI() { return this.generateAnswer(); }
    getStatistics() { return { totalDocuments: 0, totalChunks: 0 }; }
    findSimilarFiles() { return []; }
  };
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null;

// Storage for active knowledge bases
const knowledgeBases = new Map();
const activeGenerations = new Map();

// Multer setup for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max
  }
});

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Source-to-KB API',
      version: '1.0.0',
      description: 'REST API for converting source code repositories into searchable knowledge bases',
      contact: {
        name: 'API Support',
        url: 'https://github.com/vezlo/src-to-kb',
        email: 'support@example.com'
      },
      license: {
        name: 'AGPL-3.0',
        url: 'https://www.gnu.org/licenses/agpl-3.0.html'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}/api/v1`,
        description: 'Development server'
      },
      {
        url: 'https://api.src-to-kb.com/v1',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      schemas: {
        KnowledgeBase: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            path: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            stats: {
              type: 'object',
              properties: {
                filesProcessed: { type: 'integer' },
                totalSize: { type: 'integer' },
                totalChunks: { type: 'integer' },
                languages: { type: 'object' }
              }
            }
          }
        },
        SearchResult: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            confidence: { type: 'number' },
            totalMatches: { type: 'integer' },
            mode: { type: 'string' },
            topFiles: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        Mode: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'integer' }
          }
        }
      }
    }
  },
  apis: ['./api-server.js', './api-routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// API Key authentication middleware
const authenticateAPIKey = (req, res, next) => {
  if (!API_KEY) {
    return next(); // No authentication required if API_KEY not set
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }

  next();
};

// Apply authentication to all API routes except docs
app.use('/api/v1', (req, res, next) => {
  if (req.path === '/docs' || req.path.startsWith('/docs/')) {
    return next();
  }
  authenticateAPIKey(req, res, next);
});

// Swagger UI
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /knowledge-bases:
 *   get:
 *     summary: List all knowledge bases
 *     tags: [Knowledge Bases]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of knowledge bases
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/KnowledgeBase'
 */
app.get('/api/v1/knowledge-bases', (req, res) => {
  const kbs = Array.from(knowledgeBases.entries()).map(([id, kb]) => ({
    id,
    name: kb.name,
    path: kb.path,
    createdAt: kb.createdAt,
    stats: kb.stats
  }));

  res.json(kbs);
});

/**
 * @swagger
 * /knowledge-bases:
 *   post:
 *     summary: Create a new knowledge base
 *     tags: [Knowledge Bases]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - sourcePath
 *             properties:
 *               name:
 *                 type: string
 *               sourcePath:
 *                 type: string
 *               options:
 *                 type: object
 *                 properties:
 *                   chunkSize:
 *                     type: integer
 *                   chunkOverlap:
 *                     type: integer
 *                   generateEmbeddings:
 *                     type: boolean
 *                   excludePaths:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       202:
 *         description: Knowledge base generation started
 *       400:
 *         description: Invalid input
 */
app.post('/api/v1/knowledge-bases', async (req, res) => {
  const { name, sourcePath, options = {} } = req.body;

  if (!name || !sourcePath) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Name and sourcePath are required'
    });
  }

  if (!fs.existsSync(sourcePath)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Source path does not exist'
    });
  }

  const kbId = crypto.randomBytes(16).toString('hex');
  const outputPath = path.join('./knowledge-bases', kbId);

  // Start generation in background
  const generator = new KnowledgeBaseGenerator({
    ...options,
    outputPath
  });

  activeGenerations.set(kbId, {
    status: 'processing',
    progress: 0,
    startedAt: new Date().toISOString()
  });

  generator.processRepository(sourcePath)
    .then(result => {
      knowledgeBases.set(kbId, {
        name,
        path: outputPath,
        sourcePath,
        createdAt: new Date().toISOString(),
        stats: result.stats,
        generator,
        documents: result.documents
      });

      activeGenerations.set(kbId, {
        status: 'completed',
        progress: 100,
        completedAt: new Date().toISOString()
      });
    })
    .catch(error => {
      activeGenerations.set(kbId, {
        status: 'failed',
        error: error.message,
        failedAt: new Date().toISOString()
      });
    });

  res.status(202).json({
    id: kbId,
    message: 'Knowledge base generation started',
    statusUrl: `/api/v1/knowledge-bases/${kbId}/status`
  });
});

/**
 * @swagger
 * /knowledge-bases/{id}:
 *   get:
 *     summary: Get knowledge base details
 *     tags: [Knowledge Bases]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Knowledge base details
 *       404:
 *         description: Knowledge base not found
 */
app.get('/api/v1/knowledge-bases/:id', (req, res) => {
  const { id } = req.params;
  const kb = knowledgeBases.get(id);

  if (!kb) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Knowledge base not found'
    });
  }

  res.json({
    id,
    name: kb.name,
    path: kb.path,
    sourcePath: kb.sourcePath,
    createdAt: kb.createdAt,
    stats: kb.stats
  });
});

/**
 * @swagger
 * /knowledge-bases/{id}/status:
 *   get:
 *     summary: Get generation status
 *     tags: [Knowledge Bases]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Generation status
 */
app.get('/api/v1/knowledge-bases/:id/status', (req, res) => {
  const { id } = req.params;
  const status = activeGenerations.get(id);

  if (!status) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Generation status not found'
    });
  }

  res.json(status);
});

/**
 * @swagger
 * /knowledge-bases/{id}:
 *   delete:
 *     summary: Delete a knowledge base
 *     tags: [Knowledge Bases]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Knowledge base deleted
 *       404:
 *         description: Knowledge base not found
 */
app.delete('/api/v1/knowledge-bases/:id', (req, res) => {
  const { id } = req.params;

  if (!knowledgeBases.has(id)) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Knowledge base not found'
    });
  }

  // Clean up files
  const kb = knowledgeBases.get(id);
  if (fs.existsSync(kb.path)) {
    fs.rmSync(kb.path, { recursive: true, force: true });
  }

  knowledgeBases.delete(id);
  activeGenerations.delete(id);

  res.status(204).send();
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Search across knowledge bases
 *     tags: [Search]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - knowledgeBaseId
 *             properties:
 *               query:
 *                 type: string
 *               knowledgeBaseId:
 *                 type: string
 *               mode:
 *                 type: string
 *                 enum: [enduser, developer, copilot]
 *               limit:
 *                 type: integer
 *               useAI:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchResult'
 */
app.post('/api/v1/search', async (req, res) => {
  const { query, knowledgeBaseId, mode = 'developer', limit = 10, useAI = true } = req.body;

  if (!query || !knowledgeBaseId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Query and knowledgeBaseId are required'
    });
  }

  const kb = knowledgeBases.get(knowledgeBaseId);
  if (!kb) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Knowledge base not found'
    });
  }

  try {
    // Create searcher instance
    const searcher = new KnowledgeBaseSearch(kb.path, mode);

    // Perform search
    const results = searcher.search(query, { limit });

    // Generate answer
    let answer;
    if (useAI && process.env.OPENAI_API_KEY) {
      answer = await searcher.generateAnswerWithAI(query, results);
    } else {
      answer = searcher.generateAnswer(query, results);
    }

    res.json(answer);
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /modes:
 *   get:
 *     summary: List available answer modes
 *     tags: [Modes]
 *     responses:
 *       200:
 *         description: List of available modes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Mode'
 */
app.get('/api/v1/modes', (req, res) => {
  const modes = Object.keys(ANSWER_MODES).map(key => ({
    key,
    name: ANSWER_MODES[key].name,
    description: ANSWER_MODES[key].description
  }));

  res.json(modes);
});

/**
 * @swagger
 * /modes/{mode}:
 *   get:
 *     summary: Get details for a specific mode
 *     tags: [Modes]
 *     parameters:
 *       - in: path
 *         name: mode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mode details
 *       404:
 *         description: Mode not found
 */
app.get('/api/v1/modes/:mode', (req, res) => {
  const { mode } = req.params;

  if (!ANSWER_MODES[mode]) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Mode not found'
    });
  }

  res.json({
    key: mode,
    ...ANSWER_MODES[mode]
  });
});

/**
 * @swagger
 * /statistics/{knowledgeBaseId}:
 *   get:
 *     summary: Get knowledge base statistics
 *     tags: [Statistics]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgeBaseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Statistics
 */
app.get('/api/v1/statistics/:knowledgeBaseId', (req, res) => {
  const { knowledgeBaseId } = req.params;
  const kb = knowledgeBases.get(knowledgeBaseId);

  if (!kb) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Knowledge base not found'
    });
  }

  const searcher = new KnowledgeBaseSearch(kb.path);
  const stats = searcher.getStatistics();

  res.json(stats);
});

/**
 * @swagger
 * /process-file:
 *   post:
 *     summary: Process a single file
 *     tags: [Processing]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               chunkSize:
 *                 type: integer
 *               chunkOverlap:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Processed file data
 */
app.post('/api/v1/process-file', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'File is required'
    });
  }

  try {
    const { chunkSize = 1000, chunkOverlap = 200 } = req.body;

    const generator = new KnowledgeBaseGenerator({
      chunkSize: parseInt(chunkSize),
      chunkOverlap: parseInt(chunkOverlap)
    });

    // Read file content
    const content = fs.readFileSync(req.file.path, 'utf-8');

    // Clean content
    const cleanedContent = generator.cleanContent(content, 'code');

    // Create chunks
    const documentId = generator.generateId();
    const chunks = generator.createChunks(cleanedContent, documentId);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      originalName: req.file.originalname,
      size: req.file.size,
      chunks: chunks.length,
      content: cleanedContent.substring(0, 500) + '...',
      chunksData: chunks
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /similar-files:
 *   post:
 *     summary: Find similar files in a knowledge base
 *     tags: [Search]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - knowledgeBaseId
 *               - filePath
 *             properties:
 *               knowledgeBaseId:
 *                 type: string
 *               filePath:
 *                 type: string
 *     responses:
 *       200:
 *         description: Similar files
 */
app.post('/api/v1/similar-files', (req, res) => {
  const { knowledgeBaseId, filePath } = req.body;

  if (!knowledgeBaseId || !filePath) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'KnowledgeBaseId and filePath are required'
    });
  }

  const kb = knowledgeBases.get(knowledgeBaseId);
  if (!kb) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Knowledge base not found'
    });
  }

  const searcher = new KnowledgeBaseSearch(kb.path);
  const similar = searcher.findSimilarFiles(filePath);

  res.json(similar);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Endpoint not found'
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Source-to-KB API Server`);
  console.log(`================================`);
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api/v1/docs`);
  console.log(`🔑 API Key: ${API_KEY ? 'Required' : 'Not required'}`);
  console.log(`================================\n`);

  if (API_KEY) {
    console.log('ℹ️  API Key authentication is enabled');
    console.log('   Include X-API-Key header in your requests\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;