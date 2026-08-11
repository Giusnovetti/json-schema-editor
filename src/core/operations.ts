import type {
  ArrayCompositionRelation,
  JsonSchemaPrimitiveType,
  SchemaEdge,
  SchemaGraph,
  SchemaNode,
  SchemaRelation,
  SingleCompositionRelation,
} from './model';
import { dialectDescriptor } from './dialect';
import {
  appendPointer,
  edgeId,
  localRefToPointer,
  nodeIdForPointer,
  pointerToLocalRef,
  replacePointerPrefix,
} from './pointer';

function updateNode(
  graph: SchemaGraph,
  nodeId: string,
  updater: (node: SchemaNode) => SchemaNode,
): SchemaGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

type KeyedRelation = Extract<SchemaRelation, 'property' | 'definition' | 'dependentSchema'>;

function keyedEdge(
  graph: SchemaGraph,
  parentNodeId: string,
  relation: KeyedRelation,
  key: string,
): SchemaEdge | undefined {
  return graph.edges.find(
    (edge) =>
      edge.source === parentNodeId &&
      edge.relation === relation &&
      edge.key === key,
  );
}

function collectStructuralSubtreeIds(graph: SchemaGraph, rootNodeId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [rootNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (ids.has(nodeId)) continue;
    ids.add(nodeId);

    for (const edge of graph.edges) {
      if (edge.source === nodeId && edge.relation !== 'ref') {
        queue.push(edge.target);
      }
    }
  }

  return ids;
}

function nextRequiredAfterRename(
  required: unknown,
  previousName: string,
  nextName: string,
): unknown {
  if (!Array.isArray(required)) return required;
  const values = required.map((value) => (value === previousName ? nextName : value));
  return Array.from(new Set(values));
}

function nextRequiredAfterDelete(required: unknown, propertyName: string): unknown {
  if (!Array.isArray(required)) return required;
  const values = required.filter((value) => value !== propertyName);
  return values.length > 0 ? values : undefined;
}

function rewriteLocalRef(
  ref: unknown,
  previousPointer: string,
  nextPointer: string,
): unknown {
  if (typeof ref !== 'string') return ref;
  const pointer = localRefToPointer(ref);
  if (pointer === undefined) return ref;
  const rewritten = replacePointerPrefix(pointer, previousPointer, nextPointer);
  return rewritten === undefined ? ref : pointerToLocalRef(rewritten);
}

function rewritePointerSubtree(
  graph: SchemaGraph,
  previousPointer: string,
  nextPointer: string,
): SchemaGraph {
  const nodes = graph.nodes.map((node) => {
    const rewrittenPointer = replacePointerPrefix(node.pointer, previousPointer, nextPointer);
    const nextKeywords = { ...node.keywords };
    if (node.kind === 'schema' && '$ref' in nextKeywords) {
      nextKeywords.$ref = rewriteLocalRef(nextKeywords.$ref, previousPointer, nextPointer);
    }
    return {
      ...node,
      pointer: rewrittenPointer ?? node.pointer,
      keywords: nextKeywords,
    };
  });

  const edges = graph.edges.map((edge) => {
    if (edge.relation !== 'ref' || !edge.ref) return edge;
    const rewritten = rewriteLocalRef(edge.ref, previousPointer, nextPointer);
    if (typeof rewritten !== 'string' || rewritten === edge.ref) return edge;
    return {
      ...edge,
      id: edgeId(edge.source, 'ref', edge.target, rewritten),
      ref: rewritten,
    };
  });

  return { ...graph, nodes, edges };
}

function createSchemaNode(
  pointer: string,
  type?: JsonSchemaPrimitiveType,
): SchemaNode {
  return {
    id: nodeIdForPointer(pointer),
    pointer,
    kind: 'schema',
    keywords: type ? { type } : {},
    structuralPresence: { properties: false, items: false, prefixItems: false, defs: false },
  };
}

function renameKeyedChild(
  graph: SchemaGraph,
  parentNodeId: string,
  relation: KeyedRelation,
  containerKeyword: string,
  previousName: string,
  nextName: string,
): SchemaGraph {
  const trimmedName = nextName.trim();
  if (!trimmedName || trimmedName === previousName) return graph;

  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  if (!parent || parent.kind !== 'schema') return graph;

  const childEdge = keyedEdge(graph, parentNodeId, relation, previousName);
  if (!childEdge) return graph;
  if (keyedEdge(graph, parentNodeId, relation, trimmedName)) return graph;

  const child = graph.nodes.find((node) => node.id === childEdge.target);
  if (!child) return graph;

  const previousPointer = child.pointer;
  const nextPointer = appendPointer(parent.pointer, containerKeyword, trimmedName);
  let next = rewritePointerSubtree(graph, previousPointer, nextPointer);

  next = {
    ...next,
    nodes: next.nodes.map((node) => {
      if (node.id !== parentNodeId || relation !== 'property') return node;
      const keywords = { ...node.keywords };
      const required = nextRequiredAfterRename(
        keywords.required,
        previousName,
        trimmedName,
      );
      if (required === undefined) delete keywords.required;
      else keywords.required = required;
      return { ...node, keywords };
    }),
    edges: next.edges.map((edge) =>
      edge.id === childEdge.id
        ? {
            ...edge,
            id: edgeId(edge.source, edge.relation, edge.target, trimmedName),
            key: trimmedName,
          }
        : edge,
    ),
  };

  return next;
}

function removeKeyedChild(
  graph: SchemaGraph,
  parentNodeId: string,
  relation: KeyedRelation,
  key: string,
): SchemaGraph {
  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  if (!parent || parent.kind !== 'schema') return graph;

  const childEdge = keyedEdge(graph, parentNodeId, relation, key);
  if (!childEdge) return graph;

  const removedNodeIds = collectStructuralSubtreeIds(graph, childEdge.target);
  const survivingSameRelation = graph.edges.filter(
    (edge) =>
      edge.source === parentNodeId &&
      edge.relation === relation &&
      edge.id !== childEdge.id,
  );

  const nodes = graph.nodes
    .filter((node) => !removedNodeIds.has(node.id))
    .map((node) => {
      if (node.id !== parentNodeId || node.kind !== 'schema') return node;
      const keywords = { ...node.keywords };
      if (relation === 'property') {
        const required = nextRequiredAfterDelete(keywords.required, key);
        if (required === undefined) delete keywords.required;
        else keywords.required = required;
      }
      const structuralPresence = { ...node.structuralPresence };
      if (relation === 'dependentSchema' && survivingSameRelation.length === 0) {
        structuralPresence.dependentSchemas = false;
      }
      return { ...node, keywords, structuralPresence };
    });

  const edges = graph.edges.filter(
    (edge) =>
      !removedNodeIds.has(edge.source) &&
      !removedNodeIds.has(edge.target) &&
      edge.id !== childEdge.id,
  );

  return { ...graph, nodes, edges };
}

export function setNodeKeyword(
  graph: SchemaGraph,
  nodeId: string,
  keyword: string,
  value: unknown,
): SchemaGraph {
  return updateNode(graph, nodeId, (node) => {
    if (node.kind === 'boolean-schema') return node;
    const keywords = { ...node.keywords };
    if (value === undefined) delete keywords[keyword];
    else keywords[keyword] = value;
    return { ...node, keywords };
  });
}

export function setNodeType(
  graph: SchemaGraph,
  nodeId: string,
  type: JsonSchemaPrimitiveType | undefined,
): SchemaGraph {
  return setNodeKeyword(graph, nodeId, 'type', type);
}

export function addProperty(
  graph: SchemaGraph,
  parentNodeId: string,
  propertyName: string,
  type: JsonSchemaPrimitiveType = 'string',
  required = false,
): SchemaGraph {
  const trimmedName = propertyName.trim();
  if (!trimmedName) return graph;

  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  if (!parent || parent.kind !== 'schema') return graph;
  if (keyedEdge(graph, parentNodeId, 'property', trimmedName)) return graph;

  const childPointer = appendPointer(parent.pointer, 'properties', trimmedName);
  if (graph.nodes.some((node) => node.pointer === childPointer)) return graph;

  const child = createSchemaNode(childPointer, type);
  const edge: SchemaEdge = {
    id: edgeId(parent.id, 'property', child.id, trimmedName),
    source: parent.id,
    target: child.id,
    relation: 'property',
    key: trimmedName,
  };

  const requiredValues = stringArray(parent.keywords.required);
  const nextRequired = required
    ? Array.from(new Set([...requiredValues, trimmedName]))
    : requiredValues;

  return {
    ...graph,
    nodes: [
      ...graph.nodes.map((node) => {
        if (node.id !== parentNodeId) return node;
        const keywords = { ...node.keywords };
        if (required) keywords.required = nextRequired;
        return {
          ...node,
          keywords,
          structuralPresence: { ...node.structuralPresence, properties: true },
        };
      }),
      child,
    ],
    edges: [...graph.edges, edge],
  };
}

export function renameProperty(
  graph: SchemaGraph,
  parentNodeId: string,
  previousName: string,
  nextName: string,
): SchemaGraph {
  return renameKeyedChild(
    graph,
    parentNodeId,
    'property',
    'properties',
    previousName,
    nextName,
  );
}

export function removeProperty(
  graph: SchemaGraph,
  parentNodeId: string,
  propertyName: string,
): SchemaGraph {
  return removeKeyedChild(graph, parentNodeId, 'property', propertyName);
}

export function addDefinition(
  graph: SchemaGraph,
  parentNodeId: string,
  definitionName: string,
  type: JsonSchemaPrimitiveType = 'object',
): SchemaGraph {
  const trimmedName = definitionName.trim();
  if (!trimmedName) return graph;

  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  if (!parent || parent.kind !== 'schema') return graph;
  if (keyedEdge(graph, parentNodeId, 'definition', trimmedName)) return graph;

  const definitionsKeyword = dialectDescriptor(graph.dialect).definitionsKeyword;
  const childPointer = appendPointer(parent.pointer, definitionsKeyword, trimmedName);
  if (graph.nodes.some((node) => node.pointer === childPointer)) return graph;

  const child = createSchemaNode(childPointer, type);
  const edge: SchemaEdge = {
    id: edgeId(parent.id, 'definition', child.id, trimmedName),
    source: parent.id,
    target: child.id,
    relation: 'definition',
    key: trimmedName,
  };

  return {
    ...graph,
    nodes: [
      ...graph.nodes.map((node) =>
        node.id === parentNodeId
          ? {
              ...node,
              structuralPresence: { ...node.structuralPresence, defs: true },
            }
          : node,
      ),
      child,
    ],
    edges: [...graph.edges, edge],
  };
}

export function renameDefinition(
  graph: SchemaGraph,
  parentNodeId: string,
  previousName: string,
  nextName: string,
): SchemaGraph {
  return renameKeyedChild(
    graph,
    parentNodeId,
    'definition',
    dialectDescriptor(graph.dialect).definitionsKeyword,
    previousName,
    nextName,
  );
}

export function setNodeReference(
  graph: SchemaGraph,
  sourceNodeId: string,
  targetNodeId: string,
): SchemaGraph {
  const source = graph.nodes.find((node) => node.id === sourceNodeId);
  const target = graph.nodes.find((node) => node.id === targetNodeId);
  if (!source || source.kind !== 'schema' || !target) return graph;

  const ref = pointerToLocalRef(target.pointer);
  const nodes = graph.nodes.map((node) => {
    if (node.id !== sourceNodeId || node.kind !== 'schema') return node;
    return { ...node, keywords: { ...node.keywords, $ref: ref } };
  });
  const edges = graph.edges.filter(
    (edge) => !(edge.source === sourceNodeId && edge.relation === 'ref'),
  );
  edges.push({
    id: edgeId(sourceNodeId, 'ref', targetNodeId, ref),
    source: sourceNodeId,
    target: targetNodeId,
    relation: 'ref',
    ref,
  });

  return { ...graph, nodes, edges };
}

export function clearNodeReference(
  graph: SchemaGraph,
  sourceNodeId: string,
): SchemaGraph {
  const source = graph.nodes.find((node) => node.id === sourceNodeId);
  if (!source || source.kind !== 'schema') return graph;

  const nodes = graph.nodes.map((node) => {
    if (node.id !== sourceNodeId || node.kind !== 'schema') return node;
    const keywords = { ...node.keywords };
    delete keywords.$ref;
    return { ...node, keywords };
  });
  const edges = graph.edges.filter(
    (edge) => !(edge.source === sourceNodeId && edge.relation === 'ref'),
  );

  return { ...graph, nodes, edges };
}

export function addCompositionBranch(
  graph: SchemaGraph,
  parentNodeId: string,
  relation: ArrayCompositionRelation,
  type?: JsonSchemaPrimitiveType,
): SchemaGraph {
  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  if (!parent || parent.kind !== 'schema') return graph;

  const siblings = graph.edges
    .filter((edge) => edge.source === parentNodeId && edge.relation === relation)
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  const index = siblings.length;
  const childPointer = appendPointer(parent.pointer, relation, String(index));
  if (graph.nodes.some((node) => node.pointer === childPointer)) return graph;

  const child = createSchemaNode(childPointer, type);
  const edge: SchemaEdge = {
    id: edgeId(parent.id, relation, child.id, String(index)),
    source: parent.id,
    target: child.id,
    relation,
    index,
  };

  return {
    ...graph,
    nodes: [
      ...graph.nodes.map((node) =>
        node.id === parentNodeId
          ? {
              ...node,
              structuralPresence: { ...node.structuralPresence, [relation]: true },
            }
          : node,
      ),
      child,
    ],
    edges: [...graph.edges, edge],
  };
}

export function removeCompositionBranch(
  graph: SchemaGraph,
  parentNodeId: string,
  relation: ArrayCompositionRelation,
  index: number,
): SchemaGraph {
  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  if (!parent || parent.kind !== 'schema') return graph;

  const branchEdge = graph.edges.find(
    (edge) =>
      edge.source === parentNodeId &&
      edge.relation === relation &&
      edge.index === index,
  );
  if (!branchEdge) return graph;

  const removedNodeIds = collectStructuralSubtreeIds(graph, branchEdge.target);
  let next: SchemaGraph = {
    ...graph,
    nodes: graph.nodes.filter((node) => !removedNodeIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) =>
        edge.id !== branchEdge.id &&
        !removedNodeIds.has(edge.source) &&
        !removedNodeIds.has(edge.target),
    ),
  };

  const survivingBranches = next.edges
    .filter((edge) => edge.source === parentNodeId && edge.relation === relation)
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));

  for (const edge of survivingBranches) {
    const oldIndex = edge.index ?? 0;
    if (oldIndex <= index) continue;
    const child = next.nodes.find((node) => node.id === edge.target);
    if (!child) continue;
    const nextPointer = appendPointer(parent.pointer, relation, String(oldIndex - 1));
    next = rewritePointerSubtree(next, child.pointer, nextPointer);
  }

  next = {
    ...next,
    nodes: next.nodes.map((node) => {
      if (node.id !== parentNodeId) return node;
      return {
        ...node,
        structuralPresence: {
          ...node.structuralPresence,
          [relation]: survivingBranches.length > 0,
        },
      };
    }),
    edges: next.edges.map((edge) => {
      if (edge.source !== parentNodeId || edge.relation !== relation) return edge;
      const oldIndex = edge.index ?? 0;
      const nextIndex = oldIndex > index ? oldIndex - 1 : oldIndex;
      if (nextIndex === oldIndex) return edge;
      return {
        ...edge,
        index: nextIndex,
        id: edgeId(edge.source, relation, edge.target, String(nextIndex)),
      };
    }),
  };

  return next;
}

export function addSingleComposition(
  graph: SchemaGraph,
  parentNodeId: string,
  relation: SingleCompositionRelation,
  type?: JsonSchemaPrimitiveType,
): SchemaGraph {
  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  if (!parent || parent.kind !== 'schema') return graph;
  if (graph.edges.some((edge) => edge.source === parentNodeId && edge.relation === relation)) {
    return graph;
  }

  const childPointer = appendPointer(parent.pointer, relation);
  if (graph.nodes.some((node) => node.pointer === childPointer)) return graph;
  const child = createSchemaNode(childPointer, type);
  const edge: SchemaEdge = {
    id: edgeId(parent.id, relation, child.id),
    source: parent.id,
    target: child.id,
    relation,
  };

  return {
    ...graph,
    nodes: [
      ...graph.nodes.map((node) =>
        node.id === parentNodeId
          ? {
              ...node,
              structuralPresence: { ...node.structuralPresence, [relation]: true },
            }
          : node,
      ),
      child,
    ],
    edges: [...graph.edges, edge],
  };
}

export function removeSingleComposition(
  graph: SchemaGraph,
  parentNodeId: string,
  relation: SingleCompositionRelation,
): SchemaGraph {
  const relationEdge = graph.edges.find(
    (edge) => edge.source === parentNodeId && edge.relation === relation,
  );
  if (!relationEdge) return graph;
  const removedNodeIds = collectStructuralSubtreeIds(graph, relationEdge.target);

  return {
    ...graph,
    nodes: graph.nodes
      .filter((node) => !removedNodeIds.has(node.id))
      .map((node) =>
        node.id === parentNodeId
          ? {
              ...node,
              structuralPresence: { ...node.structuralPresence, [relation]: false },
            }
          : node,
      ),
    edges: graph.edges.filter(
      (edge) =>
        edge.id !== relationEdge.id &&
        !removedNodeIds.has(edge.source) &&
        !removedNodeIds.has(edge.target),
    ),
  };
}

export function addDependentSchema(
  graph: SchemaGraph,
  parentNodeId: string,
  propertyName: string,
  type?: JsonSchemaPrimitiveType,
): SchemaGraph {
  const trimmedName = propertyName.trim();
  if (!trimmedName) return graph;
  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  if (!parent || parent.kind !== 'schema') return graph;
  if (keyedEdge(graph, parentNodeId, 'dependentSchema', trimmedName)) return graph;

  const dependentSchemasKeyword = dialectDescriptor(graph.dialect).dependentSchemasKeyword;
  const childPointer = appendPointer(parent.pointer, dependentSchemasKeyword, trimmedName);
  if (graph.nodes.some((node) => node.pointer === childPointer)) return graph;
  const child = createSchemaNode(childPointer, type);
  const edge: SchemaEdge = {
    id: edgeId(parent.id, 'dependentSchema', child.id, trimmedName),
    source: parent.id,
    target: child.id,
    relation: 'dependentSchema',
    key: trimmedName,
  };

  return {
    ...graph,
    nodes: [
      ...graph.nodes.map((node) =>
        node.id === parentNodeId
          ? {
              ...node,
              structuralPresence: {
                ...node.structuralPresence,
                dependentSchemas: true,
              },
            }
          : node,
      ),
      child,
    ],
    edges: [...graph.edges, edge],
  };
}

export function renameDependentSchema(
  graph: SchemaGraph,
  parentNodeId: string,
  previousName: string,
  nextName: string,
): SchemaGraph {
  return renameKeyedChild(
    graph,
    parentNodeId,
    'dependentSchema',
    dialectDescriptor(graph.dialect).dependentSchemasKeyword,
    previousName,
    nextName,
  );
}

export function removeDependentSchema(
  graph: SchemaGraph,
  parentNodeId: string,
  propertyName: string,
): SchemaGraph {
  return removeKeyedChild(graph, parentNodeId, 'dependentSchema', propertyName);
}
