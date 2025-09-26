#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class KnowledgeBaseSearch {
  constructor(kbPath = './knowledge-base') {
    this.kbPath = kbPath;
    this.documents = new Map();
    this.chunks = new Map();
    this.loadKnowledgeBase();
  }

  loadKnowledgeBase() {
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
    }

    console.log(`📚 Loaded ${this.documents.size} documents with chunks`);
  }

  search(query, options = {}) {
    const results = [];
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/);

    // Search through all chunks
    this.chunks.forEach((docChunks, docId) => {
      const document = this.documents.get(docId);
      if (!document) return;

      docChunks.forEach(chunk => {
        let score = 0;
        let matches = [];

        // Calculate relevance score
        keywords.forEach(keyword => {
          const content = chunk.content.toLowerCase();
          if (content.includes(keyword)) {
            // Count occurrences
            const regex = new RegExp(keyword, 'gi');
            const count = (content.match(regex) || []).length;
            score += count;

            // Find context around match
            const index = content.indexOf(keyword);
            if (index !== -1) {
              const start = Math.max(0, index - 50);
              const end = Math.min(content.length, index + keyword.length + 50);
              matches.push(chunk.content.substring(start, end));
            }
          }
        });

        if (score > 0) {
          results.push({
            documentId: docId,
            documentPath: document.relativePath,
            chunkId: chunk.id,
            score: score,
            lines: `${chunk.startLine}-${chunk.endLine}`,
            matches: matches,
            preview: chunk.content.substring(0, 200)
          });
        }
      });
    });

    // Sort by relevance score
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    const limit = options.limit || 10;
    return results.slice(0, limit);
  }

  searchByType(type) {
    const results = [];
    this.documents.forEach(doc => {
      if (doc.metadata.type === type || doc.metadata.language === type) {
        results.push({
          id: doc.id,
          path: doc.relativePath,
          language: doc.metadata.language,
          type: doc.metadata.type,
          size: doc.size,
          lines: doc.metadata.lines
        });
      }
    });
    return results;
  }

  getStatistics() {
    const stats = {
      totalDocuments: this.documents.size,
      totalChunks: 0,
      totalSize: 0,
      languages: {},
      types: {}
    };

    this.documents.forEach(doc => {
      stats.totalSize += doc.size;

      // Count languages
      const lang = doc.metadata.language;
      stats.languages[lang] = (stats.languages[lang] || 0) + 1;

      // Count types
      const type = doc.metadata.type;
      stats.types[type] = (stats.types[type] || 0) + 1;
    });

    this.chunks.forEach(chunks => {
      stats.totalChunks += chunks.length;
    });

    return stats;
  }

  findSimilarFiles(filePath) {
    const targetDoc = Array.from(this.documents.values()).find(
      doc => doc.relativePath === filePath
    );

    if (!targetDoc) {
      return [];
    }

    const similar = [];
    this.documents.forEach(doc => {
      if (doc.id === targetDoc.id) return;

      // Calculate similarity based on language and type
      let similarity = 0;
      if (doc.metadata.language === targetDoc.metadata.language) similarity += 2;
      if (doc.metadata.type === targetDoc.metadata.type) similarity += 1;

      // Check for similar path structure
      const targetParts = targetDoc.relativePath.split('/');
      const docParts = doc.relativePath.split('/');
      const commonParts = targetParts.filter(part => docParts.includes(part));
      similarity += commonParts.length * 0.5;

      if (similarity > 0) {
        similar.push({
          path: doc.relativePath,
          language: doc.metadata.language,
          similarity: similarity
        });
      }
    });

    return similar.sort((a, b) => b.similarity - a.similarity);
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🔍 Knowledge Base Search Tool

Usage:
  node search.js <command> [options]

Commands:
  search <query>     Search for text in the knowledge base
  type <type>        List all files of a specific type/language
  stats              Show knowledge base statistics
  similar <file>     Find files similar to the given file path

Options:
  --kb <path>        Path to knowledge base (default: ./knowledge-base)
  --limit <n>        Limit number of results (default: 10)

Examples:
  node search.js search "initialize app"
  node search.js type JavaScript
  node search.js stats
  node search.js similar src/index.js
    `);
    process.exit(0);
  }

  const command = args[0];
  const kbPath = args.includes('--kb')
    ? args[args.indexOf('--kb') + 1]
    : './knowledge-base';

  const searcher = new KnowledgeBaseSearch(kbPath);

  switch (command) {
    case 'search': {
      if (args.length < 2) {
        console.error('❌ Please provide a search query');
        process.exit(1);
      }

      const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
      const limit = args.includes('--limit')
        ? parseInt(args[args.indexOf('--limit') + 1])
        : 10;

      console.log(`\n🔍 Searching for: "${query}"\n`);

      const results = searcher.search(query, { limit });

      if (results.length === 0) {
        console.log('No results found');
      } else {
        console.log(`Found ${results.length} results:\n`);

        results.forEach((result, index) => {
          console.log(`${index + 1}. 📄 ${result.documentPath}`);
          console.log(`   Lines: ${result.lines} | Score: ${result.score}`);
          console.log(`   Preview: ${result.preview.substring(0, 100)}...`);

          if (result.matches.length > 0) {
            console.log(`   Match: "...${result.matches[0]}..."`);
          }
          console.log();
        });
      }
      break;
    }

    case 'type': {
      if (args.length < 2) {
        console.error('❌ Please provide a type or language');
        process.exit(1);
      }

      const type = args[1];
      console.log(`\n📁 Files of type/language: ${type}\n`);

      const results = searcher.searchByType(type);

      if (results.length === 0) {
        console.log('No files found');
      } else {
        results.forEach(result => {
          console.log(`📄 ${result.path}`);
          console.log(`   Language: ${result.language} | Type: ${result.type}`);
          console.log(`   Size: ${(result.size / 1024).toFixed(2)} KB | Lines: ${result.lines}`);
          console.log();
        });
      }
      break;
    }

    case 'stats': {
      console.log('\n📊 Knowledge Base Statistics\n');

      const stats = searcher.getStatistics();

      console.log(`Total Documents: ${stats.totalDocuments}`);
      console.log(`Total Chunks: ${stats.totalChunks}`);
      console.log(`Total Size: ${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`);

      console.log('\nLanguages:');
      Object.entries(stats.languages)
        .sort((a, b) => b[1] - a[1])
        .forEach(([lang, count]) => {
          console.log(`  ${lang}: ${count} files`);
        });

      console.log('\nFile Types:');
      Object.entries(stats.types)
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count} files`);
        });
      break;
    }

    case 'similar': {
      if (args.length < 2) {
        console.error('❌ Please provide a file path');
        process.exit(1);
      }

      const filePath = args[1];
      console.log(`\n🔍 Finding files similar to: ${filePath}\n`);

      const results = searcher.findSimilarFiles(filePath);

      if (results.length === 0) {
        console.log('No similar files found (file may not exist in KB)');
      } else {
        console.log(`Found ${results.length} similar files:\n`);

        results.slice(0, 10).forEach(result => {
          console.log(`📄 ${result.path}`);
          console.log(`   Language: ${result.language} | Similarity: ${result.similarity.toFixed(2)}`);
          console.log();
        });
      }
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }
}