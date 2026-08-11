import type { SchemaGraph } from '../core';

export interface NodePosition {
  x: number;
  y: number;
}

export type NodePositions = Record<string, NodePosition>;

export function pruneNodePositions(
  graph: SchemaGraph,
  positions: NodePositions,
): NodePositions {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return Object.fromEntries(
    Object.entries(positions).filter(([nodeId]) => nodeIds.has(nodeId)),
  );
}

export function setStoredNodePosition(
  positions: NodePositions,
  nodeId: string,
  position: NodePosition,
): NodePositions {
  const previous = positions[nodeId];
  if (previous?.x === position.x && previous?.y === position.y) return positions;
  return { ...positions, [nodeId]: position };
}

export function computeDefaultNodePositions(graph: SchemaGraph): NodePositions {
  const depths = new Map<string, number>([[graph.rootNodeId, 0]]);
  const queue = [graph.rootNodeId];

  while (queue.length > 0) {
    const source = queue.shift()!;
    const depth = depths.get(source) ?? 0;
    const structural = graph.edges.filter(
      (edge) => edge.source === source && edge.relation !== 'ref',
    );

    for (const edge of structural) {
      if (!depths.has(edge.target)) {
        depths.set(edge.target, depth + 1);
        queue.push(edge.target);
      }
    }
  }

  for (const node of graph.nodes) {
    if (!depths.has(node.id)) depths.set(node.id, 1);
  }

  const rows = new Map<number, number>();
  const positions: NodePositions = {};

  for (const node of graph.nodes) {
    const depth = depths.get(node.id) ?? 0;
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    positions[node.id] = { x: depth * 300, y: row * 150 };
  }

  return positions;
}

export function resolveNodePositions(
  graph: SchemaGraph,
  storedPositions: NodePositions,
): NodePositions {
  const defaults = computeDefaultNodePositions(graph);
  const stored = pruneNodePositions(graph, storedPositions);
  return { ...defaults, ...stored };
}
