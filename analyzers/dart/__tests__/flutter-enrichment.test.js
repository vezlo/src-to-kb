'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { DartAnalyzer } = require('../index');
const { enrich } = require('../flutter');

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
// (Uses manually constructed metadata objects to test enrichment logic)
// ---------------------------------------------------------------------------

describe('Flutter enrichment (no tree-sitter required)', () => {
  it('exports an enrich function', () => {
    assert.equal(typeof enrich, 'function');
  });

  it('returns metadata unchanged when no Flutter patterns found', () => {
    const metadata = {
      type: 'class',
      name: 'PlainService',
      inherits: null,
      implements: [],
      mixins: [],
      defines: [],
      references: [],
    };
    const result = enrich(metadata, null, 'class PlainService {}', 'lib/plain.dart');
    assert.ok(!result.framework, 'Expected no framework enrichment for plain class');
  });

  it('returns metadata unchanged for null input', () => {
    const result = enrich(null, null, '', '');
    assert.equal(result, null);
  });

  // -----------------------------------------------------------------------
  // Widget detection (constructed metadata)
  // -----------------------------------------------------------------------

  describe('widget detection', () => {
    it('detects StatelessWidget from metadata', () => {
      const metadata = {
        type: 'class',
        name: 'MyWidget',
        inherits: 'StatelessWidget',
        implements: [],
        mixins: [],
        defines: [
          { name: 'build', type: 'method', visibility: 'public' },
        ],
        references: [],
      };
      const content = `
class MyWidget extends StatelessWidget {
  Widget build(BuildContext context) {
    return Container();
  }
}`;
      const result = enrich(metadata, null, content, 'lib/widgets/my_widget.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_widget');
      assert.equal(result.framework.widgetType, 'StatelessWidget');
      assert.equal(result.framework.buildMethod, true);
      assert.equal(result.framework.stateClass, null);
    });

    it('detects StatefulWidget and links State class', () => {
      const metadata = {
        type: 'class',
        name: 'CounterPage',
        inherits: 'StatefulWidget',
        implements: [],
        mixins: [],
        defines: [],
        references: [],
      };
      const content = `
class CounterPage extends StatefulWidget {
  @override
  State<CounterPage> createState() => _CounterPageState();
}

class _CounterPageState extends State<CounterPage> {
  int count = 0;

  @override
  Widget build(BuildContext context) {
    return Text('$count');
  }
}`;
      const result = enrich(metadata, null, content, 'lib/pages/counter.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_widget');
      assert.equal(result.framework.widgetType, 'StatefulWidget');
      assert.equal(result.framework.stateClass, '_CounterPageState');
    });

    it('detects ConsumerWidget (Riverpod)', () => {
      const metadata = {
        type: 'class',
        name: 'HomeScreen',
        inherits: 'ConsumerWidget',
        implements: [],
        mixins: [],
        defines: [
          { name: 'build', type: 'method', visibility: 'public' },
        ],
        references: [],
      };
      const content = `
class HomeScreen extends ConsumerWidget {
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(dataProvider);
    return Text(data);
  }
}`;
      const result = enrich(metadata, null, content, 'lib/screens/home.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_widget');
      assert.equal(result.framework.widgetType, 'ConsumerWidget');
    });

    it('extracts BLoC dependencies from widget content', () => {
      const metadata = {
        type: 'class',
        name: 'OrderScreen',
        inherits: 'StatelessWidget',
        implements: [],
        mixins: [],
        defines: [
          { name: 'build', type: 'method', visibility: 'public' },
        ],
        references: [],
      };
      const content = `
class OrderScreen extends StatelessWidget {
  Widget build(BuildContext context) {
    return BlocBuilder<OrderBloc, OrderState>(
      builder: (context, state) {
        return Text(state.toString());
      },
    );
  }
}`;
      const result = enrich(metadata, null, content, 'lib/screens/order.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_widget');
      assert.ok(result.framework.dependencies.includes('OrderBloc'),
        `Expected dependencies to include OrderBloc, got: ${JSON.stringify(result.framework.dependencies)}`);
    });

    it('extracts navigation routes from widget content', () => {
      const metadata = {
        type: 'class',
        name: 'NavWidget',
        inherits: 'StatelessWidget',
        implements: [],
        mixins: [],
        defines: [
          { name: 'build', type: 'method', visibility: 'public' },
        ],
        references: [],
      };
      const content = `
class NavWidget extends StatelessWidget {
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: () => Navigator.pushNamed(context, '/details'),
      child: Text('Go'),
    );
  }
}`;
      const result = enrich(metadata, null, content, 'lib/widgets/nav.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.ok(result.framework.navigation.includes('/details'),
        `Expected navigation to include /details, got: ${JSON.stringify(result.framework.navigation)}`);
    });
  });

  // -----------------------------------------------------------------------
  // BLoC detection (constructed metadata)
  // -----------------------------------------------------------------------

  describe('BLoC detection', () => {
    it('detects BLoC class from metadata', () => {
      const metadata = {
        type: 'class',
        name: 'OrderBloc',
        inherits: 'Bloc<OrderEvent, OrderState>',
        implements: [],
        mixins: [],
        defines: [],
        references: [],
      };
      const content = `
class OrderBloc extends Bloc<OrderEvent, OrderState> {
  OrderBloc() : super(OrderInitial()) {
    on<LoadOrders>(_onLoadOrders);
    on<CreateOrder>(_onCreateOrder);
  }
}

class LoadOrders extends OrderEvent {}
class CreateOrder extends OrderEvent {}
class OrderInitial extends OrderState {}
class OrderLoading extends OrderState {}
class OrderLoaded extends OrderState {}
class OrderError extends OrderState {}
`;
      const result = enrich(metadata, null, content, 'lib/blocs/order_bloc.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_bloc');
      assert.equal(result.framework.blocName, 'OrderBloc');

      // Events
      assert.ok(Array.isArray(result.framework.events));
      assert.ok(result.framework.events.includes('LoadOrders'),
        `Expected events to include LoadOrders, got: ${JSON.stringify(result.framework.events)}`);
      assert.ok(result.framework.events.includes('CreateOrder'),
        `Expected events to include CreateOrder, got: ${JSON.stringify(result.framework.events)}`);

      // States
      assert.ok(Array.isArray(result.framework.states));
      assert.ok(result.framework.states.length >= 2,
        `Expected at least 2 states, got: ${JSON.stringify(result.framework.states)}`);

      // Event handlers
      assert.ok(Array.isArray(result.framework.eventHandlers));
      assert.ok(result.framework.eventHandlers.length >= 2,
        `Expected at least 2 event handlers, got: ${JSON.stringify(result.framework.eventHandlers)}`);

      const loadHandler = result.framework.eventHandlers.find(h => h.event === 'LoadOrders');
      assert.ok(loadHandler, 'Expected handler for LoadOrders');
      assert.equal(loadHandler.handler, '_onLoadOrders');
    });

    it('detects Cubit class', () => {
      const metadata = {
        type: 'class',
        name: 'CounterCubit',
        inherits: 'Cubit<int>',
        implements: [],
        mixins: [],
        defines: [],
        references: [],
      };
      const content = `
class CounterCubit extends Cubit<int> {
  CounterCubit() : super(0);
  void increment() => emit(state + 1);
}`;
      const result = enrich(metadata, null, content, 'lib/cubits/counter_cubit.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_bloc');
      assert.equal(result.framework.blocName, 'CounterCubit');
    });

    it('detects event class in bloc file', () => {
      const metadata = {
        type: 'class',
        name: 'OrderEvent',
        inherits: 'Equatable',
        implements: [],
        mixins: [],
        defines: [],
        references: [],
      };
      const content = `
sealed class OrderEvent extends Equatable {}
`;
      const result = enrich(metadata, null, content, 'lib/blocs/order_bloc.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_bloc_event');
      assert.equal(result.framework.eventName, 'OrderEvent');
    });

    it('detects state class in bloc file', () => {
      const metadata = {
        type: 'class',
        name: 'OrderState',
        inherits: 'Equatable',
        implements: [],
        mixins: [],
        defines: [],
        references: [],
      };
      const content = `
sealed class OrderState extends Equatable {}
`;
      const result = enrich(metadata, null, content, 'lib/blocs/order_bloc.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_bloc_state');
      assert.equal(result.framework.stateName, 'OrderState');
    });
  });

  // -----------------------------------------------------------------------
  // Model detection (constructed metadata)
  // -----------------------------------------------------------------------

  describe('model detection', () => {
    it('detects model with JSON serialization', () => {
      const metadata = {
        type: 'class',
        name: 'UserModel',
        inherits: 'Equatable',
        implements: [],
        mixins: [],
        defines: [
          { name: 'UserModel.fromJson', type: 'constructor', named: true, factory: true, const: false },
          { name: 'toJson', type: 'method', visibility: 'public' },
          { name: 'id', type: 'field', fieldType: 'String', final: true },
          { name: 'name', type: 'field', fieldType: 'String', final: true },
        ],
        references: [],
      };
      const content = `
@JsonSerializable()
class UserModel extends Equatable {
  const UserModel({required this.id, required this.name});
  factory UserModel.fromJson(Map<String, dynamic> json) => _$UserModelFromJson(json);
  final String id;
  final String name;
  Map<String, dynamic> toJson() => _$UserModelToJson(this);
  @override
  List<Object?> get props => [id, name];
}`;
      const result = enrich(metadata, null, content, 'lib/models/user_model.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_model');
      assert.equal(result.framework.serializable, true);
      assert.equal(result.framework.equatable, true);
    });

    it('detects freezed model', () => {
      const metadata = {
        type: 'class',
        name: 'User',
        inherits: null,
        implements: [],
        mixins: [],
        defines: [],
        references: [],
      };
      const content = `
@freezed
class User with _$User {
  const factory User({required String name}) = _User;
}`;
      const result = enrich(metadata, null, content, 'lib/models/user.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_model');
      assert.equal(result.framework.freezed, true);
    });

    it('detects copyWith method', () => {
      const metadata = {
        type: 'class',
        name: 'Config',
        inherits: null,
        implements: [],
        mixins: [],
        defines: [
          { name: 'copyWith', type: 'method', visibility: 'public' },
          { name: 'value', type: 'field', fieldType: 'int', final: true },
        ],
        references: [],
      };
      const content = `
class Config {
  const Config({required this.value});
  final int value;
  Config copyWith({int? value}) => Config(value: value ?? this.value);
  factory Config.fromJson(Map<String, dynamic> json) => Config(value: json['value']);
}`;
      const result = enrich(metadata, null, content, 'lib/models/config.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.equal(result.framework.type, 'flutter_model');
      assert.equal(result.framework.copyWith, true);
      assert.equal(result.framework.serializable, true);
    });

    it('extracts fields from model metadata', () => {
      const metadata = {
        type: 'class',
        name: 'Product',
        inherits: 'Equatable',
        implements: [],
        mixins: [],
        defines: [
          { name: 'id', type: 'field', fieldType: 'String', final: true },
          { name: 'price', type: 'field', fieldType: 'double', final: true },
          { name: 'save', type: 'method', visibility: 'public' },
        ],
        references: [],
      };
      const content = `
class Product extends Equatable {
  final String id;
  final double price;
  Map<String, dynamic> toJson() => {};
  @override
  List<Object?> get props => [id, price];
}`;
      const result = enrich(metadata, null, content, 'lib/models/product.dart');
      assert.ok(result.framework, 'Expected framework enrichment');
      assert.ok(Array.isArray(result.framework.fields));
      assert.equal(result.framework.fields.length, 2);
      assert.ok(result.framework.fields.some(f => f.name === 'id'));
      assert.ok(result.framework.fields.some(f => f.name === 'price'));
    });

    it('does not detect model for non-model classes', () => {
      const metadata = {
        type: 'class',
        name: 'MyService',
        inherits: null,
        implements: [],
        mixins: [],
        defines: [],
        references: [],
      };
      const content = 'class MyService {}';
      const result = enrich(metadata, null, content, 'lib/services/my_service.dart');
      assert.ok(!result.framework, 'Expected no framework enrichment for a plain service class');
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests using tree-sitter-dart + enrichment
// ---------------------------------------------------------------------------

describe('Flutter enrichment (integration, tree-sitter required)', { skip: !treeSitterAvailable && 'tree-sitter-dart not installed' }, () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new DartAnalyzer();
  });

  describe('sample_widget.dart', () => {
    it('enriches widget metadata from parsed fixture', () => {
      const content = readFixture('sample_widget.dart');
      const filePath = 'lib/screens/sample_widget.dart';
      const tree = analyzer.parse(filePath, content);
      const results = analyzer.extractMetadata(tree, filePath, content);

      const orderListScreen = results.find(r => r.name === 'OrderListScreen');
      assert.ok(orderListScreen, 'Expected to find OrderListScreen');

      const enriched = enrich(orderListScreen, tree, content, filePath);
      assert.ok(enriched.framework, 'Expected framework enrichment');
      assert.equal(enriched.framework.type, 'flutter_widget');
      assert.equal(enriched.framework.widgetType, 'StatelessWidget');

      // Should detect BLoC dependency
      assert.ok(enriched.framework.dependencies.includes('OrderBloc'),
        `Expected OrderBloc in dependencies, got: ${JSON.stringify(enriched.framework.dependencies)}`);
    });

    it('detects navigation in OrderTile', () => {
      const content = readFixture('sample_widget.dart');
      const filePath = 'lib/screens/sample_widget.dart';
      const tree = analyzer.parse(filePath, content);
      const results = analyzer.extractMetadata(tree, filePath, content);

      const orderTile = results.find(r => r.name === 'OrderTile');
      assert.ok(orderTile, 'Expected to find OrderTile');

      const enriched = enrich(orderTile, tree, content, filePath);
      assert.ok(enriched.framework, 'Expected framework enrichment');
      assert.ok(enriched.framework.navigation.length > 0,
        'Expected at least one navigation route');
    });
  });

  describe('sample_bloc.dart', () => {
    it('enriches BLoC metadata from parsed fixture', () => {
      const content = readFixture('sample_bloc.dart');
      const filePath = 'lib/blocs/sample_bloc.dart';
      const tree = analyzer.parse(filePath, content);
      const results = analyzer.extractMetadata(tree, filePath, content);

      const orderBloc = results.find(r => r.name === 'OrderBloc');
      assert.ok(orderBloc, 'Expected to find OrderBloc');

      const enriched = enrich(orderBloc, tree, content, filePath);
      assert.ok(enriched.framework, 'Expected framework enrichment');
      assert.equal(enriched.framework.type, 'flutter_bloc');
      assert.equal(enriched.framework.blocName, 'OrderBloc');

      // Should extract events
      assert.ok(enriched.framework.events.includes('LoadOrders'),
        `Expected LoadOrders in events, got: ${JSON.stringify(enriched.framework.events)}`);
      assert.ok(enriched.framework.events.includes('CreateOrder'),
        `Expected CreateOrder in events, got: ${JSON.stringify(enriched.framework.events)}`);

      // Should extract states
      assert.ok(enriched.framework.states.length >= 2,
        `Expected at least 2 states, got: ${JSON.stringify(enriched.framework.states)}`);

      // Should extract event handlers
      assert.ok(enriched.framework.eventHandlers.length >= 2,
        `Expected at least 2 handlers, got: ${JSON.stringify(enriched.framework.eventHandlers)}`);
    });

    it('enriches event class in bloc file', () => {
      const content = readFixture('sample_bloc.dart');
      const filePath = 'lib/blocs/sample_bloc.dart';
      const tree = analyzer.parse(filePath, content);
      const results = analyzer.extractMetadata(tree, filePath, content);

      const orderEvent = results.find(r => r.name === 'OrderEvent');
      assert.ok(orderEvent, 'Expected to find OrderEvent');

      const enriched = enrich(orderEvent, tree, content, filePath);
      assert.ok(enriched.framework, 'Expected framework enrichment');
      assert.equal(enriched.framework.type, 'flutter_bloc_event');
    });

    it('enriches state class in bloc file', () => {
      const content = readFixture('sample_bloc.dart');
      const filePath = 'lib/blocs/sample_bloc.dart';
      const tree = analyzer.parse(filePath, content);
      const results = analyzer.extractMetadata(tree, filePath, content);

      const orderState = results.find(r => r.name === 'OrderState');
      assert.ok(orderState, 'Expected to find OrderState');

      const enriched = enrich(orderState, tree, content, filePath);
      assert.ok(enriched.framework, 'Expected framework enrichment');
      assert.equal(enriched.framework.type, 'flutter_bloc_state');
    });
  });

  describe('sample_model.dart', () => {
    it('enriches model metadata from parsed fixture', () => {
      const content = readFixture('sample_model.dart');
      const filePath = 'lib/models/sample_model.dart';
      const tree = analyzer.parse(filePath, content);
      const results = analyzer.extractMetadata(tree, filePath, content);

      const orderModel = results.find(r => r.name === 'OrderModel');
      assert.ok(orderModel, 'Expected to find OrderModel');

      const enriched = enrich(orderModel, tree, content, filePath);
      assert.ok(enriched.framework, 'Expected framework enrichment');
      assert.equal(enriched.framework.type, 'flutter_model');
      assert.equal(enriched.framework.serializable, true);
      assert.equal(enriched.framework.equatable, true);
      assert.equal(enriched.framework.copyWith, true);
      assert.equal(enriched.framework.freezed, false);
    });

    it('detects OrderItem as a model too', () => {
      const content = readFixture('sample_model.dart');
      const filePath = 'lib/models/sample_model.dart';
      const tree = analyzer.parse(filePath, content);
      const results = analyzer.extractMetadata(tree, filePath, content);

      const orderItem = results.find(r => r.name === 'OrderItem');
      assert.ok(orderItem, 'Expected to find OrderItem');

      const enriched = enrich(orderItem, tree, content, filePath);
      assert.ok(enriched.framework, 'Expected framework enrichment');
      assert.equal(enriched.framework.type, 'flutter_model');
      assert.equal(enriched.framework.serializable, true);
    });
  });
});
