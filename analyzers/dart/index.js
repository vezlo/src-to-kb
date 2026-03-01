'use strict';

const path = require('path');
const { BaseAnalyzer } = require('../base-analyzer');
const { loadParser } = require('../shared/tree-sitter-loader');

/**
 * Dart language analyzer.
 * Uses tree-sitter-dart to parse Dart source files and extract semantic metadata.
 *
 * Extracts: classes, mixins, extensions, enums, functions, methods, constructors,
 * fields, imports, exports, typedefs, and generics.
 *
 * Dart visibility: underscore prefix (_) = private; no underscore = public.
 *
 * NOTE: tree-sitter-dart is community-maintained. Node type names may vary between
 * grammar versions. This analyzer is intentionally defensive — it uses helpers that
 * check for multiple possible node type names and falls back to regex-based
 * extraction when AST nodes are unavailable.
 */
class DartAnalyzer extends BaseAnalyzer {
  /**
   * Parse Dart source code into a tree-sitter AST.
   * @param {string} filePath - Path to the file
   * @param {string} content - Raw file content
   * @returns {object|null} Parsed tree-sitter tree, or null if parsing fails
   */
  parse(filePath, content) {
    const loaded = loadParser('dart');
    if (!loaded) return null;

    try {
      const tree = loaded.parser.parse(content);
      return tree;
    } catch (err) {
      console.warn(`[dart-analyzer] Failed to parse ${filePath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract semantic metadata from a parsed Dart AST.
   * @param {object} tree - tree-sitter parse tree
   * @param {string} filePath - Path for context
   * @param {string} content - Raw content
   * @returns {Array<object>} Array of metadata objects (one per top-level definition)
   */
  extractMetadata(tree, filePath, content) {
    const rootNode = tree.rootNode;
    const scope = this._deriveScope(filePath);
    const imports = this._extractImports(rootNode, content);
    const exports = this._extractExports(rootNode, content);
    const results = [];

    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);
      try {
        const meta = this._extractTopLevelNode(child, content, scope, imports);
        if (meta) {
          results.push(meta);
        }
      } catch (err) {
        // Defensive: skip nodes that cause errors
        continue;
      }
    }

    // If no top-level definitions were extracted, return a file-level metadata object
    if (results.length === 0) {
      return [this._buildFileLevelMetadata(filePath, scope, imports, exports, rootNode, content)];
    }

    // Attach imports and exports to the first (primary) definition
    if (results.length > 0) {
      results[0].imports = imports;
      results[0].exports = exports;
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Top-level node dispatch
  // ---------------------------------------------------------------------------

  /**
   * Extract metadata from a single top-level AST node.
   * @param {object} node - tree-sitter node
   * @param {string} content - source content
   * @param {string[]} scope - derived scope
   * @param {Array<object>} imports - file-level imports
   * @returns {object|null} metadata or null if not a recognized definition
   */
  _extractTopLevelNode(node, content, scope, imports) {
    const type = node.type;

    // Classes (including abstract)
    if (this._isNodeType(type, ['class_definition', 'class_declaration'])) {
      return this._extractClass(node, content, scope);
    }

    // Mixins
    if (this._isNodeType(type, ['mixin_declaration', 'mixin_definition'])) {
      return this._extractMixin(node, content, scope);
    }

    // Extensions
    if (this._isNodeType(type, ['extension_declaration', 'extension_definition'])) {
      return this._extractExtension(node, content, scope);
    }

    // Enums
    if (this._isNodeType(type, ['enum_declaration', 'enum_definition'])) {
      return this._extractEnum(node, content, scope);
    }

    // Top-level functions
    if (this._isNodeType(type, [
      'function_definition', 'function_declaration',
      'function_signature', 'function_body',
      'top_level_definition',
    ])) {
      return this._extractFunction(node, content, scope);
    }

    // Typedefs
    if (this._isNodeType(type, ['type_alias', 'typedef', 'type_alias_declaration'])) {
      return this._extractTypedef(node, content, scope);
    }

    // Some grammars wrap top-level declarations
    if (this._isNodeType(type, ['declaration', 'top_level_definition'])) {
      // Recurse into the child
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        const result = this._extractTopLevelNode(child, content, scope, imports);
        if (result) return result;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Class extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract metadata from a class definition node.
   * @param {object} node
   * @param {string} content
   * @param {string[]} scope
   * @returns {object}
   */
  _extractClass(node, content, scope) {
    const text = this._nodeText(node, content);
    const name = this._extractClassName(node, content, text);
    const isAbstract = this._isAbstractClass(node, content, text);
    const inherits = this._extractSuperclass(node, content, text);
    const implementsList = this._extractImplements(node, content, text);
    const mixinsList = this._extractMixins(node, content, text);
    const typeParams = this._extractTypeParameters(node, content, text);
    const defines = [];
    const references = [];

    // Collect references from superclass, implements, mixins
    if (inherits) references.push(inherits);
    references.push(...implementsList);
    references.push(...mixinsList);

    // Extract body contents (methods, constructors, fields)
    this._extractClassBody(node, content, name, defines, references);

    return {
      type: 'class',
      name,
      abstract: isAbstract,
      exported: !name.startsWith('_'),
      inherits: inherits || null,
      implements: implementsList,
      mixins: mixinsList,
      typeParameters: typeParams.length > 0 ? typeParams : undefined,
      scope,
      defines,
      references: [...new Set(references)],
      imports: [],
    };
  }

  /**
   * Extract the class name from a node or text.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string}
   */
  _extractClassName(node, content, text) {
    // Try field-based extraction first
    const nameNode = node.childForFieldName('name');
    if (nameNode) return this._nodeText(nameNode, content);

    // Try finding first type_identifier or identifier child
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        return this._nodeText(child, content);
      }
    }

    // Fallback: regex on text
    const match = text.match(/(?:abstract\s+)?class\s+(\w+)/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * Determine if a class is abstract.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {boolean}
   */
  _isAbstractClass(node, content, text) {
    // Some grammars have 'abstract' as a child keyword node
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      const childText = this._nodeText(child, content);
      if (childText === 'abstract') return true;
    }
    // Fallback: check the text
    return /^\s*abstract\s+class\b/.test(text);
  }

  /**
   * Extract the superclass from a class definition.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string|null}
   */
  _extractSuperclass(node, content, text) {
    // Try field-based
    const superNode = node.childForFieldName('superclass');
    if (superNode) return this._cleanTypeName(this._nodeText(superNode, content));

    // Try looking for extends clause child
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (this._isNodeType(child.type, ['superclass', 'extends_clause', 'superclass_clause'])) {
        // Get the type from this clause
        const typeNode = this._findTypeInNode(child, content);
        if (typeNode) return this._cleanTypeName(typeNode);
      }
    }

    // Fallback: regex
    const match = text.match(/\bextends\s+([\w<>,\s?]+?)(?:\s+(?:implements|with|{)|\s*\{)/);
    if (match) return this._cleanTypeName(match[1].trim());

    return null;
  }

  /**
   * Extract implements list from a class definition.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string[]}
   */
  _extractImplements(node, content, text) {
    // Try field or child node
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (this._isNodeType(child.type, ['interfaces', 'implements_clause', 'interface_type_list'])) {
        return this._extractTypeList(child, content);
      }
    }

    // Fallback: regex
    const match = text.match(/\bimplements\s+([\w<>,\s?]+?)(?:\s+(?:with|{)|\s*\{)/);
    if (match) {
      return match[1].split(',').map(s => this._cleanTypeName(s.trim())).filter(Boolean);
    }
    return [];
  }

  /**
   * Extract mixin (with clause) list from a class definition.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string[]}
   */
  _extractMixins(node, content, text) {
    // Try child node
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (this._isNodeType(child.type, ['mixins', 'with_clause', 'mixin_application'])) {
        return this._extractTypeList(child, content);
      }
    }

    // Fallback: regex
    const match = text.match(/\bwith\s+([\w<>,\s?]+?)(?:\s+(?:implements|{)|\s*\{)/);
    if (match) {
      return match[1].split(',').map(s => this._cleanTypeName(s.trim())).filter(Boolean);
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Mixin extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract metadata from a mixin declaration node.
   * @param {object} node
   * @param {string} content
   * @param {string[]} scope
   * @returns {object}
   */
  _extractMixin(node, content, scope) {
    const text = this._nodeText(node, content);
    const name = this._extractMixinName(node, content, text);
    const onConstraints = this._extractOnConstraints(node, content, text);
    const implementsList = this._extractImplements(node, content, text);
    const defines = [];
    const references = [...onConstraints, ...implementsList];

    this._extractClassBody(node, content, name, defines, references);

    return {
      type: 'mixin',
      name,
      exported: !name.startsWith('_'),
      on: onConstraints,
      implements: implementsList,
      scope,
      defines,
      references: [...new Set(references)],
      imports: [],
    };
  }

  /**
   * Extract the mixin name.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string}
   */
  _extractMixinName(node, content, text) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return this._nodeText(nameNode, content);

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        return this._nodeText(child, content);
      }
    }

    const match = text.match(/\bmixin\s+(\w+)/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * Extract 'on' constraints from a mixin declaration.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string[]}
   */
  _extractOnConstraints(node, content, text) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (this._isNodeType(child.type, ['on_clause', 'superclass_constraint', 'on_interfaces'])) {
        return this._extractTypeList(child, content);
      }
    }

    const match = text.match(/\bon\s+([\w<>,\s?]+?)(?:\s+(?:implements|{)|\s*\{)/);
    if (match) {
      return match[1].split(',').map(s => this._cleanTypeName(s.trim())).filter(Boolean);
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Extension extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract metadata from an extension declaration node.
   * @param {object} node
   * @param {string} content
   * @param {string[]} scope
   * @returns {object}
   */
  _extractExtension(node, content, scope) {
    const text = this._nodeText(node, content);
    const name = this._extractExtensionName(node, content, text);
    const onType = this._extractExtensionOnType(node, content, text);
    const defines = [];
    const references = [];

    if (onType) references.push(this._cleanTypeName(onType));

    this._extractClassBody(node, content, name, defines, references);

    return {
      type: 'extension',
      name,
      exported: !name.startsWith('_'),
      on: onType,
      scope,
      defines,
      references: [...new Set(references)],
      imports: [],
    };
  }

  /**
   * Extract the extension name.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string}
   */
  _extractExtensionName(node, content, text) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return this._nodeText(nameNode, content);

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        const val = this._nodeText(child, content);
        if (val !== 'extension' && val !== 'on') return val;
      }
    }

    const match = text.match(/\bextension\s+(\w+)/);
    return match ? match[1] : 'UnnamedExtension';
  }

  /**
   * Extract the 'on' type from an extension.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string|null}
   */
  _extractExtensionOnType(node, content, text) {
    // Try child node approach
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (this._isNodeType(child.type, ['on_clause', 'type_identifier'])) {
        // For on_clause, find the type inside
        if (child.type === 'type_identifier') {
          // Skip the name identifier — look for the one after 'on'
          continue;
        }
        const typeText = this._findTypeInNode(child, content);
        if (typeText) return typeText;
      }
    }

    // Fallback: regex
    const match = text.match(/\bon\s+([\w<>,\s?]+?)(?:\s*\{)/);
    if (match) return match[1].trim();

    return null;
  }

  // ---------------------------------------------------------------------------
  // Enum extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract metadata from an enum declaration node.
   * @param {object} node
   * @param {string} content
   * @param {string[]} scope
   * @returns {object}
   */
  _extractEnum(node, content, scope) {
    const text = this._nodeText(node, content);
    const name = this._extractEnumName(node, content, text);
    const members = this._extractEnumMembers(node, content, text);
    const defines = [];
    const references = [];

    // Check for enhanced enum (methods/fields inside)
    this._extractClassBody(node, content, name, defines, references);

    return {
      type: 'enum',
      name,
      exported: !name.startsWith('_'),
      members,
      scope,
      defines,
      references: [...new Set(references)],
      imports: [],
    };
  }

  /**
   * Extract enum name.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string}
   */
  _extractEnumName(node, content, text) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return this._nodeText(nameNode, content);

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        return this._nodeText(child, content);
      }
    }

    const match = text.match(/\benum\s+(\w+)/);
    return match ? match[1] : 'Unknown';
  }

  /**
   * Extract enum members (values).
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {Array<{name: string}>}
   */
  _extractEnumMembers(node, content, text) {
    const members = [];

    // Try to find enum body / enum constants
    const bodyNode = this._findChildByTypes(node, [
      'enum_body', 'enum_constant_list', 'body', '{',
    ]);

    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (this._isNodeType(child.type, [
          'enum_constant', 'enum_value', 'identifier',
          'type_identifier',
        ])) {
          const memberName = this._nodeText(child, content).trim();
          if (memberName && memberName !== ',' && memberName !== '{' && memberName !== '}') {
            members.push({ name: memberName });
          }
        }
      }
    }

    // Fallback: regex extraction from the enum body
    if (members.length === 0) {
      const bodyMatch = text.match(/\{([^}]*?)(?:;|})/s);
      if (bodyMatch) {
        const body = bodyMatch[1];
        // Split by commas, filter out methods/constructors
        const parts = body.split(',');
        for (const part of parts) {
          const trimmed = part.trim();
          // Enum members are simple identifiers, possibly with constructor args
          const memberMatch = trimmed.match(/^(\w+)/);
          if (memberMatch && memberMatch[1] !== '' && !memberMatch[1].match(/^(final|const|static|void|int|String|bool|double|class)/)) {
            members.push({ name: memberMatch[1] });
          }
        }
      }
    }

    return members;
  }

  // ---------------------------------------------------------------------------
  // Top-level function extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract metadata from a top-level function node.
   * @param {object} node
   * @param {string} content
   * @param {string[]} scope
   * @returns {object|null}
   */
  _extractFunction(node, content, scope) {
    const text = this._nodeText(node, content);

    // Skip if this looks like a class/mixin/enum — some grammars wrap them
    if (/^\s*(abstract\s+)?class\s/.test(text)) return null;
    if (/^\s*mixin\s/.test(text)) return null;
    if (/^\s*enum\s/.test(text)) return null;

    const name = this._extractFunctionName(node, content, text);
    if (!name) return null;

    const returnType = this._extractReturnType(node, content, text);
    const params = this._extractParameters(node, content, text);
    const isAsync = this._isAsyncFunction(node, content, text);
    const isGenerator = this._isGeneratorFunction(text);
    const typeParams = this._extractTypeParameters(node, content, text);

    const references = [];
    if (returnType) {
      this._extractTypeReferences(returnType, references);
    }
    for (const p of params) {
      if (p.type) this._extractTypeReferences(p.type, references);
    }

    return {
      type: 'function',
      name,
      exported: !name.startsWith('_'),
      returnType: returnType || null,
      async: isAsync,
      generator: isGenerator,
      params,
      typeParameters: typeParams.length > 0 ? typeParams : undefined,
      scope,
      references: [...new Set(references)],
      imports: [],
    };
  }

  /**
   * Extract function name from node or text.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string|null}
   */
  _extractFunctionName(node, content, text) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return this._nodeText(nameNode, content);

    // Look for identifier children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') {
        const val = this._nodeText(child, content);
        // Skip keywords that might appear as identifiers
        if (!['void', 'async', 'static', 'final', 'const', 'var', 'late', 'get', 'set'].includes(val)) {
          return val;
        }
      }
    }

    // Fallback: regex
    const match = text.match(/(?:(?:Future|Stream|void|int|String|bool|double|[\w<>?,\s]+)\s+)?(\w+)\s*[<(]/);
    if (match) return match[1];

    return null;
  }

  // ---------------------------------------------------------------------------
  // Typedef extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract metadata from a typedef node.
   * @param {object} node
   * @param {string} content
   * @param {string[]} scope
   * @returns {object}
   */
  _extractTypedef(node, content, scope) {
    const text = this._nodeText(node, content);

    const match = text.match(/typedef\s+(\w+)/);
    const name = match ? match[1] : 'Unknown';

    return {
      type: 'typedef',
      name,
      exported: !name.startsWith('_'),
      definition: text.trim(),
      scope,
      references: [],
      imports: [],
    };
  }

  // ---------------------------------------------------------------------------
  // Class body extraction (methods, constructors, fields)
  // ---------------------------------------------------------------------------

  /**
   * Extract members from a class/mixin/extension/enum body.
   * @param {object} node - the class/mixin/extension node
   * @param {string} content
   * @param {string} className - name of the containing class
   * @param {Array} defines - mutated in place
   * @param {Array} references - mutated in place
   */
  _extractClassBody(node, content, className, defines, references) {
    const bodyNode = this._findClassBody(node);
    if (!bodyNode) {
      // Try extracting from the node itself (some grammars inline the body)
      this._extractMembersFromNode(node, content, className, defines, references);
      return;
    }

    this._extractMembersFromNode(bodyNode, content, className, defines, references);
  }

  /**
   * Find the class body node from a class definition.
   * @param {object} node
   * @returns {object|null}
   */
  _findClassBody(node) {
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) return bodyNode;

    // Try finding by type
    return this._findChildByTypes(node, [
      'class_body', 'declaration_list', 'block', 'enum_body',
    ]);
  }

  /**
   * Extract all members from a body node.
   * @param {object} node
   * @param {string} content
   * @param {string} className
   * @param {Array} defines
   * @param {Array} references
   */
  _extractMembersFromNode(node, content, className, defines, references) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      try {
        this._extractMember(child, content, className, defines, references);
      } catch (err) {
        // Defensive: skip problematic nodes
        continue;
      }
    }
  }

  /**
   * Extract a single member (method, constructor, field, getter, setter).
   * @param {object} node
   * @param {string} content
   * @param {string} className
   * @param {Array} defines
   * @param {Array} references
   */
  _extractMember(node, content, className, defines, references) {
    const type = node.type;
    const text = this._nodeText(node, content);

    // Constructor
    if (this._isNodeType(type, ['constructor_signature', 'constructor_definition', 'constructor_declaration'])) {
      this._extractConstructorDef(node, content, className, text, defines);
      return;
    }

    // Method
    if (this._isNodeType(type, [
      'method_signature', 'method_definition', 'method_declaration',
      'function_signature', 'function_definition',
    ])) {
      this._extractMethodDef(node, content, className, text, defines, references);
      return;
    }

    // Getter
    if (this._isNodeType(type, ['getter_signature', 'getter_definition', 'getter_declaration'])) {
      this._extractGetterDef(node, content, text, defines, references);
      return;
    }

    // Setter
    if (this._isNodeType(type, ['setter_signature', 'setter_definition', 'setter_declaration'])) {
      this._extractSetterDef(node, content, text, defines, references);
      return;
    }

    // Field / variable declaration
    if (this._isNodeType(type, [
      'declaration', 'variable_declaration', 'field_declaration',
      'final_builtin', 'initialized_variable_definition',
      'static_final_declaration', 'static_final_declaration_list',
    ])) {
      this._extractFieldDef(node, content, text, defines, references);
      return;
    }

    // Annotation (track but don't add to defines)
    if (this._isNodeType(type, ['annotation', 'marker_annotation'])) {
      const annotText = text.trim();
      if (annotText.startsWith('@')) {
        const annName = annotText.replace(/^@/, '').split('(')[0];
        references.push(annName);
      }
      return;
    }

    // For declaration wrappers, recurse into children
    if (this._isNodeType(type, ['class_member_definition', 'declaration_statement'])) {
      for (let i = 0; i < node.childCount; i++) {
        this._extractMember(node.child(i), content, className, defines, references);
      }
      return;
    }

    // Fallback: try text-based detection for constructor/method patterns
    if (text.trim().length > 0 && !text.startsWith('//') && !text.startsWith('/*')) {
      this._textBasedMemberExtraction(text, className, defines, references);
    }
  }

  /**
   * Extract a constructor definition.
   * @param {object} node
   * @param {string} content
   * @param {string} className
   * @param {string} text
   * @param {Array} defines
   */
  _extractConstructorDef(node, content, className, text, defines) {
    const isFactory = text.includes('factory');
    const isConst = /\bconst\b/.test(text);
    let name = className;
    let isNamed = false;

    // Check for named constructor: ClassName.name(...)
    const namedMatch = text.match(new RegExp(`${this._escapeRegex(className)}\\.([\\w]+)`));
    if (namedMatch) {
      name = `${className}.${namedMatch[1]}`;
      isNamed = true;
    }

    defines.push({
      name,
      type: 'constructor',
      named: isNamed,
      const: isConst,
      factory: isFactory,
    });
  }

  /**
   * Extract a method definition.
   * @param {object} node
   * @param {string} content
   * @param {string} className
   * @param {string} text
   * @param {Array} defines
   * @param {Array} references
   */
  _extractMethodDef(node, content, className, text, defines, references) {
    const name = this._extractFunctionName(node, content, text);
    if (!name) return;

    // Skip if this looks like a constructor
    if (name === className || text.match(new RegExp(`^\\s*(?:factory\\s+|const\\s+)?${this._escapeRegex(className)}[.(]`))) {
      this._extractConstructorDef(node, content, className, text, defines);
      return;
    }

    const isStatic = /\bstatic\b/.test(text);
    const isAbstract = text.trimEnd().endsWith(';') && !text.includes('=>') && !text.includes('{');
    const isAsync = this._isAsyncFunction(node, content, text);
    const returnType = this._extractReturnType(node, content, text);
    const visibility = name.startsWith('_') ? 'private' : 'public';

    if (returnType) {
      this._extractTypeReferences(returnType, references);
    }

    defines.push({
      name,
      type: 'method',
      visibility,
      static: isStatic,
      abstract: isAbstract,
      async: isAsync,
      returnType: returnType || null,
    });
  }

  /**
   * Extract a getter definition.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @param {Array} defines
   * @param {Array} references
   */
  _extractGetterDef(node, content, text, defines, references) {
    const match = text.match(/(?:(\w[\w<>?]*)\s+)?get\s+(\w+)/);
    if (!match) return;

    const returnType = match[1] || null;
    const name = match[2];
    const visibility = name.startsWith('_') ? 'private' : 'public';

    defines.push({
      name,
      type: 'getter',
      visibility,
      returnType,
    });

    if (returnType) this._extractTypeReferences(returnType, references);
  }

  /**
   * Extract a setter definition.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @param {Array} defines
   * @param {Array} references
   */
  _extractSetterDef(node, content, text, defines, references) {
    const match = text.match(/set\s+(\w+)/);
    if (!match) return;

    const name = match[1];
    const visibility = name.startsWith('_') ? 'private' : 'public';

    defines.push({
      name,
      type: 'setter',
      visibility,
    });
  }

  /**
   * Extract a field/variable definition.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @param {Array} defines
   * @param {Array} references
   */
  _extractFieldDef(node, content, text, defines, references) {
    const trimmed = text.trim();

    // Skip method/constructor signatures that might be wrapped in declaration nodes
    if (trimmed.includes('(') && !trimmed.includes('=')) return;

    const isFinal = /\bfinal\b/.test(trimmed);
    const isLate = /\blate\b/.test(trimmed);
    const isConst = /\bconst\b/.test(trimmed);
    const isStatic = /\bstatic\b/.test(trimmed);

    // Parse field: [static] [late] [final|const|var] [Type] name [= value];
    // Remove modifiers to find type and name
    let cleaned = trimmed
      .replace(/\bstatic\b/, '')
      .replace(/\blate\b/, '')
      .replace(/\bfinal\b/, '')
      .replace(/\bconst\b/, '')
      .replace(/\bvar\b/, '')
      .replace(/;$/, '')
      .trim();

    // Remove default value
    const eqIdx = cleaned.indexOf('=');
    if (eqIdx > 0) {
      cleaned = cleaned.substring(0, eqIdx).trim();
    }

    // Split into type and name
    let fieldType = null;
    let fieldName = null;

    // Check for Type<Generic> name pattern
    const typeNameMatch = cleaned.match(/^([\w<>,?\s]+?)\s+(\w+)$/);
    if (typeNameMatch) {
      fieldType = typeNameMatch[1].trim();
      fieldName = typeNameMatch[2];
    } else {
      // Just a name (var x / final x)
      const nameMatch = cleaned.match(/(\w+)$/);
      if (nameMatch) {
        fieldName = nameMatch[1];
      }
    }

    if (!fieldName) return;

    // Skip if the name looks like a keyword
    if (['void', 'return', 'if', 'else', 'for', 'while', 'class', 'enum'].includes(fieldName)) return;

    const visibility = fieldName.startsWith('_') ? 'private' : 'public';

    defines.push({
      name: fieldName,
      type: 'field',
      fieldType: fieldType || null,
      visibility,
      final: isFinal,
      late: isLate,
      const: isConst,
      static: isStatic,
    });

    if (fieldType) {
      this._extractTypeReferences(fieldType, references);
    }
  }

  /**
   * Fallback: text-based member extraction when AST node types don't match.
   * @param {string} text
   * @param {string} className
   * @param {Array} defines
   * @param {Array} references
   */
  _textBasedMemberExtraction(text, className, defines, references) {
    const trimmed = text.trim();

    // Skip punctuation, braces, annotations
    if (/^[{};,()@]/.test(trimmed)) return;
    if (trimmed.startsWith('@')) return;

    // Check for constructor pattern: ClassName(...) or ClassName.name(...)
    const ctorPattern = new RegExp(`^\\s*(?:(?:factory|const)\\s+)?${this._escapeRegex(className)}(?:\\.(\\w+))?\\s*\\(`);
    const ctorMatch = trimmed.match(ctorPattern);
    if (ctorMatch) {
      const namedPart = ctorMatch[1];
      defines.push({
        name: namedPart ? `${className}.${namedPart}` : className,
        type: 'constructor',
        named: !!namedPart,
        const: /\bconst\b/.test(trimmed),
        factory: /\bfactory\b/.test(trimmed),
      });
      return;
    }

    // Check for method pattern: [ReturnType] name(...)
    const methodMatch = trimmed.match(/^(?:static\s+)?(?:(?:Future|Stream|void|int|String|bool|double|[\w<>?,\s]+?)\s+)?(\w+)\s*\(/);
    if (methodMatch && methodMatch[1] !== className) {
      const name = methodMatch[1];
      if (!['if', 'for', 'while', 'switch', 'catch', 'class', 'enum', 'super', 'this'].includes(name)) {
        const returnType = this._extractReturnTypeFromText(trimmed);
        defines.push({
          name,
          type: 'method',
          visibility: name.startsWith('_') ? 'private' : 'public',
          static: /\bstatic\b/.test(trimmed),
          abstract: false,
          async: /\basync\b/.test(trimmed),
          returnType: returnType || null,
        });
        return;
      }
    }

    // Check for field pattern: [static] [late] [final|const|var] [Type] name [= ...];
    const fieldMatch = trimmed.match(/^(?:static\s+)?(?:late\s+)?(?:final|const|var)?\s*(?:([\w<>?,\s]+?)\s+)?(\w+)\s*(?:=|;)/);
    if (fieldMatch) {
      const fieldType = fieldMatch[1] ? fieldMatch[1].trim() : null;
      const fieldName = fieldMatch[2];
      if (fieldName && !['void', 'return', 'if', 'else', 'for', 'while', 'class', 'enum'].includes(fieldName)) {
        defines.push({
          name: fieldName,
          type: 'field',
          fieldType,
          visibility: fieldName.startsWith('_') ? 'private' : 'public',
          final: /\bfinal\b/.test(trimmed),
          late: /\blate\b/.test(trimmed),
          const: /\bconst\b/.test(trimmed),
          static: /\bstatic\b/.test(trimmed),
        });
        if (fieldType) this._extractTypeReferences(fieldType, references);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Import / Export extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract import statements from the root AST.
   * @param {object} rootNode
   * @param {string} content
   * @returns {Array<object>}
   */
  _extractImports(rootNode, content) {
    const imports = [];

    // Try AST-based extraction
    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);
      const text = this._nodeText(child, content).trim();

      if (this._isNodeType(child.type, [
        'import_or_export', 'import_specification', 'import_directive',
        'library_import', 'part_directive', 'part_of_directive',
      ]) || text.startsWith('import ')) {
        const parsed = this._parseImportText(text);
        if (parsed) imports.push(parsed);
      }
    }

    // Fallback: regex-based extraction from content
    if (imports.length === 0) {
      const importRegex = /import\s+['"]([^'"]+)['"]\s*(as\s+(\w+))?\s*(show\s+([^;]+?))?\s*(hide\s+([^;]+?))?\s*;/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const from = match[1];
        const asAlias = match[3] || null;
        const showList = match[5] ? match[5].split(',').map(s => s.trim()).filter(Boolean) : [];
        const hideList = match[7] ? match[7].split(',').map(s => s.trim()).filter(Boolean) : [];

        const name = from.split('/').pop() || from;
        imports.push({
          name,
          from,
          show: showList,
          hide: hideList,
          as: asAlias,
        });
      }
    }

    return imports;
  }

  /**
   * Extract export statements from the root AST.
   * @param {object} rootNode
   * @param {string} content
   * @returns {Array<object>}
   */
  _extractExports(rootNode, content) {
    const exports = [];

    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);
      const text = this._nodeText(child, content).trim();

      if (text.startsWith('export ')) {
        const parsed = this._parseExportText(text);
        if (parsed) exports.push(parsed);
      }
    }

    // Fallback: regex
    if (exports.length === 0) {
      const exportRegex = /export\s+['"]([^'"]+)['"]\s*(show\s+([^;]+?))?\s*(hide\s+([^;]+?))?\s*;/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        const from = match[1];
        const showList = match[3] ? match[3].split(',').map(s => s.trim()).filter(Boolean) : [];
        const hideList = match[5] ? match[5].split(',').map(s => s.trim()).filter(Boolean) : [];

        exports.push({
          name: from.split('/').pop() || from,
          from,
          show: showList,
          hide: hideList,
        });
      }
    }

    return exports;
  }

  /**
   * Parse an import statement text into structured data.
   * @param {string} text
   * @returns {object|null}
   */
  _parseImportText(text) {
    const match = text.match(/import\s+['"]([^'"]+)['"]\s*(as\s+(\w+))?\s*(show\s+([^;]+?))?\s*(hide\s+([^;]+?))?\s*;?/);
    if (!match) return null;

    const from = match[1];
    const asAlias = match[3] || null;
    const showList = match[5] ? match[5].split(',').map(s => s.trim()).filter(Boolean) : [];
    const hideList = match[7] ? match[7].split(',').map(s => s.trim()).filter(Boolean) : [];

    return {
      name: from.split('/').pop() || from,
      from,
      show: showList,
      hide: hideList,
      as: asAlias,
    };
  }

  /**
   * Parse an export statement text into structured data.
   * @param {string} text
   * @returns {object|null}
   */
  _parseExportText(text) {
    const match = text.match(/export\s+['"]([^'"]+)['"]\s*(show\s+([^;]+?))?\s*(hide\s+([^;]+?))?\s*;?/);
    if (!match) return null;

    const from = match[1];
    const showList = match[3] ? match[3].split(',').map(s => s.trim()).filter(Boolean) : [];
    const hideList = match[5] ? match[5].split(',').map(s => s.trim()).filter(Boolean) : [];

    return {
      name: from.split('/').pop() || from,
      from,
      show: showList,
      hide: hideList,
    };
  }

  // ---------------------------------------------------------------------------
  // Helper methods
  // ---------------------------------------------------------------------------

  /**
   * Derive scope from file path.
   * @param {string} filePath
   * @returns {string[]}
   */
  _deriveScope(filePath) {
    if (!filePath) return [];
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');

    // Find meaningful start: lib/, src/, app/
    const libIndex = parts.indexOf('lib');
    const srcIndex = parts.indexOf('src');
    const appIndex = parts.indexOf('app');
    const startIndex = libIndex >= 0
      ? libIndex
      : (srcIndex >= 0 ? srcIndex : (appIndex >= 0 ? appIndex : Math.max(0, parts.length - 3)));

    // Drop the filename
    const scopeParts = parts.slice(startIndex, parts.length - 1);
    return scopeParts.filter(p => p && p !== '.' && p !== '..');
  }

  /**
   * Build file-level metadata when no top-level definitions are found.
   * @param {string} filePath
   * @param {string[]} scope
   * @param {Array} imports
   * @param {Array} exports
   * @param {object} rootNode
   * @param {string} content
   * @returns {object}
   */
  _buildFileLevelMetadata(filePath, scope, imports, exports, rootNode, content) {
    const basename = path.basename(filePath, '.dart');
    return {
      type: 'file',
      name: basename,
      scope,
      defines: [],
      references: [],
      imports,
      exports,
    };
  }

  /**
   * Check if a node type matches any of the given possible names.
   * @param {string} type
   * @param {string[]} possibleTypes
   * @returns {boolean}
   */
  _isNodeType(type, possibleTypes) {
    return possibleTypes.includes(type);
  }

  /**
   * Find a child node matching any of the given type names.
   * @param {object} node
   * @param {string[]} types
   * @returns {object|null}
   */
  _findChildByTypes(node, types) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (types.includes(child.type)) return child;
    }
    return null;
  }

  /**
   * Extract a list of type names from a clause node (implements, with, on).
   * @param {object} node
   * @param {string} content
   * @returns {string[]}
   */
  _extractTypeList(node, content) {
    const types = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        types.push(this._nodeText(child, content));
      } else if (this._isNodeType(child.type, ['type_name', 'named_type', 'type'])) {
        types.push(this._cleanTypeName(this._nodeText(child, content)));
      }
    }
    // If no typed children found, try text extraction
    if (types.length === 0) {
      const text = this._nodeText(node, content);
      // Remove the keyword (implements, with, on)
      const cleaned = text.replace(/^(implements|with|on)\s+/, '');
      if (cleaned) {
        return cleaned.split(',').map(s => this._cleanTypeName(s.trim())).filter(Boolean);
      }
    }
    return types;
  }

  /**
   * Find a type string inside a node.
   * @param {object} node
   * @param {string} content
   * @returns {string|null}
   */
  _findTypeInNode(node, content) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        return this._nodeText(child, content);
      }
      if (this._isNodeType(child.type, ['type_name', 'named_type', 'type'])) {
        return this._nodeText(child, content);
      }
    }
    return null;
  }

  /**
   * Extract type parameters (generics) from a node.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string[]}
   */
  _extractTypeParameters(node, content, text) {
    // Try AST
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (this._isNodeType(child.type, ['type_parameters', 'type_arguments', 'type_parameter_list'])) {
        const params = [];
        for (let j = 0; j < child.childCount; j++) {
          const param = child.child(j);
          if (param.type === 'type_parameter' || param.type === 'type_identifier' || param.type === 'identifier') {
            params.push(this._nodeText(param, content));
          }
        }
        return params;
      }
    }

    // Fallback: regex for <T, U extends Something>
    const match = text.match(/\w+<([^()]+?)>(?:\s*(?:extends|implements|with|on|{|\())/);
    if (match) {
      return match[1].split(',').map(s => s.trim()).filter(Boolean);
    }

    return [];
  }

  /**
   * Extract return type from a function/method node.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {string|null}
   */
  _extractReturnType(node, content, text) {
    // Try field-based
    const returnTypeNode = node.childForFieldName('return_type') || node.childForFieldName('returnType');
    if (returnTypeNode) return this._nodeText(returnTypeNode, content);

    // Try child node
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (this._isNodeType(child.type, ['type_identifier', 'type_name', 'named_type', 'function_type', 'void_type'])) {
        // Make sure this isn't the function name
        const nextSibling = node.child(i + 1);
        if (nextSibling && (nextSibling.type === 'identifier' || nextSibling.type === 'type_identifier')) {
          return this._nodeText(child, content);
        }
      }
    }

    // Fallback: text-based
    return this._extractReturnTypeFromText(text);
  }

  /**
   * Extract return type from raw text.
   * @param {string} text
   * @returns {string|null}
   */
  _extractReturnTypeFromText(text) {
    const trimmed = text.trim()
      .replace(/^static\s+/, '')
      .replace(/^abstract\s+/, '')
      .replace(/^@\w+\s+/, '');

    // Match patterns like: Future<void> methodName(
    // or: void methodName(
    // or: List<Order?> methodName(
    const match = trimmed.match(/^((?:Future|Stream|FutureOr|Iterable)<[^>]+>(?:\?)?|void|int|double|String|bool|num|dynamic|[\w]+(?:<[^>]+>)?(?:\?)?)(?:\s+(?:get\s+)?\w+\s*[(<])/);
    if (match) return match[1];

    return null;
  }

  /**
   * Extract parameters from a function/method.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {Array<{name: string, type: string|null, required: boolean, named: boolean}>}
   */
  _extractParameters(node, content, text) {
    // Try to find formal parameter list node
    const paramListNode = this._findChildByTypes(node, [
      'formal_parameter_list', 'parameter_list', 'parameters',
    ]);

    if (paramListNode) {
      return this._extractParamsFromNode(paramListNode, content);
    }

    // Fallback: regex on text
    return this._extractParamsFromText(text);
  }

  /**
   * Extract parameters from a parameter list node.
   * @param {object} node
   * @param {string} content
   * @returns {Array<object>}
   */
  _extractParamsFromNode(node, content) {
    const params = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (this._isNodeType(child.type, [
        'formal_parameter', 'simple_formal_parameter', 'field_formal_parameter',
        'default_formal_parameter', 'function_typed_formal_parameter',
        'normal_formal_parameter', 'optional_formal_parameter',
      ])) {
        const paramText = this._nodeText(child, content).trim();
        const parsed = this._parseSingleParam(paramText);
        if (parsed) params.push(parsed);
      }
    }
    return params;
  }

  /**
   * Extract parameters from text using regex.
   * @param {string} text
   * @returns {Array<object>}
   */
  _extractParamsFromText(text) {
    const parenMatch = text.match(/\(([^)]*)\)/);
    if (!parenMatch) return [];

    const paramsStr = parenMatch[1].trim();
    if (!paramsStr) return [];

    const params = [];
    // Simple split (doesn't handle nested generics perfectly but good enough)
    const parts = this._splitParams(paramsStr);
    for (const part of parts) {
      const parsed = this._parseSingleParam(part.trim());
      if (parsed) params.push(parsed);
    }
    return params;
  }

  /**
   * Parse a single parameter string.
   * @param {string} text
   * @returns {object|null}
   */
  _parseSingleParam(text) {
    if (!text) return null;
    const trimmed = text.replace(/^{/, '').replace(/}$/, '').trim();
    if (!trimmed) return null;

    const isRequired = /\brequired\b/.test(trimmed);
    const isNamed = text.startsWith('{') || isRequired;
    const cleaned = trimmed.replace(/\brequired\b/, '').replace(/\bthis\./, '').trim();

    // Remove default value
    const eqIdx = cleaned.indexOf('=');
    const withoutDefault = eqIdx > 0 ? cleaned.substring(0, eqIdx).trim() : cleaned;

    // Try to split into type and name
    const typeNameMatch = withoutDefault.match(/^([\w<>,?\s]+?)\s+(\w+)$/);
    if (typeNameMatch) {
      return {
        name: typeNameMatch[2],
        type: typeNameMatch[1].trim(),
        required: isRequired,
        named: isNamed,
      };
    }

    // Just a name
    const nameMatch = withoutDefault.match(/(\w+)$/);
    if (nameMatch) {
      return {
        name: nameMatch[1],
        type: null,
        required: isRequired,
        named: isNamed,
      };
    }

    return null;
  }

  /**
   * Split parameter string by commas, respecting angle bracket nesting.
   * @param {string} str
   * @returns {string[]}
   */
  _splitParams(str) {
    const parts = [];
    let depth = 0;
    let current = '';

    for (const ch of str) {
      if (ch === '<' || ch === '(') depth++;
      else if (ch === '>' || ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  /**
   * Check if a function/method is async.
   * @param {object} node
   * @param {string} content
   * @param {string} text
   * @returns {boolean}
   */
  _isAsyncFunction(node, content, text) {
    // Check for async keyword in node children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      const childText = this._nodeText(child, content);
      if (childText === 'async' || childText === 'async*') return true;
    }
    // Fallback: check text
    return /\basync\b/.test(text);
  }

  /**
   * Check if a function is a generator (sync* or async*).
   * @param {string} text
   * @returns {boolean}
   */
  _isGeneratorFunction(text) {
    return /\basync\s*\*/.test(text) || /\bsync\s*\*/.test(text);
  }

  /**
   * Extract type references from a type string.
   * @param {string} typeStr - e.g. "Future<List<Order?>>"
   * @param {string[]} refs - mutated in place
   */
  _extractTypeReferences(typeStr, refs) {
    if (!typeStr) return;
    // Extract all identifiers from the type string
    const identifiers = typeStr.match(/[A-Z]\w*/g);
    if (identifiers) {
      for (const id of identifiers) {
        if (!['T', 'E', 'K', 'V', 'S', 'R'].includes(id)) {
          refs.push(id);
        }
      }
    }
  }

  /**
   * Clean a type name string (remove whitespace, trailing commas).
   * @param {string} str
   * @returns {string}
   */
  _cleanTypeName(str) {
    if (!str) return '';
    return str.replace(/,\s*$/, '').trim();
  }

  /**
   * Get the text content of a tree-sitter node.
   * @param {object} node
   * @param {string} content
   * @returns {string}
   */
  _nodeText(node, content) {
    return content.slice(node.startIndex, node.endIndex);
  }

  /**
   * Escape a string for use in a regular expression.
   * @param {string} str
   * @returns {string}
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { DartAnalyzer };
