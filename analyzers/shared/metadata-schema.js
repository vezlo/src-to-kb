'use strict';

/**
 * Validation for enriched chunk format.
 * Ensures metadata follows the expected schema.
 */

/**
 * Validate a defines entry.
 * @param {object} entry - { name, type, ... }
 * @returns {boolean}
 */
function validateDefinesEntry(entry) {
  return (
    entry &&
    typeof entry.name === 'string' &&
    typeof entry.type === 'string'
  );
}

/**
 * Validate the ast metadata object on a chunk.
 * @param {object} ast - the ast metadata
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateASTMetadata(ast) {
  const errors = [];

  if (!ast || typeof ast !== 'object') {
    return { valid: false, errors: ['ast must be an object'] };
  }

  if (typeof ast.type !== 'string') {
    errors.push('ast.type must be a string');
  }

  if (typeof ast.name !== 'string') {
    errors.push('ast.name must be a string');
  }

  if (ast.defines && !Array.isArray(ast.defines)) {
    errors.push('ast.defines must be an array');
  } else if (ast.defines) {
    for (let i = 0; i < ast.defines.length; i++) {
      if (!validateDefinesEntry(ast.defines[i])) {
        errors.push(`ast.defines[${i}] must have name (string) and type (string)`);
      }
    }
  }

  if (ast.references && !Array.isArray(ast.references)) {
    errors.push('ast.references must be an array');
  }

  if (ast.scope && !Array.isArray(ast.scope)) {
    errors.push('ast.scope must be an array');
  }

  if (ast.imports && !Array.isArray(ast.imports)) {
    errors.push('ast.imports must be an array');
  }

  if (ast.framework && typeof ast.framework !== 'object') {
    errors.push('ast.framework must be an object');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an enriched chunk (backward compatible with plain chunks).
 * @param {object} chunk - chunk object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateChunk(chunk) {
  const errors = [];

  if (!chunk || typeof chunk !== 'object') {
    return { valid: false, errors: ['chunk must be an object'] };
  }

  // Required base fields
  if (typeof chunk.content !== 'string') {
    errors.push('chunk.content must be a string');
  }
  if (typeof chunk.startLine !== 'number') {
    errors.push('chunk.startLine must be a number');
  }
  if (typeof chunk.endLine !== 'number') {
    errors.push('chunk.endLine must be a number');
  }
  if (typeof chunk.size !== 'number') {
    errors.push('chunk.size must be a number');
  }

  // Optional ast field
  if (chunk.ast !== undefined) {
    const astResult = validateASTMetadata(chunk.ast);
    if (!astResult.valid) {
      errors.push(...astResult.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateChunk, validateASTMetadata, validateDefinesEntry };
