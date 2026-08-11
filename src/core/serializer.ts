import type {
  ArrayCompositionRelation,
  JsonSchema,
  SchemaGraph,
  SchemaNode,
  SingleCompositionRelation,
} from './model';
import { dialectDescriptor } from './dialect';

const ARRAY_APPLICATORS: ArrayCompositionRelation[] = ['allOf', 'anyOf', 'oneOf'];
const SINGLE_APPLICATORS: SingleCompositionRelation[] = ['not', 'if', 'then', 'else'];

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {};
}

export function graphToSchema(graph: SchemaGraph): JsonSchema {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const dialect = dialectDescriptor(graph.dialect);
  const draft07 = dialect.id === 'draft-07';

  function serialize(node: SchemaNode): JsonSchema {
    if (node.kind === 'boolean-schema') {
      return node.booleanValue ?? true;
    }

    const result: Record<string, unknown> = structuredClone(node.keywords);
    const outgoing = graph.edges.filter(
      (edge) => edge.source === node.id && edge.relation !== 'ref',
    );

    const propertyEdges = outgoing.filter((edge) => edge.relation === 'property');
    if (node.structuralPresence.properties || propertyEdges.length > 0) {
      const properties: Record<string, JsonSchema> = {};
      for (const edge of propertyEdges) {
        if (!edge.key) continue;
        const child = nodeById.get(edge.target);
        if (!child) continue;
        properties[edge.key] = serialize(child);
      }
      result.properties = properties;
    }

    const prefixItemEdges = outgoing
      .filter((edge) => edge.relation === 'prefixItem')
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    const itemsEdge = outgoing.find((edge) => edge.relation === 'items');

    if (draft07) {
      if (node.structuralPresence.prefixItems || prefixItemEdges.length > 0) {
        result.items = prefixItemEdges
          .map((edge) => nodeById.get(edge.target))
          .filter((child): child is SchemaNode => Boolean(child))
          .map(serialize);
        if (itemsEdge) {
          const child = nodeById.get(itemsEdge.target);
          if (child) result.additionalItems = serialize(child);
        }
      } else if (node.structuralPresence.items || itemsEdge) {
        if (itemsEdge) {
          const child = nodeById.get(itemsEdge.target);
          if (child) result.items = serialize(child);
        }
      }
    } else {
      if (node.structuralPresence.prefixItems || prefixItemEdges.length > 0) {
        result.prefixItems = prefixItemEdges
          .map((edge) => nodeById.get(edge.target))
          .filter((child): child is SchemaNode => Boolean(child))
          .map(serialize);
      }
      if (node.structuralPresence.items || itemsEdge) {
        if (itemsEdge) {
          const child = nodeById.get(itemsEdge.target);
          if (child) result.items = serialize(child);
        }
      }
    }

    const definitionEdges = outgoing.filter((edge) => edge.relation === 'definition');
    if (node.structuralPresence.defs || definitionEdges.length > 0) {
      const definitions: Record<string, JsonSchema> = {};
      for (const edge of definitionEdges) {
        if (!edge.key) continue;
        const child = nodeById.get(edge.target);
        if (!child) continue;
        definitions[edge.key] = serialize(child);
      }
      result[dialect.definitionsKeyword] = definitions;
    }

    for (const relation of ARRAY_APPLICATORS) {
      const relationEdges = outgoing
        .filter((edge) => edge.relation === relation)
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
      if (node.structuralPresence[relation] || relationEdges.length > 0) {
        result[relation] = relationEdges
          .map((edge) => nodeById.get(edge.target))
          .filter((child): child is SchemaNode => Boolean(child))
          .map(serialize);
      }
    }

    for (const relation of SINGLE_APPLICATORS) {
      const relationEdge = outgoing.find((edge) => edge.relation === relation);
      if (node.structuralPresence[relation] || relationEdge) {
        const child = relationEdge ? nodeById.get(relationEdge.target) : undefined;
        if (child) result[relation] = serialize(child);
      }
    }

    const dependentSchemaEdges = outgoing.filter(
      (edge) => edge.relation === 'dependentSchema',
    );
    if (node.structuralPresence.dependentSchemas || dependentSchemaEdges.length > 0) {
      if (draft07) {
        // Preserve property-dependency arrays that remained in node.keywords.dependencies.
        const dependencies = objectValue(result.dependencies);
        for (const edge of dependentSchemaEdges) {
          if (!edge.key) continue;
          const child = nodeById.get(edge.target);
          if (!child) continue;
          const schemaDependency = serialize(child);
          const propertyDependency = dependencies[edge.key];
          if (
            Array.isArray(propertyDependency) &&
            propertyDependency.every((item) => typeof item === 'string')
          ) {
            // Draft-07 has only one dependency value per trigger. When a 2020-12
            // graph contains both dependentRequired and dependentSchemas for the
            // same trigger, preserve both semantics by composing them into the
            // schema form of dependencies.
            dependencies[edge.key] = {
              allOf: [schemaDependency, { required: [...propertyDependency] }],
            };
          } else {
            dependencies[edge.key] = schemaDependency;
          }
        }
        result.dependencies = dependencies;
      } else {
        const dependentSchemas: Record<string, JsonSchema> = {};
        for (const edge of dependentSchemaEdges) {
          if (!edge.key) continue;
          const child = nodeById.get(edge.target);
          if (!child) continue;
          dependentSchemas[edge.key] = serialize(child);
        }
        result.dependentSchemas = dependentSchemas;
      }
    }

    return result;
  }

  const root = nodeById.get(graph.rootNodeId);
  if (!root) throw new Error(`Root node ${graph.rootNodeId} not found`);
  return serialize(root);
}

export function graphToJson(graph: SchemaGraph, spaces = 2): string {
  return JSON.stringify(graphToSchema(graph), null, spaces);
}
