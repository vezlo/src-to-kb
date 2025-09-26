#!/usr/bin/env node

const { KnowledgeBaseGenerator } = require('../kb-generator');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_REPO_PATH = path.join(__dirname, '..', 'test-repo');
const KB_OUTPUT_PATH = path.join(__dirname, '..', 'test-output');

// Create a simple test repository
function createTestRepository() {
  console.log('📦 Creating test repository...\n');

  // Clean up if exists
  if (fs.existsSync(TEST_REPO_PATH)) {
    fs.rmSync(TEST_REPO_PATH, { recursive: true, force: true });
  }

  // Create test directory structure
  fs.mkdirSync(path.join(TEST_REPO_PATH, 'src', 'components'), { recursive: true });
  fs.mkdirSync(path.join(TEST_REPO_PATH, 'src', 'utils'), { recursive: true });
  fs.mkdirSync(path.join(TEST_REPO_PATH, 'docs'), { recursive: true });

  // Create sample JavaScript file
  fs.writeFileSync(
    path.join(TEST_REPO_PATH, 'src', 'index.js'),
    `// Main application entry point
import { App } from './components/App';
import { config } from './config';

/**
 * Initialize the application
 * @param {Object} options - Configuration options
 */
function initialize(options = {}) {
  const app = new App({
    ...config,
    ...options
  });

  app.on('ready', () => {
    console.log('Application is ready');
  });

  return app.start();
}

// Export main function
export { initialize };

// Start app if running directly
if (require.main === module) {
  initialize({
    port: process.env.PORT || 3000,
    debug: process.env.DEBUG === 'true'
  });
}
`
  );

  // Create sample TypeScript file
  fs.writeFileSync(
    path.join(TEST_REPO_PATH, 'src', 'components', 'App.ts'),
    `import { EventEmitter } from 'events';

interface AppConfig {
  port: number;
  debug: boolean;
  name?: string;
}

export class App extends EventEmitter {
  private config: AppConfig;
  private isRunning: boolean = false;

  constructor(config: AppConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('App is already running');
    }

    this.isRunning = true;
    this.emit('starting');

    // Simulate startup process
    await this.initialize();

    this.emit('ready');
    console.log(\`App started on port \${this.config.port}\`);
  }

  private async initialize(): Promise<void> {
    // Initialization logic
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  stop(): void {
    this.isRunning = false;
    this.emit('stopped');
  }
}
`
  );

  // Create sample Python file
  fs.writeFileSync(
    path.join(TEST_REPO_PATH, 'src', 'utils', 'helpers.py'),
    `"""
Utility helper functions for the application
"""

import json
import hashlib
from typing import Dict, List, Any

def load_config(file_path: str) -> Dict[str, Any]:
    """
    Load configuration from a JSON file

    Args:
        file_path: Path to the configuration file

    Returns:
        Dictionary containing configuration values
    """
    with open(file_path, 'r') as f:
        return json.load(f)

def generate_hash(data: str) -> str:
    """
    Generate SHA256 hash of input string

    Args:
        data: Input string to hash

    Returns:
        Hexadecimal hash string
    """
    return hashlib.sha256(data.encode()).hexdigest()

def process_items(items: List[Dict]) -> List[Dict]:
    """
    Process a list of items with validation
    """
    processed = []
    for item in items:
        if validate_item(item):
            item['processed'] = True
            processed.append(item)
    return processed

def validate_item(item: Dict) -> bool:
    """
    Validate an item has required fields
    """
    required_fields = ['id', 'name', 'value']
    return all(field in item for field in required_fields)

# Constants
DEFAULT_TIMEOUT = 30
MAX_RETRIES = 3
SUPPORTED_FORMATS = ['json', 'yaml', 'xml']
`
  );

  // Create README
  fs.writeFileSync(
    path.join(TEST_REPO_PATH, 'README.md'),
    `# Test Repository

This is a test repository for demonstrating the knowledge base generator.

## Features

- JavaScript/TypeScript support
- Python utilities
- Comprehensive documentation
- Automated testing

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`javascript
import { initialize } from './src/index';

const app = initialize({
  port: 3000,
  debug: true
});
\`\`\`

## API Reference

### initialize(options)

Initialize the application with the given options.

- \`options.port\` - Server port number
- \`options.debug\` - Enable debug mode

## Contributing

Please read CONTRIBUTING.md for details on our code of conduct.
`
  );

  // Create a larger file to test chunking
  const largeContent = [];
  for (let i = 0; i < 100; i++) {
    largeContent.push(`
function section${i}() {
  // This is section ${i} of the code
  const data = processData(${i});
  const result = transformData(data);

  // Add some more lines to make chunks
  console.log('Processing section ${i}');
  console.log('Data:', data);
  console.log('Result:', result);

  return {
    section: ${i},
    data: data,
    result: result,
    timestamp: new Date().toISOString()
  };
}
`);
  }

  fs.writeFileSync(
    path.join(TEST_REPO_PATH, 'src', 'large-file.js'),
    largeContent.join('\n')
  );

  console.log('✅ Test repository created at:', TEST_REPO_PATH);
}

// Run tests
async function runTests() {
  console.log('🧪 Source-to-KB Generator Test Suite');
  console.log('=' .repeat(50) + '\n');

  // Clean up previous output
  if (fs.existsSync(KB_OUTPUT_PATH)) {
    fs.rmSync(KB_OUTPUT_PATH, { recursive: true, force: true });
  }

  // Create test repository
  createTestRepository();

  // Test 1: Basic knowledge base generation
  console.log('\n📝 Test 1: Basic KB Generation');
  console.log('-'.repeat(50));

  const generator = new KnowledgeBaseGenerator({
    outputPath: KB_OUTPUT_PATH,
    chunkSize: 500,
    chunkOverlap: 50,
    includeComments: true
  });

  let fileCount = 0;
  generator.on('fileProcessed', (data) => {
    fileCount++;
  });

  const result = await generator.processRepository(TEST_REPO_PATH);

  console.log(`\n✅ Test 1 Results:`);
  console.log(`   Files processed: ${fileCount}`);
  console.log(`   Documents created: ${result.documents.length}`);
  console.log(`   Total chunks: ${result.stats.totalChunks}`);

  // Test 2: Verify output structure
  console.log('\n📝 Test 2: Verify Output Structure');
  console.log('-'.repeat(50));

  const dirs = ['documents', 'chunks', 'metadata'];
  let allDirsExist = true;

  dirs.forEach(dir => {
    const dirPath = path.join(KB_OUTPUT_PATH, dir);
    const exists = fs.existsSync(dirPath);
    console.log(`   ${exists ? '✅' : '❌'} ${dir}/ directory exists`);
    if (!exists) allDirsExist = false;
  });

  // Test 3: Verify metadata
  console.log('\n📝 Test 3: Verify Metadata');
  console.log('-'.repeat(50));

  const metadataPath = path.join(KB_OUTPUT_PATH, 'metadata', 'summary.json');
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log(`   ✅ Metadata file exists`);
    console.log(`   📊 Files: ${metadata.stats.filesProcessed}`);
    console.log(`   📦 Size: ${(metadata.stats.totalSize / 1024).toFixed(2)} KB`);
    console.log(`   🔢 Chunks: ${metadata.stats.totalChunks}`);
  } else {
    console.log(`   ❌ Metadata file not found`);
  }

  // Test 4: Test chunking on large file
  console.log('\n📝 Test 4: Chunking Large Files');
  console.log('-'.repeat(50));

  const largeFileDoc = result.documents.find(d => d.fileName === 'large-file.js');
  if (largeFileDoc) {
    console.log(`   ✅ Large file processed`);
    console.log(`   📄 File size: ${(largeFileDoc.size / 1024).toFixed(2)} KB`);
    console.log(`   🔢 Chunks created: ${largeFileDoc.chunks.length}`);

    // Verify chunk overlap
    if (largeFileDoc.chunks.length > 1) {
      const chunk1End = largeFileDoc.chunks[0].content.substring(
        largeFileDoc.chunks[0].content.length - 50
      );
      const chunk2Start = largeFileDoc.chunks[1].content.substring(0, 50);
      console.log(`   ✅ Chunks have overlap: ${chunk1End.includes(chunk2Start.substring(0, 20))}`);
    }
  }

  // Test 5: Language detection
  console.log('\n📝 Test 5: Language Detection');
  console.log('-'.repeat(50));

  const languages = new Set();
  result.documents.forEach(doc => {
    languages.add(doc.metadata.language);
  });

  console.log(`   Languages detected: ${Array.from(languages).join(', ')}`);

  // Test summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`✅ All tests completed`);
  console.log(`📁 Test repo: ${TEST_REPO_PATH}`);
  console.log(`📦 Output: ${KB_OUTPUT_PATH}`);

  // Clean up test repository (optional)
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\n🗑️  Clean up test files? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      fs.rmSync(TEST_REPO_PATH, { recursive: true, force: true });
      fs.rmSync(KB_OUTPUT_PATH, { recursive: true, force: true });
      console.log('✅ Test files cleaned up');
    } else {
      console.log('📁 Test files preserved for inspection');
    }
    rl.close();
    process.exit(0);
  });
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});