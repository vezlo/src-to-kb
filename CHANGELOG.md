# Changelog

## [1.3.1] - 2025-09-27

### Fixed
- 🔧 **Swagger Documentation**: All API endpoints now properly display in Swagger UI
- 📚 **API Spec**: Created separate swagger-spec.js with complete OpenAPI specification
- 🛠️ **Endpoint Paths**: Fixed path definitions for proper Swagger rendering

### Improved
- Enhanced API documentation with request/response examples
- Better organization of endpoints by category
- Added comprehensive schemas for all data models

## [1.3.0] - 2025-09-27

### Added
- 🌐 **REST API Server**: Comprehensive REST API with Swagger/OpenAPI documentation
- 📚 **Interactive API Docs**: Swagger UI available at `/api/v1/docs`
- 🔐 **API Authentication**: Optional API key authentication via `X-API-Key` header
- ⚡ **Async Processing**: Background knowledge base generation with status tracking
- 📁 **File Upload**: Process individual files via multipart upload
- 🔍 **Advanced Search API**: Search endpoints with mode selection support
- 📊 **Statistics Endpoints**: Get detailed KB analytics via API
- 🛡️ **Security Middleware**: Rate limiting, Helmet, CORS, compression
- 📝 **API Documentation**: Complete API_DOCUMENTATION.md with examples

### Features
- New CLI command: `src-to-kb-api` to start REST API server
- All core functionality exposed via REST endpoints
- Support for JavaScript, Python, cURL clients
- WebSocket support planned for future releases

## [1.2.0] - 2025-09-27

### Added
- 🎯 **Answer Modes**: Three distinct modes for different user types
  - `enduser` - Simplified, non-technical answers
  - `developer` - Full technical details with architecture info (default)
  - `copilot` - Code-focused answers with implementation examples
- 🔍 **Mode-based Filtering**: Each mode filters results appropriately
- 💡 **Custom AI Prompts**: Tailored prompts for each mode
- 📋 **Mode Selection**: `--mode` flag for search command
- 📊 **Modes Command**: New `modes` command to list available modes

### Changed
- Search now displays current mode when executing
- AI answers are formatted based on selected mode
- Result filtering excludes test files for end users
- Enhanced search relevance based on user type

### Documentation
- Added comprehensive Answer Modes section to README
- Updated examples to showcase different modes
- Added mode usage in Complete Example Workflow

## [1.1.12] - 2025-09-27

### Added
- 📝 **CONTRIBUTING.md**: Guidelines for contributing to the project
- 💬 **GitHub Discussions**: Enabled for community Q&A and feature requests
- 🤝 **Contribution Guide**: Clear instructions for reporting issues and submitting PRs

### Changed
- Updated license reference from MIT to AGPL-3.0 in contributing docs
- Added code of conduct for community interactions

## [1.1.11] - 2025-09-26

### Fixed
- Fixed MCP server installation instructions for better compatibility
- Added explicit node path instructions for MCP setup
- Updated troubleshooting guide with "Failed to connect" solutions

### Documentation
- Improved MCP installation guide with platform-specific paths
- Added instructions to find global npm installation path
- Enhanced troubleshooting section for connection issues

## [1.1.10] - 2025-09-26

### Fixed
- Fixed GPT-5 text extraction from deeply nested response structure
- GPT-5 responses now properly extract from `output[1].content[0].text`
- Cleaned up debug logging for cleaner output
- GPT-5 integration now fully functional with correct response parsing

## [1.1.9] - 2025-09-26

### Changed
- Updated to use GPT-5 with the correct Responses API (`/v1/responses`)
- Using GPT-5's reasoning capabilities with `medium` effort for balanced performance
- Added debug logging for API key detection
- Improved error messages for API failures

### Fixed
- AI-powered search now properly uses GPT-5's Responses API format
- Correctly handles GPT-5 response structure (`output_text` instead of `choices`)

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