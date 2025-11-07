# MCP Server Setup for src-to-kb

This guide explains how to set up the src-to-kb MCP server with Claude Code, Cursor, and other MCP-compatible tools.

📚 **For detailed information about available MCP tools and their usage, see [MCP_TOOLS_GUIDE.md](./MCP_TOOLS_GUIDE.md)**

## Prerequisites

1. Node.js 14+ installed
2. npm or yarn package manager
3. Claude Code or Cursor with MCP support

## Installation

### For Claude Code (Recommended) 🚀

```bash
# 1. First, ensure the package is installed globally:
npm install -g @vezlo/src-to-kb

# 2. Find your global npm installation path:
npm list -g @vezlo/src-to-kb --depth=0
# This will show the installation path

# 3. Add the MCP server to Claude Code using the full path:

# For macOS/Linux with nvm (adjust version number as needed):
claude mcp add src-to-kb -- node ~/.nvm/versions/node/v22.6.0/lib/node_modules/@vezlo/src-to-kb/mcp-server.mjs

# For macOS/Linux without nvm:
claude mcp add src-to-kb -- node /usr/local/lib/node_modules/@vezlo/src-to-kb/mcp-server.mjs

# For Windows:
claude mcp add src-to-kb -- node %APPDATA%\npm\node_modules\@vezlo\src-to-kb\mcp-server.mjs

# With OpenAI API key for embeddings:
claude mcp add src-to-kb --env OPENAI_API_KEY=your-key -- node [your-path]/mcp-server.mjs
```

**Note:** The `npx` approach may not work on all systems. Using the full path with `node` is more reliable.

That's it! The server is now available in Claude Code.

### For Claude Desktop (Manual Installation)

If you prefer to configure manually, add the following to your Claude Code configuration file:

**Config file locations:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

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

### Verify Installation in Claude Code

1. Open Claude Code
2. Type `/mcp` to see the MCP status
3. You should see `src-to-kb` in the list of servers

If you don't see it:
- Make sure you've installed the npm package first
- Try restarting Claude Code
- Check that `npx @vezlo/src-to-kb src-to-kb-mcp` works in your terminal

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

## Managing the MCP Server

```bash
# List all configured MCP servers
claude mcp list

# Get details about the src-to-kb server
claude mcp get src-to-kb

# Remove the server if needed
claude mcp remove src-to-kb

# Update with new API key
claude mcp remove src-to-kb
claude mcp add src-to-kb --env OPENAI_API_KEY=new-key -- npx -y @vezlo/src-to-kb src-to-kb-mcp
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

### MCP Server Not Showing in /mcp or "Failed to connect"

1. Ensure the package is installed globally:
   ```bash
   npm list -g @vezlo/src-to-kb
   ```

2. Find the exact installation path:
   ```bash
   # This will show where the package is installed
   npm list -g @vezlo/src-to-kb --depth=0

   # Or find the mcp-server.mjs file directly:
   find $(npm root -g) -name "mcp-server.mjs" 2>/dev/null | grep src-to-kb
   ```

3. Test the server directly:
   ```bash
   # Replace path with your actual installation path
   node ~/.nvm/versions/node/v22.6.0/lib/node_modules/@vezlo/src-to-kb/mcp-server.mjs
   # Should run without errors (no output is normal)
   ```

4. Re-add the server with the full path:
   ```bash
   claude mcp remove src-to-kb
   # Use the path from step 2
   claude mcp add src-to-kb -- node [your-full-path]/mcp-server.mjs
   ```

5. Verify connection:
   ```bash
   claude mcp list
   # Should show: src-to-kb ... ✓ Connected
   ```

6. Restart Claude Code completely

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