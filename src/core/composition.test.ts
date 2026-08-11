import { describe, expect, it } from 'vitest';
import {
  addCompositionBranch,
  addDependentSchema,
  addSingleComposition,
  removeCompositionBranch,
  removeDependentSchema,
  removeSingleComposition,
  renameDependentSchema,
  setNodeKeyword,
} from './operations';
import { schemaToGraph } from './parser';
import { getNode, getOutgoingEdges } from './selectors';
import { graphToSchema } from './serializer';
import { validateInstance, validateSchemaDocument } from './validation';
import type { JsonSchema } from './model';

const compositionSchema: JsonSchema = {
  type: 'object',
  allOf: [
    { required: ['id'] },
    { properties: { id: { type: 'integer', minimum: 1 } } },
  ],
  anyOf: [{ required: ['email'] }, { required: ['phone'] }],
  oneOf: [
    { properties: { kind: { const: 'person' } }, required: ['kind'] },
    { properties: { kind: { const: 'company' } }, required: ['kind'] },
  ],
  not: { required: ['forbidden'] },
  if: { properties: { country: { const: 'US' } }, required: ['country'] },
  then: { required: ['state'] },
  else: { required: ['countryCode'] },
  dependentSchemas: {
    creditCard: { required: ['billingAddress'] },
  },
};

describe('MVP 3 parser/serializer', () => {
  it('round-trips composition and conditional applicators', () => {
    const graph = schemaToGraph(compositionSchema);
    expect(graphToSchema(graph)).toEqual(compositionSchema);
  });

  it('projects applicators to semantic graph edges with branch indexes', () => {
    const graph = schemaToGraph(compositionSchema);
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'allOf').map((edge) => edge.index)).toEqual([0, 1]);
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'anyOf')).toHaveLength(2);
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'oneOf')).toHaveLength(2);
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'not')).toHaveLength(1);
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'if')).toHaveLength(1);
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'then')).toHaveLength(1);
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'else')).toHaveLength(1);
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'dependentSchema')[0]?.key).toBe('creditCard');
  });

  it('resolves refs pointing into composition branches', () => {
    const graph = schemaToGraph({
      allOf: [{ type: 'string', minLength: 2 }],
      $defs: { Alias: { $ref: '#/allOf/0' } },
    });
    const ref = graph.edges.find((edge) => edge.relation === 'ref');
    expect(ref).toBeDefined();
    expect(getNode(graph, ref!.target)?.pointer).toBe('/allOf/0');
  });
});

describe('MVP 3 graph operations', () => {
  it('adds and removes indexed composition branches while preserving surviving node ids', () => {
    let graph = schemaToGraph({});
    graph = addCompositionBranch(graph, graph.rootNodeId, 'allOf', 'string');
    graph = addCompositionBranch(graph, graph.rootNodeId, 'allOf', 'number');

    const branches = getOutgoingEdges(graph, graph.rootNodeId, 'allOf');
    const survivingId = branches[1]!.target;
    expect(graphToSchema(graph)).toEqual({
      allOf: [{ type: 'string' }, { type: 'number' }],
    });

    graph = removeCompositionBranch(graph, graph.rootNodeId, 'allOf', 0);
    const surviving = getNode(graph, survivingId)!;
    expect(surviving.pointer).toBe('/allOf/0');
    expect(getOutgoingEdges(graph, graph.rootNodeId, 'allOf')[0]?.index).toBe(0);
    expect(graphToSchema(graph)).toEqual({ allOf: [{ type: 'number' }] });
  });

  it('rewrites local refs when a surviving branch is reindexed', () => {
    const graph = schemaToGraph({
      allOf: [{ type: 'string' }, { type: 'number' }],
      $defs: { Alias: { $ref: '#/allOf/1' } },
    });
    const next = removeCompositionBranch(graph, graph.rootNodeId, 'allOf', 0);
    expect(graphToSchema(next)).toEqual({
      allOf: [{ type: 'number' }],
      $defs: { Alias: { $ref: '#/allOf/0' } },
    });
    expect(next.edges.find((edge) => edge.relation === 'ref')?.ref).toBe('#/allOf/0');
  });

  it('adds and removes single-schema applicators', () => {
    let graph = schemaToGraph({ type: 'string' });
    graph = addSingleComposition(graph, graph.rootNodeId, 'not', 'string');
    const notNode = getOutgoingEdges(graph, graph.rootNodeId, 'not')[0]!.target;
    graph = setNodeKeyword(graph, notNode, 'const', 'blocked');
    expect(graphToSchema(graph)).toEqual({
      type: 'string',
      not: { type: 'string', const: 'blocked' },
    });

    graph = removeSingleComposition(graph, graph.rootNodeId, 'not');
    expect(graphToSchema(graph)).toEqual({ type: 'string' });
  });

  it('adds, renames and removes dependentSchemas entries', () => {
    let graph = schemaToGraph({ type: 'object' });
    graph = addDependentSchema(graph, graph.rootNodeId, 'creditCard');
    const dependentId = getOutgoingEdges(graph, graph.rootNodeId, 'dependentSchema')[0]!.target;
    graph = setNodeKeyword(graph, dependentId, 'required', ['billingAddress']);
    graph = renameDependentSchema(graph, graph.rootNodeId, 'creditCard', 'card');

    expect(getNode(graph, dependentId)?.pointer).toBe('/dependentSchemas/card');
    expect(graphToSchema(graph)).toEqual({
      type: 'object',
      dependentSchemas: { card: { required: ['billingAddress'] } },
    });

    graph = removeDependentSchema(graph, graph.rootNodeId, 'card');
    expect(graphToSchema(graph)).toEqual({ type: 'object' });
  });
});

describe('MVP 3 schema validation', () => {
  it('validates the structure of composition applicators', () => {
    const result = validateSchemaDocument({
      allOf: [],
      anyOf: [{ type: 'string' }, 12],
      oneOf: 'invalid',
      not: 42,
      dependentSchemas: { valid: {}, invalid: 1 },
    } as unknown as JsonSchema);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((item) => item.keyword)).toEqual(
      expect.arrayContaining(['allOf', 'anyOf', 'oneOf', 'not', 'dependentSchemas']),
    );
  });

  it('warns about duplicate oneOf branches and then/else without if', () => {
    const result = validateSchemaDocument({
      oneOf: [{ type: 'string' }, { type: 'string' }],
      then: { type: 'string' },
    });
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter((item) => item.severity === 'warning')).toHaveLength(2);
  });
});

describe('MVP 3 instance validation', () => {
  it('requires every allOf branch to pass', () => {
    const graph = schemaToGraph({
      allOf: [{ type: 'number', minimum: 0 }, { type: 'number', maximum: 10 }],
    });
    expect(validateInstance(graph, 5).valid).toBe(true);
    expect(validateInstance(graph, 20).diagnostics[0]?.keyword).toBe('maximum');
  });

  it('requires at least one anyOf branch to pass without leaking failed branch errors', () => {
    const graph = schemaToGraph({
      anyOf: [{ type: 'string', minLength: 3 }, { type: 'integer', minimum: 10 }],
    });
    expect(validateInstance(graph, 'hello').valid).toBe(true);
    expect(validateInstance(graph, 12).valid).toBe(true);
    const invalid = validateInstance(graph, false);
    expect(invalid.diagnostics).toHaveLength(1);
    expect(invalid.diagnostics[0]?.keyword).toBe('anyOf');
  });

  it('requires exactly one oneOf branch to pass', () => {
    const graph = schemaToGraph({
      oneOf: [{ type: 'number' }, { type: 'number', minimum: 0 }],
    });
    expect(validateInstance(graph, -1).valid).toBe(true);
    const ambiguous = validateInstance(graph, 1);
    expect(ambiguous.valid).toBe(false);
    expect(ambiguous.diagnostics[0]?.keyword).toBe('oneOf');
    expect(ambiguous.diagnostics[0]?.message).toContain('matched 2');
  });

  it('enforces not', () => {
    const graph = schemaToGraph({ not: { type: 'string' } });
    expect(validateInstance(graph, 3).valid).toBe(true);
    expect(validateInstance(graph, 'blocked').diagnostics[0]?.keyword).toBe('not');
  });

  it('evaluates if silently and applies only then or else', () => {
    const graph = schemaToGraph({
      type: 'object',
      if: {
        properties: { country: { const: 'US' } },
        required: ['country'],
      },
      then: {
        properties: { postal: { type: 'string', pattern: '^\\d{5}$' } },
        required: ['postal'],
      },
      else: {
        properties: { postal: { type: 'string', minLength: 3 } },
        required: ['postal'],
      },
    });

    expect(validateInstance(graph, { country: 'US', postal: '12345' }).valid).toBe(true);
    expect(validateInstance(graph, { country: 'IT', postal: '001' }).valid).toBe(true);

    const invalidUs = validateInstance(graph, { country: 'US', postal: 'ABC' });
    expect(invalidUs.diagnostics.map((item) => item.keyword)).toEqual(['pattern']);

    const invalidIt = validateInstance(graph, { country: 'IT', postal: 'x' });
    expect(invalidIt.diagnostics.map((item) => item.keyword)).toEqual(['minLength']);
  });

  it('applies dependentSchemas to the whole object when the triggering property exists', () => {
    const graph = schemaToGraph({
      type: 'object',
      dependentSchemas: {
        creditCard: { required: ['billingAddress'] },
      },
    });

    expect(validateInstance(graph, {}).valid).toBe(true);
    expect(validateInstance(graph, { creditCard: '123', billingAddress: 'Rome' }).valid).toBe(true);
    const invalid = validateInstance(graph, { creditCard: '123' });
    expect(invalid.diagnostics[0]?.keyword).toBe('required');
    expect(invalid.diagnostics[0]?.instancePath).toBe('/billingAddress');
  });
});
