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
  errorCount: number;
  warningCount: number;
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
    errorCount: nodeDiagnostics.filter((item) => item.severity === 'error').length,
    warningCount: nodeDiagnostics.filter((item) => item.severity === 'warning').length,
  };
}

export function projectGraph(
  graph: SchemaGraph,
  storedPositions: NodePositions = {},
  diagnostics: ValidationDiagnostic[] = [],
): {
  nodes: SchemaFlowNode[];
  edges: Edge[];
} {
  const positions = resolveNodePositions(graph, storedPositions);

  const nodes: SchemaFlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: 'schema',
    position: positions[node.id] ?? { x: 0, y: 0 },
    data: nodeData(graph, node, diagnostics),
  }));

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label:
      edge.relation === 'property' || edge.relation === 'definition' || edge.relation === 'dependentSchema'
        ? `${edge.relation}: ${edge.key}`
        : edge.relation === 'ref'
          ? '$ref'
          : edge.relation === 'allOf' || edge.relation === 'anyOf' || edge.relation === 'oneOf'
            ? `${edge.relation}[${edge.index ?? 0}]`
            : edge.relation === 'prefixItem'
              ? `${dialectDescriptor(graph.dialect).id === 'draft-07' ? 'items' : 'prefixItems'}[${edge.index ?? 0}]`
              : edge.relation,
    type: edge.relation === 'ref' || ['allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentSchema'].includes(edge.relation)
      ? 'smoothstep'
      : 'default',
    animated: edge.relation === 'ref',
    className: ['allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentSchema'].includes(edge.relation)
      ? 'composition-edge'
      : undefined,
  }));

  return { nodes, edges };
}
