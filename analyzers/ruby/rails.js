'use strict';

/**
 * Rails framework enrichment layer.
 * Detects Rails-specific patterns (associations, validations, callbacks, routes, etc.)
 * by analyzing the tree-sitter AST and file path conventions.
 *
 * Adds a `framework` key to the base metadata object.
 */

/**
 * Enrich metadata with Rails-specific information.
 * @param {object} metadata - Base metadata from RubyAnalyzer.extractMetadata()
 * @param {object} tree - tree-sitter parse tree
 * @param {string} content - Raw file content
 * @param {string} filePath - File path for convention detection
 * @returns {object} Enriched metadata with `framework` key
 */
function enrich(metadata, tree, content, filePath) {
  const normalizedPath = (filePath || '').replace(/\\/g, '/');
  const framework = { type: 'rails' };

  // Check concern before model — app/models/concerns/ matches both patterns
  if (isConcern(normalizedPath)) {
    framework.role = 'concern';
    framework.concern = extractConcernInfo(tree.rootNode, content);
  } else if (isModel(normalizedPath)) {
    framework.role = 'model';
    framework.associations = extractAssociations(tree.rootNode, content);
    framework.validations = extractValidations(tree.rootNode, content);
    framework.scopes = extractScopes(tree.rootNode, content);
    framework.callbacks = extractCallbacks(tree.rootNode, content);
    framework.enums = extractEnums(tree.rootNode, content);
  } else if (isController(normalizedPath)) {
    framework.role = 'controller';
    framework.filters = extractFilters(tree.rootNode, content);
    framework.strongParams = extractStrongParams(tree.rootNode, content);
    framework.rescueHandlers = extractRescueHandlers(tree.rootNode, content);
  } else if (isRoutes(normalizedPath)) {
    framework.role = 'routes';
    framework.endpoints = expandRoutes(tree.rootNode, content);
  }

  metadata.framework = framework;
  return metadata;
}

// ─── Path Detection ──────────────────────────────────────────────────────────

function isModel(path) {
  return /app\/models\//.test(path);
}

function isController(path) {
  return /app\/controllers\//.test(path);
}

function isRoutes(path) {
  return /config\/routes/.test(path);
}

function isConcern(path) {
  return /concerns\//.test(path);
}

// ─── Node Helpers ────────────────────────────────────────────────────────────

/**
 * Get text of a node from source content.
 * @param {object} node
 * @param {string} content
 * @returns {string}
 */
function nodeText(node, content) {
  return content.slice(node.startIndex, node.endIndex);
}

/**
 * Recursively find all nodes of a given type in the AST.
 * @param {object} node - Starting node
 * @param {string} type - Node type to find
 * @param {Array} results - Accumulator
 * @returns {Array}
 */
function findAllByType(node, type, results) {
  results = results || [];
  if (node.type === type) {
    results.push(node);
  }
  for (let i = 0; i < node.childCount; i++) {
    findAllByType(node.child(i), type, results);
  }
  return results;
}

/**
 * Extract the first symbol argument from a call node's arguments.
 * @param {object} argsNode
 * @param {string} content
 * @returns {string|null}
 */
function firstSymbolArg(argsNode, content) {
  if (!argsNode) return null;
  for (let i = 0; i < argsNode.childCount; i++) {
    const child = argsNode.child(i);
    if (child.type === 'simple_symbol') {
      return nodeText(child, content).replace(/^:/, '');
    }
  }
  return null;
}

/**
 * Extract all symbol arguments from a call node's arguments.
 * @param {object} argsNode
 * @param {string} content
 * @returns {string[]}
 */
function allSymbolArgs(argsNode, content) {
  const results = [];
  if (!argsNode) return results;
  for (let i = 0; i < argsNode.childCount; i++) {
    const child = argsNode.child(i);
    if (child.type === 'simple_symbol') {
      results.push(nodeText(child, content).replace(/^:/, ''));
    }
  }
  return results;
}

/**
 * Extract hash options from arguments.
 * Looks for hash or pair nodes and extracts key-value pairs.
 * @param {object} argsNode
 * @param {string} content
 * @returns {object}
 */
function extractHashOptions(argsNode, content) {
  const options = {};
  if (!argsNode) return options;

  const pairs = findAllByType(argsNode, 'pair', []);
  for (const pair of pairs) {
    const keyNode = pair.childForFieldName('key');
    const valueNode = pair.childForFieldName('value');
    if (keyNode && valueNode) {
      let key = nodeText(keyNode, content).replace(/^:/, '');
      const value = nodeText(valueNode, content).replace(/^:/, '').replace(/^['"]|['"]$/g, '');
      options[key] = value;
    }
  }

  return options;
}

/**
 * Check if a call node matches a specific method name.
 * @param {object} callNode
 * @param {string} content
 * @param {string|string[]} methodNames
 * @returns {boolean}
 */
function isCallTo(callNode, content, methodNames) {
  const methodNode = callNode.childForFieldName('method');
  if (!methodNode) return false;
  const name = nodeText(methodNode, content);
  if (Array.isArray(methodNames)) return methodNames.includes(name);
  return name === methodNames;
}

/**
 * Get the method name of a call node.
 * @param {object} callNode
 * @param {string} content
 * @returns {string|null}
 */
function callMethodName(callNode, content) {
  const methodNode = callNode.childForFieldName('method');
  return methodNode ? nodeText(methodNode, content) : null;
}

// ─── Model Extraction ────────────────────────────────────────────────────────

const ASSOCIATION_METHODS = ['has_many', 'has_one', 'belongs_to', 'has_and_belongs_to_many'];

/**
 * Extract ActiveRecord associations from model AST.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{type: string, target: string, options: object}>}
 */
function extractAssociations(rootNode, content) {
  const associations = [];
  const calls = findAllByType(rootNode, 'call', []);

  for (const call of calls) {
    if (isCallTo(call, content, ASSOCIATION_METHODS)) {
      const type = callMethodName(call, content);
      const args = call.childForFieldName('arguments');
      const target = firstSymbolArg(args, content);
      if (target) {
        const options = extractHashOptions(args, content);
        associations.push({ type, target, options });
      }
    }
  }

  return associations;
}

const VALIDATION_METHODS = [
  'validates', 'validates_presence_of', 'validates_uniqueness_of',
  'validates_format_of', 'validates_length_of', 'validates_numericality_of',
  'validates_inclusion_of', 'validates_exclusion_of', 'validates_acceptance_of',
  'validates_confirmation_of', 'validates_associated', 'validate',
];

/**
 * Extract ActiveRecord validations from model AST.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{type: string, fields: string[], options: object}>}
 */
function extractValidations(rootNode, content) {
  const validations = [];
  const calls = findAllByType(rootNode, 'call', []);

  for (const call of calls) {
    if (isCallTo(call, content, VALIDATION_METHODS)) {
      const type = callMethodName(call, content);
      const args = call.childForFieldName('arguments');
      const fields = allSymbolArgs(args, content);
      const options = extractHashOptions(args, content);
      validations.push({ type, fields, options });
    }
  }

  return validations;
}

/**
 * Extract ActiveRecord scopes from model AST.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{name: string, body: string}>}
 */
function extractScopes(rootNode, content) {
  const scopes = [];
  const calls = findAllByType(rootNode, 'call', []);

  for (const call of calls) {
    if (isCallTo(call, content, 'scope')) {
      const args = call.childForFieldName('arguments');
      const name = firstSymbolArg(args, content);
      if (name) {
        // Extract the lambda body as the rest of the call text
        const lambdas = findAllByType(call, 'lambda', []);
        let body = '';
        if (lambdas.length > 0) {
          body = nodeText(lambdas[0], content);
        }
        scopes.push({ name, body });
      }
    }
  }

  return scopes;
}

const CALLBACK_METHODS = [
  'before_save', 'after_save', 'before_create', 'after_create',
  'before_update', 'after_update', 'before_destroy', 'after_destroy',
  'before_validation', 'after_validation', 'after_initialize', 'after_find',
  'after_touch', 'around_save', 'around_create', 'around_update', 'around_destroy',
  'after_commit', 'after_rollback',
];

/**
 * Extract ActiveRecord callbacks from model AST.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{type: string, method: string}>}
 */
function extractCallbacks(rootNode, content) {
  const callbacks = [];
  const calls = findAllByType(rootNode, 'call', []);

  for (const call of calls) {
    if (isCallTo(call, content, CALLBACK_METHODS)) {
      const type = callMethodName(call, content);
      const args = call.childForFieldName('arguments');
      const method = firstSymbolArg(args, content);
      if (method) {
        callbacks.push({ type, method });
      }
    }
  }

  return callbacks;
}

/**
 * Extract ActiveRecord enums from model AST.
 * Handles: enum status: { pending: 0, confirmed: 1 }
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{name: string, values: object}>}
 */
function extractEnums(rootNode, content) {
  const enums = [];
  const calls = findAllByType(rootNode, 'call', []);

  for (const call of calls) {
    if (isCallTo(call, content, 'enum')) {
      const args = call.childForFieldName('arguments');
      if (!args) continue;

      // enum status: { pending: 0, confirmed: 1 }
      // This appears as a call with a hash argument where the key is a symbol
      const pairs = findAllByType(args, 'pair', []);
      for (const pair of pairs) {
        const keyNode = pair.childForFieldName('key');
        const valueNode = pair.childForFieldName('value');
        if (keyNode && valueNode) {
          const name = nodeText(keyNode, content).replace(/^:/, '');
          const values = {};

          // If the value is a hash, extract its pairs
          const valuePairs = findAllByType(valueNode, 'pair', []);
          if (valuePairs.length > 0) {
            for (const vp of valuePairs) {
              const vkNode = vp.childForFieldName('key');
              const vvNode = vp.childForFieldName('value');
              if (vkNode && vvNode) {
                const vk = nodeText(vkNode, content).replace(/^:/, '');
                const vv = nodeText(vvNode, content);
                values[vk] = vv;
              }
            }
          }

          enums.push({ name, values });
        }
      }
    }
  }

  return enums;
}

// ─── Controller Extraction ───────────────────────────────────────────────────

const FILTER_METHODS = [
  'before_action', 'after_action', 'around_action',
  'skip_before_action', 'skip_after_action', 'skip_around_action',
  'prepend_before_action', 'append_before_action',
];

/**
 * Extract controller filters (before_action, etc).
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{type: string, method: string, only: string[]|null, except: string[]|null}>}
 */
function extractFilters(rootNode, content) {
  const filters = [];
  const calls = findAllByType(rootNode, 'call', []);

  for (const call of calls) {
    if (isCallTo(call, content, FILTER_METHODS)) {
      const type = callMethodName(call, content);
      const args = call.childForFieldName('arguments');
      const method = firstSymbolArg(args, content);
      const options = extractHashOptions(args, content);

      const filter = { type, method: method || null };

      if (options.only) {
        filter.only = parseArrayOption(options.only);
      }
      if (options.except) {
        filter.except = parseArrayOption(options.except);
      }

      filters.push(filter);
    }
  }

  return filters;
}

/**
 * Parse an array-like option value.
 * Input: "[:show, :update, :destroy]" => ['show', 'update', 'destroy']
 * @param {string} value
 * @returns {string[]}
 */
function parseArrayOption(value) {
  if (!value) return [];
  // Remove brackets and split
  const cleaned = value.replace(/[\[\]]/g, '');
  return cleaned.split(',')
    .map(s => s.trim().replace(/^:/, ''))
    .filter(Boolean);
}

/**
 * Extract strong parameters patterns (params.require().permit()).
 * Uses text-based matching on the content for reliability.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{require: string, permit: string[]}>}
 */
function extractStrongParams(rootNode, content) {
  const results = [];
  const pattern = /params\.require\(:(\w+)\)\.permit\(([^)]+)\)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const requireName = match[1];
    const permitFields = match[2]
      .split(',')
      .map(s => s.trim().replace(/^:/, ''))
      .filter(Boolean);

    results.push({ require: requireName, permit: permitFields });
  }

  return results;
}

/**
 * Extract rescue_from declarations.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{exception: string, handler: string}>}
 */
function extractRescueHandlers(rootNode, content) {
  const handlers = [];
  const calls = findAllByType(rootNode, 'call', []);

  for (const call of calls) {
    if (isCallTo(call, content, 'rescue_from')) {
      const args = call.childForFieldName('arguments');
      if (!args) continue;

      // First arg is typically a constant (exception class)
      let exception = null;
      for (let i = 0; i < args.childCount; i++) {
        const child = args.child(i);
        if (child.type === 'constant' || child.type === 'scope_resolution') {
          exception = nodeText(child, content);
          break;
        }
      }

      const options = extractHashOptions(args, content);
      const handler = options.with || null;

      if (exception) {
        handlers.push({ exception, handler });
      }
    }
  }

  return handlers;
}

// ─── Routes Extraction ───────────────────────────────────────────────────────

/**
 * Expand Rails routes into a full endpoint list.
 * Handles: resources, resource, namespace, scope, member, collection, HTTP verbs.
 * @param {object} rootNode
 * @param {string} content
 * @returns {Array<{method: string, path: string, action: string}>}
 */
function expandRoutes(rootNode, content) {
  const endpoints = [];
  const routeCalls = findAllByType(rootNode, 'call', []);

  // Process recursively with context (namespace path prefix)
  processRouteNodes(rootNode, content, '', endpoints);
  return endpoints;
}

/**
 * Recursively process route nodes, maintaining namespace context.
 * @param {object} node
 * @param {string} content
 * @param {string} prefix - current path prefix from namespaces
 * @param {Array} endpoints - accumulated endpoints
 */
function processRouteNodes(node, content, prefix, endpoints) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === 'call') {
      processRouteCall(child, content, prefix, endpoints);
    } else if (child.type === 'do_block' || child.type === 'block') {
      // Continue into blocks
      processRouteNodes(child, content, prefix, endpoints);
    } else {
      processRouteNodes(child, content, prefix, endpoints);
    }
  }
}

const HTTP_VERBS = ['get', 'post', 'put', 'patch', 'delete'];
const RESOURCE_ACTIONS = {
  index:   { method: 'GET',    suffix: '' },
  show:    { method: 'GET',    suffix: '/:id' },
  create:  { method: 'POST',   suffix: '' },
  new:     { method: 'GET',    suffix: '/new' },
  edit:    { method: 'GET',    suffix: '/:id/edit' },
  update:  { method: 'PATCH',  suffix: '/:id' },
  destroy: { method: 'DELETE', suffix: '/:id' },
};

const SINGULAR_RESOURCE_ACTIONS = {
  show:    { method: 'GET',    suffix: '' },
  create:  { method: 'POST',   suffix: '' },
  new:     { method: 'GET',    suffix: '/new' },
  edit:    { method: 'GET',    suffix: '/edit' },
  update:  { method: 'PATCH',  suffix: '' },
  destroy: { method: 'DELETE', suffix: '' },
};

/**
 * Process a single route call node.
 * @param {object} callNode
 * @param {string} content
 * @param {string} prefix
 * @param {Array} endpoints
 */
function processRouteCall(callNode, content, prefix, endpoints) {
  const methodName = callMethodName(callNode, content);
  if (!methodName) return;

  const args = callNode.childForFieldName('arguments');

  if (methodName === 'namespace') {
    const name = firstSymbolArg(args, content);
    if (name) {
      const newPrefix = prefix + '/' + name;
      // Process the block
      const block = callNode.childForFieldName('block') || findBlock(callNode);
      if (block) {
        processRouteNodes(block, content, newPrefix, endpoints);
      }
    }
    return;
  }

  if (methodName === 'scope') {
    // scope can have a path argument
    const scopePath = firstStringOrSymbolArg(args, content);
    const newPrefix = scopePath ? prefix + '/' + scopePath : prefix;
    const block = callNode.childForFieldName('block') || findBlock(callNode);
    if (block) {
      processRouteNodes(block, content, newPrefix, endpoints);
    }
    return;
  }

  if (methodName === 'resources') {
    const resourceName = firstSymbolArg(args, content);
    if (!resourceName) return;

    const resourcePath = prefix + '/' + resourceName;
    const options = extractHashOptions(args, content);

    // Determine which actions to generate
    let actions = Object.keys(RESOURCE_ACTIONS);
    if (options.only) {
      actions = parseArrayOption(options.only);
    } else if (options.except) {
      const excluded = parseArrayOption(options.except);
      actions = actions.filter(a => !excluded.includes(a));
    }

    for (const action of actions) {
      const config = RESOURCE_ACTIONS[action];
      if (config) {
        endpoints.push({
          method: config.method,
          path: resourcePath + config.suffix,
          action: resourceName + '#' + action,
        });
      }
    }

    // Process block for member/collection routes
    const block = callNode.childForFieldName('block') || findBlock(callNode);
    if (block) {
      processResourceBlock(block, content, resourcePath, resourceName, endpoints);
    }
    return;
  }

  if (methodName === 'resource') {
    const resourceName = firstSymbolArg(args, content);
    if (!resourceName) return;

    const resourcePath = prefix + '/' + resourceName;
    const options = extractHashOptions(args, content);

    let actions = Object.keys(SINGULAR_RESOURCE_ACTIONS);
    if (options.only) {
      actions = parseArrayOption(options.only);
    } else if (options.except) {
      const excluded = parseArrayOption(options.except);
      actions = actions.filter(a => !excluded.includes(a));
    }

    // Pluralize the controller name for singular resources
    const controllerName = resourceName + 's';

    for (const action of actions) {
      const config = SINGULAR_RESOURCE_ACTIONS[action];
      if (config) {
        endpoints.push({
          method: config.method,
          path: resourcePath + config.suffix,
          action: controllerName + '#' + action,
        });
      }
    }

    const block = callNode.childForFieldName('block') || findBlock(callNode);
    if (block) {
      processResourceBlock(block, content, resourcePath, controllerName, endpoints);
    }
    return;
  }

  if (HTTP_VERBS.includes(methodName)) {
    // Direct HTTP verb route: get '/health', to: 'health#check'
    const routePath = firstStringOrSymbolArg(args, content);
    const options = extractHashOptions(args, content);
    const to = options.to || null;

    if (routePath) {
      const fullPath = prefix + (routePath.startsWith('/') ? routePath : '/' + routePath);
      endpoints.push({
        method: methodName.toUpperCase(),
        path: fullPath,
        action: to || methodName,
      });
    }
    return;
  }

  // For member/collection at top level (unlikely but handle)
  if (methodName === 'member' || methodName === 'collection') {
    const block = callNode.childForFieldName('block') || findBlock(callNode);
    if (block) {
      processRouteNodes(block, content, prefix, endpoints);
    }
    return;
  }

  // For unrecognized calls (e.g., Rails.application.routes.draw),
  // check if they have a block and recurse into it
  const block = callNode.childForFieldName('block') || findBlock(callNode);
  if (block) {
    processRouteNodes(block, content, prefix, endpoints);
  }
}

/**
 * Process member and collection blocks within a resources block.
 * @param {object} blockNode
 * @param {string} content
 * @param {string} resourcePath
 * @param {string} resourceName
 * @param {Array} endpoints
 */
function processResourceBlock(blockNode, content, resourcePath, resourceName, endpoints) {
  const calls = findAllByType(blockNode, 'call', []);

  for (const call of calls) {
    const methodName = callMethodName(call, content);
    if (!methodName) continue;

    if (methodName === 'member') {
      const block = call.childForFieldName('block') || findBlock(call);
      if (block) {
        processMemberCollectionBlock(block, content, resourcePath + '/:id', resourceName, endpoints);
      }
    } else if (methodName === 'collection') {
      const block = call.childForFieldName('block') || findBlock(call);
      if (block) {
        processMemberCollectionBlock(block, content, resourcePath, resourceName, endpoints);
      }
    }
  }
}

/**
 * Process individual route calls within member/collection blocks.
 * @param {object} blockNode
 * @param {string} content
 * @param {string} basePath
 * @param {string} controllerName
 * @param {Array} endpoints
 */
function processMemberCollectionBlock(blockNode, content, basePath, controllerName, endpoints) {
  const calls = findAllByType(blockNode, 'call', []);

  for (const call of calls) {
    const verb = callMethodName(call, content);
    if (!verb || !HTTP_VERBS.includes(verb)) continue;

    const args = call.childForFieldName('arguments');
    const actionName = firstSymbolArg(args, content) || firstStringOrSymbolArg(args, content);

    if (actionName) {
      endpoints.push({
        method: verb.toUpperCase(),
        path: basePath + '/' + actionName,
        action: controllerName + '#' + actionName,
      });
    }
  }
}

/**
 * Find the first string or symbol argument from a call's arguments.
 * @param {object} argsNode
 * @param {string} content
 * @returns {string|null}
 */
function firstStringOrSymbolArg(argsNode, content) {
  if (!argsNode) return null;
  for (let i = 0; i < argsNode.childCount; i++) {
    const child = argsNode.child(i);
    if (child.type === 'simple_symbol') {
      return nodeText(child, content).replace(/^:/, '');
    }
    if (child.type === 'string') {
      // Strip quotes
      const text = nodeText(child, content);
      return text.replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}

/**
 * Find a do_block or block child of a node.
 * @param {object} node
 * @returns {object|null}
 */
function findBlock(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'do_block' || child.type === 'block') {
      return child;
    }
  }
  return null;
}

// ─── Concerns Extraction ─────────────────────────────────────────────────────

/**
 * Extract concern-specific information.
 * Detects `extend ActiveSupport::Concern` and `included`/`class_methods` blocks.
 * @param {object} rootNode
 * @param {string} content
 * @returns {object}
 */
function extractConcernInfo(rootNode, content) {
  const info = {
    isActiveSupportConcern: false,
    hasIncludedBlock: false,
    hasClassMethods: false,
  };

  const calls = findAllByType(rootNode, 'call', []);

  for (const call of calls) {
    const methodName = callMethodName(call, content);

    if (methodName === 'extend') {
      const args = call.childForFieldName('arguments');
      if (args) {
        const text = nodeText(args, content);
        if (text.includes('ActiveSupport::Concern')) {
          info.isActiveSupportConcern = true;
        }
      }
    }

    if (methodName === 'included') {
      info.hasIncludedBlock = true;
    }

    if (methodName === 'class_methods') {
      info.hasClassMethods = true;
    }
  }

  return info;
}

module.exports = { enrich };
