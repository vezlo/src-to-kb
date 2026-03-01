# Analyzer Guide

How to extend `src-to-kb` with custom language analyzers and framework enrichment layers.

## Architecture Overview

The analyzer system adds AST-aware chunking and semantic metadata to the knowledge base generation pipeline. When a file is processed, the system checks if an analyzer exists for that file's extension. If so, the file is parsed into an AST using tree-sitter, metadata is extracted, and chunks respect structural boundaries (classes, methods, functions). If no analyzer exists, the file falls back to the existing text-based chunking.

```
File (.rb, .ts, .dart, ...)
  │
  ▼
Analyzer Registry (analyzers/index.js)
  │
  ├── Analyzer found? ──► Parse AST ──► Extract Metadata ──► Enrich (optional) ──► AST-aware Chunks
  │                                                                                      │
  └── No analyzer ──► Text-based Chunking (existing behavior)                            │
                                                                                         ▼
                                                                              Enriched Chunks with `ast` field
```

### Key Components

- **`analyzers/index.js`** — Registry that maps file extensions to analyzer classes
- **`analyzers/base-analyzer.js`** — Abstract base class all analyzers extend
- **`analyzers/shared/tree-sitter-loader.js`** — Lazy-loads tree-sitter grammars with graceful fallback
- **`analyzers/shared/chunk-splitter.js`** — AST-aware chunk splitting algorithm
- **`analyzers/shared/metadata-schema.js`** — Validation for enriched chunk format
- **`analyzers/<language>/index.js`** — Language-specific analyzer
- **`analyzers/<language>/<framework>.js`** — Optional framework enrichment layer

## How to Add a Language Analyzer

### Step 1: Create the Analyzer Folder

```
analyzers/
└── python/
    ├── index.js              # PythonAnalyzer class
    └── __tests__/
        ├── python-analyzer.test.js
        └── fixtures/
            └── sample_class.py
```

### Step 2: Install the Tree-Sitter Grammar

Add to `package.json`:

```json
{
  "dependencies": {
    "tree-sitter-python": "^0.23.x"
  }
}
```

### Step 3: Implement the Analyzer

Create `analyzers/python/index.js`:

```javascript
'use strict';

const { BaseAnalyzer } = require('../base-analyzer');
const { loadParser } = require('../shared/tree-sitter-loader');

class PythonAnalyzer extends BaseAnalyzer {
  constructor() {
    super();
    this._parser = null;
  }

  parse(filePath, content) {
    if (!this._parser) {
      const loaded = loadParser('python');
      if (!loaded) return null;
      this._parser = loaded.parser;
    }
    try {
      return this._parser.parse(content);
    } catch (err) {
      return null;
    }
  }

  extractMetadata(tree, filePath, content) {
    const rootNode = tree.rootNode;
    const scope = filePath.split('/').slice(0, -1).filter(s => s && s !== '.');

    // Walk the AST and extract classes, functions, imports, etc.
    const defines = [];
    const references = [];
    const imports = [];
    let primaryType = 'module';
    let primaryName = null;

    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      // Extract based on node.type:
      // 'class_definition', 'function_definition', 'import_statement', etc.
    }

    return {
      type: primaryType,
      name: primaryName || filePath.split('/').pop().replace('.py', ''),
      scope,
      defines,
      references,
      imports,
    };
  }
}

module.exports = { PythonAnalyzer };
```

### Step 4: Register in the Extension Map

Edit `analyzers/index.js` and add to `EXTENSION_MAP`:

```javascript
const EXTENSION_MAP = {
  // ... existing entries
  '.py': { analyzer: './python', enrichment: null },
};
```

### Step 5: Add Tests

Create `analyzers/python/__tests__/python-analyzer.test.js` using `node:test`:

```javascript
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let treeSitterAvailable = false;
try {
  require('tree-sitter');
  require('tree-sitter-python');
  treeSitterAvailable = true;
} catch (err) {
  console.warn('tree-sitter-python unavailable, skipping tests');
}

describe('PythonAnalyzer', { skip: !treeSitterAvailable }, () => {
  // ... your tests
});
```

## How to Add a Framework Enrichment

Enrichment layers add framework-specific metadata on top of the base language analyzer output.

### Step 1: Create the Enrichment File

```
analyzers/
└── python/
    ├── index.js
    ├── django.js             # Django enrichment
    └── __tests__/
        ├── django-enrichment.test.js
        └── fixtures/
            └── sample_django_model.py
```

### Step 2: Implement the Enrichment

Create `analyzers/python/django.js`:

```javascript
'use strict';

/**
 * Django enrichment layer for Python.
 * Detects Django-specific patterns: models, views, URL configs, etc.
 */

/**
 * @param {object} metadata - Base metadata from PythonAnalyzer
 * @param {object} tree - tree-sitter parse tree
 * @param {string} content - Raw file content
 * @param {string} filePath - File path
 * @returns {object} Enriched metadata with framework field
 */
function enrich(metadata, tree, content, filePath) {
  // Detect Django model patterns
  if (filePath.includes('models') && metadata.inherits === 'Model') {
    metadata.framework = {
      type: 'django_model',
      fields: extractDjangoFields(tree, content),
      meta: extractDjangoMeta(tree, content),
    };
  }

  return metadata;
}

module.exports = { enrich };
```

### Step 3: Register with Auto-Detection

In `analyzers/index.js`, update the `EXTENSION_MAP`:

```javascript
'.py': { analyzer: './python', enrichment: './python/django' },
```

Then add a detection function:

```javascript
function detectDjango(projectRoot) {
  // Check for manage.py, settings.py, Django in requirements.txt
}
```

The registry checks this before applying enrichment, so non-Django Python projects won't get Django-specific metadata.

### Step 4: Document Detection Indicators

The enrichment should only activate when the project matches the framework. Common indicators:

- **Rails**: `Gemfile` with `gem 'rails'`, `config/routes.rb`, `app/models/`
- **Flutter**: `pubspec.yaml` with `flutter:`, `package:flutter/` imports
- **Django**: `manage.py`, `settings.py`, `django` in `requirements.txt`
- **NestJS**: `@nestjs/core` in `package.json`, decorators like `@Module`

## Enriched Chunk Format

Base chunk fields (always present):

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Chunk identifier (`doc_xxx_chunk_0`) |
| `index` | number | Chunk index within the document |
| `content` | string | Raw text content of the chunk |
| `startLine` | number | Start line number |
| `endLine` | number | End line number |
| `size` | number | Content size in characters |

AST metadata fields (added when an analyzer processes the file):

| Field | Type | Description |
|-------|------|-------------|
| `ast.type` | string | Primary structure type (`class`, `module`, `interface`, `mixin`, `extension`, `enum`, `function`) |
| `ast.name` | string | Name of the primary structure |
| `ast.inherits` | string\|null | Parent class/superclass |
| `ast.exported` | boolean | Whether the definition is exported (TS/Dart) |
| `ast.scope` | string[] | Path segments indicating code location |
| `ast.defines` | object[] | List of definitions (classes, methods, fields, etc.) |
| `ast.references` | string[] | Referenced types/classes |
| `ast.imports` | object[] | Import statements |
| `ast.framework` | object\|null | Framework-specific metadata |

### `defines` Entry Format

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Definition name |
| `type` | string | `class`, `method`, `field`, `constructor`, `interface`, `type_alias`, `enum` |
| `visibility` | string | `public`, `private`, `protected` (language-specific) |
| `async` | boolean | Whether the method is async |
| `returnType` | string | Return type annotation (TS/Dart) |
| `exported` | boolean | Whether exported (TS) |
| `static` | boolean | Whether static |

## Testing Guide

Tests use Node.js built-in test runner (`node:test`). Run with:

```bash
# Run all analyzer tests
node --test analyzers/*/__tests__/*.test.js

# Run a specific analyzer's tests
node --test analyzers/ruby/__tests__/*.test.js
```

All test files must gracefully skip when their tree-sitter grammar is unavailable:

```javascript
let treeSitterAvailable = false;
try {
  require('tree-sitter');
  require('tree-sitter-<language>');
  treeSitterAvailable = true;
} catch (err) {
  console.warn('Skipping tests: ' + err.message);
}

describe('MyAnalyzer', { skip: !treeSitterAvailable }, () => {
  // tests here
});
```

### Test Fixture Guidelines

- Place fixtures in `analyzers/<language>/__tests__/fixtures/`
- Use realistic but minimal code — each fixture should test specific patterns
- Name fixtures descriptively: `sample_model.rb`, `sample_controller.rb`
- Include comments in fixtures explaining what patterns they test

## Future: Linker System

A cross-codebase linker system is planned for a future phase. When writing analyzers, extract endpoint/API call information when relevant:

- **REST endpoints**: HTTP method, path, controller action
- **API calls**: client method, URL path, request/response types
- **Event handlers**: event names, handler methods
- **Database queries**: model references, association targets

This data will be used by the linker to connect API definitions with their consumers across the codebase.
