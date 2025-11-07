# MCP Tools Guide - Complete Reference

This guide provides comprehensive documentation for all MCP (Model Context Protocol) tools available in src-to-kb when integrated with Claude Code, Cursor, or other MCP-compatible assistants.

## Table of Contents

- [Available Tools Overview](#available-tools-overview)
- [Tool 1: generate_kb](#tool-1-generate_kb)
- [Tool 2: search_kb](#tool-2-search_kb)
- [Tool 3: get_kb_stats](#tool-3-get_kb_stats)
- [Tool 4: list_kb_files](#tool-4-list_kb_files)
- [Tool 5: find_similar](#tool-5-find_similar)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Available Tools Overview

The src-to-kb MCP server provides 5 specialized tools that enable AI assistants to interact with code knowledge bases:

| Tool | Purpose | Primary Use Case |
|------|---------|-----------------|
| `generate_kb` | Create knowledge bases | Index entire repositories |
| `search_kb` | Natural language search | Find code patterns and understand logic |
| `get_kb_stats` | Statistics and insights | Analyze codebase composition |
| `list_kb_files` | File listing with filters | Browse indexed content |
| `find_similar` | Similarity search | Find related files |

## Tool 1: generate_kb

### Purpose
Generates a searchable knowledge base from any source code repository by chunking, cleaning, and optionally creating embeddings.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `repoPath` | string | ✅ Yes | - | Path to the repository to process |
| `outputPath` | string | No | `./knowledge-base` | Output directory for the knowledge base |
| `chunkSize` | number | No | 1000 | Size of text chunks in characters |
| `chunkOverlap` | number | No | 200 | Overlap between chunks |
| `excludePaths` | array | No | `['node_modules', '.git', 'dist', 'build']` | Paths to exclude |
| `includeExtensions` | array | No | Common code extensions | File extensions to include |
| `generateEmbeddings` | boolean | No | false | Generate OpenAI embeddings |

### Example Natural Language Requests

```
"Generate a knowledge base for this project"
"Index the /src folder with 2000 character chunks"
"Create a KB for the backend directory excluding tests"
"Build a searchable index with embeddings enabled"
```

### Return Format

```json
{
  "success": true,
  "message": "Knowledge base generated successfully",
  "statistics": {
    "filesProcessed": 150,
    "totalSize": "5.2 MB",
    "totalChunks": 450
  },
  "outputPath": "./knowledge-base"
}
```

### Use Cases

1. **Initial Project Indexing** - Index an entire codebase when starting work
2. **Selective Indexing** - Index only specific folders or file types
3. **Documentation Generation** - Create searchable documentation from code
4. **AI Training Data** - Prepare code for RAG systems

---

## Tool 2: search_kb

### Purpose
Performs intelligent natural language search across the knowledge base with AI-powered answer generation.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ Yes | - | Natural language search query |
| `kbPath` | string | No | `./knowledge-base` | Path to knowledge base |
| `limit` | number | No | 10 | Maximum number of results |
| `includeContext` | boolean | No | true | Include AI-generated answer |

### Example Natural Language Requests

```
"How does the authentication system work?"
"Search for database connection logic"
"Find all API endpoints in the codebase"
"Where is user validation implemented?"
"What encryption methods are used?"
```

### Return Format

```json
{
  "query": "authentication system",
  "answer": "Based on the code analysis, the authentication system uses JWT tokens with a refresh token mechanism. The main logic is in auth/middleware.js which validates tokens on each request.",
  "confidence": "85%",
  "totalMatches": 15,
  "topFiles": [
    "auth/middleware.js",
    "auth/login.js",
    "auth/tokenManager.js"
  ]
}
```

### Use Cases

1. **Code Understanding** - Understand how specific features work
2. **Bug Investigation** - Find relevant code for debugging
3. **Architecture Discovery** - Learn about system design
4. **Security Audit** - Search for security-related code

---

## Tool 3: get_kb_stats

### Purpose
Provides comprehensive statistics about the indexed knowledge base.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `kbPath` | string | No | `./knowledge-base` | Path to knowledge base |

### Example Natural Language Requests

```
"Show me knowledge base statistics"
"What languages are in this codebase?"
"How many files are indexed?"
"Give me an overview of the KB"
```

### Return Format

```json
{
  "path": "./knowledge-base",
  "statistics": {
    "totalDocuments": 150,
    "totalChunks": 450,
    "totalSize": "5.2 MB",
    "languages": {
      "JavaScript": 45,
      "TypeScript": 38,
      "Python": 22,
      "Markdown": 15
    },
    "fileTypes": {
      "code": 105,
      "text": 15,
      "config": 20,
      "web": 10
    }
  }
}
```

### Use Cases

1. **Project Overview** - Quick understanding of codebase composition
2. **Language Distribution** - See what technologies are used
3. **Index Health Check** - Verify KB completeness
4. **Documentation** - Generate project statistics

---

## Tool 4: list_kb_files

### Purpose
Lists all files indexed in the knowledge base with optional filtering capabilities.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `kbPath` | string | No | `./knowledge-base` | Path to knowledge base |
| `filterByLanguage` | string | No | - | Filter by programming language |
| `filterByType` | string | No | - | Filter by file type (code/text/config/web) |

### Example Natural Language Requests

```
"List all TypeScript files"
"Show me Python files in the knowledge base"
"What JavaScript files are indexed?"
"Display all configuration files"
```

### Return Format

```json
{
  "totalFiles": 45,
  "filters": {
    "language": "TypeScript"
  },
  "files": [
    {
      "path": "src/components/Button.tsx",
      "language": "TypeScript",
      "size": "2.3 KB"
    },
    {
      "path": "src/utils/helpers.ts",
      "language": "TypeScript",
      "size": "5.1 KB"
    }
  ]
}
```

### Use Cases

1. **File Discovery** - Browse available files by type
2. **Language-Specific Work** - Focus on specific languages
3. **Project Structure** - Understand file organization
4. **Migration Planning** - Identify files for updates

---

## Tool 5: find_similar

### Purpose
Finds files similar to a given file based on structure, language, and content patterns.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filePath` | string | ✅ Yes | - | Relative path of file to compare |
| `kbPath` | string | No | `./knowledge-base` | Path to knowledge base |
| `limit` | number | No | 5 | Maximum similar files to return |

### Example Natural Language Requests

```
"Find files similar to auth/login.js"
"What files are like UserComponent.tsx?"
"Show similar configuration files to app.config.js"
"Find related test files to user.test.js"
```

### Return Format

```json
{
  "queryFile": "auth/login.js",
  "similarFiles": [
    {
      "path": "auth/register.js",
      "language": "JavaScript",
      "similarity": "85%"
    },
    {
      "path": "auth/logout.js",
      "language": "JavaScript",
      "similarity": "72%"
    }
  ]
}
```

### Use Cases

1. **Refactoring** - Find related files to update together
2. **Pattern Discovery** - Identify similar implementations
3. **Code Review** - Find comparable code for consistency
4. **Learning** - Find examples similar to current work

---

## Usage Examples

### Complete Workflow Example

```
User: "Help me understand this React project"

1. Claude uses generate_kb:
   "I'll index your React project first"
   → Generates KB with all JS/JSX/TS/TSX files

2. Claude uses get_kb_stats:
   "Let me check what we're working with"
   → Shows: 120 files, mostly TypeScript and JavaScript

3. User: "How does state management work?"
   Claude uses search_kb:
   → Finds Redux/Context API usage and explains

4. User: "Show me similar components to Button.tsx"
   Claude uses find_similar:
   → Lists IconButton.tsx, LinkButton.tsx, etc.
```

### Common Conversation Patterns

**Initial Setup:**
```
"Generate a knowledge base for this project"
"Index only the src folder"
"Create a KB excluding test files"
```

**Exploration:**
```
"What's in this codebase?"
"Show me the project statistics"
"List all Python files"
```

**Understanding:**
```
"How does authentication work?"
"Explain the database architecture"
"Where are API endpoints defined?"
```

**Development:**
```
"Find files similar to this component"
"Search for error handling patterns"
"Where is logging implemented?"
```

## Best Practices

### 1. Knowledge Base Generation

- **First Time**: Generate a complete KB when starting with a new project
- **Updates**: Regenerate when significant code changes occur
- **Selective**: Index only relevant folders for faster processing
- **Embeddings**: Enable for better semantic search (requires OpenAI API key)

### 2. Effective Searching

- **Natural Language**: Use conversational queries for best results
- **Specific Terms**: Include specific function/class names when known
- **Context**: Ask follow-up questions to refine searches

### 3. Performance Tips

- **Chunk Size**: Larger chunks (1500-2000) for more context
- **Exclusions**: Always exclude `node_modules`, `dist`, build folders
- **File Types**: Focus on relevant extensions for your work

### 4. Organization

- **Multiple KBs**: Create separate KBs for different projects
- **Naming**: Use descriptive output paths like `./frontend-kb`, `./backend-kb`
- **Regular Updates**: Refresh KB after major code changes

## Troubleshooting

### Common Issues and Solutions

**Issue: "Knowledge base not found"**
```
Solution: Generate a KB first with generate_kb tool
```

**Issue: "No results found"**
```
Solutions:
- Try broader search terms
- Check if files are indexed (use list_kb_files)
- Regenerate KB if files were recently added
```

**Issue: "MCP tools not available in Claude"**
```
Solutions:
1. Verify configuration in claude_desktop_config.json
2. Restart Claude Code completely
3. Check npm package is installed globally
4. Test with: npx @vezlo/src-to-kb src-to-kb-mcp
```

**Issue: "Embeddings not generating"**
```
Solution: Set OPENAI_API_KEY in MCP configuration
```

## Advanced Usage

### Custom Workflows

You can combine tools for powerful workflows:

1. **Code Review Workflow**
   ```
   generate_kb → search_kb (patterns) → find_similar → list_kb_files
   ```

2. **Documentation Workflow**
   ```
   generate_kb → get_kb_stats → list_kb_files (by type) → search_kb
   ```

3. **Refactoring Workflow**
   ```
   search_kb (old pattern) → find_similar → list_kb_files (affected)
   ```

### Integration Tips

- **CI/CD**: Generate KB as part of documentation pipeline
- **Team Sharing**: Share KB folders for consistent understanding
- **Git Hooks**: Auto-regenerate KB on major commits

## Security Notes

- All processing happens locally on your machine
- No code is sent to external servers (except optional OpenAI for embeddings)
- Knowledge bases are stored in your local filesystem
- Follow your organization's security policies for sensitive code

## Support

For issues or questions:
- GitHub Issues: https://github.com/vezlo/src-to-kb/issues
- Documentation: https://github.com/vezlo/src-to-kb
- NPM Package: https://www.npmjs.com/package/@vezlo/src-to-kb