# Source Code to Knowledge Base Generator with MCP Server

[![npm version](https://img.shields.io/npm/v/@vezlo/src-to-kb.svg)](https://www.npmjs.com/package/@vezlo/src-to-kb)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Convert any source code repository into a searchable knowledge base with automatic chunking, embedding generation, and intelligent search capabilities. Now with MCP (Model Context Protocol) support for Claude Code and Cursor integration!

📦 **Now available on npm!** Install with: `npm install -g @vezlo/src-to-kb`

## Available Commands

After installation, you'll have access to these commands:

- **`src-to-kb`** - Generate knowledge base from source code
- **`src-to-kb-search`** - Search the knowledge base
- **`src-to-kb-mcp`** - Start MCP server for IDE integration
- **`src-to-kb-mcp-install`** - Auto-configure Claude Code/Cursor

## Features

- 📁 **Multi-language Support**: JavaScript, TypeScript, Python, Java, C++, Go, Rust, and more
- 🔍 **Smart Chunking**: Intelligent code splitting with configurable overlap
- 🧹 **Code Cleaning**: Optional comment removal and whitespace normalization
- 🔢 **Embeddings**: Optional OpenAI embeddings for semantic search
- 📊 **Statistics**: Comprehensive analysis of your codebase
- 🚀 **Fast Processing**: Efficient file scanning and processing
- 💾 **Structured Storage**: Organized JSON output for easy integration
- 🤖 **MCP Server**: Direct integration with Claude Code, Cursor, and other MCP-compatible tools
- 💡 **AI-Powered Search**: Uses OpenAI GPT-3.5 for intelligent query understanding and helpful answers

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

### 4. Search the Knowledge Base

**IMPORTANT**: First generate a knowledge base, then search it:

```bash
# Step 1: Generate a knowledge base
src-to-kb ./your-project --output ./project-kb

# Step 2: Search the knowledge base
src-to-kb-search search "where is login path" --kb ./project-kb

# Or if using default location (./knowledge-base):
src-to-kb ./your-project
src-to-kb-search search "authentication implementation"

# Other search commands:
src-to-kb-search stats --kb ./project-kb
src-to-kb-search type JavaScript --kb ./project-kb
```

## Installation

### Option 1: Install from npm (Recommended) ✅

```bash
# Install globally from npm registry
npm install -g @vezlo/src-to-kb

# Now use the commands anywhere on your system
src-to-kb /path/to/repo                    # Generate knowledge base
src-to-kb-search search "your query"       # Search knowledge base
src-to-kb-mcp                              # Start MCP server for Claude/Cursor
```

### Option 2: Use with npx (No Installation)

```bash
# Run directly without installing
npx @vezlo/src-to-kb /path/to/repo
npx @vezlo/src-to-kb-search search "your query"
npx @vezlo/src-to-kb-mcp
```

### Option 3: Install in a Project

```bash
# Add as a project dependency
npm install @vezlo/src-to-kb

# Use with npx in your project
npx src-to-kb /path/to/repo
```

### Option 4: Clone from GitHub (For Development)

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

## Complete Example Workflow

```bash
# 1. Generate knowledge base from your frontend code
src-to-kb ./frontend/ --output ./frontend-kb

# 2. Search for specific functionality
src-to-kb-search search "forgot password" --kb ./frontend-kb
src-to-kb-search search "authentication flow" --kb ./frontend-kb

# 3. Get statistics about the codebase
src-to-kb-search stats --kb ./frontend-kb

# 4. List all TypeScript files
src-to-kb-search type TypeScript --kb ./frontend-kb
```

## More Examples

### Process Any Repository

```bash
# Using npm package
src-to-kb /path/to/repo --output ./repo-kb --embeddings

# Or with npx
npx @vezlo/src-to-kb /path/to/repo --output ./repo-kb --embeddings
```

### Process Only JavaScript and TypeScript Files

```bash
src-to-kb /path/to/repo --extensions .js,.ts,.jsx,.tsx
```

### Exclude Test and Build Directories

```bash
src-to-kb /path/to/repo --exclude tests,build,dist,coverage
```

### Large Repositories with Custom Chunking

```bash
src-to-kb /path/to/large-repo \
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

## MCP Server for Claude Code

### Quick Setup 🚀

```bash
# 1. Install the package globally (if not already installed)
npm install -g @vezlo/src-to-kb

# 2. Add to Claude Code
claude mcp add src-to-kb -- npx -y @vezlo/src-to-kb src-to-kb-mcp

# Or with OpenAI API key for embeddings:
claude mcp add src-to-kb --env OPENAI_API_KEY=your-key -- npx -y @vezlo/src-to-kb src-to-kb-mcp
```

### Managing the MCP Server

```bash
# Check if installed
claude mcp list

# Remove if needed
claude mcp remove src-to-kb

# Get server details
claude mcp get src-to-kb
```

### After Installation

1. **Restart Claude Code** completely
2. **Test by asking Claude:**
   - "Generate a knowledge base for this project"
   - "Search for authentication implementations"
   - "What languages does this codebase use?"
   - "Find files similar to config.js"

See [MCP_SETUP.md](MCP_SETUP.md) for manual setup and [MCP_TOOLS_GUIDE.md](MCP_TOOLS_GUIDE.md) for detailed tool documentation.

## Searching the Knowledge Base

### AI-Powered Search (with OpenAI)

When `OPENAI_API_KEY` is set, searches use GPT-3.5 for intelligent answers:

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your-api-key-here

# Get intelligent, context-aware answers
src-to-kb-search search "how does authentication work?" --kb ./project-kb
src-to-kb-search search "where is password reset?" --kb ./project-kb
```

### Basic Search (without OpenAI)

Without an API key, the tool provides basic keyword search:

```bash
# Basic search with pattern matching
src-to-kb-search search "authentication" --kb ./project-kb

# Find all JavaScript files
src-to-kb-search type JavaScript --kb ./project-kb

# Show statistics
src-to-kb-search stats --kb ./project-kb

# Find similar files
src-to-kb-search similar src/index.js --kb ./project-kb
```

### Search Options

```bash
# Specify knowledge base path
src-to-kb-search search "query" --kb ./my-knowledge-base

# Show detailed evidence
src-to-kb-search search "query" --verbose

# Get raw search results (old format)
src-to-kb-search search "query" --raw
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