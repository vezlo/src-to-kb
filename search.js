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
      console.log('⚠️  No OPENAI_API_KEY found in environment');
      // Fallback to basic answer generation without AI
      return this.generateAnswer(query, searchResults);
    }
    console.log('✅ Using AI-powered search with GPT-5');

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

      // Use OpenAI GPT-5 with Responses API
      const initialResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-5',
          input: `Query: "${query}"

Search Results from codebase:
${context.slice(0, 3).map(r => `File: ${r.file}\nContent: ${r.content.substring(0, 500)}...`).join('\n\n')}

Based on these search results, provide a helpful answer about what the code supports.`,
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          max_output_tokens: 2000
        })
      });

      let data = await initialResponse.json();
      const responseId = data.id;

      // Check for errors
      if (!initialResponse.ok || data.error) {
        console.error('❌ GPT-5 API Error!');
        console.error('Error details:', data.error || data);
        throw new Error(data.error?.message || `API returned ${initialResponse.status}`);
      }

      // Poll for complete response if status is incomplete
      let attempts = 0;
      const maxAttempts = 30; // Wait up to 30 seconds

      while (data.status === 'incomplete' && attempts < maxAttempts) {
        // Wait 1 second before polling
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get updated response
        const pollResponse = await fetch(`https://api.openai.com/v1/responses/${responseId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        data = await pollResponse.json();
        attempts++;
      }

      if (data.status === 'incomplete' && attempts >= maxAttempts) {
        throw new Error('GPT-5 response timed out after 30 seconds');
      }

      // console.log('📦 Final Response Data:', JSON.stringify(data, null, 2));

      // Extract text from GPT-5's nested output structure
      let aiAnswer = null;

      if (data.output && Array.isArray(data.output)) {
        // Look for message type output
        const messageOutput = data.output.find(item => item.type === 'message');
        if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
          // Find the output_text item in content array
          const textContent = messageOutput.content.find(c => c.type === 'output_text');
          if (textContent && textContent.text) {
            aiAnswer = textContent.text;
          }
        }

        // Fallback: look for direct text output
        if (!aiAnswer) {
          const textOutput = data.output.find(item => item.type === 'text');
          if (textOutput) {
            aiAnswer = textOutput.content || textOutput.text || textOutput.value;
          }
        }
      }

      if (aiAnswer) {
        const relevantFiles = [...new Set(searchResults.slice(0, 5).map(r => r.documentPath))];

        return {
          answer: aiAnswer + `\n\n📂 **Source files**: ${relevantFiles.slice(0, 3).join(', ')}`,
          confidence: 0.85,
          totalMatches: searchResults.length,
          topFiles: relevantFiles,
          aiGenerated: true
        };
      } else {
        console.error('❌ No recognized output field in response. Available fields:', Object.keys(data));
        throw new Error(`GPT-5 response missing expected field. Got fields: ${Object.keys(data).join(', ')}`);
      }
    } catch (error) {
      console.error('❌ GPT-5 API error details:', error.message);
      console.error('Full error:', error);

      // Return error in answer
      return {
        answer: `⚠️ **GPT-5 API Error**: ${error.message}\n\nPlease check:\n1. Your OpenAI API key has access to GPT-5\n2. The GPT-5 model is available in your region\n3. Your API key is valid and has sufficient credits\n\nFalling back to basic search results...`,
        confidence: 0,
        error: true
      };
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