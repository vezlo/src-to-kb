'use strict';

/**
 * Lazy-loads tree-sitter and language grammars.
 * Handles native module compilation failures gracefully.
 *
 * - Caches loaded parsers (one per language)
 * - Returns null if tree-sitter or a grammar fails to load
 * - Logs a single warning per failed language (not per file)
 * - Does NOT throw errors — callers check for null
 */

const loadedParsers = {};
const failedLanguages = new Set();

/**
 * @param {string} language - 'ruby', 'typescript', or 'dart'
 * @returns {{ parser: object, grammar: object }|null} Parser and grammar, or null if unavailable
 */
function loadParser(language) {
  if (failedLanguages.has(language)) return null;
  if (loadedParsers[language]) return loadedParsers[language];

  try {
    const Parser = require('tree-sitter');
    const grammar = require(`tree-sitter-${language}`);

    const parser = new Parser();

    // tree-sitter-typescript exports { typescript, tsx } instead of a single grammar
    if (language === 'typescript') {
      parser.setLanguage(grammar.typescript);
    } else {
      parser.setLanguage(grammar);
    }

    loadedParsers[language] = { parser, grammar };
    return loadedParsers[language];
  } catch (err) {
    console.warn(`[analyzer] tree-sitter-${language} unavailable: ${err.message}. Using text chunking for ${language} files.`);
    failedLanguages.add(language);
    return null;
  }
}

/**
 * Load TSX parser specifically (tree-sitter-typescript exports both).
 * @returns {{ parser: object, grammar: object }|null}
 */
function loadTSXParser() {
  if (failedLanguages.has('tsx')) return null;
  if (loadedParsers['tsx']) return loadedParsers['tsx'];

  try {
    const Parser = require('tree-sitter');
    const grammar = require('tree-sitter-typescript');
    const parser = new Parser();
    parser.setLanguage(grammar.tsx);
    loadedParsers['tsx'] = { parser, grammar: grammar.tsx };
    return loadedParsers['tsx'];
  } catch (err) {
    console.warn(`[analyzer] tree-sitter tsx unavailable: ${err.message}. Using text chunking for .tsx files.`);
    failedLanguages.add('tsx');
    return null;
  }
}

/**
 * Reset loaded parsers and failed languages (for testing).
 */
function resetLoaderState() {
  Object.keys(loadedParsers).forEach(k => delete loadedParsers[k]);
  failedLanguages.clear();
}

module.exports = { loadParser, loadTSXParser, resetLoaderState };
