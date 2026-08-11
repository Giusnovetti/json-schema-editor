import { describe, expect, it } from 'vitest';
import { renameProperty, schemaToGraph } from '../core';
import {
  computeDefaultNodePositions,
  pruneNodePositions,
  resolveNodePositions,
  setStoredNodePosition,
} from './positionState';

describe('graph node position state', () => {
  it('computes deterministic hierarchical defaults', () => {
    const graph = schemaToGraph({
      properties: {
        first: { type: 'string' },
        second: { type: 'object', properties: { child: { type: 'number' } } },
      },
    });
    const positions = computeDefaultNodePositions(graph);
    expect(positions[graph.rootNodeId]).toEqual({ x: 0, y: 0 });

    const firstLevel = graph.nodes.filter((node) => node.pointer.split('/').length === 3);
    expect(firstLevel.map((node) => positions[node.id]?.x)).toEqual([300, 300]);
    const nested = graph.nodes.find((node) => node.pointer.endsWith('/properties/child'))!;
    expect(positions[nested.id]?.x).toBe(600);
  });

  it('prefers stored positions and prunes deleted node ids', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' } } });
    const child = graph.nodes.find((node) => node.id !== graph.rootNodeId)!;
    const stored = {
      [child.id]: { x: 42, y: 99 },
      missing: { x: 1, y: 2 },
    };

    expect(pruneNodePositions(graph, stored)).toEqual({
      [child.id]: { x: 42, y: 99 },
    });
    expect(resolveNodePositions(graph, stored)[child.id]).toEqual({ x: 42, y: 99 });
  });

  it('retains a node position after property rename because node ids stay stable', () => {
    const graph = schemaToGraph({ properties: { profile: { type: 'object' } } });
    const property = graph.nodes.find((node) => node.id !== graph.rootNodeId)!;
    const stored = setStoredNodePosition({}, property.id, { x: 777, y: 333 });
    const renamed = renameProperty(graph, graph.rootNodeId, 'profile', 'account');

    expect(renamed.nodes.find((node) => node.pointer === '/properties/account')?.id).toBe(
      property.id,
    );
    expect(resolveNodePositions(renamed, stored)[property.id]).toEqual({ x: 777, y: 333 });
  });
});
