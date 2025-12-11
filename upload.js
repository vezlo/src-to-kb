#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ExternalServerService } = require('./external-server-service');
const { isExternalServerEnabled } = require('./external-server-config');
const { validateExternalServer: validateExternalServerUtil } = require('./validation-utils');

class KnowledgeBaseUploader {
  constructor(kbPath = './knowledge-base') {
    this.kbPath = kbPath;
    this.documents = new Map();
    this.chunks = new Map();
    this.embeddings = new Map();
    
    // Check if external server URL is provided
    if (!isExternalServerEnabled()) {
      throw new Error('EXTERNAL_KB_URL environment variable is required for upload');
    }
    
    this.externalServer = new ExternalServerService();
    const extConfig = this.externalServer.getConfig();
    console.log('🌐 External server enabled');
    console.log(`   URL: ${extConfig.url}`);
    if (process.env.EXTERNAL_KB_API_KEY) {
      console.log(`   API Key: ${'*'.repeat(process.env.EXTERNAL_KB_API_KEY.length - 4)}${process.env.EXTERNAL_KB_API_KEY.slice(-4)}`);
    }
    this.serverValidated = false;
  }

  /**
   * Validate external server availability and authentication
   * Called before upload to fail fast if server is unavailable
   */
  async validateExternalServer() {
    if (this.serverValidated) {
      return;
    }

    await validateExternalServerUtil(this.externalServer, { cacheResult: true });
    this.serverValidated = true;
  }

  loadKnowledgeBase() {
    console.log(`\n📚 Loading knowledge base from: ${this.kbPath}\n`);

    // Load documents
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
    } else {
      throw new Error(`Documents directory not found: ${docsPath}`);
    }

    // Load chunks
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
    } else {
      throw new Error(`Chunks directory not found: ${chunksPath}`);
    }

    // Load embeddings (optional)
    const embeddingsPath = path.join(this.kbPath, 'embeddings');
    if (fs.existsSync(embeddingsPath)) {
      const files = fs.readdirSync(embeddingsPath);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const content = fs.readFileSync(path.join(embeddingsPath, file), 'utf-8');
          const embeddings = JSON.parse(content);
          const docId = file.replace('.json', '');
          this.embeddings.set(docId, embeddings);
        }
      });
    }

    console.log(`✅ Loaded ${this.documents.size} documents`);
    console.log(`✅ Loaded chunks for ${this.chunks.size} documents`);
    if (this.embeddings.size > 0) {
      console.log(`✅ Loaded embeddings for ${this.embeddings.size} documents`);
    }
  }

  async upload(sendEmbeddings = false, sendChunks = false) {
    // Validate server before uploading
    await this.validateExternalServer();

    if (this.documents.size === 0) {
      throw new Error('No documents found in knowledge base');
    }

    if (sendEmbeddings && this.embeddings.size === 0) {
      throw new Error('No embeddings found. Use --with-embeddings only if embeddings exist in the KB.');
    }

    if (sendChunks && this.chunks.size === 0) {
      throw new Error('No chunks found. Use --chunks-only only if chunks exist in the KB.');
    }

    let mode = 'Raw content';
    if (sendEmbeddings) {
      mode = 'Chunks with embeddings';
    } else if (sendChunks) {
      mode = 'Chunks only';
    }

    console.log(`\n📤 Starting upload to external server...`);
    console.log(`   Mode: ${mode}\n`);

    let successCount = 0;
    let failCount = 0;

    for (const [docId, doc] of this.documents) {
      try {
        console.log(`\n📄 Processing: ${doc.relativePath || doc.title || docId}`);

        // Get chunks for this document
        const chunks = this.chunks.get(docId) || [];
        doc.chunks = chunks;

        if (sendEmbeddings) {
          // Send chunks with embeddings
          const embeddings = this.embeddings.get(docId);
          if (!embeddings || embeddings.length === 0) {
            console.warn(`   ⚠️  No embeddings found for this document, skipping...`);
            failCount++;
            continue;
          }

          // Merge embeddings into chunks
          const embeddingMap = new Map(embeddings.map(e => [e.id, e.embedding]));
          doc.chunks = chunks.map(chunk => ({
            ...chunk,
            embedding: embeddingMap.get(chunk.id)
          }));

          // Verify all chunks have embeddings
          const missingEmbeddings = doc.chunks.filter(chunk => !chunk.embedding);
          if (missingEmbeddings.length > 0) {
            console.warn(`   ⚠️  ${missingEmbeddings.length} chunks missing embeddings, skipping...`);
            failCount++;
            continue;
          }

          const options = {
            chunkSize: 1000,
            chunkOverlap: 200,
            sendEmbeddings: true
          };

          await this.externalServer.sendEmbeddings(doc, options);
          successCount++;
        } else if (sendChunks) {
          // Send chunks only (no embeddings)
          if (chunks.length === 0) {
            console.warn(`   ⚠️  No chunks found for this document, skipping...`);
            failCount++;
            continue;
          }

          // Chunks are already in doc.chunks, buildPayload will handle it
          const options = {
            chunkSize: 1000,
            chunkOverlap: 200,
            sendEmbeddings: false,
            sendChunks: true // Indicate we're sending chunks (not raw content)
          };

          await this.externalServer.sendDocument(doc, options);
          successCount++;
        } else {
          // Send raw content (reconstruct from chunks if available)
          if (chunks.length > 0) {
            doc.content = chunks.map(chunk => chunk.content).join('\n\n');
          }

          const options = {
            chunkSize: 1000,
            chunkOverlap: 200,
            sendEmbeddings: false
          };

          await this.externalServer.sendDocument(doc, options);
          successCount++;
        }
      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        failCount++;
      }
    }

    console.log(`\n✨ Upload complete!`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📊 Total: ${this.documents.size}`);
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse arguments
  let kbPath = './knowledge-base';
  let sendEmbeddings = false;
  let sendChunks = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--kb' || arg === '--kb-path') {
      kbPath = args[++i];
    } else if (arg === '--with-embeddings') {
      sendEmbeddings = true;
    } else if (arg === '--chunks-only') {
      sendChunks = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: src-to-kb-upload [options]

Upload existing local knowledge base to external server.

Options:
  --kb, --kb-path      Knowledge base directory path (default: ./knowledge-base)
  --chunks-only        Upload chunks only (requires chunks in KB)
  --with-embeddings    Upload chunks with embeddings (requires embeddings in KB)
  --help, -h            Show this help message

Examples:
  src-to-kb-upload --kb ./knowledge-base
  src-to-kb-upload --kb ./knowledge-base --chunks-only
  src-to-kb-upload --kb ./knowledge-base --with-embeddings

Note: Requires EXTERNAL_KB_URL environment variable to be set.
      `);
      process.exit(0);
    }
  }

  // Run upload
  (async () => {
    try {
      const uploader = new KnowledgeBaseUploader(kbPath);
      uploader.loadKnowledgeBase();
      await uploader.upload(sendEmbeddings, sendChunks);
      process.exit(0);
    } catch (error) {
      // Error message already contains detailed guidance from validation
      console.error(`\n❌ ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = { KnowledgeBaseUploader };

