# Changelog

## [1.5.0] - 2025-12-09

### Changed
- **Flag Names**: Renamed `--embeddings` to `--with-embeddings` and added `--chunks-only` flag for clarity
- **Embedding Model**: Upgraded from `text-embedding-ada-002` to `text-embedding-3-large` (3072 dimensions)
- **Payload Structure**: Enhanced to support chunks array with `hasEmbeddings` flag for external server integration
- **Upload Command**: Added `--chunks-only` and `--with-embeddings` flags to upload command
- **Search URL**: `EXTERNAL_KB_SEARCH_URL` is now required (no auto-generation) for external server search operations

### Added
- **Chunks Support**: `--chunks-only` flag to create chunks locally (useful with external server)
- **Processing Modes Table**: Added comprehensive table in README showing all mode/flag combinations
- **Early Validation**: OpenAI API key and external server validation before processing starts
- **Validation Utilities**: Centralized validation functions in `validation-utils.js` to eliminate code duplication
- **Server Health Check**: External server validation now includes `/health` endpoint check before processing
- **Separate Search URL**: `EXTERNAL_KB_SEARCH_URL` environment variable for independent search endpoint configuration

### Fixed
- Improved error handling for invalid API keys and server authentication failures
- Better error messages with actionable guidance
- Removed duplicate error logging in validation flow
- Search command now requires explicit `EXTERNAL_KB_SEARCH_URL` when using external server

## [1.4.0] - 2025-01-06

### Added
- **Notion Integration**: Import Notion pages and databases directly into knowledge base
- **CLI Options**: `--source=notion`, `--notion-url`, `--notion-key` for Notion integration
- **Auto-detection**: Automatically detects page vs database from URL
- **External Server Support**: Send Notion content to assistant-server
- **Documentation**: Complete guide in [docs/NOTION_INTEGRATION.md](https://github.com/vezlo/src-to-kb/blob/main/docs/NOTION_INTEGRATION.md)

### Changed
- **Documentation**: Moved detailed guides to `docs/` folder with absolute GitHub URLs
- **Notion API**: Updated to API v5 (2025-09-03) with data sources support

### Dependencies
- Added `@notionhq/client@^5.3.0`

## [1.3.4] - 2025-11-04

### Changed
- 🔧 **External Server Configuration**: Removed `USE_EXTERNAL_KB` flag - external server mode is now automatically enabled when `EXTERNAL_KB_URL` is set
- 🔐 **API Key Authentication**: Added `EXTERNAL_KB_API_KEY` environment variable support - API key is automatically sent in `x-api-key` header when provided
- 📝 **Simplified Configuration**: External server mode now requires only `EXTERNAL_KB_URL` - no separate enable flag needed
- 🔄 **Automatic Fallback**: If `EXTERNAL_KB_URL` is not set, tool automatically falls back to local processing mode
- 🗑️ **Removed UUID Fields**: Removed `company_uuid` and `created_by_uuid` from document processing payload - company/user information is now automatically detected from API key
- 🗑️ **Removed UUID from Search**: Removed `company_uuid` from search payload - company information is now automatically detected from API key

### Breaking Changes
- ❌ **Removed**: `USE_EXTERNAL_KB` environment variable is no longer used
- ❌ **Removed**: `EXTERNAL_KB_COMPANY_UUID` environment variable is no longer used
- ❌ **Removed**: `EXTERNAL_KB_CREATED_BY_UUID` environment variable is no longer used
- ✅ **Migration**: Simply set `EXTERNAL_KB_URL` instead of both `USE_EXTERNAL_KB=true` and `EXTERNAL_KB_URL`
- ✅ **Payload Changes**: Document processing payload no longer includes `company_uuid` or `created_by_uuid` fields
- ✅ **Search Payload Changes**: Search payload no longer includes `company_uuid` field

### Added
- 🔑 **API Key Support**: New `EXTERNAL_KB_API_KEY` environment variable for authenticating with external servers
- 📚 **Updated Documentation**: Revised README.md and EXTERNAL_SERVER_ENV.md to reflect new configuration approach

## [1.3.3] - 2025-09-30

### Added
- 🌐 **External Server Integration**: Added support for external knowledge base processing and search
- 🔧 **External Server Configuration**: New `external-server-config.js` for centralized configuration management
- 🚀 **External Server Service**: New `external-server-service.js` for API communication with external servers
- 📚 **External Server Documentation**: Added `EXTERNAL_SERVER_ENV.md` with comprehensive setup guide
- 🔄 **Hybrid Mode**: Automatic fallback to local processing if external server fails
- ⚙️ **Environment Variables**: Support for `USE_EXTERNAL_KB`, `EXTERNAL_KB_URL`, `EXTERNAL_KB_SEARCH_URL`, etc.
- 🎯 **Assistant Server**: Integration with [vezlo/assistant-server](https://github.com/vezlo/assistant-server) for immediate testing

### Enhanced
- 📤 **Generator**: Enhanced `kb-generator.js` with external server processing capability
- 🔍 **Search**: Enhanced `search.js` with external server search integration
- 🎯 **Progress Indicators**: Added better visual feedback and progress tracking for file processing
- 🔗 **URL Generation**: Smart URL generation for search endpoints from base URLs

### Features
- **External Processing**: Send code files to external servers for chunking and embedding generation
- **External Search**: Query external knowledge bases via REST API
- **Retry Logic**: Configurable retry attempts and delays for external server communication
- **Timeout Handling**: Request timeout management for external server calls
- **Payload Customization**: Configurable payload structure for external server integration

## [1.3.2] - 2025-09-27

### Documentation
- 📚 **Integration Guide**: Added comprehensive section for Next.js/React integration
- 🚀 **Quick Start**: Added fast-track setup for existing projects
- 💡 **Usage Examples**: Added React component examples and integration patterns
- 🏢 **Enterprise Setup**: Added production deployment guidance
- 🔄 **CI/CD Examples**: Added GitHub Actions integration example

### Added
- React component code examples for search integration
- Multiple integration patterns (onboarding, documentation, code review)
- Enterprise deployment configurations

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