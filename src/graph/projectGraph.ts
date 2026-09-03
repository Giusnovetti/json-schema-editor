import type { Edge, Node } from '@xyflow/react';
import {
  dialectDescriptor,
  inferNodeType,
  nodeDisplayName,
  type SchemaGraph,
  type SchemaNode,
  type ValidationDiagnostic,
} from '../core';
import { resolveNodePositions, type NodePositions } from './positionState';

export interface SchemaNodeData extends Record<string, unknown> {
  title: string;
  typeLabel: string;
  pointer: string;
  propertyCount: number;
  requiredCount: number;
  definitionCount: number;
  definitionKeyword: '$defs' | 'definitions';
  hasRef: boolean;
  compositionCount: number;
  conditionalCount: number;
  dependentSchemaCount: number;
  advancedCount: number;
  resourceId?: string;
  errorCount: number;
  warningCount: number;
  isRelatedNode: boolean;
}

export type SchemaFlowNode = Node<SchemaNodeData, 'schema'>;

function nodeData(
  graph: SchemaGraph,
  node: SchemaNode,
  diagnostics: ValidationDiagnostic[],
): SchemaNodeData {
  const required = Array.isArray(node.keywords.required)
    ? node.keywords.required.filter((value) => typeof value === 'string')
    : [];
  const nodeDiagnostics = diagnostics.filter((item) => item.nodeId === node.id);

  return {
    title: nodeDisplayName(graph, node),
    typeLabel: inferNodeType(graph, node),
    pointer: node.pointer || '/',
    propertyCount: graph.edges.filter(
      (edge) => edge.source === node.id && edge.relation === 'property',
    ).length,
    requiredCount: required.length,
    definitionKeyword: dialectDescriptor(graph.dialect).definitionsKeyword,
    definitionCount: graph.edges.filter(
      (edge) => edge.source === node.id && edge.relation === 'definition',
    ).length,
    hasRef: graph.edges.some(
      (edge) => edge.source === node.id && edge.relation === 'ref',
    ),
    compositionCount: graph.edges.filter(
      (edge) => edge.source === node.id && ['allOf', 'anyOf', 'oneOf', 'not'].includes(edge.relation),
    ).length,
    conditionalCount: graph.edges.filter(
      (edge) => edge.source === node.id && ['if', 'then', 'else'].includes(edge.relation),
    ).length,
    dependentSchemaCount: graph.edges.filter(
      (edge) => edge.source === node.id && edge.relation === 'dependentSchema',
    ).length,
    advancedCount: graph.edges.filter(
      (edge) => edge.source === node.id && ['prefixItem', 'contains', 'unevaluatedProperties', 'unevaluatedItems', 'dynamicRef'].includes(edge.relation),
    ).length,
    resourceId: typeof node.keywords.$id === 'string' ? node.keywords.$id : undefined,
    errorCount: nodeDiagnostics.filter((item) => item.severity === 'error').length,
    warningCount: nodeDiagnostics.filter((item) => item.severity === 'warning').length,
    isRelatedNode: false,
  };
}

export function projectGraph(
  graph: SchemaGraph,
  storedPositions: NodePositions = {},
  diagnostics: ValidationDiagnostic[] = [],
  selectedNodeId?: string,
): {
  nodes: SchemaFlowNode[];
  edges: Edge[];
} {
  const positions = resolveNodePositions(graph, storedPositions);
  const highlightedEdges = new Set(
    selectedNodeId
      ? graph.edges
        .filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
        .map((edge) => edge.id)
      : [],
  );
  const relatedNodeIds = new Set(
    graph.edges.flatMap((edge) => highlightedEdges.has(edge.id) ? [edge.source, edge.target] : []),
  );
  if (selectedNodeId) relatedNodeIds.delete(selectedNodeId);

  const nodes: SchemaFlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: 'schema',
    position: positions[node.id] ?? { x: 0, y: 0 },
    selected: node.id === selectedNodeId,
    data: {
      ...nodeData(graph, node, diagnostics),
      isRelatedNode: relatedNodeIds.has(node.id),
    },
  }));

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label:
      edge.relation === 'property' || edge.relation === 'definition' || edge.relation === 'dependentSchema'
        ? `${edge.relation}: ${edge.key}`
        : edge.relation === 'ref' || edge.relation === 'dynamicRef'
          ? edge.relation === 'ref' ? '$ref' : '$dynamicRef'
          : edge.relation === 'allOf' || edge.relation === 'anyOf' || edge.relation === 'oneOf'
            ? `${edge.relation}[${edge.index ?? 0}]`
            : edge.relation === 'prefixItem'
              ? `${dialectDescriptor(graph.dialect).id === 'draft-07' ? 'items' : 'prefixItems'}[${edge.index ?? 0}]`
              : edge.relation,
    type: edge.relation === 'ref' || edge.relation === 'dynamicRef' || ['allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentSchema', 'contains', 'unevaluatedProperties', 'unevaluatedItems'].includes(edge.relation)
      ? 'smoothstep'
      : 'default',
    animated: edge.relation === 'ref' || edge.relation === 'dynamicRef',
    className: [
      ['allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentSchema', 'contains', 'unevaluatedProperties', 'unevaluatedItems'].includes(edge.relation)
        ? 'composition-edge'
        : '',
      highlightedEdges.has(edge.id) ? 'schema-edge--highlighted' : '',
    ].filter(Boolean).join(' ') || undefined,
  }));

  return { nodes, edges };
}
