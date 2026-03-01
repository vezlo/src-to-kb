'use strict';

const { splitAST } = require('./shared/chunk-splitter');

/**
 * @abstract
 * Base class for all language analyzers.
 * Subclasses must implement parse() and extractMetadata().
 * chunk() has a default implementation using shared/chunk-splitter.js.
 */
class BaseAnalyzer {
  /**
   * Parse source code into a tree-sitter AST.
   * @param {string} filePath - Path to the file
   * @param {string} content - Raw file content
   * @returns {object|null} Parsed tree-sitter tree, or null if parsing fails
   */
  parse(filePath, content) {
    throw new Error('Not implemented: parse() must be overridden by subclass');
  }

  /**
   * Extract semantic metadata from parsed AST.
   * @param {object} tree - tree-sitter parse tree
   * @param {string} filePath - Path for context (e.g., detecting Rails conventions from path)
   * @param {string} content - Raw content (for extracting text from AST nodes)
   * @returns {object} Metadata object (structure varies by analyzer)
   */
  extractMetadata(tree, filePath, content) {
    throw new Error('Not implemented: extractMetadata() must be overridden by subclass');
  }

  /**
   * Split AST into structurally-aware chunks.
   * Default implementation uses shared/chunk-splitter.js.
   * Subclasses can override for language-specific chunking logic.
   * @param {object} tree - tree-sitter parse tree
   * @param {string} content - Raw content
   * @param {object} options - { maxSize, overlap }
   * @param {string} [filePath] - File path for context
   * @returns {Array<object>} Array of chunk objects
   */
  chunk(tree, content, options, filePath) {
    return splitAST(tree, content, options, filePath);
  }

  /**
   * Optional framework-specific enrichment.
   * Called after base metadata extraction if an enrichment layer is registered.
   * @param {object} metadata - Base metadata from extractMetadata()
   * @param {object} tree - tree-sitter parse tree
   * @param {string} content - Raw content
   * @param {string} filePath - File path
   * @returns {object} Enriched metadata
   */
  enrich(metadata, tree, content, filePath) {
    return metadata;
  }
}

module.exports = { BaseAnalyzer };
