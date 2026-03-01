'use strict';

/**
 * AST-aware chunk splitting logic.
 * Receives a tree-sitter AST and produces chunks that respect structural boundaries.
 *
 * Algorithm: recursive split-then-merge
 * 1. Identify top-level nodes (classes, modules, functions, etc.)
 * 2. If node fits within maxSize → one chunk
 * 3. If node exceeds maxSize → recurse into children
 * 4. If child still exceeds → text split within that node
 * 5. Merge small adjacent nodes (< maxSize * 0.3) into one chunk
 */

/** Node types considered as top-level structural boundaries */
const TOP_LEVEL_TYPES = new Set([
  // Ruby
  'class', 'module', 'method', 'singleton_method',
  // TypeScript/JavaScript
  'class_declaration', 'interface_declaration', 'type_alias_declaration',
  'enum_declaration', 'function_declaration', 'export_statement',
  'lexical_declaration', 'variable_declaration',
  // Dart
  'class_definition', 'mixin_declaration', 'extension_declaration',
  'enum_declaration', 'function_signature', 'function_definition',
  // Common
  'comment', 'import_statement', 'import_or_export',
]);

/** Node types considered as child structural boundaries (within classes) */
const CHILD_BOUNDARY_TYPES = new Set([
  // Ruby
  'method', 'singleton_method',
  // TypeScript
  'method_definition', 'public_field_definition', 'property_signature',
  'method_signature',
  // Dart
  'method_signature', 'constructor_signature', 'declaration',
  'getter_signature', 'setter_signature',
]);

/**
 * Get the text content of a node from the source.
 * @param {object} node - tree-sitter node
 * @param {string} content - full source content
 * @returns {string}
 */
function nodeText(node, content) {
  return content.slice(node.startIndex, node.endIndex);
}

/**
 * Count newlines before a position to get line number.
 * @param {string} content - source content
 * @param {number} index - character index
 * @returns {number} 1-based line number
 */
function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * Create a chunk object from a content slice.
 * @param {string} chunkContent - the chunk text
 * @param {number} startIndex - start character index in original content
 * @param {string} fullContent - full file content (for line number calculation)
 * @param {object} [context] - optional context info
 * @returns {object} chunk object
 */
function createChunkObject(chunkContent, startIndex, fullContent, context) {
  const startLine = getLineNumber(fullContent, startIndex);
  const endLine = startLine + chunkContent.split('\n').length - 1;
  return {
    content: chunkContent,
    startLine,
    endLine,
    size: chunkContent.length,
    ...(context ? { context } : {}),
  };
}

/**
 * Text-based splitting within a single node that exceeds maxSize.
 * @param {string} text - text to split
 * @param {number} startIndex - start index in original content
 * @param {string} fullContent - full file content
 * @param {number} maxSize - max chunk size
 * @param {object} [context] - context info
 * @returns {Array<object>} array of chunk objects
 */
function textSplit(text, startIndex, fullContent, maxSize, context) {
  const chunks = [];
  const lines = text.split('\n');
  let currentLines = [];
  let currentSize = 0;

  for (const line of lines) {
    const lineSize = line.length + 1; // +1 for newline
    if (currentSize + lineSize > maxSize && currentLines.length > 0) {
      const chunkText = currentLines.join('\n');
      const chunkStart = startIndex + text.indexOf(chunkText);
      chunks.push(createChunkObject(chunkText, chunkStart, fullContent, context));
      currentLines = [];
      currentSize = 0;
    }
    currentLines.push(line);
    currentSize += lineSize;
  }

  if (currentLines.length > 0) {
    const chunkText = currentLines.join('\n');
    const chunkStart = startIndex + text.lastIndexOf(chunkText);
    chunks.push(createChunkObject(chunkText, chunkStart >= startIndex ? chunkStart : startIndex, fullContent, context));
  }

  return chunks;
}

/**
 * Get the signature line of a parent node for context.
 * @param {object} node - tree-sitter node
 * @param {string} content - source content
 * @returns {string} first line of the node (the signature)
 */
function getNodeSignature(node, content) {
  const text = nodeText(node, content);
  const firstLine = text.split('\n')[0];
  return firstLine.trim();
}

/**
 * Build context object for a chunk.
 * @param {object} node - the node this chunk belongs to
 * @param {string} filePath - file path
 * @param {string} content - source content
 * @param {object} [parentNode] - parent node if this is a child
 * @returns {object} context object
 */
function buildContext(node, filePath, content, parentNode) {
  const ctx = { file: filePath };
  if (parentNode) {
    ctx.parent = getNodeSignature(parentNode, content);
    const scope = [];
    // Walk up to collect scope
    let current = parentNode;
    while (current) {
      const name = getNodeName(current, content);
      if (name) scope.unshift(name);
      current = current.parent;
    }
    if (scope.length > 0) ctx.scope = scope;
  }
  return ctx;
}

/**
 * Try to extract a name from a node.
 * @param {object} node - tree-sitter node
 * @param {string} content - source content
 * @returns {string|null}
 */
function getNodeName(node, content) {
  // Try named children with 'name' field
  const nameChild = node.childForFieldName('name');
  if (nameChild) return nodeText(nameChild, content);
  // Try first identifier child
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'identifier' || child.type === 'constant' || child.type === 'type_identifier') {
      return nodeText(child, content);
    }
  }
  return null;
}

/**
 * Split an AST into structurally-aware chunks.
 * @param {object} tree - tree-sitter parse tree
 * @param {string} content - raw source content
 * @param {object} options - { maxSize: number, overlap: number }
 * @param {string} [filePath] - file path for context
 * @returns {Array<object>} array of chunk objects with content, startLine, endLine, size, context
 */
function splitAST(tree, content, options, filePath) {
  const { maxSize = 1000 } = options;
  const rootNode = tree.rootNode;

  // Collect top-level nodes
  const topLevelNodes = [];
  for (let i = 0; i < rootNode.childCount; i++) {
    const child = rootNode.child(i);
    if (child.type !== 'program' && child.type !== 'ERROR') {
      topLevelNodes.push(child);
    }
  }

  // If no top-level nodes, fall back to text splitting
  if (topLevelNodes.length === 0) {
    return textSplit(content, 0, content, maxSize);
  }

  // Process each top-level node
  const rawChunks = [];
  for (const node of topLevelNodes) {
    const nodeSize = node.endIndex - node.startIndex;
    const text = nodeText(node, content);

    if (nodeSize <= maxSize) {
      rawChunks.push({
        content: text,
        startIndex: node.startIndex,
        endIndex: node.endIndex,
        node,
        parentNode: null,
      });
    } else {
      // Node exceeds maxSize — try to split by children
      const childChunks = splitLargeNode(node, content, maxSize, filePath);
      rawChunks.push(...childChunks);
    }
  }

  // Merge small adjacent chunks
  const mergedChunks = mergeSmallChunks(rawChunks, maxSize);

  // Convert to final chunk format
  return mergedChunks.map(rc => {
    const ctx = rc.parentNode ? buildContext(rc.node, filePath, content, rc.parentNode) : undefined;
    return createChunkObject(rc.content, rc.startIndex, content, ctx);
  });
}

/**
 * Split a large node by its children.
 * @param {object} node - tree-sitter node
 * @param {string} content - source content
 * @param {number} maxSize - max chunk size
 * @param {string} [filePath] - file path
 * @returns {Array<object>} raw chunk objects
 */
function splitLargeNode(node, content, maxSize, filePath) {
  const chunks = [];
  const children = [];

  for (let i = 0; i < node.childCount; i++) {
    children.push(node.child(i));
  }

  // If no meaningful children, text-split
  if (children.length === 0) {
    const text = nodeText(node, content);
    const textChunks = textSplit(text, node.startIndex, content, maxSize);
    return textChunks.map(tc => ({
      content: tc.content,
      startIndex: node.startIndex,
      endIndex: node.endIndex,
      node,
      parentNode: null,
    }));
  }

  // Try to group children into chunks
  let currentGroup = [];
  let currentSize = 0;

  for (const child of children) {
    const childSize = child.endIndex - child.startIndex;
    const childText = nodeText(child, content);

    if (childSize > maxSize) {
      // Flush current group
      if (currentGroup.length > 0) {
        chunks.push(flushGroup(currentGroup, node, content));
        currentGroup = [];
        currentSize = 0;
      }
      // Text-split the oversized child
      const textChunks = textSplit(childText, child.startIndex, content, maxSize, buildContext(child, filePath, content, node));
      for (const tc of textChunks) {
        chunks.push({
          content: tc.content,
          startIndex: child.startIndex,
          endIndex: child.endIndex,
          node: child,
          parentNode: node,
        });
      }
    } else if (currentSize + childSize > maxSize && currentGroup.length > 0) {
      // Flush current group and start new one
      chunks.push(flushGroup(currentGroup, node, content));
      currentGroup = [child];
      currentSize = childSize;
    } else {
      currentGroup.push(child);
      currentSize += childSize;
    }
  }

  // Flush remaining
  if (currentGroup.length > 0) {
    chunks.push(flushGroup(currentGroup, node, content));
  }

  return chunks;
}

/**
 * Flush a group of child nodes into a single raw chunk.
 * @param {Array<object>} nodes - child nodes
 * @param {object} parentNode - parent node
 * @param {string} content - source content
 * @returns {object} raw chunk
 */
function flushGroup(nodes, parentNode, content) {
  const startIndex = nodes[0].startIndex;
  const endIndex = nodes[nodes.length - 1].endIndex;
  const text = content.slice(startIndex, endIndex);
  return {
    content: text,
    startIndex,
    endIndex,
    node: nodes[0],
    parentNode,
  };
}

/**
 * Merge adjacent small chunks.
 * @param {Array<object>} chunks - raw chunks
 * @param {number} maxSize - max chunk size
 * @returns {Array<object>} merged chunks
 */
function mergeSmallChunks(chunks, maxSize) {
  if (chunks.length <= 1) return chunks;

  const threshold = maxSize * 0.3;
  const merged = [];
  let current = chunks[0];

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    const combinedSize = current.content.length + next.content.length;

    if (current.content.length < threshold && next.content.length < threshold && combinedSize <= maxSize) {
      // Merge: combine content with content between them
      const gapContent = current.endIndex < next.startIndex
        ? '\n'
        : '';
      current = {
        content: current.content + gapContent + next.content,
        startIndex: current.startIndex,
        endIndex: next.endIndex,
        node: current.node,
        parentNode: current.parentNode,
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return merged;
}

module.exports = { splitAST, textSplit, getLineNumber };
