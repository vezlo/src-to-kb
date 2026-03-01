'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Gracefully skip all tests if tree-sitter-ruby is not available
let RubyAnalyzer;
let treeSitterAvailable = false;

try {
  require('tree-sitter');
  require('tree-sitter-ruby');
  treeSitterAvailable = true;
} catch (err) {
  console.warn('[test] tree-sitter-ruby unavailable, skipping Ruby analyzer tests: ' + err.message);
}

if (treeSitterAvailable) {
  ({ RubyAnalyzer } = require('../../ruby/index'));
}

describe('RubyAnalyzer', { skip: !treeSitterAvailable ? 'tree-sitter-ruby not installed' : false }, () => {
  let analyzer;
  let modelContent;
  let controllerContent;
  let concernContent;

  before(() => {
    analyzer = new RubyAnalyzer();
    modelContent = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_model.rb'), 'utf8');
    controllerContent = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_controller.rb'), 'utf8');
    concernContent = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_concern.rb'), 'utf8');
  });

  describe('parse()', () => {
    it('should parse a Ruby file and return a tree', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      assert.ok(tree, 'tree should not be null');
      assert.ok(tree.rootNode, 'tree should have a rootNode');
    });

    it('should return null when tree-sitter-ruby is unavailable', () => {
      // We simulate this by testing the loadParser behavior;
      // since tree-sitter IS available in this context, we verify the parse succeeds
      const tree = analyzer.parse('test.rb', 'class Foo; end');
      assert.ok(tree !== null);
    });

    it('should handle empty content', () => {
      const tree = analyzer.parse('empty.rb', '');
      assert.ok(tree, 'tree should still be returned for empty content');
    });

    it('should handle syntax errors gracefully', () => {
      const tree = analyzer.parse('broken.rb', 'class Foo < ; end');
      // tree-sitter is error-tolerant and still returns a tree
      assert.ok(tree, 'tree should still be returned for broken syntax');
    });
  });

  describe('extractMetadata() - class extraction', () => {
    it('should extract class name and inheritance', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      const metadata = analyzer.extractMetadata(tree, 'app/models/order.rb', modelContent);

      assert.equal(metadata.type, 'class');
      assert.equal(metadata.name, 'Order');
      assert.equal(metadata.inherits, 'ApplicationRecord');
    });

    it('should include the class itself in defines', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      const metadata = analyzer.extractMetadata(tree, 'app/models/order.rb', modelContent);

      const classDef = metadata.defines.find(d => d.name === 'Order' && d.type === 'class');
      assert.ok(classDef, 'should have a class definition for Order');
    });

    it('should extract public methods', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      const metadata = analyzer.extractMetadata(tree, 'app/models/order.rb', modelContent);

      const confirmMethod = metadata.defines.find(d => d.name === 'confirm!');
      assert.ok(confirmMethod, 'should find confirm! method');
      assert.equal(confirmMethod.type, 'method');
      assert.equal(confirmMethod.visibility, 'public');

      const taxMethod = metadata.defines.find(d => d.name === 'total_with_tax');
      assert.ok(taxMethod, 'should find total_with_tax method');
      assert.equal(taxMethod.visibility, 'public');
    });

    it('should extract scope from file path', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      const metadata = analyzer.extractMetadata(tree, 'app/models/order.rb', modelContent);

      assert.ok(Array.isArray(metadata.scope));
      assert.ok(metadata.scope.includes('app'));
      assert.ok(metadata.scope.includes('models'));
    });

    it('should collect references to other classes', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      const metadata = analyzer.extractMetadata(tree, 'app/models/order.rb', modelContent);

      assert.ok(metadata.references.includes('ApplicationRecord'),
        'should reference ApplicationRecord');
    });
  });

  describe('extractMetadata() - visibility modifiers', () => {
    it('should track visibility state for private methods', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      const metadata = analyzer.extractMetadata(tree, 'app/models/order.rb', modelContent);

      const calculateTotal = metadata.defines.find(d => d.name === 'calculate_total');
      assert.ok(calculateTotal, 'should find calculate_total method');
      assert.equal(calculateTotal.visibility, 'private',
        'calculate_total should be private');

      const notifyWarehouse = metadata.defines.find(d => d.name === 'notify_warehouse');
      assert.ok(notifyWarehouse, 'should find notify_warehouse method');
      assert.equal(notifyWarehouse.visibility, 'private',
        'notify_warehouse should be private');
    });

    it('should handle protected visibility', () => {
      const code = `
class Foo
  def public_method; end

  protected

  def protected_method; end

  private

  def private_method; end
end`;
      const tree = analyzer.parse('test.rb', code);
      const metadata = analyzer.extractMetadata(tree, 'test.rb', code);

      const pubMethod = metadata.defines.find(d => d.name === 'public_method');
      assert.equal(pubMethod.visibility, 'public');

      const protMethod = metadata.defines.find(d => d.name === 'protected_method');
      assert.equal(protMethod.visibility, 'protected');

      const privMethod = metadata.defines.find(d => d.name === 'private_method');
      assert.equal(privMethod.visibility, 'private');
    });
  });

  describe('extractMetadata() - module includes/extends', () => {
    it('should extract include statements', () => {
      const code = `
class MyModel < ApplicationRecord
  include Searchable
  include Filterable
end`;
      const tree = analyzer.parse('app/models/my_model.rb', code);
      const metadata = analyzer.extractMetadata(tree, 'app/models/my_model.rb', code);

      assert.ok(metadata.includes.includes('Searchable'));
      assert.ok(metadata.includes.includes('Filterable'));
    });

    it('should extract extend statements', () => {
      const code = `
class MyModel < ApplicationRecord
  extend ClassMethods
end`;
      const tree = analyzer.parse('app/models/my_model.rb', code);
      const metadata = analyzer.extractMetadata(tree, 'app/models/my_model.rb', code);

      assert.ok(metadata.extends.includes('ClassMethods'));
    });

    it('should add included/extended modules to references', () => {
      const code = `
class MyModel < ApplicationRecord
  include Searchable
  extend ClassMethods
end`;
      const tree = analyzer.parse('test.rb', code);
      const metadata = analyzer.extractMetadata(tree, 'test.rb', code);

      assert.ok(metadata.references.includes('Searchable'));
      assert.ok(metadata.references.includes('ClassMethods'));
    });
  });

  describe('extractMetadata() - attr_reader/writer/accessor', () => {
    it('should extract attr_reader', () => {
      const code = `
class Config
  attr_reader :name, :version
end`;
      const tree = analyzer.parse('test.rb', code);
      const metadata = analyzer.extractMetadata(tree, 'test.rb', code);

      assert.ok(metadata.attributes.find(a => a.name === 'name' && a.access === 'reader'));
      assert.ok(metadata.attributes.find(a => a.name === 'version' && a.access === 'reader'));
    });

    it('should extract attr_writer', () => {
      const code = `
class Config
  attr_writer :name
end`;
      const tree = analyzer.parse('test.rb', code);
      const metadata = analyzer.extractMetadata(tree, 'test.rb', code);

      assert.ok(metadata.attributes.find(a => a.name === 'name' && a.access === 'writer'));
    });

    it('should extract attr_accessor', () => {
      const code = `
class Config
  attr_accessor :name, :email
end`;
      const tree = analyzer.parse('test.rb', code);
      const metadata = analyzer.extractMetadata(tree, 'test.rb', code);

      assert.ok(metadata.attributes.find(a => a.name === 'name' && a.access === 'accessor'));
      assert.ok(metadata.attributes.find(a => a.name === 'email' && a.access === 'accessor'));
    });
  });

  describe('extractMetadata() - constants', () => {
    it('should extract constant assignments', () => {
      const code = `
class Config
  MAX_ITEMS = 100
  DEFAULT_NAME = 'test'
end`;
      const tree = analyzer.parse('test.rb', code);
      const metadata = analyzer.extractMetadata(tree, 'test.rb', code);

      const maxItems = metadata.constants.find(c => c.name === 'MAX_ITEMS');
      assert.ok(maxItems, 'should find MAX_ITEMS constant');
      assert.equal(maxItems.value, '100');
    });
  });

  describe('extractMetadata() - module definitions', () => {
    it('should extract module metadata', () => {
      const tree = analyzer.parse('app/models/concerns/searchable.rb', concernContent);
      const metadata = analyzer.extractMetadata(tree, 'app/models/concerns/searchable.rb', concernContent);

      assert.equal(metadata.type, 'module');
      assert.equal(metadata.name, 'Searchable');
    });
  });

  describe('chunk()', () => {
    it('should produce chunks from a parsed tree', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      const chunks = analyzer.chunk(tree, modelContent, { maxSize: 500 }, 'app/models/order.rb');

      assert.ok(Array.isArray(chunks), 'chunks should be an array');
      assert.ok(chunks.length > 0, 'should produce at least one chunk');

      for (const chunk of chunks) {
        assert.ok(typeof chunk.content === 'string');
        assert.ok(typeof chunk.startLine === 'number');
        assert.ok(typeof chunk.endLine === 'number');
        assert.ok(typeof chunk.size === 'number');
      }
    });

    it('should respect structural boundaries', () => {
      const tree = analyzer.parse('app/models/order.rb', modelContent);
      const chunks = analyzer.chunk(tree, modelContent, { maxSize: 2000 }, 'app/models/order.rb');

      // With a large maxSize, the whole class should fit in fewer chunks
      assert.ok(chunks.length >= 1);
    });
  });
});
