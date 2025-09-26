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

  async generateAnswerWithAI(query, searchResults) {
    if (!process.env.OPENAI_API_KEY) {
      // Fallback to basic answer generation without AI
      return this.generateAnswer(query, searchResults);
    }

    if (searchResults.length === 0) {
      return {
        answer: "I couldn't find any relevant information about that in the knowledge base.",
        confidence: 0
      };
    }

    try {
      // Prepare context from search results
      const context = searchResults.slice(0, 5).map(r => ({
        file: r.documentPath,
        lines: r.lines,
        content: r.fullContent || r.preview
      }));

      // Use OpenAI to understand query intent and generate answer
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-5',
          messages: [
            {
              role: 'system',
              content: `You are a helpful code search assistant. Analyze the user's query and the search results from their codebase to provide a clear, actionable answer.

              Format your response as follows:
              1. Directly answer the user's question
              2. Reference specific files and locations
              3. Provide step-by-step instructions if applicable
              4. Suggest related areas to explore

              Be concise but comprehensive. Use markdown formatting for clarity.`
            },
            {
              role: 'user',
              content: `Query: "${query}"\n\nSearch Results:\n${JSON.stringify(context, null, 2)}\n\nProvide a helpful answer based on these code search results.`
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      const data = await response.json();

      if (data.choices && data.choices[0]) {
        const aiAnswer = data.choices[0].message.content;
        const relevantFiles = [...new Set(searchResults.slice(0, 5).map(r => r.documentPath))];

        return {
          answer: aiAnswer + `\n\n📂 **Source files**: ${relevantFiles.slice(0, 3).join(', ')}`,
          confidence: 0.85,
          totalMatches: searchResults.length,
          topFiles: relevantFiles,
          aiGenerated: true
        };
      }
    } catch (error) {
      console.error('OpenAI API error:', error.message);
      // Fallback to basic answer generation
      return this.generateAnswer(query, searchResults);
    }

    // Fallback to basic answer generation
    return this.generateAnswer(query, searchResults);
  }

  generateAnswer(query, searchResults) {
    if (searchResults.length === 0) {
      return {
        answer: "I couldn't find any relevant information about that in the knowledge base.",
        confidence: 0
      };
    }

    // Basic analysis without AI
    const topResult = searchResults[0];
    const relevantFiles = [...new Set(searchResults.slice(0, 5).map(r => r.documentPath))];
    let confidence = Math.min(topResult.score / 50, 1);

    // Extract contexts
    const contexts = searchResults.slice(0, 3).map(r => r.contextSnippets || []).flat();
    const meaningfulContexts = contexts.filter(c => c && c.length > 20);

    let answer = `Based on your search for "${query}", I found relevant code in:\n\n`;

    if (meaningfulContexts.length > 0) {
      answer += `📝 **Key findings**:\n`;
      meaningfulContexts.slice(0, 3).forEach((ctx, idx) => {
        const cleanContext = ctx.replace(/[\n\r\t]+/g, ' ').trim();
        const shortContext = cleanContext.length > 200 ?
          cleanContext.substring(0, 200) + '...' : cleanContext;
        answer += `${idx + 1}. ${shortContext}\n`;
      });
      answer += '\n';
    }

    answer += `📁 **Found in ${searchResults.length} location${searchResults.length > 1 ? 's' : ''}**:\n`;
    relevantFiles.slice(0, 5).forEach(file => {
      answer += `  • ${file}\n`;
    });

    answer += `\n💡 To get AI-powered answers, set OPENAI_API_KEY environment variable.`;

    return {
      answer: answer,
      confidence: confidence,
      totalMatches: searchResults.length,
      topFiles: relevantFiles
    };
  }
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
  (async () => {
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

      // Extract query, excluding flags and their values
      const queryParts = [];
      for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--')) {
          // Skip flag and its value (if any)
          if (args[i] === '--kb' || args[i] === '--limit') {
            i++; // Skip the next argument (the value)
          }
          // Other boolean flags like --verbose, --raw don't have values
        } else {
          queryParts.push(args[i]);
        }
      }
      const query = queryParts.join(' ');
      const limit = args.includes('--limit')
        ? parseInt(args[args.indexOf('--limit') + 1])
        : 10;
      const verbose = args.includes('--verbose');

      console.log(`\n🔍 Searching for: "${query}"\n`);

      const results = searcher.search(query, { limit });
      // Use AI-powered answer generation if available
      const answer = await searcher.generateAnswerWithAI(query, results);

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
  })().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}