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
