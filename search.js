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
        let contextSnippets = [];

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
              const start = Math.max(0, index - 80);
              const end = Math.min(content.length, index + keyword.length + 80);
              const snippet = chunk.content.substring(start, end).trim();

              // Clean up the snippet
              const cleanSnippet = snippet
                .replace(/\s+/g, ' ')
                .replace(/^\W+/, '')
                .replace(/\W+$/, '');

              if (!contextSnippets.some(s => s.includes(cleanSnippet.substring(0, 30)))) {
                contextSnippets.push(cleanSnippet);
              }
            }
          }
        });

        if (score > 0) {
          results.push({
            documentId: docId,
            documentPath: document.relativePath,
            documentLang: document.metadata.language,
            chunkId: chunk.id,
            score: score,
            lines: `${chunk.startLine}-${chunk.endLine}`,
            matches: matches,
            contextSnippets: contextSnippets,
            fullContent: chunk.content,
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

  generateAnswer(query, searchResults) {
    if (searchResults.length === 0) {
      return {
        answer: "I couldn't find any relevant information about that in the knowledge base.",
        confidence: 0
      };
    }

    // Analyze query intent
    const queryLower = query.toLowerCase();
    const isQuestion = queryLower.includes('?') ||
                      queryLower.startsWith('how') ||
                      queryLower.startsWith('what') ||
                      queryLower.startsWith('why') ||
                      queryLower.startsWith('when') ||
                      queryLower.startsWith('where') ||
                      queryLower.startsWith('does') ||
                      queryLower.startsWith('can') ||
                      queryLower.startsWith('is');

    // Group results by file type
    const fileTypes = {};
    const languages = new Set();

    searchResults.forEach(result => {
      const ext = path.extname(result.documentPath);
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      if (result.documentLang) {
        languages.add(result.documentLang);
      }
    });

    // Extract key information from results
    const topResult = searchResults[0];
    const relevantFiles = [...new Set(searchResults.slice(0, 5).map(r => r.documentPath))];
    let confidence = Math.min(topResult.score / 50, 1); // Normalize confidence
    let answer = ''; // Initialize answer variable

    // Analyze content for better answers
    const allContent = searchResults.slice(0, 3).map(r => r.fullContent || r.preview).join('\n');
    const contexts = searchResults.slice(0, 3).map(r => r.contextSnippets).flat();

    // Check for specific query patterns and provide intelligent answers
    if (queryLower.includes('password reset') || queryLower.includes('reset password') || queryLower.includes('forgot password')) {
      // Look for password reset related patterns
      const resetFiles = searchResults.filter(r =>
        r.documentPath.toLowerCase().includes('auth') ||
        r.documentPath.toLowerCase().includes('password') ||
        r.documentPath.toLowerCase().includes('reset') ||
        r.documentPath.toLowerCase().includes('login')
      );

      if (resetFiles.length > 0) {
        const authFile = resetFiles[0];
        answer = `Password reset functionality can be found in the authentication module:\n\n`;
        answer += `📁 **Primary location**: ${authFile.documentPath}\n`;
        answer += `📍 Lines: ${authFile.lines}\n\n`;

        // Check for routes/endpoints
        if (allContent.includes('/reset-password') || allContent.includes('/forgot-password')) {
          answer += `🔗 **Endpoint**: The password reset endpoint appears to be configured at "/reset-password" or "/forgot-password"\n\n`;
        }

        // Check for components
        const componentFiles = resetFiles.filter(r => r.documentPath.includes('component'));
        if (componentFiles.length > 0) {
          answer += `🎨 **UI Components**: Password reset UI is in ${componentFiles[0].documentPath}\n\n`;
        }

        answer += `💡 **How it works**: The password reset flow typically involves:\n`;
        answer += `1. User requests a password reset link\n`;
        answer += `2. System sends an email with a reset token\n`;
        answer += `3. User clicks the link and enters a new password\n`;
        answer += `4. System validates the token and updates the password\n\n`;
        answer += `📂 **Related files**: ${relevantFiles.slice(0, 3).join(', ')}`;
      } else {
        answer = `I couldn't find specific password reset implementation, but check these auth-related files:\n`;
        answer += `📂 ${relevantFiles.slice(0, 3).join(', ')}\n\n`;
        answer += `💡 You might need to implement password reset functionality or it may be handled by an external service.`;
      }
    } else if (queryLower.includes('login') || queryLower.includes('authentication') || queryLower.includes('auth')) {
      // Authentication queries
      const authFiles = searchResults.filter(r =>
        r.documentPath.toLowerCase().includes('auth') ||
        r.documentPath.toLowerCase().includes('login')
      );

      if (authFiles.length > 0) {
        answer = `Authentication is implemented in:\n\n`;
        answer += `📁 **Main auth module**: ${authFiles[0].documentPath}\n`;
        answer += `📍 Lines: ${authFiles[0].lines}\n\n`;

        if (allContent.includes('jwt') || allContent.includes('JWT')) {
          answer += `🔐 **Method**: Using JWT (JSON Web Tokens) for authentication\n`;
        }
        if (allContent.includes('oauth') || allContent.includes('OAuth')) {
          answer += `🔑 **OAuth**: OAuth integration detected for social login\n`;
        }

        answer += `\n📂 **Related files**: ${relevantFiles.slice(0, 3).join(', ')}`;
      }
    } else if (queryLower.includes('api') || queryLower.includes('endpoint') || queryLower.includes('route')) {
      // API/Route queries
      answer = `API endpoints and routes found in:\n\n`;

      const apiFiles = searchResults.filter(r =>
        r.documentPath.includes('api') ||
        r.documentPath.includes('route') ||
        r.documentPath.includes('controller')
      );

      if (apiFiles.length > 0) {
        apiFiles.slice(0, 3).forEach(file => {
          answer += `📁 ${file.documentPath} (lines ${file.lines})\n`;
        });
      } else {
        answer += `📂 ${relevantFiles.slice(0, 3).join('\n📂 ')}\n`;
      }

      answer += `\n💡 Look for route definitions, API handlers, or controller methods in these files.`;
    } else if (queryLower.includes('database') || queryLower.includes('model') || queryLower.includes('schema')) {
      // Database queries
      answer = `Database and data model information:\n\n`;

      const dbFiles = searchResults.filter(r =>
        r.documentPath.includes('model') ||
        r.documentPath.includes('schema') ||
        r.documentPath.includes('database') ||
        r.documentPath.includes('entity')
      );

      if (dbFiles.length > 0) {
        answer += `📊 **Data models found in**:\n`;
        dbFiles.slice(0, 3).forEach(file => {
          answer += `  • ${file.documentPath}\n`;
        });
      }

      answer += `\n📂 **All relevant files**: ${relevantFiles.slice(0, 3).join(', ')}`;
    } else if (queryLower.includes('component') || queryLower.includes('ui') || queryLower.includes('frontend')) {
      // UI/Component queries
      answer = `UI components and frontend code:\n\n`;

      const componentFiles = searchResults.filter(r =>
        r.documentPath.includes('component') ||
        r.documentPath.includes('view') ||
        r.documentPath.includes('page') ||
        r.documentPath.endsWith('.tsx') ||
        r.documentPath.endsWith('.jsx')
      );

      if (componentFiles.length > 0) {
        answer += `🎨 **Components found in**:\n`;
        componentFiles.slice(0, 4).forEach(file => {
          answer += `  • ${file.documentPath}\n`;
        });
      }

      answer += `\n💡 These files contain React/Vue/Angular components and UI logic.`;
    } else if (queryLower.includes('language') || queryLower.includes('support')) {
      // Language support queries
      const supportedLangs = Array.from(languages);
      if (supportedLangs.length > 0) {
        return {
          answer: `Yes! Based on the codebase, this system supports ${supportedLangs.length} programming languages including: ${supportedLangs.slice(0, 5).join(', ')}${supportedLangs.length > 5 ? ', and more' : ''}. The code processes files in multiple languages for knowledge base generation.`,
          confidence: 0.9,
          languages: supportedLangs,
          evidence: searchResults.slice(0, 3).map(r => ({
            file: r.documentPath,
            language: r.documentLang
          }))
        };
      }
    } else {
      // Generic answer for other queries
      answer = `Based on your search for "${query}", here's what I found:\n\n`;

      // Try to extract meaningful context
      const meaningfulContexts = contexts.filter(c => c && c.length > 20);

      if (meaningfulContexts.length > 0) {
        answer += `📝 **Key findings**:\n`;

        // Clean up the context and make it presentable
        meaningfulContexts.slice(0, 2).forEach((ctx, idx) => {
          // Extract the most relevant part of the context
          const cleanContext = ctx.replace(/[\n\r\t]+/g, ' ').trim();
          const shortContext = cleanContext.length > 150 ?
            cleanContext.substring(0, 150) + '...' : cleanContext;
          answer += `${idx + 1}. ${shortContext}\n`;
        });
        answer += '\n';
      }

      answer += `📁 **Found in ${searchResults.length} location${searchResults.length > 1 ? 's' : ''}**:\n`;
      relevantFiles.slice(0, 4).forEach(file => {
        answer += `  • ${file}\n`;
      });

      // Add helpful context based on file types
      const primaryExt = Object.keys(fileTypes)[0];
      if (primaryExt === '.js' || primaryExt === '.ts' || primaryExt === '.jsx' || primaryExt === '.tsx') {
        answer += `\n💡 These are ${primaryExt} files containing JavaScript/TypeScript code.`;
      } else if (primaryExt === '.py') {
        answer += `\n💡 These are Python files.`;
      } else if (primaryExt === '.java') {
        answer += `\n💡 These are Java files.`;
      }
    }

    return {
      answer: answer,
      confidence: confidence,
      totalMatches: searchResults.length,
      topFiles: relevantFiles,
      evidence: searchResults.slice(0, 3).map(r => ({
        file: r.documentPath,
        lines: r.lines,
        context: r.contextSnippets[0] || r.preview
      }))
    };
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

Search Options:
  --kb <path>        Path to knowledge base (default: ./knowledge-base)
  --limit <n>        Limit number of results (default: 10)
  --verbose          Show detailed evidence for answers
  --raw              Show raw search results (old format)

Examples:
  node search.js search "does it support any language"
  node search.js search "initialize app" --verbose
  node search.js search "what languages" --raw
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
      const verbose = args.includes('--verbose');

      console.log(`\n🔍 Searching for: "${query}"\n`);

      const results = searcher.search(query, { limit });
      const answer = searcher.generateAnswer(query, results);

      // Display human-friendly answer
      console.log('💡 Answer:');
      console.log('─'.repeat(50));
      console.log(answer.answer);

      if (answer.confidence) {
        console.log(`\n📊 Confidence: ${(answer.confidence * 100).toFixed(0)}%`);
      }

      // Show evidence in verbose mode or if requested
      if (verbose && answer.evidence && answer.evidence.length > 0) {
        console.log('\n📚 Evidence:');
        console.log('─'.repeat(50));

        answer.evidence.forEach((ev, index) => {
          console.log(`${index + 1}. ${ev.file} (lines ${ev.lines})`);
          console.log(`   "${ev.context.substring(0, 150)}${ev.context.length > 150 ? '...' : ''}"`);
        });
      }

      // Show raw results if --raw flag is used
      if (args.includes('--raw')) {
        console.log('\n📋 Raw Search Results:');
        console.log('─'.repeat(50));

        results.forEach((result, index) => {
          console.log(`${index + 1}. 📄 ${result.documentPath}`);
          console.log(`   Lines: ${result.lines} | Score: ${result.score}`);
          console.log(`   Preview: ${result.preview.substring(0, 100)}...`);
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