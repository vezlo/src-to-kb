#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

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
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY
    };

    this.documents = new Map();
    this.stats = {
      filesProcessed: 0,
      totalSize: 0,
      totalChunks: 0,
      errors: []
    };

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

    const files = this.scanDirectory(repoPath, options.maxDepth || 10);
    console.log(`📁 Found ${files.length} files to process\n`);

    for (const filePath of files) {
      try {
        await this.processFile(filePath, repoPath);
      } catch (error) {
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

    // Clean content
    const cleanedContent = this.cleanContent(content, document.metadata.type);

    // Create chunks
    document.chunks = this.createChunks(cleanedContent, document.id);

    // Generate embeddings if configured
    if (this.config.generateEmbeddings && this.config.openaiApiKey) {
      await this.generateEmbeddings(document);
    }

    // Save document
    await this.saveDocument(document);

    this.documents.set(document.id, document);
    this.stats.filesProcessed++;
    this.stats.totalSize += stats.size;
    this.stats.totalChunks += document.chunks.length;

    this.emit('fileProcessed', {
      file: relativePath,
      documentId: document.id,
      chunks: document.chunks.length
    });
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
      console.warn('⚠️  OpenAI API key not provided, skipping embeddings');
      return;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: document.chunks.map(chunk =>
            chunk.content.substring(0, 8000) // API limit
          )
        })
      });

      const data = await response.json();

      if (data.data) {
        document.chunks.forEach((chunk, index) => {
          chunk.embedding = data.data[index].embedding;
        });
        console.log(`  ✅ Generated ${data.data.length} embeddings`);
      }
    } catch (error) {
      console.warn(`  ⚠️  Failed to generate embeddings: ${error.message}`);
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

Options:
  --output, -o        Output directory (default: ./knowledge-base)
  --chunk-size        Chunk size in characters (default: 1000)
  --chunk-overlap     Overlap between chunks (default: 200)
  --max-file-size     Maximum file size in MB (default: 10)
  --embeddings        Generate OpenAI embeddings (requires OPENAI_API_KEY env var)
  --no-comments       Exclude comments from code
  --exclude           Additional paths to exclude (comma-separated)
  --extensions        File extensions to include (comma-separated)
  --help, -h          Show this help message

Examples:
  src-to-kb /path/to/repo
  src-to-kb /path/to/repo --output ./my-kb --embeddings
  src-to-kb . --exclude tests,examples --extensions .js,.ts
    `);
    process.exit(0);
  }

  const repoPath = args[0];
  const options = {};

  // Parse CLI arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' || arg === '-o') {
      options.outputPath = args[++i];
    } else if (arg === '--chunk-size') {
      options.chunkSize = parseInt(args[++i]);
    } else if (arg === '--chunk-overlap') {
      options.chunkOverlap = parseInt(args[++i]);
    } else if (arg === '--max-file-size') {
      options.maxFileSize = parseInt(args[++i]) * 1024 * 1024;
    } else if (arg === '--embeddings') {
      options.generateEmbeddings = true;
    } else if (arg === '--no-comments') {
      options.includeComments = false;
    } else if (arg === '--exclude') {
      const excludes = args[++i].split(',');
      options.excludePaths = [...(options.excludePaths || []), ...excludes];
    } else if (arg === '--extensions') {
      options.supportedExtensions = args[++i].split(',');
    }
  }

  // Run the generator
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
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}