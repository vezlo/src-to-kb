# Changelog

## [1.1.8] - 2025-09-26

### Fixed
- Re-release to update npm package with syntax fix

## [1.1.7] - 2025-09-26

### Fixed
- Fixed syntax error in search.js (removed extra closing brace)

## [1.1.6] - 2025-09-26

### Changed
- Updated to use GPT-5 model for AI-powered search

## [1.1.5] - 2025-09-26

### Added
- **AI-Powered Search**: Use OpenAI GPT-5 to intelligently understand queries and generate helpful answers
- Automatic fallback to basic search when OPENAI_API_KEY is not set
- Context-aware answers that understand typos, variations, and intent

### Fixed
- Search command now properly excludes --kb flag value from query string
- Improved argument parsing to handle flags in any position

## [1.1.4] - 2025-09-26

### Documentation
- Clarified usage of separate commands (src-to-kb vs src-to-kb-search)
- Added complete workflow examples showing two-step process
- Updated MCP installation for Claude Code's new CLI commands
- Added --kb parameter examples for all search operations

### Improved
- **Much better search answers**: Intelligent, context-aware responses for common queries
- Smart detection of password reset, authentication, API, database, and UI queries
- Structured answers with clear file locations, explanations, and actionable information
- Clearer error messages when commands are used incorrectly
- Better distinction between generate and search functionality

## [1.1.3] - 2025-09-26

### Fixed
- Re-release of 1.1.2 with proper npm publishing

### Changed
- Updated MCP installation instructions for Claude Code's new `claude mcp add` command
- Simplified MCP setup documentation with direct CLI commands
- Removed complex auto-installer in favor of simple manual command

## [1.1.2] - 2025-09-26

### Fixed
- Fixed `--help` flag not working properly
- Added `--version` flag support
- Help text now shows correct command names (src-to-kb instead of node kb-generator.js)
- CLI arguments properly handled
- Fixed `--embeddings` flag being treated as repository path

### Documentation
- Added "Available Commands" section to README for clarity
- Clarified that search uses `src-to-kb-search` not `src-to-kb search`
- Added more usage examples in Quick Start section

## [1.1.1] - 2025-09-26

### Changed
- Reorganized codebase structure for cleaner package
- Moved development scripts to `scripts/` directory
- Reduced npm package size by excluding non-essential files
- Fixed test script paths for new structure

### Package Structure
- Root directory now contains only essential executable files
- Development utilities moved to scripts/ (excluded from npm package)
- Cleaner, more professional package organization

## [1.1.0] - 2025-09-25

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

## [1.0.0] - 2025-09-25

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