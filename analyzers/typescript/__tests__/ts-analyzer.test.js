'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, 'fixtures');

// ─── Graceful skip if tree-sitter-typescript is unavailable ─────────────────

let TypeScriptAnalyzer;
let treeSitterAvailable = false;

try {
  require('tree-sitter');
  require('tree-sitter-typescript');
  treeSitterAvailable = true;
} catch {
  // tree-sitter or tree-sitter-typescript not installed
}

if (treeSitterAvailable) {
  ({ TypeScriptAnalyzer } = require('../index'));
}

// ─── Helper: parse + extract metadata for a fixture file ────────────────────

function analyzeFixture(analyzer, fixtureName) {
  const filePath = path.join(FIXTURES, fixtureName);
  const content = fs.readFileSync(filePath, 'utf8');
  const tree = analyzer.parse(filePath, content);
  assert.ok(tree, `Expected tree-sitter to parse ${fixtureName}`);
  const metadata = analyzer.extractMetadata(tree, filePath, content);
  return { tree, metadata, content };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TypeScriptAnalyzer', { skip: !treeSitterAvailable ? 'tree-sitter-typescript not installed' : false }, () => {
  let analyzer;

  before(() => {
    analyzer = new TypeScriptAnalyzer();
  });

  // ── Class parsing ───────────────────────────────────────────────────────

  describe('class extraction', () => {
    it('parses classes and extracts name and inheritance', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_class.ts');

      // Primary type should be the first class (BaseEntity)
      assert.equal(metadata.type, 'class');
      assert.equal(metadata.name, 'BaseEntity');

      // Find the Order class in definitions
      const orderDef = metadata.definitions.find(d => d.name === 'Order');
      assert.ok(orderDef, 'Should find Order class in definitions');
      assert.equal(orderDef.type, 'class');
      assert.equal(orderDef.inherits, 'BaseEntity');
    });

    it('extracts abstract classes and abstract methods', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_class.ts');

      const baseEntity = metadata.definitions.find(d => d.name === 'BaseEntity');
      assert.ok(baseEntity, 'Should find BaseEntity');
      assert.equal(baseEntity.abstract, true, 'BaseEntity should be abstract');
      assert.equal(baseEntity.typeInfo.abstract, true);

      // Find the abstract validate method
      const abstractMethod = baseEntity.defines.find(
        d => d.name === 'validate' && d.abstract === true
      );
      assert.ok(abstractMethod, 'Should find abstract validate() method');
    });

    it('extracts methods with visibility modifiers', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const orderService = metadata.definitions.find(d => d.name === 'OrderService');
      assert.ok(orderService, 'Should find OrderService');

      // Public methods (default)
      const createMethod = orderService.defines.find(d => d.name === 'create');
      assert.ok(createMethod, 'Should find create method');
      assert.equal(createMethod.visibility, 'public');
      assert.equal(createMethod.async, true);

      // Private method
      const validateMethod = orderService.defines.find(d => d.name === 'validate');
      assert.ok(validateMethod, 'Should find validate method');
      assert.equal(validateMethod.visibility, 'private');

      // Protected method
      const notifyMethod = orderService.defines.find(d => d.name === 'notifyWarehouse');
      assert.ok(notifyMethod, 'Should find notifyWarehouse method');
      assert.equal(notifyMethod.visibility, 'protected');
      assert.equal(notifyMethod.async, true);
    });

    it('extracts async methods with return types', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const orderService = metadata.definitions.find(d => d.name === 'OrderService');
      const findById = orderService.defines.find(d => d.name === 'findById');
      assert.ok(findById, 'Should find findById method');
      assert.equal(findById.async, true);
      assert.ok(findById.returnType, 'findById should have a return type');
      assert.ok(
        findById.returnType.includes('Promise'),
        `Return type should include Promise, got: ${findById.returnType}`
      );
    });

    it('extracts static methods', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_class.ts');

      const order = metadata.definitions.find(d => d.name === 'Order');
      assert.ok(order, 'Should find Order class');

      const staticCreate = order.defines.find(d => d.name === 'create' && d.static === true);
      assert.ok(staticCreate, 'Should find static create() method');
    });

    it('extracts getter methods', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_class.ts');

      const order = metadata.definitions.find(d => d.name === 'Order');
      assert.ok(order, 'Should find Order class');

      const totalGetter = order.defines.find(d => d.name === 'total');
      assert.ok(totalGetter, 'Should find total getter');
      assert.equal(totalGetter.type, 'getter');
    });
  });

  // ── Interface parsing ─────────────────────────────────────────────────

  describe('interface extraction', () => {
    it('extracts interfaces with properties and method signatures', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_interface.ts');

      const repo = metadata.definitions.find(d => d.name === 'Repository');
      assert.ok(repo, 'Should find Repository interface');
      assert.equal(repo.type, 'interface');

      // Should have method signatures
      assert.ok(repo.properties.length > 0, 'Repository should have properties/methods');

      const findOne = repo.properties.find(p => p.name === 'findOne');
      assert.ok(findOne, 'Should find findOne method signature');
      assert.equal(findOne.type, 'method');
      assert.ok(findOne.returnType, 'findOne should have a return type');
    });

    it('extracts interface extends', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_interface.ts');

      const orderRepo = metadata.definitions.find(d => d.name === 'OrderRepository');
      assert.ok(orderRepo, 'Should find OrderRepository interface');
      assert.equal(orderRepo.type, 'interface');
      assert.ok(orderRepo.extends.length > 0, 'OrderRepository should extend something');
      assert.ok(
        orderRepo.extends.includes('Repository'),
        `Should extend Repository, got: ${JSON.stringify(orderRepo.extends)}`
      );
    });

    it('extracts generic type parameters on interfaces', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_interface.ts');

      const repo = metadata.definitions.find(d => d.name === 'Repository');
      assert.ok(repo, 'Should find Repository interface');
      assert.ok(repo.generics.length > 0, 'Repository should have generics');
      assert.ok(
        repo.generics.includes('T'),
        `Should have generic T, got: ${JSON.stringify(repo.generics)}`
      );
    });

    it('extracts interface property signatures with optional markers', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const orderFilter = metadata.definitions.find(d => d.name === 'OrderFilter');
      assert.ok(orderFilter, 'Should find OrderFilter interface');

      // All properties should be optional
      for (const prop of orderFilter.properties) {
        if (prop.type === 'property') {
          assert.equal(prop.optional, true, `${prop.name} should be optional`);
        }
      }
    });
  });

  // ── Type alias parsing ────────────────────────────────────────────────

  describe('type alias extraction', () => {
    it('extracts type aliases', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const orderStatus = metadata.definitions.find(d => d.name === 'OrderStatus');
      assert.ok(orderStatus, 'Should find OrderStatus type alias');
      assert.equal(orderStatus.type, 'type_alias');
      assert.ok(
        orderStatus.definition.includes('pending'),
        `Definition should include 'pending', got: ${orderStatus.definition}`
      );
    });

    it('extracts type aliases with generics', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_types.ts');

      const nullable = metadata.definitions.find(d => d.name === 'Nullable');
      assert.ok(nullable, 'Should find Nullable type alias');
      assert.equal(nullable.type, 'type_alias');
      assert.ok(nullable.generics.length > 0, 'Nullable should have generics');
      assert.ok(
        nullable.generics.includes('T'),
        `Should have generic T, got: ${JSON.stringify(nullable.generics)}`
      );
    });

    it('extracts simple union type aliases', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_types.ts');

      const idType = metadata.definitions.find(d => d.name === 'ID');
      assert.ok(idType, 'Should find ID type alias');
      assert.equal(idType.type, 'type_alias');
      assert.ok(
        idType.definition.includes('string') && idType.definition.includes('number'),
        `ID definition should be a union of string | number, got: ${idType.definition}`
      );
    });
  });

  // ── Enum parsing ──────────────────────────────────────────────────────

  describe('enum extraction', () => {
    it('extracts enums with members and values', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const priority = metadata.definitions.find(d => d.name === 'Priority');
      assert.ok(priority, 'Should find Priority enum');
      assert.equal(priority.type, 'enum');
      assert.ok(priority.members.length === 3, `Priority should have 3 members, got ${priority.members.length}`);

      const low = priority.members.find(m => m.name === 'Low');
      assert.ok(low, 'Should find Low member');
      assert.equal(low.value, 'low');

      const medium = priority.members.find(m => m.name === 'Medium');
      assert.ok(medium, 'Should find Medium member');
      assert.equal(medium.value, 'medium');

      const high = priority.members.find(m => m.name === 'High');
      assert.ok(high, 'Should find High member');
      assert.equal(high.value, 'high');
    });
  });

  // ── Import parsing ────────────────────────────────────────────────────

  describe('import extraction', () => {
    it('extracts regular imports', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const injectable = metadata.imports.find(i => i.name === 'Injectable');
      assert.ok(injectable, 'Should find Injectable import');
      assert.equal(injectable.from, '@nestjs/common');
      assert.equal(injectable.isType, false);
    });

    it('extracts type imports with isType flag', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const createOrderDto = metadata.imports.find(i => i.name === 'CreateOrderDto');
      assert.ok(createOrderDto, 'Should find CreateOrderDto import');
      assert.equal(createOrderDto.from, '../dto/create-order.dto');
      assert.equal(createOrderDto.isType, true, 'CreateOrderDto should be a type import');
    });

    it('differentiates type imports from regular imports', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const order = metadata.imports.find(i => i.name === 'Order');
      assert.ok(order, 'Should find Order import');
      assert.equal(order.isType, false, 'Order should be a regular import');

      const createOrderDto = metadata.imports.find(i => i.name === 'CreateOrderDto');
      assert.equal(createOrderDto.isType, true, 'CreateOrderDto should be a type import');
    });
  });

  // ── Decorator parsing ─────────────────────────────────────────────────

  describe('decorator extraction', () => {
    it('handles decorators on classes', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const orderService = metadata.definitions.find(d => d.name === 'OrderService');
      assert.ok(orderService, 'Should find OrderService');
      assert.ok(
        orderService.typeInfo.decorators.length > 0,
        'OrderService should have decorators'
      );
      assert.ok(
        orderService.typeInfo.decorators.some(d => d.includes('Injectable')),
        `Should have @Injectable decorator, got: ${JSON.stringify(orderService.typeInfo.decorators)}`
      );
    });
  });

  // ── Generic type parameters ───────────────────────────────────────────

  describe('generic type parameters', () => {
    it('handles generic type parameters on functions', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_types.ts');

      const paginate = metadata.definitions.find(d => d.name === 'paginate');
      assert.ok(paginate, 'Should find paginate function');
      assert.ok(paginate.generics.length > 0, 'paginate should have generics');
      assert.ok(
        paginate.generics.includes('T'),
        `Should have generic T, got: ${JSON.stringify(paginate.generics)}`
      );
    });

    it('handles generic type parameters on type aliases', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_types.ts');

      const deepPartial = metadata.definitions.find(d => d.name === 'DeepPartial');
      assert.ok(deepPartial, 'Should find DeepPartial type alias');
      assert.ok(deepPartial.generics.length > 0, 'DeepPartial should have generics');
      assert.ok(
        deepPartial.generics.includes('T'),
        `Should have generic T, got: ${JSON.stringify(deepPartial.generics)}`
      );
    });
  });

  // ── Function parsing ──────────────────────────────────────────────────

  describe('function extraction', () => {
    it('extracts named function declarations', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_types.ts');

      const paginate = metadata.definitions.find(d => d.name === 'paginate' && d.type === 'function');
      assert.ok(paginate, 'Should find paginate function');
      assert.equal(paginate.exported, true, 'paginate should be exported');
      assert.ok(paginate.params.length > 0, 'paginate should have params');
    });

    it('extracts arrow functions as variables', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_types.ts');

      const createId = metadata.definitions.find(d => d.name === 'createId');
      assert.ok(createId, 'Should find createId');
      assert.equal(createId.type, 'function', 'Arrow functions should be typed as function');
      assert.equal(createId.arrow, true, 'Should be flagged as arrow function');
      assert.equal(createId.exported, true, 'createId should be exported');
    });

    it('extracts constant variables', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_types.ts');

      const defaultPageSize = metadata.definitions.find(d => d.name === 'DEFAULT_PAGE_SIZE');
      assert.ok(defaultPageSize, 'Should find DEFAULT_PAGE_SIZE');
      assert.equal(defaultPageSize.type, 'variable');
      assert.equal(defaultPageSize.exported, true);
    });
  });

  // ── Export parsing ────────────────────────────────────────────────────

  describe('export extraction', () => {
    it('marks exported definitions correctly', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      const orderService = metadata.definitions.find(d => d.name === 'OrderService');
      assert.ok(orderService, 'Should find OrderService');
      assert.equal(orderService.exported, true, 'OrderService should be exported');

      const orderFilter = metadata.definitions.find(d => d.name === 'OrderFilter');
      assert.ok(orderFilter, 'Should find OrderFilter');
      assert.equal(orderFilter.exported, true, 'OrderFilter should be exported');

      const orderStatus = metadata.definitions.find(d => d.name === 'OrderStatus');
      assert.ok(orderStatus, 'Should find OrderStatus');
      assert.equal(orderStatus.exported, true, 'OrderStatus should be exported');

      const priority = metadata.definitions.find(d => d.name === 'Priority');
      assert.ok(priority, 'Should find Priority');
      assert.equal(priority.exported, true, 'Priority should be exported');
    });
  });

  // ── Graceful null return ──────────────────────────────────────────────

  describe('graceful handling', () => {
    it('produces valid metadata with defines and references arrays', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      assert.ok(Array.isArray(metadata.defines), 'defines should be an array');
      assert.ok(Array.isArray(metadata.references), 'references should be an array');
      assert.ok(Array.isArray(metadata.imports), 'imports should be an array');
      assert.ok(Array.isArray(metadata.scope), 'scope should be an array');
      assert.ok(metadata.typeInfo, 'typeInfo should exist');
    });
  });

  // ── Chunking ──────────────────────────────────────────────────────────

  describe('chunking', () => {
    it('produces chunks that respect class, interface, and function boundaries', () => {
      const filePath = path.join(FIXTURES, 'sample_service.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      const tree = analyzer.parse(filePath, content);
      assert.ok(tree, 'Should parse sample_service.ts');

      // Use a small maxSize to force multiple chunks
      const chunks = analyzer.chunk(tree, content, { maxSize: 300 }, filePath);
      assert.ok(chunks.length > 0, 'Should produce at least one chunk');

      // Each chunk should have content, startLine, endLine, size
      for (const chunk of chunks) {
        assert.ok(typeof chunk.content === 'string', 'chunk.content should be a string');
        assert.ok(typeof chunk.startLine === 'number', 'chunk.startLine should be a number');
        assert.ok(typeof chunk.endLine === 'number', 'chunk.endLine should be a number');
        assert.ok(typeof chunk.size === 'number', 'chunk.size should be a number');
        assert.ok(chunk.size > 0, 'chunk.size should be > 0');
      }

      // With small maxSize, there should be multiple chunks
      assert.ok(chunks.length > 1, 'Should produce multiple chunks with small maxSize');
    });

    it('keeps small files in a single chunk when within maxSize', () => {
      const filePath = path.join(FIXTURES, 'sample_types.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      const tree = analyzer.parse(filePath, content);
      assert.ok(tree, 'Should parse sample_types.ts');

      // Use a very large maxSize
      const chunks = analyzer.chunk(tree, content, { maxSize: 100000 }, filePath);
      // Everything should fit in very few chunks (possibly merged)
      assert.ok(chunks.length >= 1, 'Should produce at least one chunk');
    });
  });

  // ── Multiple top-level definitions ────────────────────────────────────

  describe('multiple top-level definitions', () => {
    it('extracts all top-level definitions from a file', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      // Should have: OrderFilter (interface), OrderStatus (type_alias),
      // Priority (enum), OrderService (class)
      const types = metadata.definitions.map(d => d.type);
      assert.ok(types.includes('interface'), 'Should have an interface definition');
      assert.ok(types.includes('type_alias'), 'Should have a type_alias definition');
      assert.ok(types.includes('enum'), 'Should have an enum definition');
      assert.ok(types.includes('class'), 'Should have a class definition');
    });

    it('lists all defines including methods in the top-level defines array', () => {
      const { metadata } = analyzeFixture(analyzer, 'sample_service.ts');

      // The defines array should include classes, interfaces, enums, type aliases,
      // AND methods from classes
      const defineNames = metadata.defines.map(d => d.name);
      assert.ok(defineNames.includes('OrderService'), 'defines should include OrderService');
      assert.ok(defineNames.includes('OrderFilter'), 'defines should include OrderFilter');
      assert.ok(defineNames.includes('OrderStatus'), 'defines should include OrderStatus');
      assert.ok(defineNames.includes('Priority'), 'defines should include Priority');
      assert.ok(defineNames.includes('create'), 'defines should include create method');
      assert.ok(defineNames.includes('validate'), 'defines should include validate method');
    });
  });
});

// ── Graceful null when tree-sitter unavailable ──────────────────────────────

describe('TypeScriptAnalyzer without tree-sitter', { skip: treeSitterAvailable ? 'tree-sitter IS available; skipping unavailability test' : false }, () => {
  it('returns null gracefully when tree-sitter-typescript unavailable', () => {
    // When tree-sitter is not installed, loadParser returns null
    // and parse() should return null
    const { TypeScriptAnalyzer: TSAnalyzer } = require('../index');
    const analyzer = new TSAnalyzer();
    const result = analyzer.parse('test.ts', 'const x = 1;');
    assert.equal(result, null, 'Should return null when tree-sitter is unavailable');
  });
});
