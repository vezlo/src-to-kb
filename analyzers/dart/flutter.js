'use strict';

/**
 * Flutter enrichment layer for the Dart analyzer.
 *
 * Detects Flutter-specific patterns by analyzing AST and content:
 * - Widgets: StatelessWidget, StatefulWidget, HookWidget, ConsumerWidget
 * - State management: BLoC, Riverpod, Provider
 * - Navigation: Navigator, GoRouter
 * - Models: JSON serialization, Equatable, Freezed
 *
 * Uses a combination of AST analysis and regex-based content detection
 * because many Flutter patterns (e.g., BlocBuilder<X, Y>) are easier
 * to detect via text matching than via tree-sitter node types.
 */

// Known Flutter widget base classes
const WIDGET_BASES = new Set([
  'StatelessWidget', 'StatefulWidget',
  'HookWidget', 'HookConsumerWidget',
  'ConsumerWidget', 'ConsumerStatefulWidget',
]);

// Known State base pattern: State<WidgetName>
const STATE_BASE_PATTERN = /\bState<(\w+)>/;

// BLoC base classes
const BLOC_BASES = new Set([
  'Bloc', 'Cubit',
]);

// BLoC widget patterns (content-based detection)
const BLOC_WIDGET_PATTERNS = [
  /BlocProvider\s*</,
  /BlocBuilder\s*<\s*(\w+)\s*,\s*(\w+)\s*>/,
  /BlocListener\s*<\s*(\w+)\s*,\s*(\w+)\s*>/,
  /BlocConsumer\s*<\s*(\w+)\s*,\s*(\w+)\s*>/,
  /MultiBlocProvider/,
  /MultiBlocListener/,
];

// Navigation patterns
const NAVIGATION_PATTERNS = [
  /Navigator\s*\.\s*push(?:Named|Replacement|AndRemoveUntil)?\s*\(\s*\w*\s*,?\s*['"]([^'"]*)['"]/g,
  /Navigator\s*\.\s*pop\b/g,
  /context\s*\.\s*(?:go|push|pushNamed|pushReplacement)\s*\(\s*['"]([^'"]*)['"]/g,
  /GoRouter\s*\.\s*of\s*\(/g,
];

// Riverpod patterns
const RIVERPOD_PATTERNS = [
  /ref\s*\.\s*watch\s*\(/,
  /ref\s*\.\s*read\s*\(/,
  /ref\s*\.\s*listen\s*\(/,
  /(?:State|StateNotifier|ChangeNotifier|AsyncNotifier)Provider/,
  /ConsumerWidget/,
  /ConsumerStatefulWidget/,
  /HookConsumerWidget/,
];

// Provider patterns (classic)
const PROVIDER_PATTERNS = [
  /Provider\s*\.\s*of\s*<\s*(\w+)\s*>\s*\(/,
  /Consumer\s*<\s*(\w+)\s*>/,
  /ChangeNotifierProvider/,
  /MultiProvider/,
];

/**
 * Enrich metadata with Flutter-specific information.
 * @param {object} metadata - Base metadata from DartAnalyzer.extractMetadata()
 *   (a single metadata entry, not the array)
 * @param {object} tree - tree-sitter parse tree (may be null)
 * @param {string} content - Raw file content
 * @param {string} filePath - File path for context
 * @returns {object} Enriched metadata (same object, mutated)
 */
function enrich(metadata, tree, content, filePath) {
  if (!metadata || !content) return metadata;

  try {
    // Detect widget patterns
    const widgetInfo = detectWidget(metadata, content, filePath);
    if (widgetInfo) {
      metadata.framework = widgetInfo;
      return metadata;
    }

    // Detect BLoC patterns
    const blocInfo = detectBloc(metadata, content, filePath);
    if (blocInfo) {
      metadata.framework = blocInfo;
      return metadata;
    }

    // Detect model patterns
    const modelInfo = detectModel(metadata, content, filePath);
    if (modelInfo) {
      metadata.framework = modelInfo;
      return metadata;
    }
  } catch (err) {
    // Enrichment should never break the pipeline
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Widget detection
// ---------------------------------------------------------------------------

/**
 * Detect if this metadata represents a Flutter widget.
 * @param {object} metadata
 * @param {string} content
 * @param {string} filePath
 * @returns {object|null}
 */
function detectWidget(metadata, content, filePath) {
  if (metadata.type !== 'class') return null;

  const inherits = metadata.inherits;
  if (!inherits) return null;

  // Check if the class extends a known widget base
  const baseClass = cleanGenericType(inherits);
  if (!WIDGET_BASES.has(baseClass)) return null;

  const widgetType = baseClass;
  const result = {
    type: 'flutter_widget',
    widgetType,
    stateClass: null,
    dependencies: [],
    navigation: [],
    buildMethod: false,
  };

  // Check for build method
  if (metadata.defines) {
    const hasBuild = metadata.defines.some(d => d.type === 'method' && d.name === 'build');
    result.buildMethod = hasBuild;
  }

  // For StatefulWidget, find the associated State class
  if (widgetType === 'StatefulWidget' || widgetType === 'ConsumerStatefulWidget') {
    result.stateClass = findStateClass(metadata.name, content);
  }

  // Extract widget dependencies from BLoC usage
  result.dependencies = extractWidgetDependencies(content);

  // Extract navigation routes
  result.navigation = extractNavigationRoutes(content);

  return result;
}

/**
 * Find the State class associated with a StatefulWidget.
 * Conventions: _WidgetNameState or WidgetNameState
 * @param {string} widgetName
 * @param {string} content
 * @returns {string|null}
 */
function findStateClass(widgetName, content) {
  // Look for class _WidgetNameState extends State<WidgetName>
  const privatePattern = new RegExp(`class\\s+(_${widgetName}State)\\s+extends\\s+State<${widgetName}>`);
  const publicPattern = new RegExp(`class\\s+(${widgetName}State)\\s+extends\\s+State<${widgetName}>`);

  const privateMatch = content.match(privatePattern);
  if (privateMatch) return privateMatch[1];

  const publicMatch = content.match(publicPattern);
  if (publicMatch) return publicMatch[1];

  // Generic pattern: any class extending State<WidgetName>
  const genericPattern = new RegExp(`class\\s+(\\w+)\\s+extends\\s+State<${widgetName}>`);
  const genericMatch = content.match(genericPattern);
  if (genericMatch) return genericMatch[1];

  return null;
}

/**
 * Extract widget dependencies from BLoC/Provider/Riverpod usage in content.
 * @param {string} content
 * @returns {string[]}
 */
function extractWidgetDependencies(content) {
  const deps = new Set();

  // BlocBuilder<BlocName, StateName>
  const blocBuilderPattern = /Bloc(?:Builder|Listener|Consumer)\s*<\s*(\w+)\s*,/g;
  let match;
  while ((match = blocBuilderPattern.exec(content)) !== null) {
    deps.add(match[1]);
  }

  // BlocProvider.of<BlocName>(context)
  const blocProviderPattern = /BlocProvider\s*\.\s*of\s*<\s*(\w+)\s*>/g;
  while ((match = blocProviderPattern.exec(content)) !== null) {
    deps.add(match[1]);
  }

  // context.read<BlocName>() / context.watch<BlocName>()
  const contextPattern = /context\s*\.\s*(?:read|watch)\s*<\s*(\w+)\s*>/g;
  while ((match = contextPattern.exec(content)) !== null) {
    deps.add(match[1]);
  }

  // Provider.of<T>(context)
  const providerOfPattern = /Provider\s*\.\s*of\s*<\s*(\w+)\s*>/g;
  while ((match = providerOfPattern.exec(content)) !== null) {
    deps.add(match[1]);
  }

  // ref.watch(someProvider) / ref.read(someProvider)
  const refPattern = /ref\s*\.\s*(?:watch|read|listen)\s*\(\s*(\w+)/g;
  while ((match = refPattern.exec(content)) !== null) {
    deps.add(match[1]);
  }

  return [...deps];
}

/**
 * Extract navigation route strings from content.
 * @param {string} content
 * @returns {string[]}
 */
function extractNavigationRoutes(content) {
  const routes = new Set();

  // Navigator.pushNamed(context, '/path')
  const pushNamedPattern = /Navigator\s*\.\s*pushNamed\s*\(\s*\w+\s*,\s*['"]([^'"]*)['"]/g;
  let match;
  while ((match = pushNamedPattern.exec(content)) !== null) {
    routes.add(match[1]);
  }

  // Navigator.push with MaterialPageRoute — harder to extract route, skip
  // context.go('/path'), context.push('/path')
  const goRouterPattern = /context\s*\.\s*(?:go|push|pushNamed|pushReplacement)\s*\(\s*['"]([^'"]*)['"]/g;
  while ((match = goRouterPattern.exec(content)) !== null) {
    routes.add(match[1]);
  }

  // Interpolated strings: '/orders/${order.id}' — capture the template
  const interpPattern = /(?:Navigator\s*\.\s*pushNamed|context\s*\.\s*(?:go|push))\s*\(\s*(?:\w+\s*,\s*)?['"]([^'"]*\$\{[^}]+\}[^'"]*)['"]/g;
  while ((match = interpPattern.exec(content)) !== null) {
    routes.add(match[1]);
  }

  // Also match string interpolation style used in Dart
  const dartInterpPattern = /(?:Navigator\s*\.\s*pushNamed|context\s*\.\s*(?:go|push))\s*\(\s*(?:\w+\s*,\s*)?'([^']*\$[^']*)'|"([^"]*\$[^"]*)"/g;
  while ((match = dartInterpPattern.exec(content)) !== null) {
    const route = match[1] || match[2];
    if (route) routes.add(route);
  }

  return [...routes];
}

// ---------------------------------------------------------------------------
// BLoC detection
// ---------------------------------------------------------------------------

/**
 * Detect if this metadata represents a BLoC/Cubit pattern.
 * Also detects BLoC events and states (sealed/abstract classes in bloc files).
 * @param {object} metadata
 * @param {string} content
 * @param {string} filePath
 * @returns {object|null}
 */
function detectBloc(metadata, content, filePath) {
  if (metadata.type !== 'class') return null;

  const inherits = metadata.inherits;
  const normalizedPath = (filePath || '').replace(/\\/g, '/');
  const isBlocFile = normalizedPath.includes('_bloc.dart') ||
                     normalizedPath.includes('_cubit.dart') ||
                     normalizedPath.includes('/blocs/') ||
                     normalizedPath.includes('/bloc/') ||
                     normalizedPath.includes('/cubits/');

  // Check if the class extends Bloc or Cubit
  if (inherits) {
    const baseClass = cleanGenericType(inherits);
    if (BLOC_BASES.has(baseClass)) {
      return buildBlocFrameworkInfo(metadata, content, inherits);
    }
  }

  // If we're in a bloc file, check for event/state base classes
  if (isBlocFile) {
    // Check for sealed/abstract classes that look like events or states
    const isEvent = isEventClass(metadata, content);
    const isState = isStateClass(metadata, content);

    if (isEvent) {
      return {
        type: 'flutter_bloc_event',
        eventName: metadata.name,
        fields: extractClassFields(metadata),
      };
    }

    if (isState) {
      return {
        type: 'flutter_bloc_state',
        stateName: metadata.name,
        fields: extractClassFields(metadata),
      };
    }
  }

  return null;
}

/**
 * Build BLoC framework info for a class extending Bloc<Event, State>.
 * @param {object} metadata
 * @param {string} content
 * @param {string} inherits
 * @returns {object}
 */
function buildBlocFrameworkInfo(metadata, content, inherits) {
  // Extract event and state types from Bloc<EventType, StateType>
  const genericMatch = inherits.match(/(?:Bloc|Cubit)\s*<\s*(\w+)\s*(?:,\s*(\w+))?\s*>/);
  const eventType = genericMatch ? genericMatch[1] : null;
  const stateType = genericMatch ? (genericMatch[2] || genericMatch[1]) : null;

  // Extract events (subclasses of the event type)
  const events = extractSubclasses(content, eventType);

  // Extract states (subclasses of the state type)
  const states = extractSubclasses(content, stateType);

  // Extract event handlers: on<EventName>(_handler)
  const eventHandlers = extractEventHandlers(content);

  return {
    type: 'flutter_bloc',
    blocName: metadata.name,
    events,
    states,
    eventHandlers,
  };
}

/**
 * Check if a class looks like a BLoC event base class.
 * @param {object} metadata
 * @param {string} content
 * @returns {boolean}
 */
function isEventClass(metadata, content) {
  const name = metadata.name;
  // Common patterns: ends with Event, is abstract/sealed, extends Equatable
  if (/Event$/.test(name)) return true;

  // Check if the content has "sealed class X extends ... Event"
  const sealedPattern = new RegExp(`sealed\\s+class\\s+${escapeRegex(name)}\\b`);
  if (sealedPattern.test(content) && /Event/.test(name)) return true;

  return false;
}

/**
 * Check if a class looks like a BLoC state base class.
 * @param {object} metadata
 * @param {string} content
 * @returns {boolean}
 */
function isStateClass(metadata, content) {
  const name = metadata.name;
  if (/State$/.test(name) && !/StatefulWidget|StatelessWidget/.test(name)) return true;

  const sealedPattern = new RegExp(`sealed\\s+class\\s+${escapeRegex(name)}\\b`);
  if (sealedPattern.test(content) && /State/.test(name)) return true;

  return false;
}

/**
 * Extract event handler registrations from BLoC constructor.
 * Pattern: on<EventName>(_handlerMethod);
 * @param {string} content
 * @returns {Array<{event: string, handler: string}>}
 */
function extractEventHandlers(content) {
  const handlers = [];
  const pattern = /on\s*<\s*(\w+)\s*>\s*\(\s*(\w+)\s*\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    handlers.push({
      event: match[1],
      handler: match[2],
    });
  }
  return handlers;
}

/**
 * Extract subclasses of a given base class from the file content.
 * @param {string} content
 * @param {string} baseClassName
 * @returns {string[]}
 */
function extractSubclasses(content, baseClassName) {
  if (!baseClassName) return [];
  const subclasses = [];
  const pattern = new RegExp(`class\\s+(\\w+)\\s+extends\\s+${escapeRegex(baseClassName)}\\b`, 'g');
  let match;
  while ((match = pattern.exec(content)) !== null) {
    subclasses.push(match[1]);
  }
  return subclasses;
}

/**
 * Extract field info from metadata defines.
 * @param {object} metadata
 * @returns {Array<{name: string, type: string|null, final: boolean}>}
 */
function extractClassFields(metadata) {
  if (!metadata.defines) return [];
  return metadata.defines
    .filter(d => d.type === 'field')
    .map(d => ({
      name: d.name,
      type: d.fieldType || null,
      final: d.final || false,
    }));
}

// ---------------------------------------------------------------------------
// Model detection
// ---------------------------------------------------------------------------

/**
 * Detect if this metadata represents a Flutter model/entity class.
 * @param {object} metadata
 * @param {string} content
 * @param {string} filePath
 * @returns {object|null}
 */
function detectModel(metadata, content, filePath) {
  if (metadata.type !== 'class') return null;

  const normalizedPath = (filePath || '').replace(/\\/g, '/');
  const isModelFile = normalizedPath.includes('/models/') ||
                      normalizedPath.includes('/entities/') ||
                      normalizedPath.includes('_model.dart') ||
                      normalizedPath.includes('_entity.dart');

  // Check for model indicators
  const hasFromJson = hasMethod(metadata, 'fromJson') || /\bfromJson\b/.test(content);
  const hasToJson = hasMethod(metadata, 'toJson') || /\btoJson\b/.test(content);
  const hasJsonSerializable = /@JsonSerializable\b/.test(content);
  const hasEquatable = metadata.inherits === 'Equatable' ||
                       (metadata.mixins && metadata.mixins.includes('EquatableMixin'));
  const hasFreezed = /@freezed\b/.test(content) || /@Freezed\b/.test(content);
  const hasCopyWith = hasMethod(metadata, 'copyWith') || /\bcopyWith\b/.test(content);
  const hasPropsGetter = /\bList<Object\??>?\s+get\s+props\b/.test(content);

  const isSerializable = hasFromJson || hasToJson || hasJsonSerializable;
  const isModel = isSerializable || hasEquatable || hasFreezed || isModelFile;

  if (!isModel) return null;

  // Extract fields
  const fields = extractClassFields(metadata);

  return {
    type: 'flutter_model',
    serializable: isSerializable,
    freezed: hasFreezed,
    equatable: hasEquatable || hasPropsGetter,
    copyWith: hasCopyWith,
    fields,
  };
}

/**
 * Check if metadata defines contain a method or constructor with the given name.
 * @param {object} metadata
 * @param {string} methodName
 * @returns {boolean}
 */
function hasMethod(metadata, methodName) {
  if (!metadata.defines) return false;
  return metadata.defines.some(d =>
    (d.type === 'method' || d.type === 'constructor') &&
    (d.name === methodName || d.name.endsWith(`.${methodName}`))
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Remove generic type arguments from a type string.
 * e.g., "Bloc<OrderEvent, OrderState>" => "Bloc"
 * @param {string} typeStr
 * @returns {string}
 */
function cleanGenericType(typeStr) {
  if (!typeStr) return '';
  return typeStr.replace(/<[^>]*>/, '').trim();
}

/**
 * Escape a string for use in a regex.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { enrich };
