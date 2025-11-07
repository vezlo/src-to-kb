#!/usr/bin/env node

const crypto = require('crypto');
const { Client } = require('@notionhq/client');

/**
 * NotionSource - Fetches pages from Notion and converts to KB format
 */
class NotionSource {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NOTION_API_KEY,
      pageId: config.pageId || null,
      pageUrl: config.pageUrl || null,
      databaseId: config.databaseId || null,
    };

    if (!this.config.apiKey) {
      throw new Error('Notion API key is required. Provide --notion-key or set NOTION_API_KEY env variable');
    }

    // Initialize Notion client with log level set to error only
    this.notion = new Client({ 
      auth: this.config.apiKey,
      logLevel: 'error',
      notionVersion: '2025-09-03'
    });
  }

  /**
   * Extract page ID from Notion URL
   * Example: https://notion.so/My-Page-abc123def456 -> abc123def456
   */
  extractPageId(url) {
    const match = url.match(/([a-f0-9]{32})/);
    return match ? match[1] : null;
  }

  /**
   * Format page ID (add hyphens if needed)
   * abc123def456 -> abc123de-f456-4xxx-xxxx-xxxxxxxxxxxx
   */
  formatPageId(pageId) {
    // Remove any existing hyphens
    const clean = pageId.replace(/-/g, '');
    
    // Notion page IDs are 32 chars, format as UUID
    if (clean.length === 32) {
      return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
    }
    
    return pageId;
  }

  /**
   * Fetch all blocks recursively with pagination
   */
  async fetchAllBlocks(blockId) {
    const allBlocks = [];
    let cursor = undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100
      });

      const blocks = response.results || [];
      
      // Fetch nested blocks for each block that has children
      for (const block of blocks) {
        allBlocks.push(block);
        
        // If block has children, recursively fetch them
        if (block.has_children) {
          const childBlocks = await this.fetchAllBlocks(block.id);
          allBlocks.push(...childBlocks);
        }
      }

      hasMore = response.has_more;
      cursor = response.next_cursor;
    }

    return allBlocks;
  }

  /**
   * Fetch single page from Notion
   */
  async fetchPage(pageId) {
    const formattedId = this.formatPageId(pageId);
    
    try {
      // Fetch page metadata
      const page = await this.notion.pages.retrieve({ page_id: formattedId });
      
      // Fetch all blocks with pagination and nested blocks
      const blocks = await this.fetchAllBlocks(formattedId);
      
      console.log(`📄 Fetched page with ${blocks.length} blocks`);
      
      return {
        page,
        blocks
      };
      
    } catch (error) {
      // Handle specific Notion API errors
      if (error.code === 'unauthorized') {
        throw new Error('Invalid Notion API key. Please check your integration token.');
      }
      if (error.code === 'restricted_resource') {
        throw new Error('Access denied. Make sure the page is shared with your integration.');
      }
      if (error.code === 'object_not_found') {
        throw new Error('Page not found. Make sure the page is shared with your integration.');
      }
      if (error.code === 'validation_error') {
        throw new Error('Invalid page ID format.');
      }
      
      // Generic error
      throw new Error(`Notion API error: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Fetch all pages from a database
   */
  async fetchDatabase(databaseId) {
    const formattedId = this.formatPageId(databaseId);
    
    try {
      // First, retrieve the database to get its data sources
      const database = await this.notion.databases.retrieve({ database_id: formattedId });
      
      if (!database.data_sources || database.data_sources.length === 0) {
        console.log(`⚠️  No data sources found in database\n`);
        return [];
      }
      
      // Query each data source in the database
      const allPages = [];
      for (const dataSource of database.data_sources) {
        try {
          const response = await this.notion.dataSources.query({ 
            data_source_id: dataSource.id 
          });
          
          console.log(`📄 Found ${response.results.length} pages in data source ${dataSource.id}\n`);
          
          // Fetch content for each page
          for (const page of response.results || []) {
            try {
              const pageData = await this.fetchPage(page.id);
              allPages.push(pageData);
            } catch (error) {
              console.warn(`⚠️  Skipped page: ${error.message}`);
            }
          }
        } catch (dsError) {
          console.warn(`⚠️  Could not query data source ${dataSource.id}: ${dsError.message}`);
        }
      }
      
      console.log(`✅ Total pages fetched: ${allPages.length}\n`);
      return allPages;
      
    } catch (error) {
      // Handle specific Notion API errors
      if (error.code === 'unauthorized') {
        throw new Error('Invalid Notion API key. Please check your integration token.');
      }
      if (error.code === 'restricted_resource') {
        throw new Error('Access denied. Make sure the database is shared with your integration.');
      }
      if (error.code === 'object_not_found') {
        throw new Error('Database not found. Make sure the database is shared with your integration.');
      }
      if (error.code === 'validation_error') {
        throw new Error('Invalid database ID format.');
      }
      
      // Generic error
      throw new Error(`Notion API error: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Search all accessible pages
   */
  async searchAllPages() {
    console.log(`🔍 Searching all accessible Notion pages`);
    
    try {
      const response = await this.notion.search({
        filter: { property: 'object', value: 'page' }
      });
      
      // Fetch content for each page
      const pages = [];
      for (const page of response.results || []) {
        try {
          const pageData = await this.fetchPage(page.id);
          pages.push(pageData);
        } catch (error) {
          console.warn(`⚠️  Failed to fetch page ${page.id}: ${error.message}`);
        }
      }
      
      return pages;
      
    } catch (error) {
      throw new Error(`Notion API error: ${error.message}`);
    }
  }

  /**
   * Extract text from rich_text array
   */
  extractRichText(richTextArray) {
    if (!richTextArray || !Array.isArray(richTextArray)) {
      return '';
    }
    return richTextArray.map(rt => rt.plain_text || '').join('');
  }

  /**
   * Convert Notion blocks to plain text
   */
  blocksToText(blocks) {
    let text = '';
    
    for (const block of blocks) {
      const type = block.type;
      const blockData = block[type];
      
      if (!blockData) continue;
      
      // Extract text content
      let content = '';
      if (blockData.rich_text) {
        content = this.extractRichText(blockData.rich_text);
      } else if (blockData.caption) {
        content = this.extractRichText(blockData.caption);
      } else if (blockData.title) {
        content = this.extractRichText(blockData.title);
      }
      
      // Handle different block types
      switch (type) {
        case 'heading_1':
          text += `\n# ${content}\n\n`;
          break;
        case 'heading_2':
          text += `\n## ${content}\n\n`;
          break;
        case 'heading_3':
          text += `\n### ${content}\n\n`;
          break;
        case 'paragraph':
          text += `${content}\n\n`;
          break;
        case 'bulleted_list_item':
          text += `- ${content}\n`;
          break;
        case 'numbered_list_item':
          text += `1. ${content}\n`;
          break;
        case 'to_do':
          const checked = blockData.checked ? '✅' : '☐';
          text += `${checked} ${content}\n`;
          break;
        case 'toggle':
          text += `▶ ${content}\n`;
          break;
        case 'quote':
          text += `> ${content}\n\n`;
          break;
        case 'callout':
          const icon = blockData.icon?.emoji || '💡';
          text += `${icon} ${content}\n\n`;
          break;
        case 'code':
          const language = blockData.language || '';
          text += `\`\`\`${language}\n${content}\n\`\`\`\n\n`;
          break;
        case 'divider':
          text += `---\n\n`;
          break;
        case 'table':
          text += `[Table: ${content || 'Table content'}]\n\n`;
          break;
        case 'image':
        case 'file':
        case 'video':
        case 'pdf':
          const caption = blockData.caption ? this.extractRichText(blockData.caption) : '';
          const url = blockData.file?.url || blockData.external?.url || '';
          text += `[${type}: ${caption || url}]\n\n`;
          break;
        case 'bookmark':
          const bookmarkUrl = blockData.url || '';
          const bookmarkCaption = blockData.caption ? this.extractRichText(blockData.caption) : '';
          text += `🔖 ${bookmarkCaption || bookmarkUrl}\n${bookmarkUrl}\n\n`;
          break;
        case 'equation':
          text += `$${content}$\n\n`;
          break;
        default:
          // For unknown block types, try to extract any text content
          if (content) {
            text += `${content}\n\n`;
          }
      }
    }
    
    return text.trim();
  }

  /**
   * Get page title from page object
   */
  getPageTitle(page) {
    if (page.properties?.title?.title?.[0]?.plain_text) {
      return page.properties.title.title[0].plain_text;
    }
    if (page.properties?.Name?.title?.[0]?.plain_text) {
      return page.properties.Name.title[0].plain_text;
    }
    return 'Untitled';
  }

  /**
   * Convert Notion page to KB document format
   */
  pageToDocument(pageData) {
    const { page, blocks } = pageData;
    const title = this.getPageTitle(page);
    const content = this.blocksToText(blocks);
    const docId = crypto.randomBytes(8).toString('hex');
    
    return {
      id: docId,
      title: title,
      content: content,
      relativePath: `notion/${page.id}`,
      size: Buffer.byteLength(content, 'utf8'),
      metadata: {
        source: 'notion',
        notionPageId: page.id,
        notionUrl: page.url,
        lastEditedTime: page.last_edited_time,
        createdTime: page.created_time,
        language: 'markdown'
      }
    };
  }

  /**
   * Detect if ID is a database or page by attempting to fetch as database first
   */
  async fetchByUrl(url) {
    const id = this.extractPageId(url);
    if (!id) {
      throw new Error('Invalid Notion URL. Could not extract ID');
    }
    
    const formattedId = this.formatPageId(id);
    
    console.log(`🔍 Checking resource type...`);
    
    // Try as database first
    try {
      const response = await this.notion.databases.retrieve({ database_id: formattedId });
      
      if (response.object === 'database') {
        console.log(`✅ Detected as database\n`);
        return await this.fetchDatabase(formattedId);
      }
    } catch (error) {
      // Check error type - only fall back to page for object_not_found
      if (error.code === 'unauthorized') {
        throw new Error('Invalid Notion API key. Please check your integration token.');
      }
      if (error.code === 'restricted_resource') {
        throw new Error('Database access denied. Make sure the database is shared with your integration.');
      }
      if (error.code === 'validation_error') {
        throw new Error('Invalid database ID format.');
      }
      
      // Only if object_not_found, try as page
      if (error.code === 'object_not_found') {
        console.log(`✅ Not a database, fetching as page\n`);
        return [await this.fetchPage(formattedId)];
      }
      
      // For any other error, throw it
      throw new Error(`Notion API error: ${error.message || 'Unknown error'}`);
    }
    
    // This shouldn't be reached, but just in case
    throw new Error('Unable to determine resource type');
  }

  /**
   * Main method: fetch pages and convert to documents
   */
  async analyze() {
    console.log('\n🔵 Notion Source Analysis Started\n');
    
    let pagesData = [];
    
    // Determine what to fetch based on config
    if (this.config.pageUrl) {
      pagesData = await this.fetchByUrl(this.config.pageUrl);
    } else {
      throw new Error('Please provide a Notion page or database URL using --notion-url');
    }
    
    console.log(`\n✅ Fetched ${pagesData.length} pages from Notion\n`);
    
    // Convert to KB document format
    const documents = pagesData.map(pageData => this.pageToDocument(pageData));
    
    return documents;
  }
}

module.exports = { NotionSource };

