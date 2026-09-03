import type { JsonSchema, SchemaGraph, SchemaNode } from './model';
import { schemaToGraph } from './parser';

export type SchemaResourceRegistry = Readonly<Record<string, JsonSchema>>;

export interface ResolvedReference {
  status: 'resolved';
  absoluteRef: string;
  graph: SchemaGraph;
  node: SchemaNode;
}

export interface UnresolvedReference {
  status: 'unresolved';
  absoluteRef: string;
  reason: string;
}

export type ReferenceResolution = ResolvedReference | UnresolvedReference;

function withoutFragment(uri: string): string {
  const index = uri.indexOf('#');
  return index < 0 ? uri : uri.slice(0, index);
}

function absoluteUri(reference: string, base: string): string | undefined {
  try {
    return new URL(reference, base || 'urn:json-schema:root').href;
  } catch {
    return undefined;
  }
}

function decodeFragmentPointer(fragment: string): string | undefined {
  if (!fragment || fragment === '#') return '';
  if (!fragment.startsWith('#/')) return undefined;
  try { return decodeURIComponent(fragment.slice(1)); } catch { return undefined; }
}

interface IndexedNode { graph: SchemaGraph; node: SchemaNode; baseUri: string }

function indexGraph(graph: SchemaGraph, fallbackUri: string, index: Map<string, IndexedNode>): void {
  const ordered = [...graph.nodes].sort((a, b) => a.pointer.length - b.pointer.length);
  const baseByPointer = new Map<string, string>();
  for (const node of ordered) {
    const parent = [...baseByPointer.entries()]
      .filter(([pointer]) => node.pointer === pointer || node.pointer.startsWith(`${pointer}/`))
      .sort((a, b) => b[0].length - a[0].length)[0];
    let baseUri = parent?.[1] ?? fallbackUri;
    const nodeId = node.kind === 'schema' && typeof node.keywords.$id === 'string' ? node.keywords.$id : undefined;
    const establishesResource = nodeId !== undefined;
    if (nodeId !== undefined) {
      baseUri = absoluteUri(nodeId, baseUri) ?? baseUri;
    }
    baseByPointer.set(node.pointer, baseUri);
    if (establishesResource || node.id === graph.rootNodeId) index.set(withoutFragment(baseUri), { graph, node, baseUri });
    if (node.kind === 'schema') {
      for (const keyword of ['$anchor', '$dynamicAnchor'] as const) {
        const anchor = node.keywords[keyword];
        if (typeof anchor === 'string') index.set(`${withoutFragment(baseUri)}#${anchor}`, { graph, node, baseUri });
      }
    }
  }
  const root = graph.nodes.find((node) => node.id === graph.rootNodeId);
  if (root) index.set(withoutFragment(fallbackUri), { graph, node: root, baseUri: fallbackUri });
}

/** Resolve a reference without network access. External schemas must be supplied explicitly. */
export function resolveReference(
  graph: SchemaGraph,
  sourceNodeId: string,
  reference: string,
  resources: SchemaResourceRegistry = {},
): ReferenceResolution {
  const source = graph.nodes.find((node) => node.id === sourceNodeId);
  const root = graph.nodes.find((node) => node.id === graph.rootNodeId);
  const rootId = root?.kind === 'schema' && typeof root.keywords.$id === 'string'
    ? root.keywords.$id : 'urn:json-schema:root';
  const index = new Map<string, IndexedNode>();
  indexGraph(graph, rootId, index);
  for (const [uri, schema] of Object.entries(resources)) indexGraph(schemaToGraph(schema), uri, index);

  let sourceBase = rootId;
  for (const node of [...graph.nodes].sort((a, b) => a.pointer.length - b.pointer.length)) {
    if (!source || !(source.pointer === node.pointer || source.pointer.startsWith(`${node.pointer}/`))) continue;
    if (node.kind === 'schema' && typeof node.keywords.$id === 'string') sourceBase = absoluteUri(node.keywords.$id, sourceBase) ?? sourceBase;
  }
  const absoluteRef = absoluteUri(reference, sourceBase);
  if (!absoluteRef) return { status: 'unresolved', absoluteRef: reference, reason: 'Invalid URI reference.' };
  const direct = index.get(absoluteRef);
  if (direct) return { status: 'resolved', absoluteRef, ...direct };

  const hash = absoluteRef.indexOf('#');
  const documentUri = hash < 0 ? absoluteRef : absoluteRef.slice(0, hash);
  const fragment = hash < 0 ? '' : absoluteRef.slice(hash);
  const resource = index.get(documentUri);
  const pointer = decodeFragmentPointer(fragment);
  if (resource && pointer !== undefined) {
    const resourcePointer = resource.node.pointer;
    const targetPointer = pointer === '' ? resourcePointer : `${resourcePointer}${pointer}`;
    const node = resource.graph.nodes.find((candidate) => candidate.pointer === targetPointer);
    if (node) return { status: 'resolved', absoluteRef, graph: resource.graph, node };
  }
  return { status: 'unresolved', absoluteRef, reason: `No registered schema resource matches ${absoluteRef}.` };
}

export interface ReferenceDiagnostic {
  nodeId: string;
  keyword: '$ref' | '$dynamicRef';
  reference: string;
  message: string;
}

export function findUnresolvedReferences(graph: SchemaGraph, resources: SchemaResourceRegistry = {}): ReferenceDiagnostic[] {
  const diagnostics: ReferenceDiagnostic[] = [];
  for (const node of graph.nodes) {
    if (node.kind !== 'schema') continue;
    for (const keyword of ['$ref', '$dynamicRef'] as const) {
      const reference = node.keywords[keyword];
      if (typeof reference !== 'string') continue;
      const result = resolveReference(graph, node.id, reference, resources);
      if (result.status === 'unresolved') diagnostics.push({ nodeId: node.id, keyword, reference, message: result.reason });
    }
  }
  return diagnostics;
}
