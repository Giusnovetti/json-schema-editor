import type {
  JsonSchemaPrimitiveType,
  SchemaEdge,
  SchemaGraph,
  SchemaNode,
} from './model';
import { unescapePointerToken } from './pointer';

const TYPE_VALUES = new Set<JsonSchemaPrimitiveType>([
  'null',
  'boolean',
  'object',
  'array',
  'number',
  'string',
  'integer',
]);

export interface DefinitionEntry {
  ownerNodeId: string;
  nodeId: string;
  name: string;
  pointer: string;
}

export function getNode(graph: SchemaGraph, nodeId: string): SchemaNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function getOutgoingEdges(
  graph: SchemaGraph,
  nodeId: string,
  relation?: SchemaEdge['relation'],
): SchemaEdge[] {
  return graph.edges.filter(
    (edge) => edge.source === nodeId && (!relation || edge.relation === relation),
  );
}

export function getNodeType(node: SchemaNode): JsonSchemaPrimitiveType | undefined {
  const type = node.keywords.type;
  if (typeof type === 'string' && TYPE_VALUES.has(type as JsonSchemaPrimitiveType)) {
    return type as JsonSchemaPrimitiveType;
  }
  return undefined;
}

export function inferNodeType(
  graph: SchemaGraph,
  node: SchemaNode,
): JsonSchemaPrimitiveType | 'schema' | 'boolean-schema' {
  if (node.kind === 'boolean-schema') return 'boolean-schema';
  const explicit = getNodeType(node);
  if (explicit) return explicit;
  if (
    node.structuralPresence.properties ||
    getOutgoingEdges(graph, node.id, 'property').length > 0
  ) {
    return 'object';
  }
  if (
    node.structuralPresence.items ||
    node.structuralPresence.prefixItems ||
    getOutgoingEdges(graph, node.id, 'items').length > 0 ||
    getOutgoingEdges(graph, node.id, 'prefixItem').length > 0
  ) {
    return 'array';
  }
  return 'schema';
}

export function nodeDisplayName(graph: SchemaGraph, node: SchemaNode): string {
  if (typeof node.keywords.title === 'string' && node.keywords.title.trim()) {
    return node.keywords.title;
  }
  if (node.id === graph.rootNodeId) return 'Root';

  const incoming = graph.edges.find(
    (edge) => edge.target === node.id && edge.relation !== 'ref',
  );
  if (incoming?.relation === 'dependentSchema' && incoming.key) return `dependent: ${incoming.key}`;
  if (incoming?.key) return incoming.key;
  if (incoming?.relation === 'items') return 'items';
  if (incoming?.relation === 'prefixItem') return `item[${incoming.index ?? 0}]`;
  if (incoming?.relation === 'allOf' || incoming?.relation === 'anyOf' || incoming?.relation === 'oneOf') {
    return `${incoming.relation}[${incoming.index ?? 0}]`;
  }
  if (incoming && ['not', 'if', 'then', 'else'].includes(incoming.relation)) return incoming.relation;

  const tokens = node.pointer.split('/').filter(Boolean);
  return tokens.length > 0 ? unescapePointerToken(tokens.at(-1)!) : 'Schema';
}

export function getDefinitions(graph: SchemaGraph): DefinitionEntry[] {
  return graph.edges
    .filter(
      (edge): edge is SchemaEdge & { key: string } =>
        edge.relation === 'definition' && typeof edge.key === 'string',
    )
    .map((edge) => {
      const node = getNode(graph, edge.target);
      return node
        ? {
            ownerNodeId: edge.source,
            nodeId: edge.target,
            name: edge.key,
            pointer: node.pointer,
          }
        : undefined;
    })
    .filter((entry): entry is DefinitionEntry => Boolean(entry))
    .sort((left, right) => left.pointer.localeCompare(right.pointer));
}
