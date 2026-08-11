import { describe, expect, it } from 'vitest';
import { schemaToGraph } from './parser';
import { validateInstance, validateSchemaDocument } from './validation';

describe('validateSchemaDocument', () => {
  it('accepts a valid MVP 2 schema', () => {
    const result = validateSchemaDocument({
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', minLength: 3, format: 'email' },
        age: { type: 'integer', minimum: 0, maximum: 130 },
        role: { enum: ['admin', 'user'] },
      },
    });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects invalid non-negative integer constraints', () => {
    const result = validateSchemaDocument({ type: 'string', minLength: -1 });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.keyword).toBe('minLength');
  });

  it('associates keyword diagnostics with their schema node', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string', minLength: 1 } } });
    const nameNode = graph.nodes.find((node) => node.pointer === '/properties/name')!;
    const result = validateSchemaDocument({
      properties: { name: { type: 'string', minLength: -1 } },
    });
    expect(result.diagnostics[0]?.schemaPath).toBe('/properties/name/minLength');
    expect(result.diagnostics[0]?.nodeId).toBe(nameNode.id);
  });

  it('rejects non-positive multipleOf', () => {
    const result = validateSchemaDocument({ type: 'number', multipleOf: 0 });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.keyword).toBe('multipleOf');
  });

  it('rejects malformed regular expressions', () => {
    const result = validateSchemaDocument({ type: 'string', pattern: '[' });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.keyword).toBe('pattern');
  });

  it('rejects invalid type declarations', () => {
    const result = validateSchemaDocument({ type: 'decimal' });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.schemaPath).toBe('/type');
  });

  it('rejects duplicate required entries', () => {
    const result = validateSchemaDocument({ required: ['name', 'name'] });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.keyword).toBe('required');
  });

  it('rejects empty or duplicate enum values', () => {
    expect(validateSchemaDocument({ enum: [] }).valid).toBe(false);
    const duplicate = validateSchemaDocument({ enum: [{ a: 1 }, { a: 1 }] });
    expect(duplicate.valid).toBe(false);
    expect(duplicate.diagnostics[0]?.keyword).toBe('enum');
  });

  it('rejects invalid structural subschemas without throwing', () => {
    const result = validateSchemaDocument({
      properties: { valid: { type: 'string' }, invalid: 42 },
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.schemaPath).toBe('/properties/invalid');
  });

  it('emits warnings for contradictory length bounds without marking schema invalid', () => {
    const result = validateSchemaDocument({ minLength: 10, maxLength: 2 });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe('warning');
  });
});

describe('validateInstance type and scalar constraints', () => {
  it('validates required, type, string length, number bounds, enum and const', () => {
    const graph = schemaToGraph({
      type: 'object',
      required: ['name', 'age'],
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 8 },
        age: { type: 'integer', minimum: 0, maximum: 120 },
        role: { enum: ['admin', 'user'] },
        version: { const: 2 },
      },
    });

    const valid = validateInstance(graph, {
      name: 'Mario',
      age: 42,
      role: 'admin',
      version: 2,
    });
    expect(valid.valid).toBe(true);

    const invalid = validateInstance(graph, {
      name: 'Al',
      age: -1,
      role: 'guest',
      version: 1,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics.map((item) => item.keyword)).toEqual([
      'minLength',
      'minimum',
      'enum',
      'const',
    ]);
  });

  it('reports missing required properties at their instance pointer', () => {
    const graph = schemaToGraph({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    });
    const result = validateInstance(graph, {});
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.instancePath).toBe('/name');
    expect(result.diagnostics[0]?.nodeId).toBe(graph.rootNodeId);
  });

  it('supports exclusive numeric bounds and multipleOf with decimal values', () => {
    const graph = schemaToGraph({
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
      multipleOf: 0.1,
    });
    expect(validateInstance(graph, 0.3).valid).toBe(true);
    expect(validateInstance(graph, 0).diagnostics[0]?.keyword).toBe('exclusiveMinimum');
    expect(validateInstance(graph, 1).diagnostics[0]?.keyword).toBe('exclusiveMaximum');
    expect(validateInstance(graph, 0.35).diagnostics[0]?.keyword).toBe('multipleOf');
  });

  it('counts Unicode code points for string lengths', () => {
    const graph = schemaToGraph({ type: 'string', maxLength: 1 });
    expect(validateInstance(graph, '😀').valid).toBe(true);
    expect(validateInstance(graph, '😀a').valid).toBe(false);
  });

  it('validates pattern', () => {
    const graph = schemaToGraph({ type: 'string', pattern: '^[A-Z]{2}$' });
    expect(validateInstance(graph, 'IT').valid).toBe(true);
    expect(validateInstance(graph, 'Italy').diagnostics[0]?.keyword).toBe('pattern');
  });
});

describe('validateInstance formats', () => {
  it('validates email, date, date-time and UUID formats', () => {
    const cases: Array<[string, string, string]> = [
      ['email', 'mario@example.com', 'not-an-email'],
      ['date', '2026-08-11', '2026-02-30'],
      ['date-time', '2026-08-11T12:30:00Z', '2026-08-11 12:30:00'],
      ['uuid', '123e4567-e89b-42d3-a456-426614174000', '1234'],
    ];
    for (const [format, good, bad] of cases) {
      const graph = schemaToGraph({ type: 'string', format });
      expect(validateInstance(graph, good).valid).toBe(true);
      expect(validateInstance(graph, bad).diagnostics[0]?.keyword).toBe('format');
    }
  });

  it('ignores unknown formats instead of rejecting instances', () => {
    const graph = schemaToGraph({ type: 'string', format: 'my-company-id' });
    expect(validateInstance(graph, 'anything').valid).toBe(true);
  });
});

describe('validateInstance arrays and objects', () => {
  it('validates array size, uniqueness and items', () => {
    const graph = schemaToGraph({
      type: 'array',
      minItems: 2,
      maxItems: 3,
      uniqueItems: true,
      items: { type: 'integer', minimum: 0 },
    });
    expect(validateInstance(graph, [1, 2]).valid).toBe(true);

    const duplicate = validateInstance(graph, [1, 1]);
    expect(duplicate.diagnostics.some((item) => item.keyword === 'uniqueItems')).toBe(true);

    const badItem = validateInstance(graph, [1, -2]);
    expect(badItem.diagnostics[0]?.instancePath).toBe('/1');
    expect(badItem.diagnostics[0]?.keyword).toBe('minimum');
  });

  it('validates minProperties and maxProperties', () => {
    const graph = schemaToGraph({ type: 'object', minProperties: 1, maxProperties: 2 });
    expect(validateInstance(graph, { a: 1 }).valid).toBe(true);
    expect(validateInstance(graph, {}).diagnostics[0]?.keyword).toBe('minProperties');
    expect(validateInstance(graph, { a: 1, b: 2, c: 3 }).diagnostics[0]?.keyword).toBe('maxProperties');
  });

  it('uses structural properties even when object type is omitted', () => {
    const graph = schemaToGraph({
      properties: { name: { minLength: 2 } },
    });
    expect(validateInstance(graph, { name: 'x' }).diagnostics[0]?.keyword).toBe('minLength');
  });
});

describe('validateInstance refs and boolean schemas', () => {
  it('validates through resolved local $ref edges', () => {
    const graph = schemaToGraph({
      $defs: { Positive: { type: 'number', exclusiveMinimum: 0 } },
      properties: { amount: { $ref: '#/$defs/Positive' } },
    });
    expect(validateInstance(graph, { amount: 5 }).valid).toBe(true);
    const invalid = validateInstance(graph, { amount: 0 });
    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics[0]?.schemaPath).toBe('/$defs/Positive');
    expect(invalid.diagnostics[0]?.instancePath).toBe('/amount');
  });

  it('does not loop forever on recursive refs', () => {
    const graph = schemaToGraph({
      type: 'object',
      properties: { child: { $ref: '#' } },
    });
    expect(validateInstance(graph, { child: { child: {} } }).valid).toBe(true);
  });

  it('reports unresolved local refs during instance validation', () => {
    const graph = schemaToGraph({ $ref: '#/$defs/Missing' });
    const result = validateInstance(graph, {});
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.keyword).toBe('$ref');
  });

  it('enforces false schemas and accepts true schemas', () => {
    expect(validateInstance(schemaToGraph(true), { any: 'value' }).valid).toBe(true);
    expect(validateInstance(schemaToGraph(false), 1).valid).toBe(false);
  });
});
