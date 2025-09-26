# Source Code to Knowledge Base Generator with MCP Server

Convert any source code repository into a searchable knowledge base with automatic chunking, embedding generation, and intelligent search capabilities. Now with MCP (Model Context Protocol) support for Claude Code and Cursor integration!

## Features

- 📁 **Multi-language Support**: JavaScript, TypeScript, Python, Java, C++, Go, Rust, and more
- 🔍 **Smart Chunking**: Intelligent code splitting with configurable overlap
- 🧹 **Code Cleaning**: Optional comment removal and whitespace normalization
- 🔢 **Embeddings**: Optional OpenAI embeddings for semantic search
- 📊 **Statistics**: Comprehensive analysis of your codebase
- 🚀 **Fast Processing**: Efficient file scanning and processing
- 💾 **Structured Storage**: Organized JSON output for easy integration
- 🤖 **MCP Server**: Direct integration with Claude Code, Cursor, and other MCP-compatible tools
- 💡 **AI-Powered Search**: Natural language queries with intelligent answer generation

## Quick Start

### 1. Basic Usage

Process your repository with default settings:

```bash
# If installed globally via npm
src-to-kb /path/to/your/repo

# Or using the script directly
node kb-generator.js /path/to/your/repo
```

### 2. With Custom Output Directory

```bash
src-to-kb /path/to/your/repo --output ./my-knowledge-base
```

### 3. With OpenAI Embeddings

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your-api-key-here

# Generate with embeddings
src-to-kb /path/to/your/repo --embeddings
```

## Installation

### Option 1: Install from npm (Recommended)

```bash
# Install globally
npm install -g @vezlo/src-to-kb

# Now use anywhere
src-to-kb /path/to/repo
src-to-kb-search search "your query"
src-to-kb-mcp  # Start MCP server
```

### Option 2: Install locally in a project

```bash
# Install as a dependency
npm install @vezlo/src-to-kb

# Use with npx
npx src-to-kb /path/to/repo
npx src-to-kb-search search "your query"
```

### Option 3: Clone from GitHub

```bash
# Clone the repository
git clone https://github.com/vezlo/src-to-kb.git
cd src-to-kb

# Install dependencies
npm install

# Run directly
node kb-generator.js /path/to/repo
```

## CLI Options

```
Usage: node kb-generator.js <repository-path> [options]

Options:
  --output, -o        Output directory (default: ./knowledge-base)
  --chunk-size        Chunk size in characters (default: 1000)
  --chunk-overlap     Overlap between chunks (default: 200)
  --max-file-size     Maximum file size in MB (default: 10)
  --embeddings        Generate OpenAI embeddings (requires OPENAI_API_KEY)
  --no-comments       Exclude comments from code
  --exclude           Additional paths to exclude (comma-separated)
  --extensions        File extensions to include (comma-separated)
```

## Examples

### Process SaaSBot Repository

```bash
node kb-generator.js ../SaaSBot --output ./saasbot-kb --embeddings
```

### Process Only JavaScript and TypeScript Files

```bash
node kb-generator.js /path/to/repo --extensions .js,.ts,.jsx,.tsx
```

### Exclude Test and Build Directories

```bash
node kb-generator.js /path/to/repo --exclude tests,build,dist,coverage
```

### Large Repositories with Custom Chunking

```bash
node kb-generator.js /path/to/large-repo \
  --chunk-size 2000 \
  --chunk-overlap 400 \
  --max-file-size 20
```

## Testing

Run the included test suite to verify functionality:

```bash
# Run comprehensive tests
node test.js

# This will:
# 1. Create a test repository with sample files
# 2. Process it into a knowledge base
# 3. Verify the output structure
# 4. Test chunking on large files
# 5. Verify language detection
```

## MCP Server for Claude Code & Cursor

### Setup MCP Server

1. **Configure Claude Code** - Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "src-to-kb": {
      "command": "npx",
      "args": ["@vezlo/src-to-kb-mcp"],
      "env": {
        "OPENAI_API_KEY": "optional-api-key"
      }
    }
  }
}
```

2. **Restart Claude Code** and use natural language:
   - "Generate a knowledge base for this project"
   - "Search for authentication implementations"
   - "What languages does this codebase use?"
   - "Find files similar to config.js"

See [MCP_SETUP.md](MCP_SETUP.md) for detailed configuration instructions.

## Searching the Knowledge Base

Use the included search tool to query your knowledge base:

```bash
# AI-powered search with natural language answers
node search.js search "how does authentication work?"

# Find all JavaScript files
node search.js type JavaScript

# Show statistics
node search.js stats

# Find similar files
node search.js similar src/index.js
```

### Search Options

```bash
# Specify knowledge base path
node search.js search "query" --kb ./my-knowledge-base

# Show detailed evidence
node search.js search "query" --verbose

# Get raw search results (old format)
node search.js search "query" --raw
```

## Output Structure

The generator creates the following directory structure:

```
knowledge-base/
├── documents/      # Document metadata (without content)
│   ├── doc_xxx.json
│   └── ...
├── chunks/         # Document chunks for searching
│   ├── doc_xxx.json
│   └── ...
├── embeddings/     # OpenAI embeddings (if enabled)
│   ├── doc_xxx.json
│   └── ...
└── metadata/       # Summary and statistics
    └── summary.json
```

### Document Format

Each document contains:

```json
{
  "id": "doc_1234567890_abc123",
  "path": "/full/path/to/file.js",
  "relativePath": "src/file.js",
  "fileName": "file.js",
  "extension": ".js",
  "size": 2048,
  "checksum": "sha256-hash",
  "metadata": {
    "createdAt": "2024-01-01T00:00:00.000Z",
    "modifiedAt": "2024-01-01T00:00:00.000Z",
    "lines": 100,
    "language": "JavaScript",
    "type": "code"
  }
}
```

### Chunk Format

Each chunk contains:

```json
{
  "id": "doc_xxx_chunk_0",
  "index": 0,
  "content": "chunk content here...",
  "startLine": 1,
  "endLine": 25,
  "size": 1000
}
```

## Use Cases

1. **Code Documentation**: Generate searchable documentation from your codebase
2. **AI Training**: Prepare code for fine-tuning or RAG systems
3. **Code Analysis**: Analyze patterns and structure across large repositories
4. **Knowledge Extraction**: Extract domain knowledge from source code
5. **Code Search**: Build intelligent code search systems
6. **IDE Integration**: Use directly in Claude Code or Cursor for code understanding
7. **Team Knowledge Sharing**: Create searchable knowledge bases for team onboarding

## Performance

- Processes ~1000 files/minute on average hardware
- Memory efficient - streams large files
- Parallel chunk processing
- Configurable file size limits

## Supported Languages

- JavaScript (.js, .jsx)
- TypeScript (.ts, .tsx)
- Python (.py)
- Java (.java)
- C/C++ (.c, .cpp, .h, .hpp)
- C# (.cs)
- Go (.go)
- Rust (.rs)
- Ruby (.rb)
- PHP (.php)
- Swift (.swift)
- Kotlin (.kt)
- Scala (.scala)
- And many more...

## Configuration Files

Also processes:
- JSON (.json)
- YAML (.yaml, .yml)
- XML (.xml)
- Markdown (.md)
- HTML/CSS (.html, .css, .scss)
- SQL (.sql)

## Tips

1. **Chunking Strategy**:
   - Use smaller chunks (500-1000) for precise search
   - Use larger chunks (2000-3000) for more context

2. **Overlap**:
   - 10-20% overlap helps maintain context between chunks
   - Increase overlap for code with many dependencies

3. **Exclusions**:
   - Always exclude node_modules, vendor, dist directories
   - Consider excluding auto-generated files

4. **File Size**:
   - Default 10MB limit prevents processing of large binaries
   - Increase for legitimate large source files

## Programmatic Usage

```javascript
const { KnowledgeBaseGenerator } = require('./kb-generator');

async function generateKB() {
  const generator = new KnowledgeBaseGenerator({
    outputPath: './my-kb',
    chunkSize: 1500,
    generateEmbeddings: true,
    openaiApiKey: 'your-api-key'
  });

  generator.on('fileProcessed', (data) => {
    console.log(`Processed: ${data.file}`);
  });

  const result = await generator.processRepository('/path/to/repo');
  console.log(`Generated KB with ${result.documents.length} documents`);
}

generateKB();
```

## License

This software is dual-licensed:

- **Non-Commercial Use**: Free under AGPL-3.0 license
- **Commercial Use**: Requires a commercial license - contact us for details

See [LICENSE](LICENSE) file for full details.

## Contributing

Feel free to submit issues and enhancement requests!