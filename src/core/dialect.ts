import type { JsonSchema, SchemaGraph, SchemaNode } from './model';
import { appendPointer, edgeId, pointerToLocalRef, replacePointerPrefix } from './pointer';

export const DRAFT_2020_12_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
export const DRAFT_07_DIALECT = 'http://json-schema.org/draft-07/schema#';

export type SupportedDialect = 'draft-2020-12' | 'draft-07';

export interface DialectDescriptor {
  id: SupportedDialect;
  label: string;
  uri: string;
  definitionsKeyword: '$defs' | 'definitions';
  dependentSchemasKeyword: 'dependentSchemas' | 'dependencies';
}

export const DIALECTS: Record<SupportedDialect, DialectDescriptor> = {
  'draft-2020-12': {
    id: 'draft-2020-12',
    label: 'Draft 2020-12',
    uri: DRAFT_2020_12_DIALECT,
    definitionsKeyword: '$defs',
    dependentSchemasKeyword: 'dependentSchemas',
  },
  'draft-07': {
    id: 'draft-07',
    label: 'Draft-07',
    uri: DRAFT_07_DIALECT,
    definitionsKeyword: 'definitions',
    dependentSchemasKeyword: 'dependencies',
  },
};

function normalizedUri(value: string): string {
  return value.trim().replace(/^https:/, 'http:').replace(/#$/, '');
}

export function supportedDialectId(value?: string): SupportedDialect {
  if (!value) return 'draft-2020-12';
  const normalized = normalizedUri(value);
  if (normalized === 'http://json-schema.org/draft-07/schema') return 'draft-07';
  if (normalized === 'http://json-schema.org/draft/2020-12/schema') return 'draft-2020-12';
  return 'draft-2020-12';
}

export function dialectDescriptor(value?: string): DialectDescriptor {
  return DIALECTS[supportedDialectId(value)];
}

export function isDraft07Dialect(value?: string): boolean {
  return supportedDialectId(value) === 'draft-07';
}

export function dialectForSchema(schema: JsonSchema): DialectDescriptor {
  if (typeof schema === 'boolean') return DIALECTS['draft-2020-12'];
  return dialectDescriptor(typeof schema.$schema === 'string' ? schema.$schema : undefined);
}

export function dialectLabel(value?: string): string {
  return dialectDescriptor(value).label;
}

function propertyDependencyMap(node: SchemaNode, dialect: SupportedDialect): Record<string, string[]> {
  if (node.kind !== 'schema') return {};
  const keyword = dialect === 'draft-07' ? 'dependencies' : 'dependentRequired';
  const value = node.keywords[keyword];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [name, dependency] of Object.entries(value as Record<string, unknown>)) {
    if (
      Array.isArray(dependency) &&
      dependency.every((item): item is string => typeof item === 'string')
    ) {
      result[name] = [...dependency];
    }
  }
  return result;
}

function rewriteGraphPointerPrefix(
  graph: SchemaGraph,
  oldPointer: string,
  newPointer: string,
): SchemaGraph {
  const nodes = graph.nodes.map((node) => {
    const pointer = replacePointerPrefix(node.pointer, oldPointer, newPointer) ?? node.pointer;
    if (node.kind !== 'schema') return pointer === node.pointer ? node : { ...node, pointer };

    const keywords = { ...node.keywords };
    for (const keyword of ['$ref', '$dynamicRef'] as const) {
      if (typeof keywords[keyword] !== 'string') continue;
      const refValue = keywords[keyword] as string;
      const refPointer = refValue === '#'
        ? ''
        : refValue.startsWith('#/')
          ? refValue.slice(1)
          : undefined;
      if (refPointer !== undefined) {
        const rewrittenRef = replacePointerPrefix(refPointer, oldPointer, newPointer);
        if (rewrittenRef !== undefined) keywords[keyword] = pointerToLocalRef(rewrittenRef);
      }
    }
    return pointer === node.pointer && keywords.$ref === node.keywords.$ref && keywords.$dynamicRef === node.keywords.$dynamicRef
      ? node
      : { ...node, pointer, keywords };
  });

  const edges = graph.edges.map((candidate) => {
    if ((candidate.relation !== 'ref' && candidate.relation !== 'dynamicRef') || typeof candidate.ref !== 'string') return candidate;
    const refPointer = candidate.ref === '#'
      ? ''
      : candidate.ref.startsWith('#/')
        ? candidate.ref.slice(1)
        : undefined;
    if (refPointer === undefined) return candidate;
    const rewrittenRefPointer = replacePointerPrefix(refPointer, oldPointer, newPointer);
    if (rewrittenRefPointer === undefined) return candidate;
    const ref = pointerToLocalRef(rewrittenRefPointer);
    return { ...candidate, ref, id: edgeId(candidate.source, candidate.relation, candidate.target, ref) };
  });

  return { ...graph, nodes, edges };
}

function rewriteContainerPointers(
  graph: SchemaGraph,
  relation: 'definition' | 'dependentSchema' | 'prefixItem' | 'items',
  oldContainer: string,
  newContainer: string,
): SchemaGraph {
  let next = graph;
  const edges = next.edges.filter((edge) => edge.relation === relation);
  for (const edge of edges) {
    const child = next.nodes.find((node) => node.id === edge.target);
    const parent = next.nodes.find((node) => node.id === edge.source);
    if (!child || !parent) continue;
    const suffix = edge.key ?? (edge.index !== undefined ? String(edge.index) : undefined);
    const expectedOld = suffix === undefined
      ? appendPointer(parent.pointer, oldContainer)
      : appendPointer(parent.pointer, oldContainer, suffix);
    if (child.pointer !== expectedOld && !child.pointer.startsWith(`${expectedOld}/`)) continue;
    const expectedNew = suffix === undefined
      ? appendPointer(parent.pointer, newContainer)
      : appendPointer(parent.pointer, newContainer, suffix);
    next = rewriteGraphPointerPrefix(next, expectedOld, expectedNew);
  }
  return next;
}

/**
 * Converts only syntax that differs between the two supported dialects while
 * keeping the semantic graph and stable node ids intact.
 */
export function convertGraphDialect(
  graph: SchemaGraph,
  target: SupportedDialect,
): SchemaGraph {
  const source = supportedDialectId(graph.dialect);
  if (source === target) {
    const root = graph.nodes.find((node) => node.id === graph.rootNodeId);
    return {
      ...graph,
      dialect: DIALECTS[target].uri,
      nodes: graph.nodes.map((node) => {
        if (node.id !== root?.id || node.kind !== 'schema') return node;
        return { ...node, keywords: { ...node.keywords, $schema: DIALECTS[target].uri } };
      }),
    };
  }

  const sourceDescriptor = DIALECTS[source];
  const targetDescriptor = DIALECTS[target];
  let next: SchemaGraph = { ...graph, dialect: targetDescriptor.uri };

  next = rewriteContainerPointers(
    next,
    'definition',
    sourceDescriptor.definitionsKeyword,
    targetDescriptor.definitionsKeyword,
  );
  next = rewriteContainerPointers(
    next,
    'dependentSchema',
    sourceDescriptor.dependentSchemasKeyword,
    targetDescriptor.dependentSchemasKeyword,
  );

  // Positional array subschemas are /items/N in Draft-07 and /prefixItems/N in 2020-12.
  next = rewriteContainerPointers(
    next,
    'prefixItem',
    source === 'draft-07' ? 'items' : 'prefixItems',
    target === 'draft-07' ? 'items' : 'prefixItems',
  );

  // When positional items exist, the rest schema is additionalItems in Draft-07 and items in 2020-12.
  const parentsWithPrefixItems = new Set(
    next.edges.filter((edge) => edge.relation === 'prefixItem').map((edge) => edge.source),
  );
  for (const parentId of parentsWithPrefixItems) {
    const parent = next.nodes.find((node) => node.id === parentId);
    const rest = next.edges.find((edge) => edge.source === parentId && edge.relation === 'items');
    const child = rest ? next.nodes.find((node) => node.id === rest.target) : undefined;
    if (!parent || !child) continue;
    const oldPointer = appendPointer(parent.pointer, source === 'draft-07' ? 'additionalItems' : 'items');
    const newPointer = appendPointer(parent.pointer, target === 'draft-07' ? 'additionalItems' : 'items');
    if (child.pointer === oldPointer || child.pointer.startsWith(`${oldPointer}/`)) {
      next = rewriteGraphPointerPrefix(next, oldPointer, newPointer);
    }
  }

  next = {
    ...next,
    nodes: next.nodes.map((node) => {
      if (node.kind !== 'schema') return node;
      const keywords = { ...node.keywords };
      const dependencies = propertyDependencyMap(node, source);
      if (source === 'draft-07') delete keywords.dependencies;
      else delete keywords.dependentRequired;
      if (Object.keys(dependencies).length > 0) {
        keywords[target === 'draft-07' ? 'dependencies' : 'dependentRequired'] = dependencies;
      }
      if (node.id === next.rootNodeId) keywords.$schema = targetDescriptor.uri;
      return { ...node, keywords };
    }),
  };

  return next;
}
