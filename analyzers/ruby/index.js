'use strict';

const { BaseAnalyzer } = require('../base-analyzer');
const { loadParser } = require('../shared/tree-sitter-loader');

/**
 * Ruby language analyzer.
 * Uses tree-sitter-ruby to parse Ruby source files and extract semantic metadata.
 *
 * Extracts: classes, modules, methods, visibility modifiers, module operations
 * (include/extend/prepend), constants, and attribute accessors.
 */
class RubyAnalyzer extends BaseAnalyzer {
  /**
   * Parse Ruby source code into a tree-sitter AST.
   * @param {string} filePath - Path to the file
   * @param {string} content - Raw file content
   * @returns {object|null} Parsed tree-sitter tree, or null if parsing fails
   */
  parse(filePath, content) {
    const loaded = loadParser('ruby');
    if (!loaded) return null;

    try {
      const tree = loaded.parser.parse(content);
      return tree;
    } catch (err) {
      console.warn(`[ruby-analyzer] Failed to parse ${filePath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract semantic metadata from a parsed Ruby AST.
   * @param {object} tree - tree-sitter parse tree
   * @param {string} filePath - Path for context
   * @param {string} content - Raw content
   * @returns {object} Metadata object
   */
  extractMetadata(tree, filePath, content) {
    const rootNode = tree.rootNode;
    const scope = this._deriveScope(filePath);

    // Find top-level classes and modules
    const topLevelDefs = this._findTopLevelDefinitions(rootNode, content);

    if (topLevelDefs.length === 0) {
      // No classes or modules — extract file-level info
      return this._extractFileLevelMetadata(rootNode, content, filePath, scope);
    }

    // Pick the primary definition (first or largest)
    const primary = this._selectPrimary(topLevelDefs);
    const node = primary.node;

    const metadata = {
      type: primary.type,
      name: primary.name,
      scope,
      defines: [],
      references: [],
      includes: [],
      extends: [],
      attributes: [],
      constants: [],
    };

    if (primary.inherits) {
      metadata.inherits = primary.inherits;
      metadata.references.push(primary.inherits);
    }

    // Add the class/module itself as a definition
    metadata.defines.push({ name: primary.name, type: primary.type });

    // Extract body contents
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      this._extractBodyContents(bodyNode, content, metadata);
    }

    // Deduplicate references
    metadata.references = [...new Set(metadata.references)];

    return metadata;
  }

  /**
   * Derive scope from file path by extracting meaningful segments.
   * @param {string} filePath
   * @returns {string[]}
   */
  _deriveScope(filePath) {
    if (!filePath) return [];
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');

    // Find meaningful path segments (e.g., app/models, lib/concerns)
    const appIndex = parts.indexOf('app');
    const libIndex = parts.indexOf('lib');
    const startIndex = appIndex >= 0 ? appIndex : (libIndex >= 0 ? libIndex : Math.max(0, parts.length - 3));

    // Take segments from start to the file (exclusive), drop the filename
    const scopeParts = parts.slice(startIndex, parts.length - 1);

    return scopeParts.filter(p => p && p !== '.' && p !== '..');
  }

  /**
   * Find all top-level class and module definitions.
   * @param {object} rootNode
   * @param {string} content
   * @returns {Array<{type: string, name: string, inherits: string|null, node: object, size: number}>}
   */
  _findTopLevelDefinitions(rootNode, content) {
    const defs = [];

    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);

      if (child.type === 'class') {
        const nameNode = child.childForFieldName('name');
        const superclassNode = child.childForFieldName('superclass');
        const name = nameNode ? this._nodeText(nameNode, content) : 'Anonymous';
        // tree-sitter-ruby's superclass node includes the `<` token, strip it
        const inherits = superclassNode ? this._nodeText(superclassNode, content).replace(/^<\s*/, '') : null;
        defs.push({
          type: 'class',
          name,
          inherits,
          node: child,
          size: child.endIndex - child.startIndex,
        });
      } else if (child.type === 'module') {
        const nameNode = child.childForFieldName('name');
        const name = nameNode ? this._nodeText(nameNode, content) : 'Anonymous';
        defs.push({
          type: 'module',
          name,
          inherits: null,
          node: child,
          size: child.endIndex - child.startIndex,
        });
      }
    }

    return defs;
  }

  /**
   * Select the primary definition (first one, or largest if first is trivially small).
   * @param {Array} defs
   * @returns {object}
   */
  _selectPrimary(defs) {
    if (defs.length === 1) return defs[0];

    // Return the first one — typical Ruby convention is one class/module per file
    return defs[0];
  }

  /**
   * Extract metadata from a class/module body node.
   * Tracks visibility state across method definitions.
   * @param {object} bodyNode
   * @param {string} content
   * @param {object} metadata - mutated in place
   */
  _extractBodyContents(bodyNode, content, metadata) {
    let currentVisibility = 'public';

    for (let i = 0; i < bodyNode.childCount; i++) {
      const child = bodyNode.child(i);

      switch (child.type) {
        case 'method': {
          const methodName = this._getMethodName(child, content);
          if (methodName) {
            metadata.defines.push({
              name: methodName,
              type: 'method',
              visibility: currentVisibility,
            });
          }
          // Collect references from method body
          this._collectReferences(child, content, metadata.references);
          break;
        }

        case 'singleton_method': {
          const methodName = this._getMethodName(child, content);
          if (methodName) {
            metadata.defines.push({
              name: `self.${methodName}`,
              type: 'method',
              visibility: currentVisibility,
            });
          }
          this._collectReferences(child, content, metadata.references);
          break;
        }

        case 'call': {
          this._extractCallMetadata(child, content, metadata);
          break;
        }

        case 'identifier': {
          // Bare visibility modifier (private, public, protected on own line)
          const text = this._nodeText(child, content);
          if (text === 'private' || text === 'public' || text === 'protected') {
            currentVisibility = text;
          }
          break;
        }

        case 'assignment': {
          this._extractConstant(child, content, metadata);
          break;
        }

        case 'class': {
          // Nested class
          const nameNode = child.childForFieldName('name');
          if (nameNode) {
            const name = this._nodeText(nameNode, content);
            metadata.defines.push({ name, type: 'class' });
            const superNode = child.childForFieldName('superclass');
            if (superNode) {
              metadata.references.push(this._nodeText(superNode, content));
            }
          }
          break;
        }

        case 'module': {
          // Nested module
          const nameNode = child.childForFieldName('name');
          if (nameNode) {
            const name = this._nodeText(nameNode, content);
            metadata.defines.push({ name, type: 'module' });
          }
          break;
        }

        default:
          break;
      }
    }
  }

  /**
   * Extract metadata from a `call` node (method invocations at class level).
   * Handles: include, extend, prepend, attr_reader, attr_writer, attr_accessor,
   * visibility modifiers applied to specific methods.
   * @param {object} callNode
   * @param {string} content
   * @param {object} metadata
   */
  _extractCallMetadata(callNode, content, metadata) {
    const methodNode = callNode.childForFieldName('method');
    if (!methodNode) return;

    const methodName = this._nodeText(methodNode, content);
    const args = callNode.childForFieldName('arguments');

    switch (methodName) {
      case 'include': {
        const modules = this._extractSymbolOrConstantArgs(args, content);
        metadata.includes.push(...modules);
        metadata.references.push(...modules);
        break;
      }

      case 'extend': {
        const modules = this._extractSymbolOrConstantArgs(args, content);
        metadata.extends.push(...modules);
        metadata.references.push(...modules);
        break;
      }

      case 'prepend': {
        const modules = this._extractSymbolOrConstantArgs(args, content);
        // Store prepends in includes with a note, or as separate array
        metadata.includes.push(...modules);
        metadata.references.push(...modules);
        break;
      }

      case 'attr_reader':
      case 'attr_writer':
      case 'attr_accessor': {
        const accessType = methodName.replace('attr_', '');
        const symbols = this._extractSymbolArgs(args, content);
        for (const sym of symbols) {
          metadata.attributes.push({ name: sym, access: accessType });
        }
        break;
      }

      case 'private':
      case 'public':
      case 'protected': {
        // Visibility applied to specific methods: private :method_name
        // These don't change the current visibility state—they target specific methods
        break;
      }

      default:
        // Collect references from other calls
        this._collectReferences(callNode, content, metadata.references);
        break;
    }
  }

  /**
   * Extract a constant assignment (e.g., MAX_ITEMS = 100).
   * @param {object} assignmentNode
   * @param {string} content
   * @param {object} metadata
   */
  _extractConstant(assignmentNode, content, metadata) {
    const leftNode = assignmentNode.childForFieldName('left');
    const rightNode = assignmentNode.childForFieldName('right');

    if (!leftNode || !rightNode) return;

    const name = this._nodeText(leftNode, content);
    // Constants in Ruby are uppercase identifiers
    if (name && /^[A-Z][A-Z0-9_]*$/.test(name)) {
      const value = this._nodeText(rightNode, content);
      metadata.constants.push({ name, value });
    }
  }

  /**
   * Collect constant references (class names, module names) from a node subtree.
   * @param {object} node
   * @param {string} content
   * @param {string[]} refs - mutated in place
   */
  _collectReferences(node, content, refs) {
    if (node.type === 'constant' || node.type === 'scope_resolution') {
      const text = this._nodeText(node, content);
      // Filter out common built-in constants
      if (text && !['true', 'false', 'nil', 'self'].includes(text)) {
        refs.push(text);
      }
      return; // Don't recurse into scope_resolution children
    }

    for (let i = 0; i < node.childCount; i++) {
      this._collectReferences(node.child(i), content, refs);
    }
  }

  /**
   * Extract symbol or constant arguments from an argument list.
   * e.g., include Searchable, Filterable => ['Searchable', 'Filterable']
   * @param {object} argsNode
   * @param {string} content
   * @returns {string[]}
   */
  _extractSymbolOrConstantArgs(argsNode, content) {
    const results = [];
    if (!argsNode) return results;

    for (let i = 0; i < argsNode.childCount; i++) {
      const child = argsNode.child(i);
      if (child.type === 'constant' || child.type === 'scope_resolution') {
        results.push(this._nodeText(child, content));
      }
    }
    return results;
  }

  /**
   * Extract symbol arguments from an argument list.
   * e.g., attr_reader :name, :email => ['name', 'email']
   * @param {object} argsNode
   * @param {string} content
   * @returns {string[]}
   */
  _extractSymbolArgs(argsNode, content) {
    const results = [];
    if (!argsNode) return results;

    for (let i = 0; i < argsNode.childCount; i++) {
      const child = argsNode.child(i);
      if (child.type === 'simple_symbol') {
        const text = this._nodeText(child, content);
        // Strip leading colon
        results.push(text.replace(/^:/, ''));
      }
    }
    return results;
  }

  /**
   * Get the name of a method node.
   * @param {object} methodNode
   * @param {string} content
   * @returns {string|null}
   */
  _getMethodName(methodNode, content) {
    const nameNode = methodNode.childForFieldName('name');
    if (nameNode) return this._nodeText(nameNode, content);
    return null;
  }

  /**
   * Extract file-level metadata when no top-level class/module is found.
   * @param {object} rootNode
   * @param {string} content
   * @param {string} filePath
   * @param {string[]} scope
   * @returns {object}
   */
  _extractFileLevelMetadata(rootNode, content, filePath, scope) {
    const path = require('path');
    const basename = path.basename(filePath, '.rb');

    const metadata = {
      type: 'file',
      name: basename,
      scope,
      defines: [],
      references: [],
      includes: [],
      extends: [],
      attributes: [],
      constants: [],
    };

    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);

      if (child.type === 'method') {
        const name = this._getMethodName(child, content);
        if (name) {
          metadata.defines.push({ name, type: 'method', visibility: 'public' });
        }
        this._collectReferences(child, content, metadata.references);
      } else if (child.type === 'assignment') {
        this._extractConstant(child, content, metadata);
      } else if (child.type === 'call') {
        this._collectReferences(child, content, metadata.references);
      }
    }

    metadata.references = [...new Set(metadata.references)];
    return metadata;
  }

  /**
   * Get the text of a tree-sitter node.
   * @param {object} node
   * @param {string} content
   * @returns {string}
   */
  _nodeText(node, content) {
    return content.slice(node.startIndex, node.endIndex);
  }
}

module.exports = { RubyAnalyzer };
