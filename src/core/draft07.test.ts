import { describe, expect, it } from 'vitest';
import {
  DRAFT_07_DIALECT,
  DRAFT_2020_12_DIALECT,
  addDefinition,
  addDependentSchema,
  convertGraphDialect,
  dialectDescriptor,
  schemaToGraph,
  supportedDialectId,
} from './index';
import { getNode, getOutgoingEdges } from './selectors';
import { graphToSchema } from './serializer';
import { validateInstance, validateSchemaDocument } from './validation';
import type { JsonSchema } from './model';

const draft07Schema: JsonSchema = {
  $schema: DRAFT_07_DIALECT,
  type: 'object',
  properties: {
    name: { type: 'string' },
    address: { $ref: '#/definitions/Address' },
  },
  definitions: {
    Address: {
      type: 'object',
      required: ['city'],
      properties: { city: { type: 'string' } },
    },
  },
  dependencies: {
    name: ['address'],
    address: { required: ['name'] },
  },
};

describe('Draft-07 dialect detection and round-trip', () => {
  it('detects the official Draft-07 URI and uses dialect-specific containers', () => {
    const graph = schemaToGraph(draft07Schema);
    expect(supportedDialectId(graph.dialect)).toBe('draft-07');
    expect(supportedDialectId('https://json-schema.org/draft-07/schema')).toBe('draft-07');
    expect(dialectDescriptor(graph.dialect).definitionsKeyword).toBe('definitions');
    expect(dialectDescriptor(graph.dialect).dependentSchemasKeyword).toBe('dependencies');
    expect(graphToSchema(graph)).toEqual(draft07Schema);
  });

  it('maps definitions and schema dependencies to semantic edges', () => {
    const graph = schemaToGraph(draft07Schema);
    const definition = getOutgoingEdges(graph, graph.rootNodeId, 'definition')[0]!;
    expect(definition.key).toBe('Address');
    expect(getNode(graph, definition.target)?.pointer).toBe('/definitions/Address');

    const dependency = getOutgoingEdges(graph, graph.rootNodeId, 'dependentSchema')[0]!;
    expect(dependency.key).toBe('address');
    expect(getNode(graph, dependency.target)?.pointer).toBe('/dependencies/address');

    const root = getNode(graph, graph.rootNodeId)!;
    expect(root.keywords.dependencies).toEqual({ name: ['address'] });
  });

  it('round-trips tuple items and additionalItems through semantic item edges', () => {
    const schema: JsonSchema = {
      $schema: DRAFT_07_DIALECT,
      type: 'array',
      items: [{ type: 'string' }, { type: 'integer' }],
      additionalItems: false,
    };
    const graph = schemaToGraph(schema);
    const prefix = getOutgoingEdges(graph, graph.rootNodeId, 'prefixItem');
    expect(prefix.map((edge) => edge.index)).toEqual([0, 1]);
    expect(getNode(graph, prefix[0]!.target)?.pointer).toBe('/items/0');
    expect(getNode(graph, getOutgoingEdges(graph, graph.rootNodeId, 'items')[0]!.target)?.pointer).toBe('/additionalItems');
    expect(graphToSchema(graph)).toEqual(schema);
  });
});

describe('Draft-07 validation semantics', () => {
  it('validates tuple items and rejects additional items when additionalItems is false', () => {
    const graph = schemaToGraph({
      $schema: DRAFT_07_DIALECT,
      type: 'array',
      items: [{ type: 'string' }, { type: 'integer' }],
      additionalItems: false,
    });
    expect(validateInstance(graph, ['ok', 2]).valid).toBe(true);
    expect(validateInstance(graph, ['ok', 2, true]).valid).toBe(false);
    expect(validateInstance(graph, ['ok', 'wrong']).diagnostics[0]?.keyword).toBe('type');
  });

  it('supports both property and schema forms of dependencies', () => {
    const graph = schemaToGraph(draft07Schema);
    expect(validateInstance(graph, {}).valid).toBe(true);
    const missingPropertyDependency = validateInstance(graph, { name: 'Ada' });
    expect(missingPropertyDependency.valid).toBe(false);
    expect(missingPropertyDependency.diagnostics[0]?.keyword).toBe('dependencies');
    expect(missingPropertyDependency.diagnostics[0]?.instancePath).toBe('/address');

    const missingSchemaDependency = validateInstance(graph, {
      address: { city: 'Rome' },
    });
    expect(missingSchemaDependency.valid).toBe(false);
    expect(missingSchemaDependency.diagnostics[0]?.keyword).toBe('required');
  });

  it('ignores sibling keywords of $ref in Draft-07 but not in 2020-12', () => {
    const draft07 = schemaToGraph({
      $schema: DRAFT_07_DIALECT,
      definitions: { Text: { type: 'string' } },
      $ref: '#/definitions/Text',
      minLength: 10,
    });
    expect(validateInstance(draft07, 'short').valid).toBe(true);

    const modern = schemaToGraph({
      $schema: DRAFT_2020_12_DIALECT,
      $defs: { Text: { type: 'string' } },
      $ref: '#/$defs/Text',
      minLength: 10,
    });
    expect(validateInstance(modern, 'short').valid).toBe(false);
    expect(validateInstance(modern, 'short').diagnostics[0]?.keyword).toBe('minLength');
  });

  it('validates Draft-07 structural syntax for definitions, tuple items and dependencies', () => {
    expect(validateSchemaDocument({
      $schema: DRAFT_07_DIALECT,
      definitions: { A: { type: 'string' } },
      items: [{ type: 'string' }, false],
      additionalItems: { type: 'number' },
      dependencies: {
        a: ['b', 'c'],
        d: { required: ['e'] },
      },
    }).valid).toBe(true);

    const invalid = validateSchemaDocument({
      $schema: DRAFT_07_DIALECT,
      items: [{ type: 'string' }, 3],
      additionalItems: 4,
      dependencies: { a: ['b', 'b'], d: 1 },
    } as unknown as JsonSchema);
    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics.map((item) => item.keyword)).toEqual(
      expect.arrayContaining(['items', 'additionalItems', 'dependencies']),
    );
  });
});

describe('Dialect conversion', () => {
  it('converts Draft 2020-12 definitions and dependencies to Draft-07 and rewrites refs', () => {
    const modern = schemaToGraph({
      $schema: DRAFT_2020_12_DIALECT,
      type: 'object',
      properties: { item: { $ref: '#/$defs/Item' } },
      $defs: { Item: { type: 'string' } },
      dependentRequired: { a: ['b'] },
      dependentSchemas: { token: { required: ['verified'] } },
    });
    const itemDefinitionId = getOutgoingEdges(modern, modern.rootNodeId, 'definition')[0]!.target;

    const draft07 = convertGraphDialect(modern, 'draft-07');
    expect(draft07.dialect).toBe(DRAFT_07_DIALECT);
    expect(getNode(draft07, itemDefinitionId)?.pointer).toBe('/definitions/Item');
    expect(graphToSchema(draft07)).toEqual({
      $schema: DRAFT_07_DIALECT,
      type: 'object',
      properties: { item: { $ref: '#/definitions/Item' } },
      definitions: { Item: { type: 'string' } },
      dependencies: {
        a: ['b'],
        token: { required: ['verified'] },
      },
    });
  });

  it('preserves both 2020-12 dependency forms when they share the same trigger', () => {
    const modern = schemaToGraph({
      $schema: DRAFT_2020_12_DIALECT,
      type: 'object',
      dependentRequired: { card: ['billingAddress'] },
      dependentSchemas: { card: { required: ['securityCode'] } },
    });

    const draft07 = convertGraphDialect(modern, 'draft-07');
    expect(graphToSchema(draft07)).toEqual({
      $schema: DRAFT_07_DIALECT,
      type: 'object',
      dependencies: {
        card: {
          allOf: [
            { required: ['securityCode'] },
            { required: ['billingAddress'] },
          ],
        },
      },
    });

    expect(validateInstance(draft07, {
      card: true,
      billingAddress: 'Rome',
      securityCode: '123',
    }).valid).toBe(true);
    expect(validateInstance(draft07, { card: true, securityCode: '123' }).valid).toBe(false);
    expect(validateInstance(draft07, { card: true, billingAddress: 'Rome' }).valid).toBe(false);
  });

  it('converts Draft-07 tuple items to 2020-12 prefixItems/items without changing node ids', () => {
    const draft07 = schemaToGraph({
      $schema: DRAFT_07_DIALECT,
      type: 'array',
      items: [{ type: 'string' }, { type: 'integer' }],
      additionalItems: { type: 'boolean' },
    });
    const prefixId = getOutgoingEdges(draft07, draft07.rootNodeId, 'prefixItem')[0]!.target;
    const restId = getOutgoingEdges(draft07, draft07.rootNodeId, 'items')[0]!.target;

    const modern = convertGraphDialect(draft07, 'draft-2020-12');
    expect(getNode(modern, prefixId)?.pointer).toBe('/prefixItems/0');
    expect(getNode(modern, restId)?.pointer).toBe('/items');
    expect(graphToSchema(modern)).toEqual({
      $schema: DRAFT_2020_12_DIALECT,
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'integer' }],
      items: { type: 'boolean' },
    });
  });

  it('uses dialect-specific pointers for newly created definitions and schema dependencies', () => {
    let graph = schemaToGraph({ $schema: DRAFT_07_DIALECT, type: 'object' });
    graph = addDefinition(graph, graph.rootNodeId, 'Address', 'object');
    graph = addDependentSchema(graph, graph.rootNodeId, 'card', 'object');

    const definition = getOutgoingEdges(graph, graph.rootNodeId, 'definition')[0]!;
    const dependency = getOutgoingEdges(graph, graph.rootNodeId, 'dependentSchema')[0]!;
    expect(getNode(graph, definition.target)?.pointer).toBe('/definitions/Address');
    expect(getNode(graph, dependency.target)?.pointer).toBe('/dependencies/card');
    expect(graphToSchema(graph)).toEqual({
      $schema: DRAFT_07_DIALECT,
      type: 'object',
      definitions: { Address: { type: 'object' } },
      dependencies: { card: { type: 'object' } },
    });
  });
});
