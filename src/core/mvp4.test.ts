import { describe, expect, it } from 'vitest';
import {
  addAdvancedSchema,
  addPrefixItem,
  convertGraphDialect,
  graphToSchema,
  findUnresolvedReferences,
  removeAdvancedSchema,
  resolveReference,
  schemaToGraph,
  validateInstance,
  validateSchemaDocument,
  type JsonSchema,
} from './index';

const dialect = 'https://json-schema.org/draft/2020-12/schema';

describe('MVP4 advanced JSON Schema', () => {
  it('round-trips identifiers, anchors, dynamic references and advanced applicators', () => {
    const schema: JsonSchema = {
      $schema: dialect,
      $id: 'https://example.test/root',
      $anchor: 'root',
      $dynamicAnchor: 'node',
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      contains: { const: 42 },
      minContains: 1,
      maxContains: 2,
      unevaluatedItems: false,
      unevaluatedProperties: { type: 'string' },
      $dynamicRef: '#node',
    };
    expect(graphToSchema(schemaToGraph(schema))).toEqual(schema);
  });

  it('adds prefix items and removable advanced schema edges', () => {
    let graph = schemaToGraph({ $schema: dialect, type: 'array' });
    graph = addPrefixItem(graph, graph.rootNodeId, 'string');
    graph = addAdvancedSchema(graph, graph.rootNodeId, 'contains', 'integer');
    expect(graphToSchema(graph)).toMatchObject({ prefixItems: [{ type: 'string' }], contains: { type: 'integer' } });
    graph = removeAdvancedSchema(graph, graph.rootNodeId, 'contains');
    expect(graphToSchema(graph)).not.toHaveProperty('contains');
  });

  it('resolves JSON Pointers, anchors, embedded resource ids and external resources', () => {
    const graph = schemaToGraph({
      $schema: dialect,
      $id: 'https://example.test/root',
      $defs: {
        local: { $anchor: 'named', type: 'string' },
        embedded: { $id: 'child', type: 'integer' },
      },
    });
    expect(resolveReference(graph, graph.rootNodeId, '#/$defs/local').status).toBe('resolved');
    expect(resolveReference(graph, graph.rootNodeId, '#named').status).toBe('resolved');
    expect(resolveReference(graph, graph.rootNodeId, 'child').status).toBe('resolved');
    expect(resolveReference(graph, graph.rootNodeId, 'https://remote.test/schema', {
      'https://remote.test/schema': { $id: 'https://remote.test/schema', type: 'boolean' },
    }).status).toBe('resolved');
    expect(resolveReference(graph, graph.rootNodeId, 'missing').status).toBe('unresolved');
    expect(findUnresolvedReferences(graph)).toHaveLength(0);
  });

  it('reports unresolved static and dynamic references', () => {
    const graph = schemaToGraph({ $schema: dialect, $id: 'https://example.test/root', $ref: 'missing', $dynamicRef: '#absent' });
    expect(findUnresolvedReferences(graph).map((item) => item.keyword)).toEqual(['$ref', '$dynamicRef']);
  });

  it('validates contains counts and unevaluated array items', () => {
    const graph = schemaToGraph({
      $schema: dialect,
      type: 'array',
      prefixItems: [{ type: 'string' }],
      contains: { type: 'integer' },
      minContains: 2,
      unevaluatedItems: false,
    });
    expect(validateInstance(graph, ['head', 1, 2]).valid).toBe(true);
    expect(validateInstance(graph, ['head', 1, 'extra']).valid).toBe(false);
  });

  it('validates unevaluated object properties', () => {
    const graph = schemaToGraph({
      $schema: dialect,
      type: 'object',
      properties: { known: { type: 'number' } },
      unevaluatedProperties: { type: 'string' },
    });
    expect(validateInstance(graph, { known: 1, label: 'ok' }).valid).toBe(true);
    expect(validateInstance(graph, { known: 1, label: false }).valid).toBe(false);
  });

  it('validates registered external and dynamic-anchor references', () => {
    const external = schemaToGraph({ $schema: dialect, $id: 'https://example.test/root', $ref: 'https://remote.test/value' });
    const resources = { 'https://remote.test/value': { $id: 'https://remote.test/value', type: 'string' } };
    expect(validateInstance(external, 'ok', resources).valid).toBe(true);
    expect(validateInstance(external, 4, resources).valid).toBe(false);

    const dynamic = schemaToGraph({ $schema: dialect, $id: 'https://example.test/dynamic', $dynamicRef: '#value', $defs: { value: { $dynamicAnchor: 'value', type: 'integer' } } });
    expect(validateInstance(dynamic, 3).valid).toBe(true);
    expect(validateInstance(dynamic, 'no').valid).toBe(false);
  });

  it('reports invalid MVP4 keyword shapes and contradictory contains bounds', () => {
    const result = validateSchemaDocument({
      $schema: dialect,
      $id: 4,
      $anchor: 'bad anchor',
      $dynamicRef: false,
      contains: [],
      unevaluatedItems: 1,
      minContains: 3,
      maxContains: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((item) => item.keyword)).toEqual(expect.arrayContaining(['$id', '$anchor', '$dynamicRef', 'contains', 'unevaluatedItems', 'minContains']));
  });

  it('diagnoses duplicate identifiers/anchors and unresolved references', () => {
    const result = validateSchemaDocument({
      $schema: dialect,
      $id: 'https://example.test/root',
      $anchor: 'same',
      $ref: '#missing',
      $defs: { child: { $id: 'https://example.test/root', $anchor: 'same' } },
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((item) => item.message.includes('Duplicate schema resource'))).toBe(true);
    expect(result.diagnostics.some((item) => item.message.includes('Duplicate anchor'))).toBe(true);
    expect(result.diagnostics.some((item) => item.severity === 'warning' && item.keyword === '$ref')).toBe(true);
  });

  it('keeps 2020-12 advanced keywords lossless across the supported dialect model', () => {
    const graph = schemaToGraph({ $schema: dialect, $dynamicAnchor: 'node', contains: { type: 'string' } });
    const draft07Graph = convertGraphDialect(graph, 'draft-07');
    expect(draft07Graph.dialect).toBe('http://json-schema.org/draft-07/schema#');
    expect(graphToSchema(convertGraphDialect(draft07Graph, 'draft-2020-12'))).toMatchObject({
      $schema: dialect,
      $dynamicAnchor: 'node',
      contains: { type: 'string' },
    });
  });
});
