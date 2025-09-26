# Changelog

## [1.1.1] - 2024-12-30

### Changed
- Reorganized codebase structure for cleaner package
- Moved development scripts to `scripts/` directory
- Reduced npm package size by excluding non-essential files
- Fixed test script paths for new structure

### Package Structure
- Root directory now contains only essential executable files
- Development utilities moved to scripts/ (excluded from npm package)
- Cleaner, more professional package organization

## [1.1.0] - 2024-12-30

### Added
- 🚀 **Automatic MCP Installer** - One-command installation with `npx @vezlo/src-to-kb install-mcp`
- 🔧 **MCP Management Commands** - Status check, API key update, and uninstall options
- 📚 **Comprehensive MCP Tools Guide** - Detailed documentation for all 5 MCP tools
- 🎯 **Simplified Setup** - No manual config file editing required

### Features
- Cross-platform installer (macOS, Windows, Linux)
- Automatic Claude configuration detection
- Config backup before modifications
- Optional OpenAI API key configuration
- Clean uninstall option

### Documentation
- Added MCP_TOOLS_GUIDE.md with detailed tool reference
- Updated README with simplified installation instructions
- Enhanced MCP_SETUP.md with automatic installation option

## [1.0.0] - 2024-12-29

### Initial Release
- 📁 Multi-language support for 20+ programming languages
- 🔍 Smart chunking with configurable overlap
- 🧹 Code cleaning with optional comment removal
- 🔢 Optional OpenAI embeddings for semantic search
- 📊 Comprehensive codebase statistics
- 💡 AI-powered natural language search
- 🤖 MCP server for Claude Code and Cursor integration
- 📦 Published to npm as @vezlo/src-to-kb

### Tools
- `src-to-kb` - Generate knowledge bases
- `src-to-kb-search` - Search with natural language
- `src-to-kb-mcp` - MCP server for IDE integration

### License
- Dual-licensed: AGPL-3.0 for non-commercial use
- Commercial license available for business use