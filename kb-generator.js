#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { ExternalServerService } = require('./external-server-service');
const { isExternalServerEnabled } = require('./external-server-config');
const { validateOpenAIKey: validateOpenAIKeyUtil, validateExternalServer: validateExternalServerUtil } = require('./validation-utils');

class KnowledgeBaseGenerator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      outputPath: config.outputPath || './knowledge-base',
      chunkSize: config.chunkSize || 1000,
      chunkOverlap: config.chunkOverlap || 200,
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      supportedExtensions: config.supportedExtensions || [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c',
        '.cs', '.go', '.rust', '.rb', '.php', '.md', '.txt', '.json',
        '.yaml', '.yml', '.xml', '.html', '.css', '.scss', '.sql'
      ],
      excludePaths: config.excludePaths || [
        'node_modules', '.git', 'dist', 'build', '.next',
        'coverage', '.cache', 'vendor', '__pycache__'
      ],
      includeComments: config.includeComments !== false,
      generateEmbeddings: config.generateEmbeddings || false,
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
      createChunks: config.createChunks || false
    };

    this.documents = new Map();
    this.stats = {
      filesProcessed: 0,
      totalSize: 0,
      totalChunks: 0,
      errors: []
    };

    // 🆕 NEW: Check if external server URL is provided (replaces USE_EXTERNAL_KB flag)
    this.useExternalServer = isExternalServerEnabled();
    
    // Initialize external server service only if URL is provided
    if (this.useExternalServer) {
      this.externalServer = new ExternalServerService();
      const extConfig = this.externalServer.getConfig();
      console.log('🌐 External server enabled');
      console.log(`   URL: ${extConfig.url}`);
      console.log(`   Max file size: ${(extConfig.maxFileSize / 1024 / 1024).toFixed(1)}MB`);
      if (process.env.EXTERNAL_KB_API_KEY) {
        console.log(`   API Key: ${'*'.repeat(process.env.EXTERNAL_KB_API_KEY.length - 4)}${process.env.EXTERNAL_KB_API_KEY.slice(-4)}`);
      }
    } else {
      console.log('📁 Local processing mode');
    }

    this.initializeOutputDirectory();
  }

  initializeOutputDirectory() {
    const dirs = [
      this.config.outputPath,
      path.join(this.config.outputPath, 'documents'),
      path.join(this.config.outputPath, 'chunks'),
      path.join(this.config.outputPath, 'embeddings'),
      path.join(this.config.outputPath, 'metadata')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async processRepository(repoPath, options = {}) {
    console.log(`\n🔍 Processing repository: ${repoPath}\n`);

    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    // Early validation: Check OpenAI key if embeddings are required
    if (this.config.generateEmbeddings) {
      await validateOpenAIKeyUtil(this.config.openaiApiKey);
    }

    // Early validation: Test external server connection and auth on first request
    if (this.useExternalServer) {
      await validateExternalServerUtil(this.externalServer);
    }

    const files = this.scanDirectory(repoPath, options.maxDepth || 10);
    console.log(`📁 Found ${files.length} files to process\n`);

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const progress = `[${i + 1}/${files.length}]`;
      
      try {
        console.log(`\n${progress} Processing file...`);
        await this.processFile(filePath, repoPath);
        
        // Add spacing between files
        if (i < files.length - 1) {
          console.log(''); // Empty line for spacing
        }
        
      } catch (error) {
        // In server mode, stop all processing on any error (no fallback)
        if (this.useExternalServer) {
          console.error(`\n❌ ${error.message}`);
          if (error.message.includes('authentication failed') || error.message.includes('401') || error.message.includes('403')) {
            console.error('   Stopping all processing due to authentication error.');
            console.error('   Please check your EXTERNAL_KB_API_KEY and ensure it is valid.\n');
          } else {
            console.error('   Stopping all processing due to external server error.');
            console.error('   External server mode does not fallback to local processing.\n');
          }
          throw error; // Re-throw to stop the loop
        }
        
        // In local mode, continue with other files on error
        console.error(`❌ Error processing ${filePath}: ${error.message}`);
        this.stats.errors.push({ file: filePath, error: error.message });
      }
    }

    await this.saveMetadata();
    this.printSummary();

    return {
      documents: Array.from(this.documents.values()),
      stats: this.stats
    };
  }

  scanDirectory(dirPath, maxDepth, currentDepth = 0, basePath = null) {
    const files = [];

    if (currentDepth > maxDepth) return files;

    if (!basePath) basePath = dirPath;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        // Check if path should be excluded
        if (this.shouldExclude(relativePath)) continue;

        if (entry.isDirectory()) {
          files.push(...this.scanDirectory(fullPath, maxDepth, currentDepth + 1, basePath));
        } else if (entry.isFile() && this.isSupportedFile(entry.name)) {
          const stats = fs.statSync(fullPath);
          if (stats.size <= this.config.maxFileSize) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not read directory: ${dirPath}`);
    }

    return files;
  }

  shouldExclude(filePath) {
    return this.config.excludePaths.some(excludePath =>
      filePath.includes(excludePath)
    );
  }

  isSupportedFile(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    return this.config.supportedExtensions.includes(ext);
  }

  async processFile(filePath, repoPath) {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(repoPath, filePath);

    console.log(`📄 Processing: ${relativePath}`);

    const document = {
      id: this.generateId(),
      path: filePath,
      relativePath: relativePath,
      fileName: path.basename(filePath),
      extension: path.extname(filePath),
      size: stats.size,
      content: content,
      checksum: this.generateChecksum(content),
      metadata: {
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        lines: content.split('\n').length,
        language: this.detectLanguage(filePath),
        type: this.getFileType(filePath)
      },
      chunks: []
    };

    // Choose processing method based on server mode and flags
    if (this.useExternalServer) {
      // Server mode: Send to server (no fallback)
      if (this.config.createChunks || this.config.generateEmbeddings) {
        // Create chunks locally first
        await this.processLocally(document);
        
        // Then send to server
        if (this.config.generateEmbeddings) {
          // Send chunks with embeddings
          await this.sendEmbeddingsToServer(document);
        } else {
          // Send chunks only
          await this.sendChunksToServer(document);
        }
      } else {
        // Default: Send raw content (server does chunking)
        await this.processWithExternalServer(document);
      }
    } else {
      // Local mode: Process locally only
      await this.processLocally(document);
    }

    this.documents.set(document.id, document);
    this.stats.filesProcessed++;
    this.stats.totalSize += stats.size;
    // Only count chunks if they exist (local-first creates chunks, direct send doesn't)
    if (document.chunks && document.chunks.length > 0) {
      this.stats.totalChunks += document.chunks.length;
    }

    this.emit('fileProcessed', {
      file: relativePath,
      documentId: document.id,
      chunks: document.chunks ? document.chunks.length : 0
    });
  }

  // External server processing (sends raw content)
  async processWithExternalServer(document) {
    const options = {
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      generateEmbeddings: false, // Server will generate embeddings
      sendEmbeddings: false // Sending raw content
    };

    const result = await this.externalServer.sendDocument(document, options);
    
    // Store external server response
    document.externalId = result.id || result.documentId;
    document.externalChunks = result.chunkIds || [];
    document.externalResult = result;
    
    console.log(`✅ External server processed: ${document.relativePath}`);
  }

  // Send chunks to server (requires local KB with chunks)
  async sendChunksToServer(document) {
    if (!document.chunks || document.chunks.length === 0) {
      throw new Error('No chunks available. Chunks must be created first.');
    }

    const options = {
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      generateEmbeddings: false,
      sendEmbeddings: false,
      sendChunks: true // Indicate we're sending chunks (not raw content)
    };

    // Send chunks array directly (buildPayload will handle it)
    const result = await this.externalServer.sendDocument(document, options);
    
    // Store external server response
    document.externalId = result.id || result.documentId;
    document.externalChunks = result.chunkIds || [];
    document.externalResult = result;
    
    console.log(`✅ Sent chunks to external server: ${document.relativePath}`);
  }

  // Send embeddings to server (requires local KB with embeddings)
  async sendEmbeddingsToServer(document) {
    if (!document.chunks || document.chunks.length === 0) {
      throw new Error('No chunks available. Chunks must be created first.');
    }

    // Check if embeddings exist
    const hasEmbeddings = document.chunks.some(chunk => chunk.embedding);
    if (!hasEmbeddings) {
      throw new Error('No embeddings found. Generate embeddings first with --with-embeddings flag.');
    }

    const options = {
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      generateEmbeddings: false, // Already generated
      sendEmbeddings: true // Sending embeddings
    };

    const result = await this.externalServer.sendEmbeddings(document, options);
    
    // Store external server response
    document.externalId = result.id || result.documentId;
    document.externalChunks = result.chunkIds || [];
    document.externalResult = result;
    
    console.log(`✅ Sent embeddings to external server: ${document.relativePath}`);
  }

  // 🆕 NEW: Local processing (extracted from original)
  async processLocally(document) {
    // Clean content
    const cleanedContent = this.cleanContent(document.content, document.metadata.type);

    // Create chunks
    document.chunks = this.createChunks(cleanedContent, document.id);

    // Generate embeddings if configured
    if (this.config.generateEmbeddings && this.config.openaiApiKey) {
      await this.generateEmbeddings(document);
    }

    // Save document
    await this.saveDocument(document);
  }

  cleanContent(content, type) {
    let cleaned = content;

    if (!this.config.includeComments) {
      // Remove single-line comments
      cleaned = cleaned.replace(/\/\/.*$/gm, '');

      // Remove multi-line comments
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

      // Remove Python/Ruby style comments
      cleaned = cleaned.replace(/^\s*#.*$/gm, '');
    }

    // Remove excessive whitespace
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Trim lines
    cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

    return cleaned.trim();
  }

  createChunks(content, documentId) {
    const chunks = [];
    const lines = content.split('\n');
    const chunkSize = this.config.chunkSize;
    const overlap = this.config.chunkOverlap;

    let currentChunk = [];
    let currentSize = 0;
    let chunkIndex = 0;
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = line.length + 1; // +1 for newline

      if (currentSize + lineSize > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          id: `${documentId}_chunk_${chunkIndex}`,
          index: chunkIndex,
          content: currentChunk.join('\n'),
          startLine: startLine,
          endLine: i - 1,
          size: currentSize
        });

        // Calculate overlap
        const overlapLines = Math.ceil(overlap / (currentSize / currentChunk.length));
        const overlapStart = Math.max(0, currentChunk.length - overlapLines);

        // Start new chunk with overlap
        currentChunk = currentChunk.slice(overlapStart);
        currentSize = currentChunk.join('\n').length;
        startLine = i - (currentChunk.length - 1);
        chunkIndex++;
      }

      currentChunk.push(line);
      currentSize += lineSize;
    }

    // Add remaining chunk
    if (currentChunk.length > 0) {
      chunks.push({
        id: `${documentId}_chunk_${chunkIndex}`,
        index: chunkIndex,
        content: currentChunk.join('\n'),
        startLine: startLine,
        endLine: lines.length - 1,
        size: currentSize
      });
    }

    return chunks;
  }


  async generateEmbeddings(document) {
    if (!this.config.openaiApiKey) {
      throw new Error('OpenAI API key is required for embedding generation');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-large',
          input: document.chunks.map(chunk =>
            chunk.content.substring(0, 8000) // API limit
          )
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid OpenAI API key. Please check your OPENAI_API_KEY');
        }
        throw new Error(`OpenAI API error (${response.status}): ${data.error?.message || 'Unknown error'}`);
      }

      if (data.data) {
        document.chunks.forEach((chunk, index) => {
          chunk.embedding = data.data[index].embedding;
        });
        console.log(`  ✅ Generated ${data.data.length} embeddings`);
      }
    } catch (error) {
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
  }

  async saveDocument(document) {
    // Save main document (without embeddings to reduce size)
    const docPath = path.join(this.config.outputPath, 'documents', `${document.id}.json`);
    const docToSave = { ...document };
    delete docToSave.chunks; // Save chunks separately

    fs.writeFileSync(docPath, JSON.stringify(docToSave, null, 2));

    // Save chunks
    const chunksPath = path.join(this.config.outputPath, 'chunks', `${document.id}.json`);
    const chunksToSave = document.chunks.map(chunk => ({
      ...chunk,
      embedding: undefined // Save embeddings separately
    }));
    fs.writeFileSync(chunksPath, JSON.stringify(chunksToSave, null, 2));

    // Save embeddings if they exist
    if (document.chunks[0]?.embedding) {
      const embeddingsPath = path.join(this.config.outputPath, 'embeddings', `${document.id}.json`);
      const embeddings = document.chunks.map(chunk => ({
        id: chunk.id,
        embedding: chunk.embedding
      }));
      fs.writeFileSync(embeddingsPath, JSON.stringify(embeddings));
    }
  }

  async saveMetadata() {
    const metadataPath = path.join(this.config.outputPath, 'metadata', 'summary.json');

    const summary = {
      generatedAt: new Date().toISOString(),
      stats: this.stats,
      config: {
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        supportedExtensions: this.config.supportedExtensions
      },
      documents: Array.from(this.documents.values()).map(doc => ({
        id: doc.id,
        path: doc.relativePath,
        size: doc.size,
        chunks: doc.chunks.length,
        language: doc.metadata.language,
        type: doc.metadata.type
      }))
    };

    fs.writeFileSync(metadataPath, JSON.stringify(summary, null, 2));
  }

  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Knowledge Base Generation Summary');
    console.log('='.repeat(50));
    console.log(`✅ Files processed: ${this.stats.filesProcessed}`);
    console.log(`📦 Total size: ${this.formatBytes(this.stats.totalSize)}`);
    console.log(`🔢 Total chunks: ${this.stats.totalChunks}`);
    console.log(`📁 Output directory: ${this.config.outputPath}`);

    if (this.stats.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${this.stats.errors.length}`);
      this.stats.errors.forEach(err => {
        console.log(`   - ${err.file}: ${err.error}`);
      });
    }

    // Language distribution
    const languages = {};
    this.documents.forEach(doc => {
      const lang = doc.metadata.language;
      languages[lang] = (languages[lang] || 0) + 1;
    });

    console.log('\n📈 Language Distribution:');
    Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .forEach(([lang, count]) => {
        console.log(`   ${lang}: ${count} files`);
      });
  }

  // Utility methods
  generateId() {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const langMap = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.go': 'Go',
      '.rust': 'Rust',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.scala': 'Scala',
      '.r': 'R',
      '.m': 'MATLAB',
      '.sql': 'SQL',
      '.html': 'HTML',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.xml': 'XML',
      '.json': 'JSON',
      '.yaml': 'YAML',
      '.yml': 'YAML',
      '.md': 'Markdown',
      '.txt': 'Text'
    };

    return langMap[ext] || 'Unknown';
  }

  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rust', '.rb', '.php'].includes(ext)) {
      return 'code';
    } else if (['.md', '.txt'].includes(ext)) {
      return 'text';
    } else if (['.json', '.yaml', '.yml', '.xml'].includes(ext)) {
      return 'config';
    } else if (['.html', '.css', '.scss'].includes(ext)) {
      return 'web';
    }

    return 'other';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export for use as module
module.exports = { KnowledgeBaseGenerator };

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  // Check for version flag
  if (args.includes('--version') || args.includes('-v')) {
    const package = require('./package.json');
    console.log(`v${package.version}`);
    process.exit(0);
  }

  // Check for help flag
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📚 Source Code to Knowledge Base Generator

Usage:
  src-to-kb <repository-path> [options]
  src-to-kb --source=notion [notion-options] [options]

Options:
  --source            Source type: code (default) or notion
  --output, -o        Output directory (default: ./knowledge-base)
  --chunk-size        Chunk size in characters (default: 1000)
  --chunk-overlap     Overlap between chunks (default: 200)
  --max-file-size     Maximum file size in MB (default: 10)
  --chunks-only       Create chunks locally (and send to server if enabled)
  --with-embeddings   Create chunks with embeddings (requires OPENAI_API_KEY env var)
  --no-comments       Exclude comments from code
  --exclude           Additional paths to exclude (comma-separated)
  --extensions        File extensions to include (comma-separated)
  --help, -h          Show this help message
  --version, -v       Show version number

Notion Options:
  --notion-key        Notion API integration token (or set NOTION_API_KEY env var)
  --notion-url        Notion page or database URL (auto-detects type)

Examples:
  src-to-kb /path/to/repo
  src-to-kb /path/to/repo --output ./my-kb --with-embeddings
  src-to-kb /path/to/repo --chunks-only
  src-to-kb . --exclude tests,examples --extensions .js,.ts
  
  src-to-kb --source=notion --notion-key=secret_xxx --notion-url=https://notion.so/My-Page-abc123
  src-to-kb --source=notion --notion-url=https://notion.so/Database-xyz789

Note: For code analysis, repository path must be provided as the first non-flag argument
    `);
    process.exit(0);
  }

  // Check if using Notion source
  const sourceIndex = args.findIndex(arg => arg.startsWith('--source'));
  const isNotionSource = sourceIndex !== -1 && args[sourceIndex].includes('notion');

  // Find the repository path (first non-flag argument) - only for code source
  let repoPath = null;
  if (!isNotionSource) {
    for (const arg of args) {
      if (!arg.startsWith('--') && !arg.startsWith('-')) {
        repoPath = arg;
        break;
      }
    }

    if (!repoPath) {
      console.error('❌ Error: Repository path is required for code analysis');
      console.log('Usage: src-to-kb <repository-path> [options]');
      console.log('Or use: src-to-kb --source=notion [notion-options]');
      console.log('Run "src-to-kb --help" for more information');
      process.exit(1);
    }
  }
  const options = {};
  const notionOptions = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Skip the repo path if present
    if (repoPath && arg === repoPath) {
      continue;
    }

    // Skip --source flag (already processed)
    if (arg.startsWith('--source=')) {
      continue;
    } else if (arg === '--source') {
      i++; // Skip next arg value
      continue;
    }

    // Parse options
    if (arg === '--output' || arg === '-o') {
      options.outputPath = args[++i];
    } else if (arg === '--chunk-size') {
      options.chunkSize = parseInt(args[++i]);
    } else if (arg === '--chunk-overlap') {
      options.chunkOverlap = parseInt(args[++i]);
    } else if (arg === '--max-file-size') {
      options.maxFileSize = parseInt(args[++i]) * 1024 * 1024;
    } else if (arg === '--with-embeddings') {
      options.generateEmbeddings = true;
    } else if (arg === '--chunks-only') {
      options.createChunks = true;
    } else if (arg === '--no-comments') {
      options.includeComments = false;
    } else if (arg === '--exclude') {
      const excludes = args[++i].split(',');
      options.excludePaths = [...(options.excludePaths || []), ...excludes];
    } else if (arg === '--extensions') {
      options.supportedExtensions = args[++i].split(',');
    } else if (arg === '--notion-key' || arg.startsWith('--notion-key=')) {
      notionOptions.apiKey = arg.startsWith('--notion-key=') ? arg.split('=')[1] : args[++i];
    } else if (arg === '--notion-url' || arg.startsWith('--notion-url=')) {
      notionOptions.pageUrl = arg.startsWith('--notion-url=') ? arg.split('=')[1] : args[++i];
    }
  }

  // Run the appropriate source processor
  if (isNotionSource) {
    // Process Notion pages
    const { NotionSource } = require('./notion-source');
    
    (async () => {
      try {
        const notionSource = new NotionSource(notionOptions);
        const documents = await notionSource.analyze();
        
        console.log(`\n📝 Processing ${documents.length} Notion documents into KB format...`);
        
        // Initialize generator for KB creation
        const generator = new KnowledgeBaseGenerator({
          ...options,
          outputPath: options.outputPath || './knowledge-base/notion'
        });
        
        // Process each Notion document through the chunking system
        for (const doc of documents) {
          console.log(`\n📄 Processing: ${doc.title}`);
          
          // Process Notion document using same logic as regular files
          const document = {
            id: doc.id,
            path: doc.title,
            relativePath: doc.title,
            fileName: doc.title,
            extension: '.md',
            size: doc.size || doc.content.length,
            content: doc.content,
            checksum: generator.generateChecksum(doc.content),
            metadata: {
              ...doc.metadata,
              createdAt: doc.metadata?.createdAt || new Date(),
              modifiedAt: doc.metadata?.modifiedAt || new Date(),
              lines: doc.content.split('\n').length,
              language: 'markdown',
              type: 'document'
            },
            chunks: []
          };

          // Use the same processing logic as regular files
          if (generator.useExternalServer) {
            // Server mode: Send to server (no fallback)
            if (generator.config.createChunks || generator.config.generateEmbeddings) {
              // Create chunks locally first
              document.chunks = generator.createChunks(document.content, document.id, document.metadata);
              
              // Generate embeddings if needed
              if (generator.config.generateEmbeddings) {
                await generator.generateEmbeddings(document);
              }
              
              // Save locally
              await generator.saveDocument(document);
              generator.stats.filesProcessed++;
              generator.stats.totalSize += document.size;
              generator.stats.totalChunks += document.chunks.length;
              
              // Then send to server
              if (generator.config.generateEmbeddings) {
                // Send chunks with embeddings
                await generator.sendEmbeddingsToServer(document);
              } else {
                // Send chunks only
                await generator.sendChunksToServer(document);
              }
            } else {
              // Default: Send raw content (server does chunking)
              await generator.processWithExternalServer(document);
              generator.stats.filesProcessed++;
              generator.stats.totalSize += document.size;
            }
          } else {
            // Local mode: Process locally only
            document.chunks = generator.createChunks(document.content, document.id, document.metadata);
            
            // Generate embeddings if needed
            if (generator.config.generateEmbeddings) {
              await generator.generateEmbeddings(document);
            }
            
            await generator.saveDocument(document);
            generator.stats.filesProcessed++;
            generator.stats.totalSize += document.size;
            generator.stats.totalChunks += document.chunks.length;
            console.log(`   ✅ Created ${document.chunks.length} chunks`);
          }
        }
        
        // Save metadata
        generator.saveMetadata();
        
        console.log('\n✨ Notion knowledge base generation complete!');
        console.log(`📊 Processed ${documents.length} pages, ${generator.stats.totalChunks} chunks`);
        
        // Only show "Saved to" if not using external server
        if (!generator.useExternalServer) {
          console.log(`💾 Saved to: ${generator.config.outputPath}`);
        }
        
        process.exit(0);
        
      } catch (error) {
        // Error message already contains detailed guidance from validation
        console.error(`\n❌ ${error.message}`);
        process.exit(1);
      }
    })();
    
  } else {
    // Process code repository (existing logic)
    const generator = new KnowledgeBaseGenerator(options);

    generator.on('fileProcessed', (data) => {
      // Progress indicator
      process.stdout.write('.');
    });

    generator.processRepository(repoPath)
      .then(() => {
        console.log('\n✨ Knowledge base generation complete!');
        process.exit(0);
      })
      .catch(error => {
        // Error message already contains detailed guidance from validation
        console.error(`\n❌ ${error.message}`);
        process.exit(1);
      });
  }
}