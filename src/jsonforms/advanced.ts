import type { ErrorObject } from 'ajv';
import type { ErrorTranslator, JsonFormsI18nState, Translator } from '@jsonforms/core';
import {
  findUnresolvedReferences,
  graphToSchema,
  resolveReference,
  schemaToGraph,
  type JsonSchema,
  type SchemaGraph,
  type SchemaResourceRegistry,
} from '../core';
import { getUiRule, resolveUiScope } from './core';
import type { CustomRendererDefinition, RegisteredUiSchemaDocument } from './extensibility';
import type { UiSchemaDocument } from './model';

export type TranslationCatalog = Record<string, Record<string, string>>;

function interpolate(message: string, values?: Record<string, unknown>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => values?.[key] === undefined ? `{${key}}` : String(values[key]));
}

export function createCatalogTranslator(locale: string, catalogs: TranslationCatalog): Translator {
  return ((id: string, defaultMessage?: string, values?: Record<string, unknown>) => {
    const message = catalogs[locale]?.[id] ?? defaultMessage;
    return message === undefined ? undefined : interpolate(message, values);
  }) as Translator;
}

export function createCatalogErrorTranslator(locale: string, catalogs: TranslationCatalog): ErrorTranslator {
  return (error, translate) => translate(`error.${error.keyword}`, error.message ?? 'Validation failed.', error.params) ?? catalogs[locale]?.['error.default'] ?? error.message ?? 'Validation failed.';
}

export function createI18nState(locale: string, catalogs: TranslationCatalog): JsonFormsI18nState {
  return { locale, translate: createCatalogTranslator(locale, catalogs), translateError: createCatalogErrorTranslator(locale, catalogs) };
}

export function enumTranslationKey(scope: string, value: unknown): string {
  return `${scope.replace(/^#\//, '').replace(/\//g, '.')}.${String(value)}`;
}

export type RendererSetId = 'vanilla' | 'vanilla-custom';

export interface RendererCompatibilityDiagnostic {
  severity: 'error' | 'warning';
  elementId: string;
  message: string;
}

export function rendererCompatibilityDiagnostics(document: UiSchemaDocument, set: RendererSetId, custom: CustomRendererDefinition[]): RendererCompatibilityDiagnostic[] {
  const result: RendererCompatibilityDiagnostic[] = [];
  for (const node of document.nodes) {
    const options = node.element.options && typeof node.element.options === 'object' && !Array.isArray(node.element.options) ? node.element.options as Record<string, unknown> : {};
    if (typeof options.customRenderer === 'string') {
      const available = set === 'vanilla-custom' && custom.some((item) => item.enabled && item.id === options.customRenderer);
      if (!available) result.push({ severity: 'error', elementId: node.id, message: `Renderer ${options.customRenderer} is unavailable in renderer set ${set}.` });
    }
    if (set === 'vanilla' && options.apiSource !== undefined) result.push({ severity: 'warning', elementId: node.id, message: 'Option apiSource requires a custom/dynamic renderer.' });
  }
  return result;
}

export interface PreviewSchemaResolution {
  schema: JsonSchema;
  diagnostics: Array<{ reference: string; message: string; nodeId?: string }>;
  resolvedCount: number;
}

export function resolvePreviewSchema(source: JsonSchema, resources: SchemaResourceRegistry = {}): PreviewSchemaResolution {
  const sourceGraph = schemaToGraph(source);
  const diagnostics = findUnresolvedReferences(sourceGraph, resources).map((item) => ({ reference: item.reference, message: item.message, nodeId: item.nodeId }));
  let resolvedCount = 0;
  function expand(graph: SchemaGraph, nodeId: string, seen: Set<string>): JsonSchema {
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) return true;
    const schema = graphToSchema({ ...graph, rootNodeId: node.id });
    if (typeof schema === 'boolean') return schema;
    const reference = typeof schema.$ref === 'string' ? schema.$ref : typeof schema.$dynamicRef === 'string' ? schema.$dynamicRef : undefined;
    if (reference) {
      const result = resolveReference(graph, node.id, reference, resources);
      if (result.status === 'resolved' && !seen.has(result.absoluteRef)) {
        resolvedCount += 1;
        const replacement = expand(result.graph, result.node.id, new Set([...seen, result.absoluteRef]));
        if (typeof replacement === 'boolean') return replacement;
        const siblings = { ...schema }; delete siblings.$ref; delete siblings.$dynamicRef;
        return { ...replacement, ...walkObject(siblings, graph, node.id, seen) };
      }
    }
    return walkObject(schema, graph, node.id, seen);
  }
  function walkObject(value: Record<string, unknown>, graph: SchemaGraph, ownerId: string, seen: Set<string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (Array.isArray(item)) result[key] = item.map((child) => child && typeof child === 'object' && !Array.isArray(child) ? walkObject(child as Record<string, unknown>, graph, ownerId, seen) : child);
      else if (item && typeof item === 'object') result[key] = walkObject(item as Record<string, unknown>, graph, ownerId, seen);
      else result[key] = item;
    }
    return result;
  }
  return { schema: expand(sourceGraph, sourceGraph.rootNodeId, new Set()), diagnostics, resolvedCount };
}

export interface UiSchemaUsage {
  documentId: string;
  documentName: string;
  elementId: string;
  kind: 'control' | 'rule';
  label: string;
}

export function findUiSchemaUsages(graph: SchemaGraph, schemaNodeId: string, main: UiSchemaDocument, registered: RegisteredUiSchemaDocument[] = []): UiSchemaUsage[] {
  const target = graph.nodes.find((node) => node.id === schemaNodeId);
  if (!target) return [];
  const documents = [{ id: 'main', name: 'Main UI Schema', document: main }, ...registered.map((item) => ({ id: item.id, name: item.name, document: item.document }))];
  const usages: UiSchemaUsage[] = [];
  for (const entry of documents) for (const node of entry.document.nodes) {
    const label = String(node.element.label ?? node.element.scope ?? node.element.type);
    if (resolveUiScope(graph, node.element.scope)?.id === schemaNodeId) usages.push({ documentId: entry.id, documentName: entry.name, elementId: node.id, kind: 'control', label });
    const rule = getUiRule(node);
    if (rule && resolveUiScope(graph, rule.condition.scope)?.id === schemaNodeId) usages.push({ documentId: entry.id, documentName: entry.name, elementId: node.id, kind: 'rule', label });
  }
  return usages;
}

export type ReadonlyOrigin = 'json-schema' | 'ui-schema' | 'global' | 'rule-disable';
export function readonlyOrigins(graph: SchemaGraph, document: UiSchemaDocument, elementId: string, globalReadonly: boolean): ReadonlyOrigin[] {
  const node = document.nodes.find((item) => item.id === elementId);
  if (!node) return [];
  const origins: ReadonlyOrigin[] = [];
  const target = resolveUiScope(graph, node.element.scope);
  if (target?.keywords.readOnly === true) origins.push('json-schema');
  const options = node.element.options as Record<string, unknown> | undefined;
  if (options?.readonly === true) origins.push('ui-schema');
  if (globalReadonly) origins.push('global');
  if (getUiRule(node)?.effect === 'DISABLE') origins.push('rule-disable');
  return origins;
}

