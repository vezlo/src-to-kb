'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getAnalyzer, getAnalyzerStats, resetRegistry } = require('../index');
const { validateChunk } = require('../shared/metadata-schema');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Create a mixed-language fixture directory for integration testing
function createFixtureProject() {
  const projectDir = path.join(FIXTURES_DIR, 'mixed-project');

  // Ruby file
  const rubyDir = path.join(projectDir, 'app', 'models');
  fs.mkdirSync(rubyDir, { recursive: true });
  fs.writeFileSync(path.join(rubyDir, 'user.rb'), `
class User < ApplicationRecord
  has_many :orders
  validates :email, presence: true

  def full_name
    "\#{first_name} \#{last_name}"
  end
end
`);

  // TypeScript file
  const tsDir = path.join(projectDir, 'src', 'services');
  fs.mkdirSync(tsDir, { recursive: true });
  fs.writeFileSync(path.join(tsDir, 'user.service.ts'), `
import { Injectable } from '@nestjs/common';

export class UserService {
  async findById(id: string): Promise<User | null> {
    return null;
  }
}
`);

  // Dart file
  const dartDir = path.join(projectDir, 'lib', 'models');
  fs.mkdirSync(dartDir, { recursive: true });
  fs.writeFileSync(path.join(dartDir, 'user.dart'), `
class User {
  final String id;
  final String name;

  User({required this.id, required this.name});

  factory User.fromJson(Map<String, dynamic> json) {
    return User(id: json['id'], name: json['name']);
  }
}
`);

  // Python file (no analyzer available — should fall back)
  const pyDir = path.join(projectDir, 'scripts');
  fs.mkdirSync(pyDir, { recursive: true });
  fs.writeFileSync(path.join(pyDir, 'migrate.py'), `
def run_migration():
    print("Running migration...")

if __name__ == "__main__":
    run_migration()
`);

  // Go file (no analyzer available — should fall back)
  fs.writeFileSync(path.join(pyDir, 'server.go'), `
package main

func main() {
    fmt.Println("Hello, World!")
}
`);

  // Rails indicator for enrichment
  const configDir = path.join(projectDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'routes.rb'), `
Rails.application.routes.draw do
  resources :users
end
`);

  return projectDir;
}

function cleanupFixtureProject() {
  const projectDir = path.join(FIXTURES_DIR, 'mixed-project');
  try {
    fs.rmSync(projectDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}

describe('Analyzer Integration', () => {
  let projectDir;

  before(() => {
    resetRegistry();
    projectDir = createFixtureProject();
  });

  after(() => {
    cleanupFixtureProject();
    resetRegistry();
  });

  describe('getAnalyzer()', () => {
    it('returns an analyzer for .rb files', () => {
      const analyzer = getAnalyzer('.rb', projectDir);
      // May return null if tree-sitter-ruby is not installed, that's ok
      if (analyzer) {
        assert.ok(typeof analyzer.parse === 'function');
        assert.ok(typeof analyzer.extractMetadata === 'function');
        assert.ok(typeof analyzer.chunk === 'function');
        assert.ok(typeof analyzer.enrich === 'function');
      }
    });

    it('returns an analyzer for .ts files', () => {
      const analyzer = getAnalyzer('.ts', projectDir);
      if (analyzer) {
        assert.ok(typeof analyzer.parse === 'function');
        assert.ok(typeof analyzer.extractMetadata === 'function');
      }
    });

    it('returns an analyzer for .tsx files', () => {
      const analyzer = getAnalyzer('.tsx', projectDir);
      if (analyzer) {
        assert.ok(typeof analyzer.parse === 'function');
      }
    });

    it('returns an analyzer for .dart files', () => {
      const analyzer = getAnalyzer('.dart', projectDir);
      if (analyzer) {
        assert.ok(typeof analyzer.parse === 'function');
        assert.ok(typeof analyzer.extractMetadata === 'function');
      }
    });

    it('returns null for unsupported extensions', () => {
      assert.equal(getAnalyzer('.py', projectDir), null);
      assert.equal(getAnalyzer('.go', projectDir), null);
      assert.equal(getAnalyzer('.java', projectDir), null);
      assert.equal(getAnalyzer('.js', projectDir), null);
      assert.equal(getAnalyzer('.css', projectDir), null);
    });
  });

  describe('end-to-end processing', () => {
    it('produces enriched chunks for Ruby files when analyzer is available', () => {
      const analyzer = getAnalyzer('.rb', projectDir);
      if (!analyzer) {
        console.log('   ⏭️  Skipping: tree-sitter-ruby not installed');
        return;
      }

      const content = fs.readFileSync(path.join(projectDir, 'app', 'models', 'user.rb'), 'utf8');
      const tree = analyzer.parse(path.join(projectDir, 'app', 'models', 'user.rb'), content);
      assert.ok(tree, 'Should parse Ruby file');

      const metadata = analyzer.extractMetadata(tree, 'app/models/user.rb', content);
      assert.ok(metadata, 'Should extract metadata');
      assert.equal(metadata.name, 'User');

      const enrichedMetadata = analyzer.enrich(metadata, tree, content, 'app/models/user.rb');
      assert.ok(enrichedMetadata, 'Should enrich metadata');

      const chunks = analyzer.chunk(tree, content, { maxSize: 1000 }, 'app/models/user.rb');
      assert.ok(chunks.length > 0, 'Should produce chunks');

      // Verify chunk format
      for (const chunk of chunks) {
        const enrichedChunk = { ...chunk, ast: enrichedMetadata };
        const result = validateChunk(enrichedChunk);
        assert.ok(result.valid, `Chunk validation failed: ${result.errors.join(', ')}`);
      }
    });

    it('produces enriched chunks for TypeScript files when analyzer is available', () => {
      const analyzer = getAnalyzer('.ts', projectDir);
      if (!analyzer) {
        console.log('   ⏭️  Skipping: tree-sitter-typescript not installed');
        return;
      }

      const content = fs.readFileSync(path.join(projectDir, 'src', 'services', 'user.service.ts'), 'utf8');
      const tree = analyzer.parse(path.join(projectDir, 'src', 'services', 'user.service.ts'), content);
      assert.ok(tree, 'Should parse TypeScript file');

      const metadata = analyzer.extractMetadata(tree, 'src/services/user.service.ts', content);
      assert.ok(metadata, 'Should extract metadata');

      const chunks = analyzer.chunk(tree, content, { maxSize: 1000 }, 'src/services/user.service.ts');
      assert.ok(chunks.length > 0, 'Should produce chunks');
    });

    it('produces enriched chunks for Dart files when analyzer is available', () => {
      const analyzer = getAnalyzer('.dart', projectDir);
      if (!analyzer) {
        console.log('   ⏭️  Skipping: tree-sitter-dart not installed');
        return;
      }

      const content = fs.readFileSync(path.join(projectDir, 'lib', 'models', 'user.dart'), 'utf8');
      const tree = analyzer.parse(path.join(projectDir, 'lib', 'models', 'user.dart'), content);
      if (!tree) {
        // tree-sitter-dart grammar failed to load — graceful fallback
        console.log('   ⏭️  Skipping: tree-sitter-dart grammar unavailable');
        return;
      }

      const metadata = analyzer.extractMetadata(tree, 'lib/models/user.dart', content);
      assert.ok(metadata, 'Should extract metadata');
    });

    it('returns null analyzer for Python files (text fallback expected)', () => {
      const analyzer = getAnalyzer('.py', projectDir);
      assert.equal(analyzer, null, 'Should return null for .py files');
    });

    it('returns null analyzer for Go files (text fallback expected)', () => {
      const analyzer = getAnalyzer('.go', projectDir);
      assert.equal(analyzer, null, 'Should return null for .go files');
    });
  });

  describe('backward compatibility', () => {
    it('chunks without ast field pass validation', () => {
      // Simulate a text-based chunk (no ast field)
      const textChunk = {
        id: 'doc_test_chunk_0',
        index: 0,
        content: 'def run_migration():\n    print("Running migration...")',
        startLine: 1,
        endLine: 2,
        size: 52,
      };
      const result = validateChunk(textChunk);
      assert.ok(result.valid, `Text chunk should be valid: ${result.errors.join(', ')}`);
    });

    it('enriched chunks with ast field pass validation', () => {
      const enrichedChunk = {
        id: 'doc_test_chunk_0',
        index: 0,
        content: 'class User < ApplicationRecord\nend',
        startLine: 1,
        endLine: 2,
        size: 34,
        ast: {
          type: 'class',
          name: 'User',
          inherits: 'ApplicationRecord',
          scope: ['app', 'models'],
          defines: [{ name: 'User', type: 'class' }],
          references: ['ApplicationRecord'],
        },
      };
      const result = validateChunk(enrichedChunk);
      assert.ok(result.valid, `Enriched chunk should be valid: ${result.errors.join(', ')}`);
    });
  });

  describe('framework detection', () => {
    it('detects Rails project when config/routes.rb exists', () => {
      const { detectRails } = require('../index');
      assert.ok(detectRails(projectDir), 'Should detect Rails project');
    });

    it('does not detect Flutter for non-Flutter project', () => {
      const { detectFlutter } = require('../index');
      assert.equal(detectFlutter(projectDir), false, 'Should not detect Flutter');
    });
  });

  describe('analyzer stats', () => {
    it('returns stats object', () => {
      const stats = getAnalyzerStats();
      assert.ok(stats, 'Should return stats');
      assert.ok(Array.isArray(stats.analyzersUsed), 'analyzersUsed should be an array');
      assert.ok(Array.isArray(stats.enrichmentsApplied), 'enrichmentsApplied should be an array');
    });
  });
});
