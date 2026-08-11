import { describe, expect, it } from 'vitest';
import {
  addDefinition,
  addProperty,
  clearNodeReference,
  removeProperty,
  renameDefinition,
  renameProperty,
  setNodeReference,
  setNodeKeyword,
} from './operations';
import { schemaToGraph } from './parser';
import { appendPointer } from './pointer';
import { getNode, getOutgoingEdges, inferNodeType } from './selectors';
import { graphToSchema } from './serializer';
import type { JsonSchema } from './model';

const schema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Customer',
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 2 },
    address: { $ref: '#/$defs/Address' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  $defs: {
    Address: {
      type: 'object',
      properties: {
        city: { type: 'string' },
      },
    },
  },
  'x-custom-keyword': { preserved: true },
};

describe('SchemaGraph parser/serializer', () => {
  it('round-trips MVP 1 structures without losing unknown keywords', () => {
    const graph = schemaToGraph(schema);
    expect(graphToSchema(graph)).toEqual(schema);
  });

  it('creates a resolved REF edge for local JSON Pointer refs', () => {
    const graph = schemaToGraph(schema);
    const refEdges = graph.edges.filter((edge) => edge.relation === 'ref');
    expect(refEdges).toHaveLength(1);
    expect(refEdges[0]?.ref).toBe('#/$defs/Address');
  });

  it('supports recursive refs without recursive serialization', () => {
    const recursive: JsonSchema = {
      type: 'object',
      properties: {
        child: { $ref: '#' },
      },
    };
    const graph = schemaToGraph(recursive);
    expect(graph.edges.some((edge) => edge.relation === 'ref')).toBe(true);
    expect(graphToSchema(graph)).toEqual(recursive);
  });

  it('preserves boolean schemas', () => {
    expect(graphToSchema(schemaToGraph(false))).toBe(false);
  });

  it('infers object/array from structural keywords even when type is omitted', () => {
    const objectGraph = schemaToGraph({ properties: {} });
    expect(inferNodeType(objectGraph, objectGraph.nodes[0]!)).toBe('object');

    const arrayGraph = schemaToGraph({ items: { type: 'string' } });
    expect(inferNodeType(arrayGraph, arrayGraph.nodes[0]!)).toBe('array');
  });
});

describe('SchemaGraph property operations', () => {
  it('adds properties and required entries through a graph operation', () => {
    const graph = schemaToGraph({ type: 'object', properties: {} });
    const next = addProperty(graph, graph.rootNodeId, 'email', 'string', true);
    expect(graphToSchema(next)).toEqual({
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string' } },
    });
  });

  it('renames a property, keeps its node id stable, and updates required', () => {
    const graph = schemaToGraph({
      type: 'object',
      required: ['profile'],
      properties: {
        profile: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      },
    });
    const propertyEdge = getOutgoingEdges(graph, graph.rootNodeId, 'property')[0]!;
    const childId = propertyEdge.target;

    const next = renameProperty(graph, graph.rootNodeId, 'profile', 'account');
    const renamedEdge = getOutgoingEdges(next, next.rootNodeId, 'property')[0]!;
    const child = getNode(next, childId)!;
    const nested = next.nodes.find((node) => node.keywords.type === 'string')!;

    expect(renamedEdge.key).toBe('account');
    expect(renamedEdge.target).toBe(childId);
    expect(child.pointer).toBe('/properties/account');
    expect(nested.pointer).toBe('/properties/account/properties/name');
    expect(graphToSchema(next)).toEqual({
      type: 'object',
      required: ['account'],
      properties: {
        account: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      },
    });
  });

  it('rewrites local refs that point into a renamed property subtree', () => {
    const graph = schemaToGraph({
      type: 'object',
      properties: {
        source: {
          type: 'object',
          properties: { value: { type: 'string' } },
        },
        alias: { $ref: '#/properties/source/properties/value' },
      },
    });

    const next = renameProperty(graph, graph.rootNodeId, 'source', 'renamed');
    expect(graphToSchema(next)).toEqual({
      type: 'object',
      properties: {
        renamed: {
          type: 'object',
          properties: { value: { type: 'string' } },
        },
        alias: { $ref: '#/properties/renamed/properties/value' },
      },
    });
    expect(next.edges.find((edge) => edge.relation === 'ref')?.ref).toBe(
      '#/properties/renamed/properties/value',
    );
  });

  it('escapes JSON Pointer tokens when renaming properties', () => {
    const graph = schemaToGraph({
      properties: { 'a/b': { type: 'string' } },
    });
    const next = renameProperty(graph, graph.rootNodeId, 'a/b', 'x~y');
    const edge = getOutgoingEdges(next, next.rootNodeId, 'property')[0]!;
    expect(getNode(next, edge.target)?.pointer).toBe('/properties/x~0y');
    expect(graphToSchema(next)).toEqual({
      properties: { 'x~y': { type: 'string' } },
    });
  });

  it('rejects duplicate property names without mutating the graph', () => {
    const graph = schemaToGraph({
      properties: { first: {}, second: {} },
    });
    expect(renameProperty(graph, graph.rootNodeId, 'first', 'second')).toBe(graph);
  });

  it('removes a property subtree and its required entry', () => {
    const graph = schemaToGraph({
      type: 'object',
      required: ['profile', 'keep'],
      properties: {
        profile: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        keep: { type: 'number' },
      },
    });
    const next = removeProperty(graph, graph.rootNodeId, 'profile');

    expect(next.nodes.some((node) => node.pointer.startsWith('/properties/profile'))).toBe(false);
    expect(graphToSchema(next)).toEqual({
      type: 'object',
      required: ['keep'],
      properties: { keep: { type: 'number' } },
    });
  });

  it('keeps surviving unresolved $ref text when its target is deleted', () => {
    const graph = schemaToGraph({
      properties: {
        source: { type: 'string' },
        alias: { $ref: '#/properties/source' },
      },
    });
    const next = removeProperty(graph, graph.rootNodeId, 'source');

    expect(next.edges.filter((edge) => edge.relation === 'ref')).toHaveLength(0);
    expect(graphToSchema(next)).toEqual({
      properties: { alias: { $ref: '#/properties/source' } },
    });
  });
});

describe('SchemaGraph $defs and $ref operations', () => {
  it('creates a definition and points an existing node to it', () => {
    let graph = schemaToGraph({
      type: 'object',
      properties: { shippingAddress: {} },
    });
    graph = addDefinition(graph, graph.rootNodeId, 'Address', 'object');

    const definitionEdge = getOutgoingEdges(graph, graph.rootNodeId, 'definition')[0]!;
    const propertyEdge = getOutgoingEdges(graph, graph.rootNodeId, 'property')[0]!;
    graph = setNodeReference(graph, propertyEdge.target, definitionEdge.target);

    expect(graphToSchema(graph)).toEqual({
      type: 'object',
      properties: {
        shippingAddress: { $ref: '#/$defs/Address' },
      },
      $defs: {
        Address: { type: 'object' },
      },
    });
    expect(getOutgoingEdges(graph, propertyEdge.target, 'ref')[0]?.target).toBe(
      definitionEdge.target,
    );
  });

  it('renames a definition and rewrites every local ref into its subtree', () => {
    const graph = schemaToGraph({
      type: 'object',
      properties: {
        node: { $ref: '#/$defs/Node' },
      },
      $defs: {
        Node: {
          type: 'object',
          properties: {
            next: { $ref: '#/$defs/Node' },
          },
        },
      },
    });
    const definitionEdge = getOutgoingEdges(graph, graph.rootNodeId, 'definition')[0]!;
    const definitionId = definitionEdge.target;

    const next = renameDefinition(graph, graph.rootNodeId, 'Node', 'TreeNode');
    expect(getNode(next, definitionId)?.pointer).toBe('/$defs/TreeNode');
    expect(graphToSchema(next)).toEqual({
      type: 'object',
      properties: {
        node: { $ref: '#/$defs/TreeNode' },
      },
      $defs: {
        TreeNode: {
          type: 'object',
          properties: {
            next: { $ref: '#/$defs/TreeNode' },
          },
        },
      },
    });
    expect(next.edges.filter((edge) => edge.relation === 'ref').map((edge) => edge.ref)).toEqual([
      '#/$defs/TreeNode',
      '#/$defs/TreeNode',
    ]);
  });

  it('can create and clear a root self-reference', () => {
    let graph = schemaToGraph({ title: 'Recursive' });
    graph = setNodeReference(graph, graph.rootNodeId, graph.rootNodeId);
    expect(graphToSchema(graph)).toEqual({ title: 'Recursive', $ref: '#' });
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'ref')).toHaveLength(1);

    graph = clearNodeReference(graph, graph.rootNodeId);
    expect(graphToSchema(graph)).toEqual({ title: 'Recursive' });
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'ref')).toHaveLength(0);
  });

  it('does not create duplicate definitions', () => {
    const graph = schemaToGraph({ $defs: { Address: { type: 'string' } } });
    expect(addDefinition(graph, graph.rootNodeId, 'Address', 'object')).toBe(graph);
  });
});

describe('SchemaGraph keyword operations', () => {
  it('preserves empty strings as legitimate keyword values', () => {
    const graph = schemaToGraph({ type: 'string' });
    const next = setNodeKeyword(graph, graph.rootNodeId, 'const', '');
    expect(graphToSchema(next)).toEqual({ type: 'string', const: '' });
  });

  it('removes a keyword only when value is undefined', () => {
    const graph = schemaToGraph({ type: 'string', minLength: 2 });
    const next = setNodeKeyword(graph, graph.rootNodeId, 'minLength', undefined);
    expect(graphToSchema(next)).toEqual({ type: 'string' });
  });
});

describe('JSON Pointer helpers used by editing operations', () => {
  it('escapes slash and tilde tokens', () => {
    expect(appendPointer('', 'properties', 'a/b~c')).toBe('/properties/a~1b~0c');
  });
});
