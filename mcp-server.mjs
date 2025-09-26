#!/usr/bin/env node

/**
 * MCP Server for Source-to-Knowledge Base Generator
 * Enables integration with Claude Code, Cursor, and other MCP-compatible tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup for CommonJS compatibility
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import our CommonJS modules
const { KnowledgeBaseGenerator } = require('./kb-generator.js');

// Import search module with modified approach
class KnowledgeBaseSearch {
  constructor(kbPath = './knowledge-base') {
    this.kbPath = kbPath;
    this.documents = new Map();
    this.chunks = new Map();
    this.loadKnowledgeBase();
  }

  loadKnowledgeBase() {
    const docsPath = path.join(this.kbPath, 'documents');
    if (fs.existsSync(docsPath)) {
      const files = fs.readdirSync(docsPath);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const content = fs.readFileSync(path.join(docsPath, file), 'utf-8');
          const doc = JSON.parse(content);
          this.documents.set(doc.id, doc);
        }
      });
    }

    const chunksPath = path.join(this.kbPath, 'chunks');
    if (fs.existsSync(chunksPath)) {
      const files = fs.readdirSync(chunksPath);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const content = fs.readFileSync(path.join(chunksPath, file), 'utf-8');
          const chunks = JSON.parse(content);
          const docId = file.replace('.json', '');
          this.chunks.set(docId, chunks);
        }
      });
    }
  }

  search(query, options = {}) {
    const results = [];
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/);

    this.chunks.forEach((docChunks, docId) => {
      const document = this.documents.get(docId);
      if (!document) return;

      docChunks.forEach(chunk => {
        let score = 0;
        let contextSnippets = [];

        keywords.forEach(keyword => {
          const content = chunk.content.toLowerCase();
          if (content.includes(keyword)) {
            const regex = new RegExp(keyword, 'gi');
            const count = (content.match(regex) || []).length;
            score += count;

            const index = content.indexOf(keyword);
            if (index !== -1) {
              const start = Math.max(0, index - 80);
              const end = Math.min(content.length, index + keyword.length + 80);
              const snippet = chunk.content.substring(start, end).trim();
              contextSnippets.push(snippet.replace(/\s+/g, ' '));
            }
          }
        });

        if (score > 0) {
          results.push({
            documentId: docId,
            documentPath: document.relativePath,
            documentLang: document.metadata?.language,
            score: score,
            lines: `${chunk.startLine}-${chunk.endLine}`,
            contextSnippets: contextSnippets,
            preview: chunk.content.substring(0, 200)
          });
        }
      });
    });

    results.sort((a, b) => b.score - a.score);
    const limit = options.limit || 10;
    return results.slice(0, limit);
  }

  generateAnswer(query, searchResults) {
    if (searchResults.length === 0) {
      return {
        answer: "I couldn't find any relevant information about that in the knowledge base.",
        confidence: 0
      };
    }

    const queryLower = query.toLowerCase();
    const isQuestion = queryLower.includes('?') ||
                      ['how', 'what', 'why', 'when', 'where', 'does', 'can', 'is']
                        .some(word => queryLower.startsWith(word));

    const languages = new Set();
    searchResults.forEach(result => {
      if (result.documentLang) {
        languages.add(result.documentLang);
      }
    });

    if (queryLower.includes('language') || queryLower.includes('support')) {
      const supportedLangs = Array.from(languages);
      if (supportedLangs.length > 0) {
        return {
          answer: `Yes! This system supports ${supportedLangs.length} languages: ${supportedLangs.join(', ')}`,
          confidence: 0.9,
          languages: supportedLangs
        };
      }
    }

    const topResult = searchResults[0];
    const relevantFiles = [...new Set(searchResults.slice(0, 5).map(r => r.documentPath))];
    const contexts = searchResults.slice(0, 3).map(r => r.contextSnippets).flat();

    let answer = isQuestion ? 'Based on the code analysis, ' : `Found ${searchResults.length} matches. `;
    if (contexts.length > 0) {
      answer += `Key context: "${contexts[0].substring(0, 150)}..."`;
    }
    answer += `\n\n📍 Found in: ${relevantFiles.slice(0, 3).join(', ')}`;

    return {
      answer: answer,
      confidence: Math.min(topResult.score / 50, 1),
      totalMatches: searchResults.length,
      topFiles: relevantFiles
    };
  }

  getStatistics() {
    let totalChunks = 0;
    let totalSize = 0;
    const languages = {};
    const types = {};

    this.documents.forEach(doc => {
      totalSize += doc.size || 0;
      const lang = doc.metadata?.language || 'Unknown';
      languages[lang] = (languages[lang] || 0) + 1;
      const type = doc.metadata?.type || 'Unknown';
      types[type] = (types[type] || 0) + 1;
    });

    this.chunks.forEach(chunks => {
      totalChunks += chunks.length;
    });

    return {
      totalDocuments: this.documents.size,
      totalChunks,
      totalSize,
      languages,
      types
    };
  }

  findSimilarFiles(filePath) {
    const results = [];
    this.documents.forEach(doc => {
      if (doc.relativePath === filePath) return;

      let similarity = 0;
      if (path.extname(doc.relativePath) === path.extname(filePath)) {
        similarity += 2;
      }

      const targetParts = filePath.split('/');
      const docParts = doc.relativePath.split('/');
      const commonParts = targetParts.filter(part => docParts.includes(part));
      similarity += commonParts.length * 0.5;

      if (similarity > 0) {
        results.push({
          path: doc.relativePath,
          language: doc.metadata?.language,
          similarity
        });
      }
    });

    return results.sort((a, b) => b.similarity - a.similarity);
  }
}

class KnowledgeBaseMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'src-to-kb',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.kbGenerator = null;
    this.kbSearch = null;
    this.currentKBPath = null;

    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args);
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  getTools() {
    return [
      {
        name: 'generate_kb',
        description: 'Generate a knowledge base from a source code repository',
        inputSchema: {
          type: 'object',
          properties: {
            repoPath: {
              type: 'string',
              description: 'Path to the repository to process',
            },
            outputPath: {
              type: 'string',
              description: 'Output directory for the knowledge base',
            },
            chunkSize: {
              type: 'number',
              description: 'Size of text chunks in characters',
            },
            generateEmbeddings: {
              type: 'boolean',
              description: 'Generate OpenAI embeddings',
            },
          },
          required: ['repoPath'],
        },
      },
      {
        name: 'search_kb',
        description: 'Search the knowledge base with natural language queries',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            kbPath: {
              type: 'string',
              description: 'Path to knowledge base',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_kb_stats',
        description: 'Get statistics about a knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            kbPath: {
              type: 'string',
              description: 'Path to knowledge base',
            },
          },
        },
      },
      {
        name: 'list_kb_files',
        description: 'List all files indexed in the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            kbPath: {
              type: 'string',
              description: 'Path to knowledge base',
            },
            filterByLanguage: {
              type: 'string',
              description: 'Filter by programming language',
            },
          },
        },
      },
      {
        name: 'find_similar',
        description: 'Find files similar to a given file',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'File path to compare',
            },
            kbPath: {
              type: 'string',
              description: 'Path to knowledge base',
            },
          },
          required: ['filePath'],
        },
      },
    ];
  }

  async handleToolCall(toolName, args) {
    switch (toolName) {
      case 'generate_kb':
        return await this.generateKnowledgeBase(args);
      case 'search_kb':
        return await this.searchKnowledgeBase(args);
      case 'get_kb_stats':
        return await this.getKBStatistics(args);
      case 'list_kb_files':
        return await this.listKBFiles(args);
      case 'find_similar':
        return await this.findSimilarFiles(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async generateKnowledgeBase(args) {
    const {
      repoPath,
      outputPath = './knowledge-base',
      chunkSize = 1000,
      generateEmbeddings = false,
    } = args;

    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    this.kbGenerator = new KnowledgeBaseGenerator({
      outputPath,
      chunkSize,
      generateEmbeddings,
      openaiApiKey: process.env.OPENAI_API_KEY,
    });

    const result = await this.kbGenerator.processRepository(repoPath);
    this.currentKBPath = outputPath;

    return {
      success: true,
      message: `Knowledge base generated successfully`,
      statistics: {
        filesProcessed: result.stats.filesProcessed,
        totalSize: `${(result.stats.totalSize / (1024 * 1024)).toFixed(2)} MB`,
        totalChunks: result.stats.totalChunks,
      },
      outputPath: outputPath,
    };
  }

  async searchKnowledgeBase(args) {
    const {
      query,
      kbPath = './knowledge-base',
      limit = 10,
    } = args;

    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base not found at: ${kbPath}`);
    }

    if (!this.kbSearch || this.currentKBPath !== kbPath) {
      this.kbSearch = new KnowledgeBaseSearch(kbPath);
      this.currentKBPath = kbPath;
    }

    const results = this.kbSearch.search(query, { limit });
    const answer = this.kbSearch.generateAnswer(query, results);

    return {
      query,
      answer: answer.answer,
      confidence: answer.confidence ? `${(answer.confidence * 100).toFixed(0)}%` : null,
      totalMatches: answer.totalMatches,
      topFiles: answer.topFiles,
    };
  }

  async getKBStatistics(args) {
    const { kbPath = './knowledge-base' } = args;

    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base not found at: ${kbPath}`);
    }

    const search = new KnowledgeBaseSearch(kbPath);
    const stats = search.getStatistics();

    return {
      path: kbPath,
      statistics: {
        totalDocuments: stats.totalDocuments,
        totalChunks: stats.totalChunks,
        totalSize: `${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`,
        languages: stats.languages,
        fileTypes: stats.types,
      },
    };
  }

  async listKBFiles(args) {
    const {
      kbPath = './knowledge-base',
      filterByLanguage,
    } = args;

    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base not found at: ${kbPath}`);
    }

    const search = new KnowledgeBaseSearch(kbPath);
    const files = [];

    search.documents.forEach(doc => {
      if (filterByLanguage && doc.metadata?.language !== filterByLanguage) {
        return;
      }
      files.push({
        path: doc.relativePath,
        language: doc.metadata?.language || 'Unknown',
        size: `${((doc.size || 0) / 1024).toFixed(2)} KB`,
      });
    });

    return {
      totalFiles: files.length,
      files: files.slice(0, 100),
    };
  }

  async findSimilarFiles(args) {
    const {
      filePath,
      kbPath = './knowledge-base',
    } = args;

    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base not found at: ${kbPath}`);
    }

    const search = new KnowledgeBaseSearch(kbPath);
    const similar = search.findSimilarFiles(filePath);

    return {
      queryFile: filePath,
      similarFiles: similar.slice(0, 5).map(s => ({
        path: s.path,
        language: s.language,
        similarity: `${(s.similarity * 20).toFixed(0)}%`,
      })),
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Server for src-to-kb started');
  }
}

// Run server if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new KnowledgeBaseMCPServer();
  server.run().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

export { KnowledgeBaseMCPServer };