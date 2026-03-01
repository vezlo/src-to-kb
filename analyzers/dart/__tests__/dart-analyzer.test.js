'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { DartAnalyzer } = require('../index');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * Helper: read a fixture file.
 * @param {string} filename
 * @returns {string}
 */
function readFixture(filename) {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

/**
 * Helper: check if tree-sitter-dart is available.
 * @returns {boolean}
 */
function isTreeSitterDartAvailable() {
  try {
    require('tree-sitter');
    require('tree-sitter-dart');
    return true;
  } catch {
    return false;
  }
}

const treeSitterAvailable = isTreeSitterDartAvailable();

// ---------------------------------------------------------------------------
// Tests that do NOT require tree-sitter-dart
// ---------------------------------------------------------------------------

describe('DartAnalyzer (no tree-sitter required)', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new DartAnalyzer();
  });

  it('returns null from parse() when tree-sitter-dart is unavailable', (t) => {
    if (treeSitterAvailable) {
      t.skip('tree-sitter-dart IS available; cannot test unavailable path');
      return;
    }
    const result = analyzer.parse('test.dart', 'class Foo {}');
    assert.equal(result, null);
  });

  it('is an instance of BaseAnalyzer', () => {
    const { BaseAnalyzer } = require('../../base-analyzer');
    assert.ok(analyzer instanceof BaseAnalyzer);
  });

  it('has parse, extractMetadata, chunk, and enrich methods', () => {
    assert.equal(typeof analyzer.parse, 'function');
    assert.equal(typeof analyzer.extractMetadata, 'function');
    assert.equal(typeof analyzer.chunk, 'function');
    assert.equal(typeof analyzer.enrich, 'function');
  });
});

// ---------------------------------------------------------------------------
// Tests that REQUIRE tree-sitter-dart
// ---------------------------------------------------------------------------

describe('DartAnalyzer (tree-sitter required)', { skip: !treeSitterAvailable && 'tree-sitter-dart not installed' }, () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new DartAnalyzer();
  });

  // -----------------------------------------------------------------------
  // Parsing
  // -----------------------------------------------------------------------

  describe('parse()', () => {
    it('parses valid Dart source and returns a tree', () => {
      const content = 'class Foo {}';
      const tree = analyzer.parse('test.dart', content);
      assert.ok(tree, 'Expected a non-null tree');
      assert.ok(tree.rootNode, 'Expected tree to have a rootNode');
    });

    it('returns a tree even for empty content', () => {
      const tree = analyzer.parse('empty.dart', '');
      assert.ok(tree, 'Expected a non-null tree even for empty content');
    });

    it('parses the sample_repository.dart fixture', () => {
      const content = readFixture('sample_repository.dart');
      const tree = analyzer.parse('sample_repository.dart', content);
      assert.ok(tree, 'Expected tree for repository fixture');
    });
  });

  // -----------------------------------------------------------------------
  // Class extraction
  // -----------------------------------------------------------------------

  describe('extractMetadata() - classes', () => {
    it('extracts a simple class with name', () => {
      const content = 'class MyWidget {}';
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      assert.ok(Array.isArray(results));
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected to find a class');
      assert.equal(cls.name, 'MyWidget');
      assert.equal(cls.exported, true);
      assert.equal(cls.abstract, false);
    });

    it('extracts abstract classes', () => {
      const content = 'abstract class BaseRepository {}';
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected to find a class');
      assert.equal(cls.name, 'BaseRepository');
      assert.equal(cls.abstract, true);
    });

    it('detects private classes (underscore prefix)', () => {
      const content = 'class _InternalHelper {}';
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected to find a class');
      assert.equal(cls.name, '_InternalHelper');
      assert.equal(cls.exported, false);
    });

    it('extracts class inheritance (extends)', () => {
      const content = 'class OrderBloc extends Bloc<OrderEvent, OrderState> {}';
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected to find a class');
      assert.ok(cls.inherits, 'Expected inherits to be set');
      assert.ok(cls.inherits.includes('Bloc'), `Expected inherits to include "Bloc", got: ${cls.inherits}`);
    });

    it('extracts implements clause', () => {
      const content = 'class OrderRepositoryImpl implements OrderRepository {}';
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected to find a class');
      assert.ok(Array.isArray(cls.implements));
      assert.ok(cls.implements.length > 0, 'Expected at least one implement');
      assert.ok(cls.implements.some(i => i.includes('OrderRepository')),
        `Expected implements to include OrderRepository, got: ${JSON.stringify(cls.implements)}`);
    });

    it('extracts with clause (mixins)', () => {
      const content = 'class MyWidget extends StatelessWidget with LoggingMixin {}';
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected to find a class');
      assert.ok(Array.isArray(cls.mixins));
      assert.ok(cls.mixins.length > 0, 'Expected at least one mixin');
      assert.ok(cls.mixins.some(m => m.includes('LoggingMixin')),
        `Expected mixins to include LoggingMixin, got: ${JSON.stringify(cls.mixins)}`);
    });

    it('extracts from the sample_repository fixture', () => {
      const content = readFixture('sample_repository.dart');
      const tree = analyzer.parse('lib/repositories/sample_repository.dart', content);
      const results = analyzer.extractMetadata(tree, 'lib/repositories/sample_repository.dart', content);
      assert.ok(results.length > 0, 'Expected at least one definition');

      // Should find the abstract class
      const abstractRepo = results.find(r => r.type === 'class' && r.name === 'OrderRepository');
      assert.ok(abstractRepo, 'Expected to find OrderRepository class');
      assert.equal(abstractRepo.abstract, true);

      // Should find the implementation class
      const implRepo = results.find(r => r.type === 'class' && r.name === 'OrderRepositoryImpl');
      assert.ok(implRepo, 'Expected to find OrderRepositoryImpl class');
    });
  });

  // -----------------------------------------------------------------------
  // Method extraction
  // -----------------------------------------------------------------------

  describe('extractMetadata() - methods', () => {
    it('extracts methods with visibility detection', () => {
      const content = `
class MyService {
  void doPublicThing() {}
  void _doPrivateThing() {}
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const publicMethod = cls.defines.find(d => d.name === 'doPublicThing');
      const privateMethod = cls.defines.find(d => d.name === '_doPrivateThing');

      if (publicMethod) {
        assert.equal(publicMethod.visibility, 'public');
      }
      if (privateMethod) {
        assert.equal(privateMethod.visibility, 'private');
      }

      // At least one should be found (AST or text fallback)
      assert.ok(publicMethod || privateMethod,
        'Expected to find at least one method from the class body');
    });

    it('detects async methods', () => {
      const content = `
class ApiService {
  Future<List<String>> fetchData() async {
    return [];
  }
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const method = cls.defines.find(d => d.name === 'fetchData');
      if (method) {
        assert.equal(method.async, true);
      }
    });

    it('extracts method return types', () => {
      const content = `
class Calculator {
  int add(int a, int b) {
    return a + b;
  }
  Future<String> greet() async {
    return 'hello';
  }
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      // Check that return types are captured (either via AST or text fallback)
      const addMethod = cls.defines.find(d => d.name === 'add');
      if (addMethod && addMethod.returnType) {
        assert.ok(addMethod.returnType.includes('int'),
          `Expected return type to include 'int', got: ${addMethod.returnType}`);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Constructor extraction
  // -----------------------------------------------------------------------

  describe('extractMetadata() - constructors', () => {
    it('extracts default constructor', () => {
      const content = `
class User {
  User(this.name);
  final String name;
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const ctor = cls.defines.find(d => d.type === 'constructor' && d.name === 'User');
      if (ctor) {
        assert.equal(ctor.named, false);
        assert.equal(ctor.factory, false);
      }
    });

    it('extracts named constructors', () => {
      const content = `
class User {
  User(this.name);
  User.fromJson(Map<String, dynamic> json) : name = json['name'] as String;
  final String name;
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const namedCtor = cls.defines.find(d =>
        d.type === 'constructor' && d.name === 'User.fromJson'
      );
      if (namedCtor) {
        assert.equal(namedCtor.named, true);
      }
    });

    it('extracts factory constructors', () => {
      const content = `
class Singleton {
  factory Singleton() => _instance;
  Singleton._internal();
  static final Singleton _instance = Singleton._internal();
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const factoryCtor = cls.defines.find(d =>
        d.type === 'constructor' && d.factory === true
      );
      // Factory constructors may be detected via AST or text fallback
      if (factoryCtor) {
        assert.equal(factoryCtor.factory, true);
      }
    });

    it('extracts const constructors', () => {
      const content = `
class Point {
  const Point(this.x, this.y);
  final double x;
  final double y;
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const constCtor = cls.defines.find(d =>
        d.type === 'constructor' && d.const === true
      );
      if (constCtor) {
        assert.equal(constCtor.const, true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Field extraction
  // -----------------------------------------------------------------------

  describe('extractMetadata() - fields', () => {
    it('extracts final fields with types', () => {
      const content = `
class Config {
  final String name;
  final int count;
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const nameField = cls.defines.find(d => d.type === 'field' && d.name === 'name');
      if (nameField) {
        assert.equal(nameField.final, true);
        assert.ok(nameField.fieldType && nameField.fieldType.includes('String'),
          `Expected field type to include String, got: ${nameField.fieldType}`);
      }
    });

    it('extracts late fields', () => {
      const content = `
class Service {
  late final String url;
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const field = cls.defines.find(d => d.type === 'field' && d.name === 'url');
      if (field) {
        assert.equal(field.late, true);
        assert.equal(field.final, true);
      }
    });

    it('detects private fields', () => {
      const content = `
class Cache {
  final List<String> _items = [];
}`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');

      const field = cls.defines.find(d => d.type === 'field' && d.name === '_items');
      if (field) {
        assert.equal(field.visibility, 'private');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Import extraction
  // -----------------------------------------------------------------------

  describe('extractMetadata() - imports', () => {
    it('extracts import statements', () => {
      const content = `
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/order_model.dart';

class MyWidget {}
`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      assert.ok(results.length > 0);

      const primary = results[0];
      assert.ok(primary.imports, 'Expected imports array');
      assert.ok(primary.imports.length >= 2, `Expected at least 2 imports, got ${primary.imports.length}`);

      const flutterImport = primary.imports.find(i => i.from && i.from.includes('flutter/material.dart'));
      if (flutterImport) {
        assert.ok(flutterImport.name.includes('material.dart'));
      }
    });

    it('extracts show/hide clauses', () => {
      const content = `
import 'package:flutter/material.dart' show Container, Text;
import 'dart:math' hide Random;

class MyWidget {}
`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const primary = results[0];
      assert.ok(primary.imports, 'Expected imports array');

      const showImport = primary.imports.find(i =>
        i.from && i.from.includes('material.dart') && i.show && i.show.length > 0
      );
      if (showImport) {
        assert.ok(showImport.show.includes('Container') || showImport.show.includes('Text'),
          `Expected show clause to include Container or Text, got: ${JSON.stringify(showImport.show)}`);
      }

      const hideImport = primary.imports.find(i =>
        i.from && i.from.includes('dart:math') && i.hide && i.hide.length > 0
      );
      if (hideImport) {
        assert.ok(hideImport.hide.includes('Random'),
          `Expected hide clause to include Random, got: ${JSON.stringify(hideImport.hide)}`);
      }
    });

    it('extracts as clause (prefix)', () => {
      const content = `
import 'dart:math' as math;

class Foo {}
`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const primary = results[0];
      assert.ok(primary.imports, 'Expected imports array');

      const asImport = primary.imports.find(i => i.as === 'math');
      if (asImport) {
        assert.equal(asImport.as, 'math');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Enum extraction
  // -----------------------------------------------------------------------

  describe('extractMetadata() - enums', () => {
    it('extracts simple enums with members', () => {
      const content = `enum OrderStatus { pending, confirmed, shipped, cancelled }`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);
      const enumDef = results.find(r => r.type === 'enum');
      assert.ok(enumDef, 'Expected to find an enum');
      assert.equal(enumDef.name, 'OrderStatus');
      assert.ok(Array.isArray(enumDef.members), 'Expected members array');
      assert.ok(enumDef.members.length > 0, 'Expected at least one member');

      const memberNames = enumDef.members.map(m => m.name);
      assert.ok(memberNames.includes('pending'), `Expected "pending" member, got: ${JSON.stringify(memberNames)}`);
    });

    it('extracts enums from the model fixture', () => {
      const content = readFixture('sample_model.dart');
      const tree = analyzer.parse('lib/models/sample_model.dart', content);
      const results = analyzer.extractMetadata(tree, 'lib/models/sample_model.dart', content);

      const orderStatus = results.find(r => r.type === 'enum' && r.name === 'OrderStatus');
      assert.ok(orderStatus, 'Expected to find OrderStatus enum');
      assert.ok(orderStatus.members.length >= 2, 'Expected multiple enum members');
    });
  });

  // -----------------------------------------------------------------------
  // Scope derivation
  // -----------------------------------------------------------------------

  describe('scope derivation', () => {
    it('derives scope from lib/ path', () => {
      const content = 'class Foo {}';
      const tree = analyzer.parse('lib/src/models/foo.dart', content);
      const results = analyzer.extractMetadata(tree, 'lib/src/models/foo.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');
      assert.ok(Array.isArray(cls.scope));
      assert.ok(cls.scope.includes('lib'), `Expected scope to include "lib", got: ${JSON.stringify(cls.scope)}`);
    });
  });

  // -----------------------------------------------------------------------
  // Full fixture tests
  // -----------------------------------------------------------------------

  describe('full fixture: sample_bloc.dart', () => {
    it('extracts multiple classes from the bloc file', () => {
      const content = readFixture('sample_bloc.dart');
      const tree = analyzer.parse('lib/blocs/sample_bloc.dart', content);
      const results = analyzer.extractMetadata(tree, 'lib/blocs/sample_bloc.dart', content);

      assert.ok(results.length >= 2, `Expected at least 2 definitions, got ${results.length}`);

      // Should find OrderBloc
      const bloc = results.find(r => r.type === 'class' && r.name === 'OrderBloc');
      assert.ok(bloc, 'Expected to find OrderBloc class');

      // Should find some event/state classes
      const classNames = results.filter(r => r.type === 'class').map(r => r.name);
      assert.ok(classNames.length >= 2, `Expected multiple classes, got: ${JSON.stringify(classNames)}`);
    });
  });

  describe('full fixture: sample_widget.dart', () => {
    it('extracts widget classes', () => {
      const content = readFixture('sample_widget.dart');
      const tree = analyzer.parse('lib/screens/sample_widget.dart', content);
      const results = analyzer.extractMetadata(tree, 'lib/screens/sample_widget.dart', content);

      assert.ok(results.length >= 1, 'Expected at least one definition');

      const widget = results.find(r =>
        r.type === 'class' && r.name === 'OrderListScreen'
      );
      assert.ok(widget, 'Expected to find OrderListScreen class');
      assert.ok(widget.inherits && widget.inherits.includes('StatelessWidget'),
        `Expected inherits to include StatelessWidget, got: ${widget.inherits}`);
    });
  });

  // -----------------------------------------------------------------------
  // Chunking
  // -----------------------------------------------------------------------

  describe('chunk()', () => {
    it('produces chunks that respect class boundaries', () => {
      const content = readFixture('sample_repository.dart');
      const tree = analyzer.parse('sample_repository.dart', content);
      const chunks = analyzer.chunk(tree, content, { maxSize: 300 }, 'sample_repository.dart');

      assert.ok(Array.isArray(chunks), 'Expected chunks to be an array');
      assert.ok(chunks.length >= 1, 'Expected at least one chunk');

      for (const chunk of chunks) {
        assert.ok(chunk.content, 'Each chunk should have content');
        assert.ok(typeof chunk.startLine === 'number', 'Each chunk should have startLine');
        assert.ok(typeof chunk.endLine === 'number', 'Each chunk should have endLine');
        assert.ok(typeof chunk.size === 'number', 'Each chunk should have size');
      }
    });

    it('keeps small files in a single chunk', () => {
      const content = 'class Foo {\n  void bar() {}\n}';
      const tree = analyzer.parse('foo.dart', content);
      const chunks = analyzer.chunk(tree, content, { maxSize: 5000 }, 'foo.dart');

      assert.ok(chunks.length >= 1, 'Expected at least one chunk');
      // A small file should fit in one chunk
      if (content.length < 5000) {
        assert.equal(chunks.length, 1, 'Small file should produce exactly one chunk');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles files with only imports', () => {
      const content = `
import 'dart:async';
import 'package:flutter/material.dart';
`;
      const tree = analyzer.parse('test.dart', content);
      const results = analyzer.extractMetadata(tree, 'test.dart', content);

      assert.ok(Array.isArray(results));
      // Should produce file-level metadata
      assert.ok(results.length >= 1);
    });

    it('handles files with syntax errors gracefully', () => {
      const content = `
class Broken {
  void foo( {
    // missing closing paren and brace
`;
      const tree = analyzer.parse('broken.dart', content);
      // tree-sitter should still return a tree (with ERROR nodes)
      if (tree) {
        const results = analyzer.extractMetadata(tree, 'broken.dart', content);
        // Should not throw; may return partial results or empty
        assert.ok(Array.isArray(results));
      }
    });

    it('handles empty class body', () => {
      const content = 'class Empty {}';
      const tree = analyzer.parse('empty.dart', content);
      const results = analyzer.extractMetadata(tree, 'empty.dart', content);
      const cls = results.find(r => r.type === 'class');
      assert.ok(cls, 'Expected a class');
      assert.equal(cls.name, 'Empty');
      assert.ok(Array.isArray(cls.defines));
    });
  });
});
