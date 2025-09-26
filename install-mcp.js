#!/usr/bin/env node

/**
 * Automatic MCP Server Installer for src-to-kb
 * Configures Claude Code to use the src-to-kb MCP server
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Determine Claude config path based on platform
function getClaudeConfigPath() {
  const platform = os.platform();
  const homeDir = os.homedir();

  switch (platform) {
    case 'darwin': // macOS
      return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'win32': // Windows
      return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
    case 'linux':
      return path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Check if npm package is installed
async function checkPackageInstalled() {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec('npm list -g @vezlo/src-to-kb', (error, stdout) => {
      resolve(!error && stdout.includes('@vezlo/src-to-kb'));
    });
  });
}

// Create config directory if it doesn't exist
function ensureConfigDirectory(configPath) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created config directory: ${dir}`);
  }
}

// Read existing config or create new one
function readConfig(configPath) {
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('⚠️  Existing config file is invalid, creating backup...');
      fs.copyFileSync(configPath, `${configPath}.backup`);
      return {};
    }
  }
  return {};
}

// Main installer function
async function installMCPServer() {
  console.log('🚀 src-to-kb MCP Server Installer');
  console.log('==================================\n');

  try {
    // Step 1: Check if package is installed
    console.log('📦 Checking npm package...');
    const isInstalled = await checkPackageInstalled();

    if (!isInstalled) {
      console.log('❌ Package not found. Installing @vezlo/src-to-kb globally...');
      console.log('\nRun this command first:');
      console.log('  npm install -g @vezlo/src-to-kb\n');
      console.log('Then run this installer again.');
      process.exit(1);
    }
    console.log('✅ Package @vezlo/src-to-kb is installed\n');

    // Step 2: Find Claude config
    console.log('🔍 Locating Claude configuration...');
    const configPath = getClaudeConfigPath();
    console.log(`📄 Config path: ${configPath}\n`);

    // Step 3: Ask for OpenAI API key (optional)
    const apiKey = await new Promise((resolve) => {
      rl.question('🔑 Enter OpenAI API key (optional, press Enter to skip): ', (answer) => {
        resolve(answer.trim());
      });
    });

    // Step 4: Prepare MCP configuration
    const mcpConfig = {
      command: 'npx',
      args: ['-y', '@vezlo/src-to-kb', 'src-to-kb-mcp'],
      env: {}
    };

    if (apiKey) {
      mcpConfig.env.OPENAI_API_KEY = apiKey;
      console.log('✅ OpenAI API key configured\n');
    } else {
      console.log('⏭️  Skipping OpenAI embeddings (can be added later)\n');
    }

    // Step 5: Update configuration
    console.log('📝 Updating Claude configuration...');
    ensureConfigDirectory(configPath);
    const config = readConfig(configPath);

    // Initialize mcpServers if not present
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Check if already configured
    if (config.mcpServers['src-to-kb']) {
      const overwrite = await new Promise((resolve) => {
        rl.question('⚠️  src-to-kb is already configured. Overwrite? (y/n): ', (answer) => {
          resolve(answer.toLowerCase() === 'y');
        });
      });

      if (!overwrite) {
        console.log('❌ Installation cancelled');
        process.exit(0);
      }
    }

    // Add our MCP server
    config.mcpServers['src-to-kb'] = mcpConfig;

    // Step 6: Write configuration
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✅ Configuration saved\n');

    // Step 7: Success message
    console.log('🎉 Installation Complete!');
    console.log('========================\n');
    console.log('Next steps:');
    console.log('1. Restart Claude Code completely');
    console.log('2. Test by asking Claude:');
    console.log('   - "Generate a knowledge base for this project"');
    console.log('   - "Search for authentication in the codebase"');
    console.log('   - "What languages does this project use?"\n');

    console.log('📚 Documentation:');
    console.log('   - MCP Tools Guide: https://github.com/vezlo/src-to-kb/blob/main/MCP_TOOLS_GUIDE.md');
    console.log('   - Troubleshooting: https://github.com/vezlo/src-to-kb/blob/main/MCP_SETUP.md\n');

    if (!apiKey) {
      console.log('💡 Tip: To enable embeddings later, run:');
      console.log('   src-to-kb-mcp-install --update-api-key\n');
    }

  } catch (error) {
    console.error('❌ Installation failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle command line arguments
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
src-to-kb MCP Server Installer

Usage:
  npx @vezlo/src-to-kb install-mcp    Install MCP server for Claude Code
  install-mcp --update-api-key         Update OpenAI API key
  install-mcp --status                 Check installation status
  install-mcp --uninstall              Remove MCP server configuration

Options:
  -h, --help                           Show this help message

Examples:
  npx @vezlo/src-to-kb install-mcp
  src-to-kb-mcp-install --status
    `);
    process.exit(0);
  }

  if (args.includes('--status')) {
    await checkInstallationStatus();
  } else if (args.includes('--update-api-key')) {
    await updateApiKey();
  } else if (args.includes('--uninstall')) {
    await uninstallMCPServer();
  } else {
    await installMCPServer();
  }
}

// Check installation status
async function checkInstallationStatus() {
  console.log('🔍 Checking MCP Installation Status\n');

  try {
    const configPath = getClaudeConfigPath();

    if (!fs.existsSync(configPath)) {
      console.log('❌ Claude configuration not found');
      console.log(`   Expected at: ${configPath}`);
      return;
    }

    const config = readConfig(configPath);

    if (!config.mcpServers || !config.mcpServers['src-to-kb']) {
      console.log('❌ src-to-kb MCP server not configured');
      console.log('   Run: npx @vezlo/src-to-kb install-mcp');
      return;
    }

    console.log('✅ src-to-kb MCP server is configured');
    console.log('\nConfiguration:');
    console.log(JSON.stringify(config.mcpServers['src-to-kb'], null, 2));

    const hasApiKey = config.mcpServers['src-to-kb'].env?.OPENAI_API_KEY;
    console.log(`\n🔑 OpenAI API key: ${hasApiKey ? 'Configured' : 'Not configured'}`);

  } catch (error) {
    console.error('❌ Error checking status:', error.message);
  }
  process.exit(0);
}

// Update API key
async function updateApiKey() {
  console.log('🔑 Update OpenAI API Key\n');

  try {
    const configPath = getClaudeConfigPath();

    if (!fs.existsSync(configPath)) {
      console.log('❌ Claude configuration not found. Run install first.');
      process.exit(1);
    }

    const config = readConfig(configPath);

    if (!config.mcpServers || !config.mcpServers['src-to-kb']) {
      console.log('❌ src-to-kb not configured. Run install first.');
      process.exit(1);
    }

    const apiKey = await new Promise((resolve) => {
      rl.question('Enter new OpenAI API key: ', (answer) => {
        resolve(answer.trim());
        rl.close();
      });
    });

    if (apiKey) {
      if (!config.mcpServers['src-to-kb'].env) {
        config.mcpServers['src-to-kb'].env = {};
      }
      config.mcpServers['src-to-kb'].env.OPENAI_API_KEY = apiKey;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('✅ API key updated successfully');
      console.log('🔄 Please restart Claude Code');
    } else {
      console.log('❌ No API key provided');
    }

  } catch (error) {
    console.error('❌ Error updating API key:', error.message);
  }
  process.exit(0);
}

// Uninstall MCP server
async function uninstallMCPServer() {
  console.log('🗑️  Uninstall src-to-kb MCP Server\n');

  try {
    const configPath = getClaudeConfigPath();

    if (!fs.existsSync(configPath)) {
      console.log('❌ Claude configuration not found');
      return;
    }

    const config = readConfig(configPath);

    if (!config.mcpServers || !config.mcpServers['src-to-kb']) {
      console.log('❌ src-to-kb MCP server not installed');
      return;
    }

    const confirm = await new Promise((resolve) => {
      rl.question('Are you sure you want to uninstall? (y/n): ', (answer) => {
        resolve(answer.toLowerCase() === 'y');
        rl.close();
      });
    });

    if (confirm) {
      delete config.mcpServers['src-to-kb'];

      // Remove mcpServers if empty
      if (Object.keys(config.mcpServers).length === 0) {
        delete config.mcpServers;
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('✅ src-to-kb MCP server uninstalled');
      console.log('🔄 Please restart Claude Code');
    } else {
      console.log('❌ Uninstall cancelled');
    }

  } catch (error) {
    console.error('❌ Error uninstalling:', error.message);
  }
  process.exit(0);
}

// Run main function
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { installMCPServer };