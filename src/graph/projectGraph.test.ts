import { describe, expect, it } from 'vitest';
import { DRAFT_07_DIALECT, schemaToGraph, validateInstance, validateSchemaDocument } from '../core';
import { projectGraph } from './projectGraph';

describe('projectGraph validation projection', () => {
  it('projects instance errors onto the responsible graph node', () => {
    const graph = schemaToGraph({
      properties: { age: { type: 'integer', minimum: 0 } },
    });
    const age = graph.nodes.find((node) => node.pointer === '/properties/age')!;
    const diagnostics = validateInstance(graph, { age: -1 }).diagnostics;
    const projection = projectGraph(graph, {}, diagnostics);
    const ageFlowNode = projection.nodes.find((node) => node.id === age.id)!;

    expect(ageFlowNode.data.errorCount).toBe(1);
    expect(ageFlowNode.data.warningCount).toBe(0);
  });

  it('projects schema warnings separately from errors', () => {
    const graph = schemaToGraph({ type: 'string', minLength: 10, maxLength: 2 });
    const diagnostics = validateSchemaDocument({
      type: 'string',
      minLength: 10,
      maxLength: 2,
    }).diagnostics;
    const root = projectGraph(graph, {}, diagnostics).nodes[0]!;

    expect(root.data.errorCount).toBe(0);
    expect(root.data.warningCount).toBe(1);
  });
});

it('highlights a selected node, all its relations, and directly connected nodes', () => {
  const graph = schemaToGraph({
    properties: { profile: { type: 'object' } },
    $defs: { profileAlias: { $ref: '#/properties/profile' } },
  });
  const profile = graph.nodes.find((node) => node.pointer === '/properties/profile')!;
  const projection = projectGraph(graph, {}, [], profile.id);
  const connectedEdges = graph.edges.filter(
    (edge) => edge.source === profile.id || edge.target === profile.id,
  );
  const connectedNodeIds = new Set(
    connectedEdges.flatMap((edge) => [edge.source, edge.target]),
  );
  connectedNodeIds.delete(profile.id);

  expect(projection.nodes.find((node) => node.id === profile.id)?.selected).toBe(true);
  expect(projection.nodes.filter((node) => node.data.isRelatedNode).map((node) => node.id))
    .toEqual(expect.arrayContaining([...connectedNodeIds]));
  expect(projection.edges.filter((edge) => edge.className?.includes('schema-edge--highlighted')).map((edge) => edge.id))
    .toEqual(expect.arrayContaining(connectedEdges.map((edge) => edge.id)));
});


it('projects composition metadata and labels', () => {
  const graph = schemaToGraph({
    allOf: [{ type: 'string' }, { type: 'number' }],
    if: { type: 'object' },
    then: { required: ['x'] },
    dependentSchemas: { a: { required: ['b'] } },
  });
  const projection = projectGraph(graph);
  const root = projection.nodes.find((node) => node.id === graph.rootNodeId)!;
  expect(root.data.compositionCount).toBe(2);
  expect(root.data.conditionalCount).toBe(2);
  expect(root.data.dependentSchemaCount).toBe(1);
  expect(projection.edges.map((edge) => edge.label)).toEqual(
    expect.arrayContaining(['allOf[0]', 'allOf[1]', 'if', 'then', 'dependentSchema: a']),
  );
});


it('projects Draft-07 definition and tuple labels', () => {
  const graph = schemaToGraph({
    $schema: DRAFT_07_DIALECT,
    type: 'array',
    items: [{ type: 'string' }],
    definitions: { Value: { type: 'string' } },
  });
  const projection = projectGraph(graph);
  const root = projection.nodes.find((node) => node.id === graph.rootNodeId)!;

  expect(root.data.definitionKeyword).toBe('definitions');
  expect(projection.edges.map((edge) => edge.label)).toEqual(
    expect.arrayContaining(['items[0]', 'definition: Value']),
  );
});

it('projects MVP4 resource metadata and advanced relation labels', () => {
  const graph = schemaToGraph({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://example.test/list',
    prefixItems: [{ type: 'string' }],
    contains: { type: 'number' },
    unevaluatedItems: false,
    $dynamicRef: '#/$defs/value',
    $defs: { value: { type: 'number' } },
  });
  const projection = projectGraph(graph);
  const root = projection.nodes.find((node) => node.id === graph.rootNodeId)!;
  expect(root.data.resourceId).toBe('https://example.test/list');
  expect(root.data.advancedCount).toBe(4);
  expect(projection.edges.map((edge) => edge.label)).toEqual(
    expect.arrayContaining(['prefixItems[0]', 'contains', 'unevaluatedItems', '$dynamicRef']),
  );
});
