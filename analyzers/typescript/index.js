'use strict';

const path = require('path');
const { BaseAnalyzer } = require('../base-analyzer');
const { loadParser, loadTSXParser } = require('../shared/tree-sitter-loader');

/**
 * TypeScript/TSX Analyzer
 *
 * Extracts semantic metadata from TypeScript and TSX files using tree-sitter.
 * Handles classes, interfaces, type aliases, enums, functions, imports, exports,
 * decorators, generics, and visibility modifiers.
 */
class TypeScriptAnalyzer extends BaseAnalyzer {
  /**
   * Parse TypeScript/TSX source code into a tree-sitter AST.
   * Detects .tsx from filePath and uses the TSX parser accordingly.
   * @param {string} filePath - Path to the file
   * @param {string} content - Raw file content
   * @returns {object|null} Parsed tree-sitter tree, or null if parsing fails
   */
  parse(filePath, content) {
    const ext = path.extname(filePath).toLowerCase();
    const loaded = ext === '.tsx' ? loadTSXParser() : loadParser('typescript');
    if (!loaded) return null;

    try {
      return loaded.parser.parse(content);
    } catch (err) {
      console.warn(`[ts-analyzer] Failed to parse ${filePath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract semantic metadata from a parsed TypeScript AST.
   * @param {object} tree - tree-sitter parse tree
   * @param {string} filePath - Path for scope derivation
   * @param {string} content - Raw source content
   * @returns {object} Metadata object
   */
  extractMetadata(tree, filePath, content) {
    const rootNode = tree.rootNode;
    const imports = extractImports(rootNode, content);
    const exports = extractExports(rootNode, content);
    const scope = deriveScope(filePath);

    const definitions = [];
    const allDefines = [];
    const allReferences = new Set();

    // Walk top-level children
    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);

      // Handle export_statement wrapping declarations
      const innerNode = unwrapExportStatement(node);
      const isExported = node.type === 'export_statement' || hasExportKeyword(node, content);

      switch (innerNode.type) {
        case 'class_declaration': {
          const cls = extractClass(innerNode, content, node);
          cls.exported = cls.exported || isExported;
          definitions.push(cls);
          allDefines.push({ name: cls.name, type: 'class', exported: cls.exported });
          if (cls.defines) {
            for (const d of cls.defines) {
              allDefines.push(d);
            }
          }
          collectReferences(cls, allReferences);
          break;
        }
        case 'abstract_class_declaration': {
          const cls = extractClass(innerNode, content, node);
          cls.exported = cls.exported || isExported;
          cls.abstract = true;
          if (cls.typeInfo) cls.typeInfo.abstract = true;
          definitions.push(cls);
          allDefines.push({ name: cls.name, type: 'class', exported: cls.exported });
          if (cls.defines) {
            for (const d of cls.defines) {
              allDefines.push(d);
            }
          }
          collectReferences(cls, allReferences);
          break;
        }
        case 'interface_declaration': {
          const iface = extractInterface(innerNode, content);
          iface.exported = iface.exported || isExported;
          definitions.push(iface);
          allDefines.push({ name: iface.name, type: 'interface', exported: iface.exported });
          collectReferences(iface, allReferences);
          break;
        }
        case 'type_alias_declaration': {
          const alias = extractTypeAlias(innerNode, content);
          alias.exported = alias.exported || isExported;
          definitions.push(alias);
          allDefines.push({ name: alias.name, type: 'type_alias', exported: alias.exported });
          collectReferences(alias, allReferences);
          break;
        }
        case 'enum_declaration': {
          const en = extractEnum(innerNode, content);
          en.exported = en.exported || isExported;
          definitions.push(en);
          allDefines.push({ name: en.name, type: 'enum', exported: en.exported });
          break;
        }
        case 'function_declaration': {
          const fn = extractFunction(innerNode, content);
          fn.exported = fn.exported || isExported;
          definitions.push(fn);
          allDefines.push({ name: fn.name, type: 'function', exported: fn.exported });
          collectReferences(fn, allReferences);
          break;
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          const vars = extractVariableDeclaration(innerNode, content, isExported);
          for (const v of vars) {
            definitions.push(v);
            allDefines.push({ name: v.name, type: v.type, exported: v.exported });
            collectReferences(v, allReferences);
          }
          break;
        }
        default:
          // export_statement may contain re-exports without inner declaration
          break;
      }
    }

    // Collect import references
    for (const imp of imports) {
      allReferences.add(imp.name);
    }

    // Determine primary definition
    const primary = definitions.find(d =>
      d.type === 'class' || d.type === 'interface'
    ) || definitions[0] || { type: 'module', name: path.basename(filePath, path.extname(filePath)) };

    return {
      type: primary.type,
      name: primary.name,
      exported: primary.exported || false,
      inherits: primary.inherits || null,
      scope,
      defines: allDefines,
      references: Array.from(allReferences),
      imports,
      exports,
      definitions,
      typeInfo: primary.typeInfo || {
        interfaces_implemented: [],
        generics: [],
        decorators: [],
        abstract: false,
      },
    };
  }
}

// ─── Helper: Extract text from a tree-sitter node ───────────────────────────

/**
 * Get the source text of a tree-sitter node.
 * @param {object} node - tree-sitter node
 * @param {string} content - full source content
 * @returns {string}
 */
function extractNodeText(node, content) {
  if (!node) return '';
  return content.slice(node.startIndex, node.endIndex).trim();
}

// ─── Helper: Derive scope from file path ────────────────────────────────────

/**
 * Derive a scope array from a file path.
 * @param {string} filePath
 * @returns {string[]}
 */
function deriveScope(filePath) {
  const parsed = path.parse(filePath);
  const segments = parsed.dir.split(path.sep).filter(Boolean);
  // Take the last few meaningful segments (skip root-level noise)
  const srcIndex = segments.indexOf('src');
  if (srcIndex >= 0) {
    return segments.slice(srcIndex);
  }
  // If no 'src' dir, take the last 3 segments
  return segments.slice(-3);
}

// ─── Helper: Unwrap export_statement to get inner declaration ───────────────

/**
 * If the node is an export_statement, return its inner declaration node.
 * Otherwise return the node itself.
 * @param {object} node
 * @returns {object}
 */
function unwrapExportStatement(node) {
  if (node.type === 'export_statement') {
    // Look for the declaration child (class_declaration, function_declaration, etc.)
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (
        child.type === 'class_declaration' ||
        child.type === 'abstract_class_declaration' ||
        child.type === 'interface_declaration' ||
        child.type === 'type_alias_declaration' ||
        child.type === 'enum_declaration' ||
        child.type === 'function_declaration' ||
        child.type === 'lexical_declaration' ||
        child.type === 'variable_declaration'
      ) {
        return child;
      }
    }
  }
  return node;
}

// ─── Helper: Check for export keyword ───────────────────────────────────────

/**
 * Check if a node has an 'export' keyword as a direct child.
 * @param {object} node
 * @param {string} content
 * @returns {boolean}
 */
function hasExportKeyword(node, content) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (extractNodeText(child, content) === 'export') {
      return true;
    }
  }
  return false;
}

// ─── Imports ────────────────────────────────────────────────────────────────

/**
 * Extract all import statements from the root node.
 * Differentiates regular imports from type imports.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{name: string, from: string, isType: boolean}>}
 */
function extractImports(rootNode, content) {
  const imports = [];

  for (let i = 0; i < rootNode.childCount; i++) {
    const node = rootNode.child(i);
    if (node.type !== 'import_statement') continue;

    const text = extractNodeText(node, content);
    const isTypeImport = text.startsWith('import type ');

    // Extract the source (from clause)
    const sourceNode = node.childForFieldName('source');
    const from = sourceNode ? extractNodeText(sourceNode, content).replace(/['"]/g, '') : '';

    // Extract imported names from import_clause
    const importClause = findChildByType(node, 'import_clause');
    if (importClause) {
      extractImportNames(importClause, content, from, isTypeImport, imports);
    }
  }

  return imports;
}

/**
 * Recursively extract import names from an import_clause node.
 * @param {object} node - import_clause or named_imports node
 * @param {string} content
 * @param {string} from - module path
 * @param {boolean} isTypeImport - whether the entire import is a type import
 * @param {Array} imports - accumulator array
 */
function extractImportNames(node, content, from, isTypeImport, imports) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'identifier' || child.type === 'type_identifier') {
      // Default import
      imports.push({ name: extractNodeText(child, content), from, isType: isTypeImport });
    } else if (child.type === 'named_imports') {
      // Named imports: { X, Y, Z }
      for (let j = 0; j < child.childCount; j++) {
        const spec = child.child(j);
        if (spec.type === 'import_specifier') {
          const nameNode = spec.childForFieldName('name') || spec.childForFieldName('alias');
          const name = nameNode ? extractNodeText(nameNode, content) : '';
          if (name) {
            // Check if individual specifier has 'type' keyword
            const specText = extractNodeText(spec, content);
            const specIsType = isTypeImport || specText.startsWith('type ');
            imports.push({ name, from, isType: specIsType });
          }
        }
      }
    } else if (child.type === 'namespace_import') {
      // import * as X
      const nameNode = findChildByType(child, 'identifier');
      if (nameNode) {
        imports.push({ name: extractNodeText(nameNode, content), from, isType: isTypeImport });
      }
    }
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

/**
 * Extract all export statements from the root node.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{name: string, isDefault: boolean, isReExport: boolean, from: string|null}>}
 */
function extractExports(rootNode, content) {
  const exports = [];

  for (let i = 0; i < rootNode.childCount; i++) {
    const node = rootNode.child(i);
    if (node.type !== 'export_statement') continue;

    const text = extractNodeText(node, content);
    const isDefault = text.includes('export default');

    // Check for re-export (export ... from '...')
    const sourceNode = node.childForFieldName('source');
    const from = sourceNode ? extractNodeText(sourceNode, content).replace(/['"]/g, '') : null;
    const isReExport = from !== null;

    // Get the inner declaration
    const inner = unwrapExportStatement(node);

    if (inner !== node) {
      // Has a declaration
      const nameNode = inner.childForFieldName('name');
      const name = nameNode ? extractNodeText(nameNode, content) : '';
      if (name) {
        exports.push({ name, isDefault, isReExport, from });
      }
    } else {
      // Named export clause: export { X, Y }
      const exportClause = findChildByType(node, 'export_clause');
      if (exportClause) {
        for (let j = 0; j < exportClause.childCount; j++) {
          const spec = exportClause.child(j);
          if (spec.type === 'export_specifier') {
            const nameNode = spec.childForFieldName('name');
            const name = nameNode ? extractNodeText(nameNode, content) : '';
            if (name) {
              exports.push({ name, isDefault: name === 'default', isReExport, from });
            }
          }
        }
      } else if (isDefault) {
        // export default <expression>
        exports.push({ name: 'default', isDefault: true, isReExport, from });
      }
    }
  }

  return exports;
}

// ─── Class Extraction ───────────────────────────────────────────────────────

/**
 * Extract class information from a class_declaration or abstract_class_declaration node.
 * @param {object} node
 * @param {string} content
 * @returns {object}
 */
function extractClass(node, content, parentNode) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? extractNodeText(nameNode, content) : '';
  const isAbstract = node.type === 'abstract_class_declaration';

  // Heritage: extends and implements
  let inherits = null;
  const implementsList = [];
  const heritage = findChildByType(node, 'class_heritage');
  if (heritage) {
    for (let i = 0; i < heritage.childCount; i++) {
      const child = heritage.child(i);
      if (child.type === 'extends_clause') {
        const extendsValue = findChildByType(child, 'identifier') || findChildByType(child, 'type_identifier');
        // Also check for generic type references inside extends
        const genericRef = findChildByType(child, 'generic_type');
        if (genericRef) {
          const typeNameNode = findChildByType(genericRef, 'type_identifier') || findChildByType(genericRef, 'identifier');
          inherits = typeNameNode ? extractNodeText(typeNameNode, content) : null;
        } else if (extendsValue) {
          inherits = extractNodeText(extendsValue, content);
        }
      } else if (child.type === 'implements_clause') {
        for (let j = 0; j < child.childCount; j++) {
          const impl = child.child(j);
          if (impl.type === 'type_identifier' || impl.type === 'identifier') {
            implementsList.push(extractNodeText(impl, content));
          } else if (impl.type === 'generic_type') {
            const typeNameNode = findChildByType(impl, 'type_identifier') || findChildByType(impl, 'identifier');
            if (typeNameNode) {
              implementsList.push(extractNodeText(typeNameNode, content));
            }
          }
        }
      }
    }
  }

  // Decorators
  // Decorators: check both the node itself and the parent (export_statement may hold decorators)
  let decorators = getDecorators(node, content);
  if (decorators.length === 0 && parentNode && parentNode !== node) {
    decorators = getDecorators(parentNode, content);
  }

  // Generics
  const generics = getTypeParameters(node, content);

  // Body: methods and fields
  const body = findChildByType(node, 'class_body');
  const defines = [];
  const references = new Set();

  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i);

      if (member.type === 'method_definition') {
        const method = extractMethod(member, content);
        defines.push(method);
        // Collect type references from return type
        if (method.returnType) {
          extractTypeReferences(method.returnType, references);
        }
      } else if (member.type === 'abstract_method_signature') {
        const method = extractAbstractMethod(member, content);
        defines.push(method);
        if (method.returnType) {
          extractTypeReferences(method.returnType, references);
        }
      } else if (member.type === 'public_field_definition') {
        const field = extractField(member, content);
        defines.push(field);
        if (field.fieldType) {
          extractTypeReferences(field.fieldType, references);
        }
      }
    }
  }

  // Collect references from inherits and implements
  if (inherits) references.add(inherits);
  for (const impl of implementsList) references.add(impl);

  return {
    type: 'class',
    name,
    exported: false,
    inherits,
    abstract: isAbstract,
    defines,
    references: Array.from(references),
    typeInfo: {
      interfaces_implemented: implementsList,
      generics,
      decorators,
      abstract: isAbstract,
    },
  };
}

// ─── Method Extraction ──────────────────────────────────────────────────────

/**
 * Extract method information from a method_definition node.
 * @param {object} node
 * @param {string} content
 * @returns {object}
 */
function extractMethod(node, content) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? extractNodeText(nameNode, content) : '';
  const visibility = getVisibility(node);
  const isAsync = hasChildWithText(node, content, 'async');
  const isAbstract = hasChildWithText(node, content, 'abstract');
  const isStatic = hasChildWithText(node, content, 'static');
  const returnType = getReturnType(node, content);
  const params = extractParameters(node, content);
  const decorators = getDecorators(node, content);

  // Detect getter/setter
  const fullText = extractNodeText(node, content);
  const isGetter = fullText.startsWith('get ') || (nameNode && hasModifierBefore(node, content, 'get'));
  const isSetter = fullText.startsWith('set ') || (nameNode && hasModifierBefore(node, content, 'set'));

  const methodType = isGetter ? 'getter' : isSetter ? 'setter' : 'method';

  const result = {
    name,
    type: methodType,
    visibility,
    async: isAsync,
    static: isStatic,
    abstract: isAbstract,
    returnType,
  };

  if (params.length > 0) {
    result.params = params;
  }

  if (decorators.length > 0) {
    result.decorators = decorators;
  }

  return result;
}

// ─── Abstract Method Extraction ─────────────────────────────────────────────

/**
 * Extract abstract method signature from an abstract_method_signature node.
 * @param {object} node
 * @param {string} content
 * @returns {object}
 */
function extractAbstractMethod(node, content) {
  const nameNode = findChildByType(node, 'property_identifier');
  const name = nameNode ? extractNodeText(nameNode, content) : '';
  const returnType = getReturnType(node, content);
  const params = extractParameters(node, content);

  const result = {
    name,
    type: 'method',
    visibility: 'public',
    async: false,
    static: false,
    abstract: true,
    returnType,
  };

  if (params.length > 0) {
    result.params = params;
  }

  return result;
}

// ─── Field Extraction ───────────────────────────────────────────────────────

/**
 * Extract field information from a public_field_definition node.
 * @param {object} node
 * @param {string} content
 * @returns {object}
 */
function extractField(node, content) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? extractNodeText(nameNode, content) : '';
  const visibility = getVisibility(node);
  const typeAnnotation = findChildByType(node, 'type_annotation');
  const fieldType = typeAnnotation ? extractTypeAnnotationValue(typeAnnotation, content) : null;

  const isReadonly = hasChildWithText(node, content, 'readonly');
  const isStatic = hasChildWithText(node, content, 'static');

  return {
    name,
    type: 'property',
    visibility,
    fieldType,
    readonly: isReadonly,
    static: isStatic,
  };
}

// ─── Interface Extraction ───────────────────────────────────────────────────

/**
 * Extract interface information from an interface_declaration node.
 * @param {object} node
 * @param {string} content
 * @returns {object}
 */
function extractInterface(node, content) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? extractNodeText(nameNode, content) : '';

  // Generics
  const generics = getTypeParameters(node, content);

  // Extends
  const extendsList = [];
  const extendsClause = findChildByType(node, 'extends_type_clause');
  if (extendsClause) {
    for (let i = 0; i < extendsClause.childCount; i++) {
      const child = extendsClause.child(i);
      if (child.type === 'type_identifier' || child.type === 'identifier') {
        extendsList.push(extractNodeText(child, content));
      } else if (child.type === 'generic_type') {
        // e.g., Repository<Order>
        const typeNameNode = findChildByType(child, 'type_identifier') || findChildByType(child, 'identifier');
        if (typeNameNode) {
          extendsList.push(extractNodeText(typeNameNode, content));
        }
      }
    }
  }

  // Properties and method signatures
  const properties = [];
  const body = findChildByType(node, 'interface_body') || findChildByType(node, 'object_type');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i);

      if (member.type === 'property_signature') {
        const propName = member.childForFieldName('name');
        const propNameStr = propName ? extractNodeText(propName, content) : '';
        const typeAnnotation = findChildByType(member, 'type_annotation');
        const propType = typeAnnotation ? extractTypeAnnotationValue(typeAnnotation, content) : null;
        const isOptional = extractNodeText(member, content).includes('?');

        properties.push({
          name: propNameStr,
          type: 'property',
          propertyType: propType,
          optional: isOptional,
        });
      } else if (member.type === 'method_signature') {
        const methodName = member.childForFieldName('name');
        const methodNameStr = methodName ? extractNodeText(methodName, content) : '';
        const returnType = getReturnType(member, content);
        const params = extractParameters(member, content);
        const methodGenerics = getTypeParameters(member, content);

        const methodDef = {
          name: methodNameStr,
          type: 'method',
          returnType,
        };

        if (params.length > 0) {
          methodDef.params = params;
        }

        if (methodGenerics.length > 0) {
          methodDef.generics = methodGenerics;
        }

        properties.push(methodDef);
      }
    }
  }

  return {
    type: 'interface',
    name,
    exported: false,
    extends: extendsList,
    properties,
    generics,
    references: [...extendsList],
  };
}

// ─── Type Alias Extraction ──────────────────────────────────────────────────

/**
 * Extract type alias information from a type_alias_declaration node.
 * @param {object} node
 * @param {string} content
 * @returns {object}
 */
function extractTypeAlias(node, content) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? extractNodeText(nameNode, content) : '';

  // Generics
  const generics = getTypeParameters(node, content);

  // The type value (everything after the = sign)
  const valueNode = node.childForFieldName('value');
  const definition = valueNode ? extractNodeText(valueNode, content) : '';

  return {
    type: 'type_alias',
    name,
    exported: false,
    definition,
    generics,
    references: [],
  };
}

// ─── Enum Extraction ────────────────────────────────────────────────────────

/**
 * Extract enum information from an enum_declaration node.
 * @param {object} node
 * @param {string} content
 * @returns {object}
 */
function extractEnum(node, content) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? extractNodeText(nameNode, content) : '';

  const members = [];
  const body = findChildByType(node, 'enum_body');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i);
      if (member.type === 'enum_assignment') {
        // enum_assignment has a property_identifier child (name) and a value child
        const nameNode = findChildByType(member, 'property_identifier');
        const memberName = nameNode ? extractNodeText(nameNode, content) : '';
        // Value: find string or number literal after the = sign
        let value = null;
        for (let j = 0; j < member.childCount; j++) {
          const child = member.child(j);
          if (child.type === 'string') {
            value = extractNodeText(child, content).replace(/['"]/g, '');
          } else if (child.type === 'number') {
            value = extractNodeText(child, content);
          }
        }
        if (memberName) {
          members.push({ name: memberName, value });
        }
      } else if (member.type === 'property_identifier') {
        // Simple enum member without value assignment
        const memberName = extractNodeText(member, content);
        if (memberName && memberName !== '{' && memberName !== '}' && memberName !== ',') {
          members.push({ name: memberName, value: null });
        }
      }
    }
  }

  return {
    type: 'enum',
    name,
    exported: false,
    members,
  };
}

// ─── Function Extraction ────────────────────────────────────────────────────

/**
 * Extract function information from a function_declaration node.
 * @param {object} node
 * @param {string} content
 * @returns {object}
 */
function extractFunction(node, content) {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? extractNodeText(nameNode, content) : '';
  const isAsync = hasChildWithText(node, content, 'async');
  const returnType = getReturnType(node, content);
  const params = extractParameters(node, content);
  const generics = getTypeParameters(node, content);

  const references = new Set();
  if (returnType) {
    extractTypeReferences(returnType, references);
  }
  for (const p of params) {
    if (p.type) {
      extractTypeReferences(p.type, references);
    }
  }

  return {
    type: 'function',
    name,
    exported: false,
    async: isAsync,
    returnType,
    params,
    generics,
    references: Array.from(references),
  };
}

// ─── Variable / Arrow Function Extraction ───────────────────────────────────

/**
 * Extract variable declarations (const/let/var) which may contain arrow functions.
 * @param {object} node - lexical_declaration or variable_declaration node
 * @param {string} content
 * @param {boolean} isExported
 * @returns {Array<object>}
 */
function extractVariableDeclaration(node, content, isExported) {
  const results = [];
  const kind = extractNodeText(node.child(0), content); // const, let, var

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'variable_declarator') {
      const nameNode = child.childForFieldName('name');
      const name = nameNode ? extractNodeText(nameNode, content) : '';
      const valueNode = child.childForFieldName('value');
      const typeAnnotation = findChildByType(child, 'type_annotation');
      const varType = typeAnnotation ? extractTypeAnnotationValue(typeAnnotation, content) : null;

      if (valueNode && valueNode.type === 'arrow_function') {
        // Arrow function: treat as a function definition
        const isAsync = hasChildWithText(valueNode, content, 'async');
        const returnType = getReturnType(valueNode, content);
        const params = extractParameters(valueNode, content);
        const generics = getTypeParameters(valueNode, content);

        const references = new Set();
        if (returnType) extractTypeReferences(returnType, references);
        for (const p of params) {
          if (p.type) extractTypeReferences(p.type, references);
        }

        results.push({
          type: 'function',
          name,
          exported: isExported,
          async: isAsync,
          returnType,
          params,
          generics,
          kind, // const, let
          arrow: true,
          references: Array.from(references),
        });
      } else {
        // Regular variable
        results.push({
          type: 'variable',
          name,
          exported: isExported,
          kind,
          varType,
          references: [],
        });
      }
    }
  }

  return results;
}

// ─── Parameter Extraction ───────────────────────────────────────────────────

/**
 * Extract function/method parameters.
 * @param {object} node - function_declaration, method_definition, arrow_function, or method_signature
 * @param {string} content
 * @returns {Array<{name: string, type: string|null, optional: boolean, rest: boolean}>}
 */
function extractParameters(node, content) {
  const params = [];
  const paramsNode = node.childForFieldName('parameters') || findChildByType(node, 'formal_parameters');

  if (!paramsNode) return params;

  for (let i = 0; i < paramsNode.childCount; i++) {
    const param = paramsNode.child(i);

    if (
      param.type === 'required_parameter' ||
      param.type === 'optional_parameter' ||
      param.type === 'rest_parameter'
    ) {
      const patternNode = param.childForFieldName('pattern') || param.childForFieldName('name');
      let paramName = '';

      if (patternNode) {
        paramName = extractNodeText(patternNode, content);
      } else {
        // Fallback: look for identifier
        const ident = findChildByType(param, 'identifier');
        if (ident) paramName = extractNodeText(ident, content);
      }

      // Skip visibility-prefixed constructor params: 'private readonly repo' => name is after modifiers
      const fullParamText = extractNodeText(param, content);
      const isAccessibilityParam = /^(public|private|protected|readonly)\s/.test(fullParamText);
      if (isAccessibilityParam && !paramName) {
        // Extract the actual parameter name from the text
        const parts = fullParamText.split(/\s+/);
        paramName = parts.filter(p => !['public', 'private', 'protected', 'readonly'].includes(p))[0] || '';
        // Remove type annotation from the name
        paramName = paramName.split(':')[0];
      }

      const typeAnnotation = findChildByType(param, 'type_annotation');
      const paramType = typeAnnotation ? extractTypeAnnotationValue(typeAnnotation, content) : null;

      const isOptional = param.type === 'optional_parameter';
      const isRest = param.type === 'rest_parameter';

      if (paramName && paramName !== '(' && paramName !== ')' && paramName !== ',') {
        params.push({
          name: paramName,
          type: paramType,
          optional: isOptional,
          rest: isRest,
        });
      }
    }
  }

  return params;
}

// ─── Visibility ─────────────────────────────────────────────────────────────

/**
 * Get the visibility modifier of a class member.
 * @param {object} node - method_definition or public_field_definition
 * @returns {string} 'public' | 'private' | 'protected'
 */
function getVisibility(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'accessibility_modifier') {
      const text = child.text || '';
      if (text === 'private') return 'private';
      if (text === 'protected') return 'protected';
      if (text === 'public') return 'public';
    }
  }
  return 'public';
}

// ─── Return Type ────────────────────────────────────────────────────────────

/**
 * Get the return type annotation from a function/method node.
 * @param {object} node
 * @param {string} content
 * @returns {string|null}
 */
function getReturnType(node, content) {
  const returnTypeNode = node.childForFieldName('return_type');
  if (returnTypeNode) {
    return extractTypeAnnotationValue(returnTypeNode, content);
  }

  // Fallback: look for type_annotation after the parameter list
  const paramsNode = node.childForFieldName('parameters') || findChildByType(node, 'formal_parameters');
  if (paramsNode) {
    // The type annotation should be the sibling right after the params
    let found = false;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (found && child.type === 'type_annotation') {
        return extractTypeAnnotationValue(child, content);
      }
      if (child === paramsNode) {
        found = true;
      }
    }
  }

  return null;
}

/**
 * Extract the type value from a type_annotation node (strips the leading colon).
 * @param {object} typeAnnotation
 * @param {string} content
 * @returns {string}
 */
function extractTypeAnnotationValue(typeAnnotation, content) {
  const text = extractNodeText(typeAnnotation, content);
  // Remove leading ': ' if present
  return text.startsWith(':') ? text.slice(1).trim() : text;
}

// ─── Type Parameters (Generics) ─────────────────────────────────────────────

/**
 * Get type parameters (generics) from a node.
 * @param {object} node
 * @param {string} content
 * @returns {string[]}
 */
function getTypeParameters(node, content) {
  const typeParams = node.childForFieldName('type_parameters') || findChildByType(node, 'type_parameters');
  if (!typeParams) return [];

  const params = [];
  for (let i = 0; i < typeParams.childCount; i++) {
    const child = typeParams.child(i);
    if (child.type === 'type_parameter') {
      const nameNode = child.childForFieldName('name') || findChildByType(child, 'type_identifier');
      if (nameNode) {
        params.push(extractNodeText(nameNode, content));
      }
    }
  }

  return params;
}

// ─── Decorators ─────────────────────────────────────────────────────────────

/**
 * Get decorator list from a node.
 * Looks at previous siblings and direct children for decorator nodes.
 * @param {object} node
 * @param {string} content
 * @returns {string[]}
 */
function getDecorators(node, content) {
  const decorators = [];

  // Check direct children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'decorator') {
      decorators.push(extractNodeText(child, content));
    }
  }

  // Check preceding siblings (decorators are often siblings before the declaration)
  let prev = node.previousSibling;
  while (prev && prev.type === 'decorator') {
    decorators.unshift(extractNodeText(prev, content));
    prev = prev.previousSibling;
  }

  return decorators;
}

// ─── Utility Helpers ────────────────────────────────────────────────────────

/**
 * Find the first child of a specific type.
 * @param {object} node
 * @param {string} type
 * @returns {object|null}
 */
function findChildByType(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === type) return child;
  }
  return null;
}

/**
 * Check if a node has a child whose text matches a keyword.
 * Only checks direct keyword/token children (not deep).
 * @param {object} node
 * @param {string} content
 * @param {string} keyword
 * @returns {boolean}
 */
function hasChildWithText(node, content, keyword) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const text = extractNodeText(child, content);
    if (text === keyword) return true;
  }
  return false;
}

/**
 * Check if a modifier keyword appears before the name node.
 * @param {object} node
 * @param {string} content
 * @param {string} modifier
 * @returns {boolean}
 */
function hasModifierBefore(node, content, modifier) {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return false;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child === nameNode) break;
    if (extractNodeText(child, content) === modifier) return true;
  }
  return false;
}

/**
 * Extract type references from a type string (simple heuristic).
 * Pulls out PascalCase identifiers that look like type names.
 * @param {string} typeStr
 * @param {Set<string>} references
 */
function extractTypeReferences(typeStr, references) {
  if (!typeStr) return;
  // Match PascalCase identifiers (likely type names)
  const matches = typeStr.match(/\b[A-Z][a-zA-Z0-9]*\b/g);
  if (matches) {
    for (const m of matches) {
      // Skip common built-in types
      if (!BUILTIN_TYPES.has(m)) {
        references.add(m);
      }
    }
  }
}

/** Built-in TypeScript types that should not be counted as references */
const BUILTIN_TYPES = new Set([
  'String', 'Number', 'Boolean', 'Object', 'Array', 'Promise',
  'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit',
  'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'InstanceType',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'Error', 'RegExp',
  'Function', 'Symbol', 'BigInt', 'Uint8Array', 'Int32Array',
]);

/**
 * Collect references from a definition object into a set.
 * @param {object} def - a definition (class, interface, function, etc.)
 * @param {Set<string>} references
 */
function collectReferences(def, references) {
  if (def.references) {
    for (const r of def.references) {
      references.add(r);
    }
  }
}

module.exports = { TypeScriptAnalyzer };
