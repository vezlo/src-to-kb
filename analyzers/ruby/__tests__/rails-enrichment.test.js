'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Gracefully skip all tests if tree-sitter-ruby is not available
let RubyAnalyzer;
let enrich;
let treeSitterAvailable = false;

try {
  require('tree-sitter');
  require('tree-sitter-ruby');
  treeSitterAvailable = true;
} catch (err) {
  console.warn('[test] tree-sitter-ruby unavailable, skipping Rails enrichment tests: ' + err.message);
}

if (treeSitterAvailable) {
  ({ RubyAnalyzer } = require('../../ruby/index'));
  ({ enrich } = require('../../ruby/rails'));
}

/**
 * Helper: parse a file and extract enriched metadata.
 */
function parseAndEnrich(analyzer, fixtureName, virtualPath) {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, fixtureName), 'utf8');
  const tree = analyzer.parse(virtualPath, content);
  const metadata = analyzer.extractMetadata(tree, virtualPath, content);
  return enrich(metadata, tree, content, virtualPath);
}

describe('Rails Enrichment', { skip: !treeSitterAvailable ? 'tree-sitter-ruby not installed' : false }, () => {
  let analyzer;

  before(() => {
    analyzer = new RubyAnalyzer();
  });

  // ─── Model Tests ─────────────────────────────────────────────────────────

  describe('Model enrichment', () => {
    let metadata;

    before(() => {
      metadata = parseAndEnrich(analyzer, 'sample_model.rb', 'app/models/order.rb');
    });

    it('should detect model role', () => {
      assert.equal(metadata.framework.type, 'rails');
      assert.equal(metadata.framework.role, 'model');
    });

    describe('associations', () => {
      it('should extract belongs_to association', () => {
        const belongsTo = metadata.framework.associations.find(
          a => a.type === 'belongs_to' && a.target === 'user'
        );
        assert.ok(belongsTo, 'should find belongs_to :user');
      });

      it('should extract has_many association with options', () => {
        const hasMany = metadata.framework.associations.find(
          a => a.type === 'has_many' && a.target === 'line_items'
        );
        assert.ok(hasMany, 'should find has_many :line_items');
        assert.equal(hasMany.options.dependent, 'destroy');
      });

      it('should extract has_one association with options', () => {
        const hasOne = metadata.framework.associations.find(
          a => a.type === 'has_one' && a.target === 'invoice'
        );
        assert.ok(hasOne, 'should find has_one :invoice');
        assert.equal(hasOne.options.class_name, 'OrderInvoice');
      });
    });

    describe('validations', () => {
      it('should extract presence validation', () => {
        const validation = metadata.framework.validations.find(
          v => v.fields.includes('status')
        );
        assert.ok(validation, 'should find validates :status');
        assert.equal(validation.type, 'validates');
        assert.ok(validation.options.presence);
      });

      it('should extract numericality validation', () => {
        const validation = metadata.framework.validations.find(
          v => v.fields.includes('total')
        );
        assert.ok(validation, 'should find validates :total');
      });
    });

    describe('scopes', () => {
      it('should extract scope names', () => {
        const scopeNames = metadata.framework.scopes.map(s => s.name);
        assert.ok(scopeNames.includes('pending'), 'should find :pending scope');
        assert.ok(scopeNames.includes('recent'), 'should find :recent scope');
      });

      it('should have body for scopes', () => {
        const pendingScope = metadata.framework.scopes.find(s => s.name === 'pending');
        assert.ok(pendingScope, 'pending scope should exist');
        // The body is the lambda text
        assert.ok(typeof pendingScope.body === 'string');
      });
    });

    describe('callbacks', () => {
      it('should extract before_save callback', () => {
        const cb = metadata.framework.callbacks.find(
          c => c.type === 'before_save' && c.method === 'calculate_total'
        );
        assert.ok(cb, 'should find before_save :calculate_total');
      });

      it('should extract after_create callback', () => {
        const cb = metadata.framework.callbacks.find(
          c => c.type === 'after_create' && c.method === 'notify_warehouse'
        );
        assert.ok(cb, 'should find after_create :notify_warehouse');
      });
    });

    describe('enums', () => {
      it('should extract enum definition', () => {
        assert.ok(metadata.framework.enums.length > 0, 'should find at least one enum');
        const statusEnum = metadata.framework.enums.find(e => e.name === 'status');
        assert.ok(statusEnum, 'should find status enum');
      });

      it('should extract enum values', () => {
        const statusEnum = metadata.framework.enums.find(e => e.name === 'status');
        assert.ok(statusEnum.values, 'should have values');
        assert.equal(statusEnum.values.pending, '0');
        assert.equal(statusEnum.values.confirmed, '1');
        assert.equal(statusEnum.values.shipped, '2');
        assert.equal(statusEnum.values.cancelled, '3');
      });
    });
  });

  // ─── Controller Tests ────────────────────────────────────────────────────

  describe('Controller enrichment', () => {
    let metadata;

    before(() => {
      metadata = parseAndEnrich(analyzer, 'sample_controller.rb', 'app/controllers/orders_controller.rb');
    });

    it('should detect controller role', () => {
      assert.equal(metadata.framework.type, 'rails');
      assert.equal(metadata.framework.role, 'controller');
    });

    describe('filters', () => {
      it('should extract before_action filters', () => {
        assert.ok(metadata.framework.filters.length >= 2, 'should find at least 2 filters');

        const authFilter = metadata.framework.filters.find(
          f => f.method === 'authenticate_user!'
        );
        assert.ok(authFilter, 'should find authenticate_user! filter');
        assert.equal(authFilter.type, 'before_action');
      });

      it('should extract :only options on filters', () => {
        const setOrder = metadata.framework.filters.find(
          f => f.method === 'set_order'
        );
        assert.ok(setOrder, 'should find set_order filter');
        assert.ok(Array.isArray(setOrder.only), 'should have only array');
        assert.ok(setOrder.only.includes('show'));
        assert.ok(setOrder.only.includes('update'));
        assert.ok(setOrder.only.includes('destroy'));
      });
    });

    describe('strong params', () => {
      it('should extract params.require().permit() pattern', () => {
        assert.ok(metadata.framework.strongParams.length > 0, 'should find strong params');

        const orderParams = metadata.framework.strongParams.find(
          sp => sp.require === 'order'
        );
        assert.ok(orderParams, 'should find params.require(:order)');
        assert.ok(orderParams.permit.includes('status'));
        assert.ok(orderParams.permit.includes('total'));
        assert.ok(orderParams.permit.includes('notes'));
      });
    });

    describe('rescue handlers', () => {
      it('should extract rescue_from declarations', () => {
        assert.ok(metadata.framework.rescueHandlers.length > 0, 'should find rescue handlers');

        const handler = metadata.framework.rescueHandlers[0];
        assert.ok(
          handler.exception.includes('RecordNotFound') || handler.exception.includes('ActiveRecord'),
          'should reference RecordNotFound'
        );
        assert.equal(handler.handler, 'not_found');
      });
    });
  });

  // ─── Routes Tests ────────────────────────────────────────────────────────

  describe('Routes enrichment', () => {
    let metadata;

    before(() => {
      metadata = parseAndEnrich(analyzer, 'sample_routes.rb', 'config/routes.rb');
    });

    it('should detect routes role', () => {
      assert.equal(metadata.framework.type, 'rails');
      assert.equal(metadata.framework.role, 'routes');
    });

    it('should expand routes into endpoints', () => {
      assert.ok(Array.isArray(metadata.framework.endpoints));
      assert.ok(metadata.framework.endpoints.length > 0, 'should have endpoints');
    });

    describe('namespaced resources', () => {
      it('should handle nested namespaces', () => {
        // api/v1/orders routes
        const orderEndpoints = metadata.framework.endpoints.filter(
          e => e.path.includes('/api/v1/orders')
        );
        assert.ok(orderEndpoints.length > 0, 'should have api/v1/orders endpoints');
      });

      it('should expand only specified actions', () => {
        // orders has only: [:index, :show, :create]
        const orderIndex = metadata.framework.endpoints.find(
          e => e.action === 'orders#index'
        );
        assert.ok(orderIndex, 'should have orders#index');
        assert.equal(orderIndex.method, 'GET');

        const orderShow = metadata.framework.endpoints.find(
          e => e.action === 'orders#show'
        );
        assert.ok(orderShow, 'should have orders#show');

        const orderCreate = metadata.framework.endpoints.find(
          e => e.action === 'orders#create'
        );
        assert.ok(orderCreate, 'should have orders#create');
        assert.equal(orderCreate.method, 'POST');

        // Should NOT have update or destroy since only: was specified
        const orderUpdate = metadata.framework.endpoints.find(
          e => e.action === 'orders#update'
        );
        assert.equal(orderUpdate, undefined, 'should NOT have orders#update');

        const orderDestroy = metadata.framework.endpoints.find(
          e => e.action === 'orders#destroy'
        );
        assert.equal(orderDestroy, undefined, 'should NOT have orders#destroy');
      });
    });

    describe('member routes', () => {
      it('should expand member routes with :id prefix', () => {
        const confirmEndpoint = metadata.framework.endpoints.find(
          e => e.action === 'orders#confirm'
        );
        assert.ok(confirmEndpoint, 'should have member confirm route');
        assert.equal(confirmEndpoint.method, 'POST');
        assert.ok(confirmEndpoint.path.includes(':id'), 'member route should include :id');
      });
    });

    describe('collection routes', () => {
      it('should expand collection routes without :id', () => {
        const pendingEndpoint = metadata.framework.endpoints.find(
          e => e.action === 'orders#pending'
        );
        assert.ok(pendingEndpoint, 'should have collection pending route');
        assert.equal(pendingEndpoint.method, 'GET');
        // Collection routes should not have :id in the path before the action
        assert.ok(!pendingEndpoint.path.includes(':id'), 'collection route should NOT include :id');
      });
    });

    describe('singular resource', () => {
      it('should expand singular resource routes', () => {
        const profileShow = metadata.framework.endpoints.find(
          e => e.action === 'profiles#show'
        );
        assert.ok(profileShow, 'should have profiles#show');
        assert.equal(profileShow.method, 'GET');
        assert.ok(profileShow.path.includes('/profile'), 'should use singular path');
        // Singular resource should NOT have :id
        assert.ok(!profileShow.path.includes(':id'), 'singular resource should not have :id');
      });
    });

    describe('explicit HTTP verb routes', () => {
      it('should handle standalone get route', () => {
        const healthEndpoint = metadata.framework.endpoints.find(
          e => e.path.includes('/health')
        );
        assert.ok(healthEndpoint, 'should have /health endpoint');
        assert.equal(healthEndpoint.method, 'GET');
        assert.equal(healthEndpoint.action, 'health#check');
      });
    });

    describe('users resource', () => {
      it('should expand users with only show and update', () => {
        const userShow = metadata.framework.endpoints.find(
          e => e.action === 'users#show'
        );
        assert.ok(userShow, 'should have users#show');

        const userUpdate = metadata.framework.endpoints.find(
          e => e.action === 'users#update'
        );
        assert.ok(userUpdate, 'should have users#update');

        const userIndex = metadata.framework.endpoints.find(
          e => e.action === 'users#index'
        );
        assert.equal(userIndex, undefined, 'should NOT have users#index');
      });
    });
  });

  // ─── Concern Tests ───────────────────────────────────────────────────────

  describe('Concern enrichment', () => {
    let metadata;

    before(() => {
      metadata = parseAndEnrich(
        analyzer, 'sample_concern.rb', 'app/models/concerns/searchable.rb'
      );
    });

    it('should detect concern role', () => {
      assert.equal(metadata.framework.type, 'rails');
      assert.equal(metadata.framework.role, 'concern');
    });

    it('should detect ActiveSupport::Concern', () => {
      assert.ok(
        metadata.framework.concern.isActiveSupportConcern,
        'should detect extend ActiveSupport::Concern'
      );
    });

    it('should detect included block', () => {
      assert.ok(
        metadata.framework.concern.hasIncludedBlock,
        'should detect included do...end block'
      );
    });

    it('should detect class_methods block', () => {
      assert.ok(
        metadata.framework.concern.hasClassMethods,
        'should detect class_methods do...end block'
      );
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle file with no Rails patterns gracefully', () => {
      const code = `
class PlainRuby
  def hello
    puts "Hello"
  end
end`;
      const tree = analyzer.parse('lib/plain_ruby.rb', code);
      const baseMetadata = analyzer.extractMetadata(tree, 'lib/plain_ruby.rb', code);
      const enriched = enrich(baseMetadata, tree, code, 'lib/plain_ruby.rb');

      assert.equal(enriched.framework.type, 'rails');
      // Should not crash, framework key should exist but no role-specific data
      assert.equal(enriched.framework.role, undefined);
    });

    it('should handle model with no associations', () => {
      const code = `
class EmptyModel < ApplicationRecord
end`;
      const tree = analyzer.parse('app/models/empty_model.rb', code);
      const baseMetadata = analyzer.extractMetadata(tree, 'app/models/empty_model.rb', code);
      const enriched = enrich(baseMetadata, tree, code, 'app/models/empty_model.rb');

      assert.equal(enriched.framework.role, 'model');
      assert.deepEqual(enriched.framework.associations, []);
      assert.deepEqual(enriched.framework.validations, []);
      assert.deepEqual(enriched.framework.scopes, []);
      assert.deepEqual(enriched.framework.callbacks, []);
      assert.deepEqual(enriched.framework.enums, []);
    });

    it('should handle controller with no filters', () => {
      const code = `
class SimpleController < ApplicationController
  def index
    render json: []
  end
end`;
      const tree = analyzer.parse('app/controllers/simple_controller.rb', code);
      const baseMetadata = analyzer.extractMetadata(tree, 'app/controllers/simple_controller.rb', code);
      const enriched = enrich(baseMetadata, tree, code, 'app/controllers/simple_controller.rb');

      assert.equal(enriched.framework.role, 'controller');
      assert.deepEqual(enriched.framework.filters, []);
      assert.deepEqual(enriched.framework.strongParams, []);
      assert.deepEqual(enriched.framework.rescueHandlers, []);
    });
  });
});
