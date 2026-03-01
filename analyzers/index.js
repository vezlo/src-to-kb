'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Analyzer Registry
 * Maps file extensions to analyzer instances.
 * Lazy-loads analyzers and caches instances.
 * Returns null if no analyzer is available → triggers text-based fallback.
 */

const EXTENSION_MAP = {
  '.rb':   { analyzer: './ruby',       enrichment: './ruby/rails' },
  '.ts':   { analyzer: './typescript', enrichment: null },
  '.tsx':  { analyzer: './typescript', enrichment: null },
  '.dart': { analyzer: './dart',       enrichment: './dart/flutter' },
};

/** @type {Map<string, object|null>} Cached analyzer instances keyed by analyzer path */
const analyzerCache = new Map();

/** @type {Map<string, object|null>} Cached enrichment instances keyed by enrichment path */
const enrichmentCache = new Map();

/** @type {Map<string, boolean|null>} Project-level framework detection flags */
const frameworkDetectionCache = new Map();

/**
 * Detect if a project is a Rails project.
 * @param {string} [projectRoot] - root directory of the project
 * @returns {boolean}
 */
function detectRails(projectRoot) {
  if (!projectRoot) return false;

  const cacheKey = `rails:${projectRoot}`;
  if (frameworkDetectionCache.has(cacheKey)) {
    return frameworkDetectionCache.get(cacheKey);
  }

  let isRails = false;
  try {
    // Check for Rails indicators
    const hasRoutesRb = fs.existsSync(path.join(projectRoot, 'config', 'routes.rb'));
    const hasAppModels = fs.existsSync(path.join(projectRoot, 'app', 'models'));
    const hasAppControllers = fs.existsSync(path.join(projectRoot, 'app', 'controllers'));

    if (hasRoutesRb || (hasAppModels && hasAppControllers)) {
      isRails = true;
    } else {
      // Check Gemfile for rails gem
      const gemfilePath = path.join(projectRoot, 'Gemfile');
      if (fs.existsSync(gemfilePath)) {
        const gemfileContent = fs.readFileSync(gemfilePath, 'utf8');
        isRails = /gem\s+['"]rails['"]/.test(gemfileContent);
      }
    }
  } catch (err) {
    // Ignore filesystem errors
  }

  frameworkDetectionCache.set(cacheKey, isRails);
  return isRails;
}

/**
 * Detect if a project is a Flutter project.
 * @param {string} [projectRoot] - root directory of the project
 * @returns {boolean}
 */
function detectFlutter(projectRoot) {
  if (!projectRoot) return false;

  const cacheKey = `flutter:${projectRoot}`;
  if (frameworkDetectionCache.has(cacheKey)) {
    return frameworkDetectionCache.get(cacheKey);
  }

  let isFlutter = false;
  try {
    const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
      isFlutter = /flutter:/.test(pubspecContent) || /package:flutter\//.test(pubspecContent);
    }
    // Only detect Flutter when pubspec.yaml explicitly references Flutter.
    // A bare `lib/` directory is too generic to be a reliable indicator.
  } catch (err) {
    // Ignore filesystem errors
  }

  frameworkDetectionCache.set(cacheKey, isFlutter);
  return isFlutter;
}

/**
 * Load an analyzer module by path.
 * @param {string} analyzerPath - relative path to analyzer module
 * @returns {object|null} analyzer instance or null
 */
function loadAnalyzer(analyzerPath) {
  if (analyzerCache.has(analyzerPath)) {
    return analyzerCache.get(analyzerPath);
  }

  try {
    const AnalyzerModule = require(analyzerPath);
    const AnalyzerClass = AnalyzerModule.default || AnalyzerModule[Object.keys(AnalyzerModule)[0]];
    const instance = new AnalyzerClass();
    analyzerCache.set(analyzerPath, instance);
    return instance;
  } catch (err) {
    console.warn(`[analyzer] Failed to load analyzer ${analyzerPath}: ${err.message}`);
    analyzerCache.set(analyzerPath, null);
    return null;
  }
}

/**
 * Load an enrichment module by path.
 * @param {string} enrichmentPath - relative path to enrichment module
 * @returns {object|null} enrichment module or null
 */
function loadEnrichment(enrichmentPath) {
  if (enrichmentCache.has(enrichmentPath)) {
    return enrichmentCache.get(enrichmentPath);
  }

  try {
    const enrichment = require(enrichmentPath);
    enrichmentCache.set(enrichmentPath, enrichment);
    return enrichment;
  } catch (err) {
    console.warn(`[analyzer] Failed to load enrichment ${enrichmentPath}: ${err.message}`);
    enrichmentCache.set(enrichmentPath, null);
    return null;
  }
}

/**
 * Get the appropriate analyzer for a file extension.
 * @param {string} extension - File extension including dot (e.g., '.rb')
 * @param {string} [projectRoot] - Root directory of the project being processed
 * @returns {object|null} Analyzer instance with enrichment bound, or null for text fallback
 */
function getAnalyzer(extension, projectRoot) {
  const config = EXTENSION_MAP[extension];
  if (!config) return null;

  const analyzer = loadAnalyzer(config.analyzer);
  if (!analyzer) return null;

  // Check if enrichment should be applied
  if (config.enrichment) {
    let shouldEnrich = false;

    if (extension === '.rb') {
      shouldEnrich = detectRails(projectRoot);
    } else if (extension === '.dart') {
      shouldEnrich = detectFlutter(projectRoot);
    }

    if (shouldEnrich) {
      const enrichment = loadEnrichment(config.enrichment);
      if (enrichment && enrichment.enrich) {
        // Create a wrapper that applies enrichment
        const originalEnrich = analyzer.enrich.bind(analyzer);
        const enrichFn = enrichment.enrich;
        return {
          parse: analyzer.parse.bind(analyzer),
          extractMetadata: analyzer.extractMetadata.bind(analyzer),
          chunk: analyzer.chunk.bind(analyzer),
          enrich: (metadata, tree, content, filePath) => {
            const base = originalEnrich(metadata, tree, content, filePath);
            return enrichFn(base, tree, content, filePath);
          },
        };
      }
    }
  }

  return analyzer;
}

/**
 * Get analyzer stats for the current session.
 * @returns {object} stats object
 */
function getAnalyzerStats() {
  const analyzersUsed = [];
  const enrichmentsApplied = [];

  for (const [key, instance] of analyzerCache) {
    if (instance) analyzersUsed.push(path.basename(key));
  }
  for (const [key, instance] of enrichmentCache) {
    if (instance) enrichmentsApplied.push(path.basename(path.dirname(key)));
  }

  return { analyzersUsed, enrichmentsApplied };
}

/**
 * Reset all caches (for testing).
 */
function resetRegistry() {
  analyzerCache.clear();
  enrichmentCache.clear();
  frameworkDetectionCache.clear();
}

module.exports = {
  getAnalyzer,
  getAnalyzerStats,
  resetRegistry,
  EXTENSION_MAP,
  detectRails,
  detectFlutter,
};
