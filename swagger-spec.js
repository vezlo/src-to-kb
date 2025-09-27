// Swagger/OpenAPI specification for Source-to-KB API

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Source-to-KB API',
    version: '1.3.0',
    description: 'REST API for converting source code repositories into searchable knowledge bases',
    contact: {
      name: 'API Support',
      url: 'https://github.com/vezlo/src-to-kb',
    },
    license: {
      name: 'AGPL-3.0',
      url: 'https://www.gnu.org/licenses/agpl-3.0.html'
    }
  },
  servers: [
    {
      url: 'http://localhost:{port}/api/v1',
      description: 'Development server',
      variables: {
        port: {
          default: '3000'
        }
      }
    }
  ],
  tags: [
    { name: 'Knowledge Bases', description: 'Create and manage knowledge bases' },
    { name: 'Search', description: 'Search and query operations' },
    { name: 'Modes', description: 'Answer mode management' },
    { name: 'Processing', description: 'File processing operations' },
    { name: 'Statistics', description: 'Analytics and statistics' }
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
          id: { type: 'string', example: 'abc123def456' },
          name: { type: 'string', example: 'My Project KB' },
          path: { type: 'string', example: './knowledge-bases/abc123' },
          sourcePath: { type: 'string', example: '/path/to/project' },
          createdAt: { type: 'string', format: 'date-time' },
          stats: {
            type: 'object',
            properties: {
              filesProcessed: { type: 'integer', example: 150 },
              totalSize: { type: 'integer', example: 5242880 },
              totalChunks: { type: 'integer', example: 1500 }
            }
          }
        }
      },
      SearchRequest: {
        type: 'object',
        required: ['query', 'knowledgeBaseId'],
        properties: {
          query: { type: 'string', example: 'authentication implementation' },
          knowledgeBaseId: { type: 'string', example: 'abc123' },
          mode: {
            type: 'string',
            enum: ['enduser', 'developer', 'copilot'],
            default: 'developer',
            example: 'developer'
          },
          limit: { type: 'integer', default: 10, example: 10 },
          useAI: { type: 'boolean', default: true }
        }
      },
      SearchResult: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          confidence: { type: 'number', example: 0.85 },
          totalMatches: { type: 'integer', example: 15 },
          mode: { type: 'string', example: 'developer' },
          topFiles: {
            type: 'array',
            items: { type: 'string' },
            example: ['src/auth/login.js', 'src/middleware/auth.js']
          }
        }
      },
      Mode: {
        type: 'object',
        properties: {
          key: { type: 'string', example: 'developer' },
          name: { type: 'string', example: 'Developer' },
          description: { type: 'string' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Bad Request' },
          message: { type: 'string', example: 'Invalid input provided' }
        }
      }
    }
  },
  paths: {
    '/knowledge-bases': {
      get: {
        summary: 'List all knowledge bases',
        tags: ['Knowledge Bases'],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'List of knowledge bases',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/KnowledgeBase' }
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create a new knowledge base',
        tags: ['Knowledge Bases'],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'sourcePath'],
                properties: {
                  name: { type: 'string', example: 'My Project' },
                  sourcePath: { type: 'string', example: '/path/to/project' },
                  options: {
                    type: 'object',
                    properties: {
                      chunkSize: { type: 'integer', example: 1500 },
                      chunkOverlap: { type: 'integer', example: 300 },
                      generateEmbeddings: { type: 'boolean', example: true },
                      excludePaths: {
                        type: 'array',
                        items: { type: 'string' },
                        example: ['node_modules', 'dist']
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          '202': {
            description: 'Knowledge base generation started',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    message: { type: 'string' },
                    statusUrl: { type: 'string' }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Invalid input',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/knowledge-bases/{id}': {
      get: {
        summary: 'Get knowledge base details',
        tags: ['Knowledge Bases'],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Knowledge base ID'
          }
        ],
        responses: {
          '200': {
            description: 'Knowledge base details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/KnowledgeBase' }
              }
            }
          },
          '404': {
            description: 'Knowledge base not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      delete: {
        summary: 'Delete a knowledge base',
        tags: ['Knowledge Bases'],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Knowledge base ID'
          }
        ],
        responses: {
          '204': {
            description: 'Knowledge base deleted'
          },
          '404': {
            description: 'Knowledge base not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/knowledge-bases/{id}/status': {
      get: {
        summary: 'Get generation status',
        tags: ['Knowledge Bases'],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Knowledge base ID'
          }
        ],
        responses: {
          '200': {
            description: 'Generation status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['processing', 'completed', 'failed'],
                      example: 'processing'
                    },
                    progress: { type: 'integer', example: 75 },
                    startedAt: { type: 'string', format: 'date-time' },
                    completedAt: { type: 'string', format: 'date-time' },
                    error: { type: 'string' }
                  }
                }
              }
            }
          },
          '404': {
            description: 'Status not found'
          }
        }
      }
    },
    '/search': {
      post: {
        summary: 'Search across knowledge bases',
        tags: ['Search'],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SearchRequest' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Search results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SearchResult' }
              }
            }
          },
          '400': {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/similar-files': {
      post: {
        summary: 'Find similar files in a knowledge base',
        tags: ['Search'],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['knowledgeBaseId', 'filePath'],
                properties: {
                  knowledgeBaseId: { type: 'string', example: 'abc123' },
                  filePath: { type: 'string', example: 'src/auth/login.js' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Similar files',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      path: { type: 'string' },
                      language: { type: 'string' },
                      similarity: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/modes': {
      get: {
        summary: 'List available answer modes',
        tags: ['Modes'],
        responses: {
          '200': {
            description: 'List of available modes',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Mode' }
                }
              }
            }
          }
        }
      }
    },
    '/modes/{mode}': {
      get: {
        summary: 'Get details for a specific mode',
        tags: ['Modes'],
        parameters: [
          {
            in: 'path',
            name: 'mode',
            required: true,
            schema: {
              type: 'string',
              enum: ['enduser', 'developer', 'copilot']
            },
            description: 'Mode name'
          }
        ],
        responses: {
          '200': {
            description: 'Mode details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Mode' }
              }
            }
          },
          '404': {
            description: 'Mode not found'
          }
        }
      }
    },
    '/statistics/{knowledgeBaseId}': {
      get: {
        summary: 'Get knowledge base statistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'knowledgeBaseId',
            required: true,
            schema: { type: 'string' },
            description: 'Knowledge base ID'
          }
        ],
        responses: {
          '200': {
            description: 'Statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalDocuments: { type: 'integer', example: 150 },
                    totalChunks: { type: 'integer', example: 1500 },
                    totalSize: { type: 'integer', example: 5242880 },
                    languages: {
                      type: 'object',
                      additionalProperties: { type: 'integer' },
                      example: { JavaScript: 80, TypeScript: 50, Python: 20 }
                    },
                    types: {
                      type: 'object',
                      additionalProperties: { type: 'integer' },
                      example: { code: 120, config: 20, documentation: 10 }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/process-file': {
      post: {
        summary: 'Process a single file',
        tags: ['Processing'],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'File to process'
                  },
                  chunkSize: {
                    type: 'integer',
                    default: 1000,
                    example: 1000
                  },
                  chunkOverlap: {
                    type: 'integer',
                    default: 200,
                    example: 200
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Processed file data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    originalName: { type: 'string' },
                    size: { type: 'integer' },
                    chunks: { type: 'integer' },
                    content: { type: 'string' },
                    chunksData: { type: 'array', items: { type: 'object' } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

module.exports = swaggerSpec;