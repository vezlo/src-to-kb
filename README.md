# Source Code to Knowledge Base Generator with MCP Server

[![npm version](https://img.shields.io/npm/v/@vezlo/src-to-kb.svg)](https://www.npmjs.com/package/@vezlo/src-to-kb)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Convert any source code repository into a searchable knowledge base with automatic chunking, embedding generation, and intelligent search capabilities. Now with MCP (Model Context Protocol) support for Claude Code and Cursor integration!

📦 **Now available on npm!** Install with: `npm install -g @vezlo/src-to-kb`

## Available Commands

After installation, you'll have access to these commands:

- **`src-to-kb`** - Generate knowledge base from source code
- **`src-to-kb-search`** - Search the knowledge base
- **`src-to-kb-api`** - Start REST API server with Swagger docs
- **`src-to-kb-mcp`** - Start MCP server for IDE integration
- **`src-to-kb-mcp-install`** - Auto-configure Claude Code/Cursor

## Features

- 📁 **Multi-language Support**: JavaScript, TypeScript, Python, Java, C++, Go, Rust, and more
- 📝 **Notion Integration**: Import pages and databases directly from Notion (NEW!)
- 🎯 **Answer Modes**: Three modes for different users - End User (simple), Developer (technical), Copilot (code-focused)
- 🌐 **REST API**: Full-featured API with Swagger documentation for integration with external services
- 🔍 **Smart Chunking**: Intelligent code splitting with configurable overlap
- 🧹 **Code Cleaning**: Optional comment removal and whitespace normalization
- 🔢 **Embeddings**: Optional OpenAI embeddings for semantic search
- 📊 **Statistics**: Comprehensive analysis of your codebase
- 🚀 **Fast Processing**: Efficient file scanning and processing
- 💾 **Structured Storage**: Organized JSON output for easy integration
- 🤖 **MCP Server**: Direct integration with Claude Code, Cursor, and other MCP-compatible tools
- 💡 **AI-Powered Search**: Uses OpenAI GPT-5 (latest reasoning model) for intelligent query understanding and helpful answers
- 🔐 **API Authentication**: Optional API key authentication for secure access
- 🌐 **External Server Integration**: Send code to external servers for processing and search via REST API

## Quick Start

### 🚀 For Existing Projects (Next.js, React, etc.)

```bash
# Install globally
npm install -g @vezlo/src-to-kb

# Generate KB from your project
src-to-kb ./my-nextjs-app --output ./my-kb

# Start API server
src-to-kb-api

# Search your codebase
src-to-kb-search search "How does routing work?" --mode developer
```

**That's it!** Your codebase is now searchable with AI assistance.

## External Server Integration 🌐

### 🚀 Try It Now with Public Demo Server

Experience external server integration immediately with our production-ready assistant-server:

```bash
# Generate knowledge base using assistant-server
EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items src-to-kb ./your-repo

# With API key authentication
EXTERNAL_KB_URL=https://your-assistant-server.com/api/knowledge/items EXTERNAL_KB_API_KEY=your-api-key src-to-kb ./your-repo

# Search using assistant-server
EXTERNAL_KB_URL=https://your-assistant-server.com/api/search src-to-kb-search search "how does authentication work?"

# Search with API key
EXTERNAL_KB_URL=https://your-assistant-server.com/api/search EXTERNAL_KB_API_KEY=your-api-key src-to-kb-search search "how does authentication work?"
```

**Assistant Server**: [vezlo/assistant-server](https://github.com/vezlo/assistant-server) - Production-ready Node.js/TypeScript API server with vector search and Docker deployment

### 🏢 Enterprise Setup

For production deployments or custom servers:

📖 **Complete Guide**: [External Server Setup Guide](https://github.com/vezlo/src-to-kb/blob/main/docs/EXTERNAL_SERVER_ENV.md)

## Notion Integration 📝

**NEW!** Import your Notion pages and databases directly into your knowledge base! Perfect for combining documentation, project plans, and code knowledge in one searchable system.

### Quick Start with Notion

```bash
# 1. Get your Notion API key (see full guide below)
export NOTION_API_KEY=secret_xxx

# 2. Generate KB from a Notion page
src-to-kb --source=notion --notion-url=https://notion.so/Your-Page-abc123

# 3. Or fetch all pages from a Notion database
src-to-kb --source=notion --notion-url=https://notion.so/Database-xyz789

# 4. Search your Notion content
src-to-kb-search search "your query" --kb ./knowledge-base/notion
```

### With External Server

Send Notion content directly to your assistant-server:

```bash
# Set external server URL
export EXTERNAL_KB_URL=http://localhost:3002/api/knowledge/items
export EXTERNAL_KB_API_KEY=your-api-key

# Fetch from Notion and send to server
src-to-kb --source=notion --notion-url=https://notion.so/Your-Page-abc123

# Search via external server
export EXTERNAL_KB_URL=http://localhost:3002/api/knowledge/search
src-to-kb-search search "your query"
```

### Features

- ✅ **Auto-detection**: Automatically detects if URL is a page or database
- ✅ **Single Page**: Fetch individual Notion pages
- ✅ **Database Support**: Fetch all pages from a Notion database
- ✅ **Rich Content**: Preserves formatting, headings, lists, code blocks, and more
- ✅ **Separate KB**: Notion content saved to `./knowledge-base/notion` by default
- ✅ **External Server**: Send directly to assistant-server for production use

### Examples

```bash
# Single page (local KB)
src-to-kb --source=notion --notion-url=https://notion.so/Project-Docs-abc123

# Database with all pages (local KB)
src-to-kb --source=notion --notion-url=https://notion.so/Team-Wiki-xyz789

# With API key as parameter
src-to-kb --source=notion --notion-key=secret_xxx --notion-url=https://notion.so/Page-abc123

# Send to external server
EXTERNAL_KB_URL=http://localhost:3002/api/knowledge/items \
EXTERNAL_KB_API_KEY=your-key \
src-to-kb --source=notion --notion-url=https://notion.so/Page-abc123

# Search local Notion KB
src-to-kb-search search "project timeline" --kb ./knowledge-base/notion

# Search via external server
EXTERNAL_KB_URL=http://localhost:3002/api/knowledge/search \
src-to-kb-search search "project timeline"
```

📖 **Complete Notion Guide**: [Notion Integration Documentation](https://github.com/vezlo/src-to-kb/blob/main/docs/NOTION_INTEGRATION.md) - Includes setup instructions, API key creation, sharing pages/databases, and troubleshooting

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

### 4. Search with Answer Modes

Choose the right answer mode for your needs:

```bash
# First generate a knowledge base
src-to-kb ./your-project --output ./project-kb

# Search with different modes:

# End User Mode - Simple, non-technical answers
src-to-kb-search search "how do I reset password?" --kb ./project-kb --mode enduser

# Developer Mode - Technical details and architecture (default)
src-to-kb-search search "authentication flow" --kb ./project-kb --mode developer

# Copilot Mode - Code examples and implementation patterns
src-to-kb-search search "implement user login" --kb ./project-kb --mode copilot

# View available modes
src-to-kb-search modes
```

## Answer Modes 🎯

The search tool adapts its responses based on who's asking:

| Mode | For | Description | Example Use Case |
|------|-----|-------------|------------------|
| **`enduser`** | Non-technical users | Simple explanations without technical jargon, focuses on features and capabilities | Product managers, business stakeholders asking about features |
| **`developer`** | Software developers | Full technical details including architecture, dependencies, and implementation details | Engineers understanding codebase structure and design patterns |
| **`copilot`** | Coding assistance | Code examples, snippets, and implementation patterns ready to use | Developers looking for code to copy/adapt for their implementation |

### Mode Examples

```bash
# CEO asks: "What payment methods do we support?"
src-to-kb-search search "payment methods" --mode enduser
# Returns: Simple list of supported payment options

# Developer asks: "How is payment processing implemented?"
src-to-kb-search search "payment processing" --mode developer
# Returns: Technical details about payment gateway integration, API endpoints, error handling

# Developer needs: "Show me payment integration code"
src-to-kb-search search "payment integration" --mode copilot
# Returns: Actual code snippets for payment implementation
```

### How Modes Work

- **Filtering**: Each mode filters results differently (e.g., end users don't see test files)
- **AI Prompts**: Custom prompts guide AI to give appropriate responses
- **Formatting**: Answers are formatted based on the audience (code blocks for developers, plain text for end users)
- **Context**: Technical depth is adjusted (high for developers, low for end users)

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
       node kb-generator.js --source=notion [notion-options] [options]

Options:
  --output, -o        Output directory (default: ./knowledge-base)
  --chunk-size        Chunk size in characters (default: 1000)
  --chunk-overlap     Overlap between chunks (default: 200)
  --max-file-size     Maximum file size in MB (default: 10)
  --embeddings        Generate OpenAI embeddings (requires OPENAI_API_KEY)
  --no-comments       Exclude comments from code
  --exclude           Additional paths to exclude (comma-separated)
  --extensions        File extensions to include (comma-separated)

Notion Options (use with --source=notion):
  --source            Source type: code (default) or notion
  --notion-key        Notion API integration token (or set NOTION_API_KEY env var)
  --notion-url        Notion page or database URL (auto-detects type)
```

## Complete Example Workflow

```bash
# 1. Generate knowledge base from your frontend code
src-to-kb ./frontend/ --output ./frontend-kb

# 2. Different users asking different questions:

# Product Manager asks about features
src-to-kb-search search "password reset feature" --kb ./frontend-kb --mode enduser

# Developer investigates technical implementation
src-to-kb-search search "authentication flow" --kb ./frontend-kb --mode developer

# Developer needs code examples
src-to-kb-search search "login component implementation" --kb ./frontend-kb --mode copilot

# 3. Get statistics about the codebase
src-to-kb-search stats --kb ./frontend-kb

# 4. List all TypeScript files
src-to-kb-search type TypeScript --kb ./frontend-kb

# 5. View available answer modes
src-to-kb-search modes
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

## REST API Server

The Source-to-KB REST API provides programmatic access to all functionality with comprehensive Swagger documentation.

### Starting the API Server

```bash
# Start with defaults (port 3000, no authentication)
src-to-kb-api

# With custom port and API key
PORT=8080 API_KEY=your-secret-key src-to-kb-api

# With all options
PORT=8080 API_KEY=secret OPENAI_API_KEY=sk-... src-to-kb-api
```

### API Documentation

Once started, visit: `http://localhost:3000/api/v1/docs` for interactive Swagger UI

### Key Endpoints

- `POST /api/v1/knowledge-bases` - Create new knowledge base
- `POST /api/v1/search` - Search with mode selection
- `GET /api/v1/modes` - List available answer modes
- `GET /api/v1/statistics/{id}` - Get KB statistics
- `POST /api/v1/process-file` - Process single file

### Example API Usage

```javascript
// Create knowledge base
const response = await fetch('http://localhost:3000/api/v1/knowledge-bases', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    name: 'My Project',
    sourcePath: '/path/to/project',
    options: { chunkSize: 1500 }
  })
});

// Search with mode
const searchResponse = await fetch('http://localhost:3000/api/v1/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    query: 'authentication',
    knowledgeBaseId: 'abc123',
    mode: 'developer'
  })
});
```

For complete API documentation, see [API_DOCUMENTATION.md](https://github.com/vezlo/src-to-kb/blob/main/docs/API_DOCUMENTATION.md)

## MCP Server for Claude Code

### Quick Setup 🚀

```bash
# 1. Install the package globally
npm install -g @vezlo/src-to-kb

# 2. Find your global npm installation path
npm list -g @vezlo/src-to-kb --depth=0

# 3. Add to Claude Code (replace the path with your npm global path)
# For macOS/Linux with nvm:
claude mcp add src-to-kb -- node ~/.nvm/versions/node/v22.6.0/lib/node_modules/@vezlo/src-to-kb/mcp-server.mjs

# For macOS/Linux without nvm:
claude mcp add src-to-kb -- node /usr/local/lib/node_modules/@vezlo/src-to-kb/mcp-server.mjs

# For Windows:
claude mcp add src-to-kb -- node %APPDATA%\npm\node_modules\@vezlo\src-to-kb\mcp-server.mjs

# With OpenAI API key for embeddings:
claude mcp add src-to-kb --env OPENAI_API_KEY=your-key -- node [your-path]/mcp-server.mjs
```

#### Alternative: Using npx (if the above doesn't work)

```bash
# Try with npx (may not work on all systems)
claude mcp add src-to-kb -- npx -y @vezlo/src-to-kb src-to-kb-mcp
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

See [MCP_SETUP.md](https://github.com/vezlo/src-to-kb/blob/main/docs/MCP_SETUP.md) for manual setup and [MCP_TOOLS_GUIDE.md](https://github.com/vezlo/src-to-kb/blob/main/docs/MCP_TOOLS_GUIDE.md) for detailed tool documentation.

## Searching the Knowledge Base

### Answer Modes

The search tool supports three different answer modes to tailor responses based on your needs:

- **`enduser`**: Simplified answers for non-technical users, focusing on features and capabilities
- **`developer`**: Detailed technical answers including architecture and implementation details (default)
- **`copilot`**: Code-focused answers with examples and patterns for implementation

```bash
# Examples with different modes
src-to-kb-search search "how to use API?" --mode enduser      # Simple explanation
src-to-kb-search search "authentication flow" --mode developer # Technical details
src-to-kb-search search "login implementation" --mode copilot  # Code examples

# List available modes
src-to-kb-search modes
```

### AI-Powered Search (with OpenAI)

When `OPENAI_API_KEY` is set, searches use GPT-5 (OpenAI's latest reasoning model) for intelligent answers:

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your-api-key-here

# Get intelligent, context-aware answers with mode selection
src-to-kb-search search "how does authentication work?" --kb ./project-kb --mode developer
src-to-kb-search search "where is password reset?" --kb ./project-kb --mode enduser
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

# Select answer mode
src-to-kb-search search "query" --mode enduser|developer|copilot

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

## 🔧 Integration with Existing Projects

### Next.js / React Integration

Transform your frontend codebase into a searchable knowledge base with AI-powered assistance:

#### Quick Setup

```bash
# 1. Generate knowledge base from your project
src-to-kb /path/to/nextjs-app --output ./nextjs-kb

# 2. Start the API server
src-to-kb-api

# 3. Query your codebase
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How is authentication implemented?", "knowledgeBaseId": "your-kb-id", "mode": "developer"}'
```

#### React Component Example

```jsx
// components/CodeSearch.jsx
import { useState } from 'react';

export default function CodeSearch() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);

  const search = async () => {
    const response = await fetch('http://localhost:3000/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        knowledgeBaseId: 'your-kb-id',
        mode: 'developer'
      })
    });
    const data = await response.json();
    setResult(data);
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask about your codebase..."
      />
      <button onClick={search}>Search</button>
      {result && <div>{result.answer}</div>}
    </div>
  );
}
```

#### Integration Ideas

- **🎓 Onboarding Assistant**: Help new developers understand your codebase
- **📖 In-App Documentation**: Provide context-aware help within your application
- **🔍 Code Review Helper**: Find similar patterns and best practices
- **🤖 Development Copilot**: Get AI suggestions based on your existing code
- **📊 Code Analytics Dashboard**: Visualize codebase statistics and complexity

### CI/CD Integration

```yaml
# GitHub Actions example
name: Update Knowledge Base
on: [push]
jobs:
  update-kb:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install -g @vezlo/src-to-kb
      - run: src-to-kb . --output ./kb
      # Upload KB as artifact or deploy to server
```

### Enterprise Setup

For production environments:

```bash
# Start with authentication and custom port
API_KEY=secure-key PORT=8080 src-to-kb-api

# Use with Docker
docker run -p 3000:3000 -e API_KEY=secret vezlo/src-to-kb-api
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