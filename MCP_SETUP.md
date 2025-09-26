# MCP Server Setup for src-to-kb

This guide explains how to set up the src-to-kb MCP server with Claude Code, Cursor, and other MCP-compatible tools.

## Prerequisites

1. Node.js 14+ installed
2. npm or yarn package manager
3. Claude Code or Cursor with MCP support

## Installation

### Step 1: Install Dependencies

```bash
cd /path/to/src-to-kb
npm install
```

### Step 2: Configure Claude Code

Add the following to your Claude Code configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "src-to-kb": {
      "command": "node",
      "args": ["/Users/admin/Documents/AI-Playground/src-to-kb/mcp-server.mjs"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"  // Optional, for embeddings
      }
    }
  }
}
```

### Step 3: Configure Cursor (if using Cursor)

For Cursor, add to your settings:

```json
{
  "mcp.servers": {
    "src-to-kb": {
      "command": "node",
      "args": ["/path/to/src-to-kb/mcp-server.mjs"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available MCP Tools

Once configured, the following tools will be available in your IDE:

### 1. `generate_kb`
Generate a knowledge base from any source code repository.

**Example usage in Claude/Cursor:**
```
Generate a knowledge base from the current project
```

The assistant will use: `generate_kb` with appropriate parameters.

### 2. `search_kb`
Search the knowledge base with natural language queries.

**Example usage:**
```
Search for authentication implementations in the knowledge base
```

### 3. `get_kb_stats`
Get statistics about the knowledge base.

**Example usage:**
```
Show me statistics about the current knowledge base
```

### 4. `list_kb_files`
List all indexed files, with optional filtering.

**Example usage:**
```
List all TypeScript files in the knowledge base
```

### 5. `find_similar`
Find files similar to a given file.

**Example usage:**
```
Find files similar to src/auth/login.ts
```

### 6. `extract_code`
Extract specific code patterns.

**Example usage:**
```
Extract all React component definitions
```

### 7. `update_kb`
Update the knowledge base with new changes.

**Example usage:**
```
Update the knowledge base with latest changes
```

## Usage Examples

### In Claude Code

1. **Generate KB for current project:**
   - Open Claude Code in your project
   - Say: "Generate a knowledge base for this project"
   - Claude will automatically use the MCP tool

2. **Search for code patterns:**
   - "Find all API endpoint definitions"
   - "Show me where authentication is handled"
   - "What databases does this project use?"

3. **Analyze codebase:**
   - "What programming languages are used?"
   - "Show me the project statistics"
   - "Find files similar to the main configuration"

### In Cursor

Similar usage - the MCP tools integrate seamlessly with Cursor's AI features.

## Environment Variables

- `OPENAI_API_KEY`: Required only if you want to generate embeddings
- `KB_DEFAULT_PATH`: Override default knowledge base path (optional)

## Troubleshooting

### MCP Server Not Starting

1. Check that Node.js is installed:
   ```bash
   node --version
   ```

2. Verify the path in your configuration is correct

3. Check logs:
   - Claude Code: Check developer console
   - Cursor: Check output panel

### Tools Not Appearing

1. Restart your IDE after configuration
2. Ensure the MCP server path is absolute, not relative
3. Check that dependencies are installed:
   ```bash
   npm list @modelcontextprotocol/sdk
   ```

### Knowledge Base Not Found

The tools expect a knowledge base at `./knowledge-base` by default. Either:
1. Generate one first using `generate_kb`
2. Specify the path in tool parameters

## Advanced Configuration

### Custom Default Paths

Set environment variables in the MCP configuration:

```json
{
  "mcpServers": {
    "src-to-kb": {
      "command": "node",
      "args": ["/path/to/mcp-server.js"],
      "env": {
        "KB_DEFAULT_PATH": "/path/to/your/default/kb",
        "DEFAULT_CHUNK_SIZE": "1500",
        "DEFAULT_CHUNK_OVERLAP": "300"
      }
    }
  }
}
```

### Multiple Knowledge Bases

You can manage multiple knowledge bases by specifying different paths:

1. Generate: `generate_kb repoPath: "./project1" outputPath: "./kb-project1"`
2. Search: `search_kb query: "auth" kbPath: "./kb-project1"`

## Security Notes

- The MCP server runs locally on your machine
- No data is sent to external servers (except OpenAI for embeddings if configured)
- Knowledge bases are stored locally in your filesystem
- Follow AGPL-3.0 license terms for non-commercial use

## Support

For issues or questions:
- Open an issue on GitHub: https://github.com/vezlo/src-to-kb
- Check the main README for general usage
- Review test.js for example implementations