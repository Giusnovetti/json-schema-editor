import {
  DEFAULT_DIALECT,
  type ArrayCompositionRelation,
  type JsonSchema,
  type SchemaEdge,
  type SchemaGraph,
  type SchemaNode,
  type SingleCompositionRelation,
} from './model';
import {
  dialectDescriptor,
  dialectForSchema,
  isDraft07Dialect,
} from './dialect';
import { appendPointer, edgeId, localRefToPointer, nodeIdForPointer } from './pointer';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'boolean' || isObject(value);
}

function isSchemaArray(value: unknown): value is JsonSchema[] {
  return Array.isArray(value) && value.every(isSchema);
}

function isSchemaMap(value: unknown): value is Record<string, JsonSchema> {
  return isObject(value) && Object.values(value).every(isSchema);
}

function cloneObject(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value);
}

function schemaEntries(value: unknown): Array<[string, JsonSchema]> {
  if (!isObject(value)) return [];
  return Object.entries(value).filter((entry): entry is [string, JsonSchema] => isSchema(entry[1]));
}

const ARRAY_APPLICATORS: ArrayCompositionRelation[] = ['allOf', 'anyOf', 'oneOf'];
const SINGLE_APPLICATORS: SingleCompositionRelation[] = ['not', 'if', 'then', 'else'];

export function schemaToGraph(schema: JsonSchema): SchemaGraph {
  const nodes: SchemaNode[] = [];
  const edges: SchemaEdge[] = [];
  const pointerToNode = new Map<string, SchemaNode>();
  const rootDialect = dialectForSchema(schema);
  const draft07 = rootDialect.id === 'draft-07';
  const definitionsKeyword = rootDialect.definitionsKeyword;
  const dependentSchemasKeyword = rootDialect.dependentSchemasKeyword;

  function visit(value: JsonSchema, pointer: string): SchemaNode {
    const existing = pointerToNode.get(pointer);
    if (existing) return existing;

    if (typeof value === 'boolean') {
      const node: SchemaNode = {
        id: nodeIdForPointer(pointer),
        pointer,
        kind: 'boolean-schema',
        booleanValue: value,
        keywords: {},
        structuralPresence: { properties: false, items: false, prefixItems: false, defs: false },
      };
      nodes.push(node);
      pointerToNode.set(pointer, node);
      return node;
    }

    const keywords = cloneObject(value);
    const propertiesValue = value.properties;
    const defsValue = value[definitionsKeyword];
    const itemsValue = value.items;
    const prefixItemsValue = draft07 ? undefined : value.prefixItems;
    const additionalItemsValue = draft07 ? value.additionalItems : undefined;
    const dependentSchemasValue = value[dependentSchemasKeyword];

    const hasProperties = isSchemaMap(propertiesValue);
    const hasDefs = isSchemaMap(defsValue);
    const hasSchemaItems = isSchema(itemsValue);
    const hasTupleItems = draft07 && isSchemaArray(itemsValue);
    const hasPrefixItems = !draft07 && isSchemaArray(prefixItemsValue);
    const hasAdditionalItemsSchema = draft07 && hasTupleItems && isSchema(additionalItemsValue);

    // Draft-07 dependencies can mix schema dependencies and property dependency arrays.
    // Extract only schema-valued entries; preserve all other entries in node.keywords.
    const dependentSchemaEntries = schemaEntries(dependentSchemasValue);
    const hasDependentSchemas = dependentSchemaEntries.length > 0;

    const arrayApplicators = Object.fromEntries(
      ARRAY_APPLICATORS.map((relation) => [relation, isSchemaArray(value[relation])]),
    ) as Record<ArrayCompositionRelation, boolean>;
    const singleApplicators = Object.fromEntries(
      SINGLE_APPLICATORS.map((relation) => [relation, isSchema(value[relation])]),
    ) as Record<SingleCompositionRelation, boolean>;

    if (hasProperties) delete keywords.properties;
    if (hasDefs) delete keywords[definitionsKeyword];
    if (hasSchemaItems || hasTupleItems) delete keywords.items;
    if (hasPrefixItems) delete keywords.prefixItems;
    if (hasAdditionalItemsSchema) delete keywords.additionalItems;

    if (hasDependentSchemas && isObject(dependentSchemasValue)) {
      const remaining = cloneObject(dependentSchemasValue);
      for (const [name] of dependentSchemaEntries) delete remaining[name];
      if (Object.keys(remaining).length === 0) delete keywords[dependentSchemasKeyword];
      else keywords[dependentSchemasKeyword] = remaining;
    }

    for (const relation of ARRAY_APPLICATORS) {
      if (arrayApplicators[relation]) delete keywords[relation];
    }
    for (const relation of SINGLE_APPLICATORS) {
      if (singleApplicators[relation]) delete keywords[relation];
    }

    const node: SchemaNode = {
      id: nodeIdForPointer(pointer),
      pointer,
      kind: 'schema',
      keywords,
      structuralPresence: {
        properties: hasProperties,
        items: hasSchemaItems || hasAdditionalItemsSchema,
        prefixItems: hasTupleItems || hasPrefixItems,
        defs: hasDefs,
        allOf: arrayApplicators.allOf,
        anyOf: arrayApplicators.anyOf,
        oneOf: arrayApplicators.oneOf,
        not: singleApplicators.not,
        if: singleApplicators.if,
        then: singleApplicators.then,
        else: singleApplicators.else,
        dependentSchemas: hasDependentSchemas,
      },
    };

    nodes.push(node);
    pointerToNode.set(pointer, node);

    if (hasProperties) {
      for (const [propertyName, propertySchema] of Object.entries(propertiesValue)) {
        const child = visit(propertySchema, appendPointer(pointer, 'properties', propertyName));
        edges.push({
          id: edgeId(node.id, 'property', child.id, propertyName),
          source: node.id,
          target: child.id,
          relation: 'property',
          key: propertyName,
        });
      }
    }

    const positionalItems = hasTupleItems
      ? (itemsValue as JsonSchema[])
      : hasPrefixItems
        ? (prefixItemsValue as JsonSchema[])
        : undefined;
    if (positionalItems) {
      const containerKeyword = draft07 ? 'items' : 'prefixItems';
      positionalItems.forEach((itemSchema, index) => {
        const child = visit(itemSchema, appendPointer(pointer, containerKeyword, String(index)));
        edges.push({
          id: edgeId(node.id, 'prefixItem', child.id, String(index)),
          source: node.id,
          target: child.id,
          relation: 'prefixItem',
          index,
        });
      });
    }

    if (hasSchemaItems) {
      const child = visit(itemsValue, appendPointer(pointer, 'items'));
      edges.push({
        id: edgeId(node.id, 'items', child.id),
        source: node.id,
        target: child.id,
        relation: 'items',
      });
    } else if (hasAdditionalItemsSchema) {
      const child = visit(additionalItemsValue as JsonSchema, appendPointer(pointer, 'additionalItems'));
      edges.push({
        id: edgeId(node.id, 'items', child.id),
        source: node.id,
        target: child.id,
        relation: 'items',
      });
    }

    if (hasDefs) {
      for (const [definitionName, definitionSchema] of Object.entries(defsValue)) {
        const child = visit(
          definitionSchema,
          appendPointer(pointer, definitionsKeyword, definitionName),
        );
        edges.push({
          id: edgeId(node.id, 'definition', child.id, definitionName),
          source: node.id,
          target: child.id,
          relation: 'definition',
          key: definitionName,
        });
      }
    }

    for (const relation of ARRAY_APPLICATORS) {
      if (!arrayApplicators[relation]) continue;
      const schemas = value[relation] as JsonSchema[];
      schemas.forEach((childSchema, index) => {
        const child = visit(childSchema, appendPointer(pointer, relation, String(index)));
        edges.push({
          id: edgeId(node.id, relation, child.id, String(index)),
          source: node.id,
          target: child.id,
          relation,
          index,
        });
      });
    }

    for (const relation of SINGLE_APPLICATORS) {
      if (!singleApplicators[relation]) continue;
      const child = visit(value[relation] as JsonSchema, appendPointer(pointer, relation));
      edges.push({
        id: edgeId(node.id, relation, child.id),
        source: node.id,
        target: child.id,
        relation,
      });
    }

    if (hasDependentSchemas) {
      for (const [propertyName, dependentSchema] of dependentSchemaEntries) {
        const child = visit(
          dependentSchema,
          appendPointer(pointer, dependentSchemasKeyword, propertyName),
        );
        edges.push({
          id: edgeId(node.id, 'dependentSchema', child.id, propertyName),
          source: node.id,
          target: child.id,
          relation: 'dependentSchema',
          key: propertyName,
        });
      }
    }

    return node;
  }

  const root = visit(schema, '');

  // Resolve local JSON Pointer refs after every structural subschema has been indexed.
  for (const node of nodes) {
    const ref = node.keywords.$ref;
    if (typeof ref !== 'string') continue;
    const pointer = localRefToPointer(ref);
    if (pointer === undefined) continue;
    const target = pointerToNode.get(pointer);
    if (!target) continue;
    edges.push({
      id: edgeId(node.id, 'ref', target.id, ref),
      source: node.id,
      target: target.id,
      relation: 'ref',
      ref,
    });
  }

  const rootObject = typeof schema === 'boolean' ? undefined : schema;
  const dialect = typeof rootObject?.$schema === 'string'
    ? rootObject.$schema
    : rootDialect.uri ?? DEFAULT_DIALECT;

  // Keep arbitrary $schema strings for lossless source round-trip, but supported
  // dialect behavior is classified by dialectDescriptor()/isDraft07Dialect().
  void dialectDescriptor(dialect);
  void isDraft07Dialect(dialect);

  return {
    dialect,
    rootNodeId: root.id,
    nodes,
    edges,
  };
}
